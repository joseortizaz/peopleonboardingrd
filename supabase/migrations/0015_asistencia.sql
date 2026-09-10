-- =========================================================
-- Asistencia y tiempo v1:
--  1) employee_shifts: horario fijo por empleado (hora de inicio/fin,
--     igual todos los dias laborables -- sin turnos rotativos ni
--     turnos nocturnos que cruzan medianoche en v1).
--  2) time_clock_entries: marcaje web de entrada/salida. clock_in()
--     calcula is_late comparando la hora real contra el horario del
--     empleado (con 10 minutos de tolerancia) si tiene uno asignado;
--     sin horario asignado, nunca se marca como tardanza.
--  3) leave_requests: solicitudes de vacaciones y permisos en una sola
--     tabla (type distingue una de otra). Vacaciones se valida contra
--     el balance calculado por get_vacation_balance() al momento de
--     APROBAR (no al solicitar), para no bloquear la solicitud misma.
--  4) get_vacation_balance(): calcula dias acumulados por antiguedad
--     segun el Codigo de Trabajo (14 dias/ano en anos 1-4, 18 dias/ano
--     desde el ano 5), sumado ano por ano completado -- no una tasa
--     plana -- menos los dias ya aprobados. Es un calculo de
--     referencia, igual que offboarding y nomina: no reemplaza la
--     validacion de un contador o gestor laboral.
-- =========================================================

create table public.employee_shifts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade unique,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now()
);

create index employee_shifts_tenant_id_idx on public.employee_shifts(tenant_id);

alter table public.employee_shifts enable row level security;

create policy employee_shifts_select on public.employee_shifts
  for select using (
    tenant_id in (select public.my_manager_tenant_ids())
    or employee_id in (select public.my_employee_ids())
  );

create policy employee_shifts_insert on public.employee_shifts
  for insert with check (tenant_id in (select public.my_manager_tenant_ids()));

create policy employee_shifts_update on public.employee_shifts
  for update using (tenant_id in (select public.my_manager_tenant_ids()));

create policy employee_shifts_delete on public.employee_shifts
  for delete using (tenant_id in (select public.my_manager_tenant_ids()));

create or replace function public.upsert_employee_shift(
  p_employee_id uuid,
  p_start_time time,
  p_end_time time
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id from public.employees where id = p_employee_id;

  if v_tenant_id is null or v_tenant_id not in (select public.my_manager_tenant_ids()) then
    raise exception 'No autorizado';
  end if;

  insert into public.employee_shifts (tenant_id, employee_id, start_time, end_time)
  values (v_tenant_id, p_employee_id, p_start_time, p_end_time)
  on conflict (employee_id) do update
    set start_time = excluded.start_time,
        end_time = excluded.end_time;
end;
$$;

grant execute on function public.upsert_employee_shift(uuid, time, time) to authenticated;

-- ---------- Marcaje ----------
create table public.time_clock_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  is_late boolean not null default false,
  created_at timestamptz not null default now(),
  check (clock_out is null or clock_out >= clock_in)
);

create index time_clock_entries_tenant_id_idx on public.time_clock_entries(tenant_id);
create index time_clock_entries_employee_id_idx on public.time_clock_entries(employee_id);

alter table public.time_clock_entries enable row level security;

create policy time_clock_entries_select on public.time_clock_entries
  for select using (
    tenant_id in (select public.my_manager_tenant_ids())
    or employee_id in (select public.my_employee_ids())
  );

-- Respaldo directo (el flujo real pasa por clock_in()/clock_out()):
create policy time_clock_entries_insert on public.time_clock_entries
  for insert with check (employee_id in (select public.my_employee_ids()));

create policy time_clock_entries_update on public.time_clock_entries
  for update using (
    employee_id in (select public.my_employee_ids())
    or tenant_id in (select public.my_manager_tenant_ids())
  );

create policy time_clock_entries_delete on public.time_clock_entries
  for delete using (tenant_id in (select public.my_manager_tenant_ids()));

create or replace function public.clock_in(p_tenant_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id uuid;
  v_shift record;
  v_is_late boolean := false;
  v_entry_id uuid;
begin
  select id into v_employee_id
  from public.employees
  where profile_id = auth.uid() and tenant_id = p_tenant_id;

  if v_employee_id is null then
    raise exception 'No tienes un registro de empleado en este tenant';
  end if;

  if exists (
    select 1 from public.time_clock_entries
    where employee_id = v_employee_id and clock_out is null
  ) then
    raise exception 'Ya tienes una entrada marcada sin salida';
  end if;

  select start_time into v_shift from public.employee_shifts where employee_id = v_employee_id;

  if v_shift.start_time is not null then
    v_is_late := now()::time > (v_shift.start_time + interval '10 minutes');
  end if;

  insert into public.time_clock_entries (tenant_id, employee_id, clock_in, is_late)
  values (p_tenant_id, v_employee_id, now(), v_is_late)
  returning id into v_entry_id;

  return v_entry_id;
end;
$$;

grant execute on function public.clock_in(uuid) to authenticated;

create or replace function public.clock_out(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id uuid;
  v_entry_id uuid;
begin
  select id into v_employee_id
  from public.employees
  where profile_id = auth.uid() and tenant_id = p_tenant_id;

  if v_employee_id is null then
    raise exception 'No tienes un registro de empleado en este tenant';
  end if;

  select id into v_entry_id
  from public.time_clock_entries
  where employee_id = v_employee_id and clock_out is null
  order by clock_in desc
  limit 1;

  if v_entry_id is null then
    raise exception 'No tienes una entrada marcada actualmente';
  end if;

  update public.time_clock_entries set clock_out = now() where id = v_entry_id;
end;
$$;

grant execute on function public.clock_out(uuid) to authenticated;

-- ---------- Vacaciones y permisos ----------
create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  type text not null check (type in ('vacaciones', 'permiso')),
  start_date date not null,
  end_date date not null,
  days_requested numeric(6, 2) not null,
  reason text,
  status text not null default 'pendiente' check (status in ('pendiente', 'aprobada', 'rechazada')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_notes text,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index leave_requests_tenant_id_idx on public.leave_requests(tenant_id);
create index leave_requests_employee_id_idx on public.leave_requests(employee_id);

alter table public.leave_requests enable row level security;

create policy leave_requests_select on public.leave_requests
  for select using (
    tenant_id in (select public.my_manager_tenant_ids())
    or employee_id in (select public.my_employee_ids())
  );

-- Respaldo directo (el flujo real pasa por request_leave()):
create policy leave_requests_insert on public.leave_requests
  for insert with check (employee_id in (select public.my_employee_ids()));

-- El empleado puede cancelar su propia solicitud mientras siga pendiente;
-- gestion puede borrar cualquiera de su tenant.
create policy leave_requests_delete on public.leave_requests
  for delete using (
    (employee_id in (select public.my_employee_ids()) and status = 'pendiente')
    or tenant_id in (select public.my_manager_tenant_ids())
  );

-- La decision (aprobar/rechazar) pasa por decide_leave_request(); esta
-- policy es solo un respaldo si alguna vez se actualiza directo.
create policy leave_requests_update on public.leave_requests
  for update using (tenant_id in (select public.my_manager_tenant_ids()));

create or replace function public.get_vacation_balance(p_employee_id uuid)
returns table (accrued numeric, used numeric, available numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_hire_date date;
  v_completed_years int;
  v_accrued numeric := 0;
  v_used numeric := 0;
begin
  select tenant_id, hire_date into v_tenant_id, v_hire_date
  from public.employees where id = p_employee_id;

  if v_tenant_id is null then
    raise exception 'Empleado invalido';
  end if;

  if v_tenant_id not in (select public.my_manager_tenant_ids())
     and p_employee_id not in (select public.my_employee_ids()) then
    raise exception 'No autorizado';
  end if;

  if v_hire_date is null or v_hire_date > current_date then
    return query select 0::numeric, 0::numeric, 0::numeric;
    return;
  end if;

  v_completed_years := floor(
    extract(year from age(current_date, v_hire_date))
    + extract(month from age(current_date, v_hire_date)) / 12.0
  )::int;

  if v_completed_years > 0 then
    select coalesce(sum(case when gs >= 5 then 18 else 14 end), 0)
    into v_accrued
    from generate_series(1, v_completed_years) gs;
  end if;

  select coalesce(sum(days_requested), 0) into v_used
  from public.leave_requests
  where employee_id = p_employee_id and type = 'vacaciones' and status = 'aprobada';

  return query select v_accrued, v_used, (v_accrued - v_used);
end;
$$;

grant execute on function public.get_vacation_balance(uuid) to authenticated;

create or replace function public.request_leave(
  p_tenant_id uuid,
  p_type text,
  p_start_date date,
  p_end_date date,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id uuid;
  v_days numeric;
  v_request_id uuid;
begin
  if p_type not in ('vacaciones', 'permiso') then
    raise exception 'Tipo de solicitud invalido';
  end if;

  if p_end_date < p_start_date then
    raise exception 'La fecha de fin no puede ser anterior a la fecha de inicio';
  end if;

  if p_type = 'permiso' and trim(coalesce(p_reason, '')) = '' then
    raise exception 'El motivo es obligatorio para un permiso';
  end if;

  select id into v_employee_id
  from public.employees
  where profile_id = auth.uid() and tenant_id = p_tenant_id;

  if v_employee_id is null then
    raise exception 'No tienes un registro de empleado en este tenant';
  end if;

  v_days := (p_end_date - p_start_date + 1);

  insert into public.leave_requests (tenant_id, employee_id, type, start_date, end_date, days_requested, reason)
  values (p_tenant_id, v_employee_id, p_type, p_start_date, p_end_date, v_days, nullif(trim(coalesce(p_reason, '')), ''))
  returning id into v_request_id;

  return v_request_id;
end;
$$;

grant execute on function public.request_leave(uuid, text, date, date, text) to authenticated;

create or replace function public.decide_leave_request(
  p_request_id uuid,
  p_decision text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_employee_id uuid;
  v_type text;
  v_status text;
  v_days numeric;
  v_available numeric;
begin
  if p_decision not in ('aprobada', 'rechazada') then
    raise exception 'Decision invalida';
  end if;

  select tenant_id, employee_id, type, status, days_requested
  into v_tenant_id, v_employee_id, v_type, v_status, v_days
  from public.leave_requests
  where id = p_request_id;

  if v_tenant_id is null then
    raise exception 'Solicitud invalida';
  end if;

  if v_tenant_id not in (select public.my_manager_tenant_ids()) then
    raise exception 'No autorizado';
  end if;

  if v_status <> 'pendiente' then
    raise exception 'Esta solicitud ya fue decidida';
  end if;

  if p_decision = 'aprobada' and v_type = 'vacaciones' then
    select available into v_available from public.get_vacation_balance(v_employee_id);
    if v_days > v_available then
      raise exception 'El empleado solo tiene % dia(s) disponibles de vacaciones', v_available;
    end if;
  end if;

  update public.leave_requests
  set status = p_decision,
      decided_by = auth.uid(),
      decided_at = now(),
      decision_notes = nullif(trim(coalesce(p_notes, '')), '')
  where id = p_request_id;
end;
$$;

grant execute on function public.decide_leave_request(uuid, text, text) to authenticated;
