-- =========================================================
-- Offboarding (baja del empleado): checklist de salida +
-- calculo de referencia de preaviso/cesantia/vacaciones/regalia
-- segun el Codigo de Trabajo dominicano (Ley 16-92).
--
-- Es un calculo de referencia para que RR.HH. tenga un punto de
-- partida: no sustituye la validacion de un contador o gestor
-- laboral antes de pagar una liquidacion real (ver plan de
-- desarrollo, seccion 12, punto 5).
--
-- A diferencia de onboarding, en v1 el checklist de baja es
-- fijo (no hay plantillas) y es de uso exclusivo de RR.HH.:
-- el empleado que se va no necesita ver ni marcar estas tareas.
-- =========================================================

create table public.offboarding_processes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  reason text not null check (
    reason in ('renuncia', 'despido_justificado', 'despido_injustificado', 'mutuo_acuerdo', 'fin_contrato')
  ),
  last_working_day date not null,
  monthly_salary numeric(12, 2) not null check (monthly_salary >= 0),
  years_of_service numeric(6, 2) not null default 0,
  preaviso_days integer not null default 0,
  preaviso_amount numeric(12, 2) not null default 0,
  cesantia_days numeric(8, 2) not null default 0,
  cesantia_amount numeric(12, 2) not null default 0,
  vacation_days_pending numeric(8, 2) not null default 0,
  vacation_amount numeric(12, 2) not null default 0,
  christmas_bonus_amount numeric(12, 2) not null default 0,
  total_liquidation numeric(12, 2) not null default 0,
  notes text,
  status text not null default 'en_proceso' check (status in ('en_proceso', 'completado')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index offboarding_processes_tenant_id_idx on public.offboarding_processes(tenant_id);
create index offboarding_processes_employee_id_idx on public.offboarding_processes(employee_id);

create table public.offboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.offboarding_processes(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  description text,
  order_index int not null default 0,
  status text not null default 'pendiente' check (status in ('pendiente', 'completada')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index offboarding_tasks_process_id_idx on public.offboarding_tasks(process_id);

create or replace function public.set_offboarding_task_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select tenant_id into new.tenant_id
  from public.offboarding_processes
  where id = new.process_id;

  if new.tenant_id is null then
    raise exception 'Proceso de baja invalido';
  end if;

  return new;
end;
$$;

drop trigger if exists set_offboarding_task_tenant_trigger on public.offboarding_tasks;

create trigger set_offboarding_task_tenant_trigger
  before insert on public.offboarding_tasks
  for each row execute function public.set_offboarding_task_tenant();

-- Recalcula el estado del proceso cada vez que cambia el estado de una tarea
-- (mismo patron que onboarding: funciona en ambas direcciones, sin boton manual)
create or replace function public.check_offboarding_process_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending int;
begin
  select count(*) into v_pending
  from public.offboarding_tasks
  where process_id = new.process_id and status <> 'completada';

  if v_pending = 0 then
    update public.offboarding_processes
    set status = 'completado', completed_at = now()
    where id = new.process_id and status <> 'completado';
  else
    update public.offboarding_processes
    set status = 'en_proceso', completed_at = null
    where id = new.process_id and status = 'completado';
  end if;

  return new;
end;
$$;

drop trigger if exists check_offboarding_process_completion_trigger on public.offboarding_tasks;

create trigger check_offboarding_process_completion_trigger
  after update of status on public.offboarding_tasks
  for each row execute function public.check_offboarding_process_completion();

-- Crea el proceso de baja calculando preaviso/cesantia/vacaciones/regalia
-- de referencia segun el Codigo de Trabajo dominicano, y genera el
-- checklist de salida por defecto. security definer: valida por su cuenta
-- que quien llama sea gestor del tenant del empleado (no puede depender
-- solo de RLS). Tambien marca al empleado como 'terminated'.
create or replace function public.start_offboarding_process(
  p_employee_id uuid,
  p_reason text,
  p_last_working_day date,
  p_monthly_salary numeric,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_hire_date date;
  v_age interval;
  v_whole_months int;
  v_whole_years int;
  v_months_since_anniv int;
  v_cesantia_rate int;
  v_vacation_rate numeric;
  v_daily_salary numeric(12, 2);
  v_preaviso_days int := 0;
  v_preaviso_amount numeric(12, 2) := 0;
  v_cesantia_days numeric(8, 2) := 0;
  v_cesantia_amount numeric(12, 2) := 0;
  v_vacation_days numeric(8, 2) := 0;
  v_vacation_amount numeric(12, 2) := 0;
  v_year_start date;
  v_year_age interval;
  v_months_this_year numeric;
  v_christmas_bonus numeric(12, 2) := 0;
  v_total numeric(12, 2) := 0;
  v_process_id uuid;
begin
  if p_reason not in ('renuncia', 'despido_justificado', 'despido_injustificado', 'mutuo_acuerdo', 'fin_contrato') then
    raise exception 'Motivo de baja invalido';
  end if;

  select tenant_id, hire_date into v_tenant_id, v_hire_date
  from public.employees
  where id = p_employee_id;

  if v_tenant_id is null then
    raise exception 'Empleado invalido';
  end if;

  if v_tenant_id not in (select public.my_manager_tenant_ids()) then
    raise exception 'No autorizado';
  end if;

  if v_hire_date is null then
    raise exception 'El empleado no tiene fecha de ingreso registrada; agregala en Empleados antes de iniciar la baja';
  end if;

  if p_last_working_day < v_hire_date then
    raise exception 'La fecha de ultimo dia no puede ser anterior a la fecha de ingreso';
  end if;

  v_daily_salary := round(p_monthly_salary / 23.83, 2);

  -- Meses completos de servicio (age() ya da el desglose calendario correcto)
  v_age := age(p_last_working_day, v_hire_date);
  v_whole_months := extract(year from v_age)::int * 12 + extract(month from v_age)::int;
  v_whole_years := v_whole_months / 12; -- division entera
  v_months_since_anniv := v_whole_months % 12;

  -- Preaviso y cesantia (Art. 76 y 80 del Codigo de Trabajo): solo aplican
  -- cuando el empleador despide sin causa justificada.
  if p_reason = 'despido_injustificado' then
    if v_whole_months < 3 then
      v_preaviso_days := 0;
      v_cesantia_days := 0;
    elsif v_whole_months < 6 then
      v_preaviso_days := 7;
      v_cesantia_days := 6;
    elsif v_whole_months < 12 then
      v_preaviso_days := 14;
      v_cesantia_days := 13;
    else
      v_preaviso_days := 28;
      v_cesantia_rate := case when v_whole_years >= 5 then 23 else 21 end;
      v_cesantia_days := v_whole_years * v_cesantia_rate
        + (v_months_since_anniv / 12.0) * v_cesantia_rate;
    end if;

    v_preaviso_amount := round(v_preaviso_days * v_daily_salary, 2);
    v_cesantia_amount := round(v_cesantia_days * v_daily_salary, 2);
  end if;

  -- Vacaciones no disfrutadas (Art. 177): derecho ganado, se paga sin
  -- importar el motivo de la baja. 14 dias/ano (18 desde el 6to ano),
  -- prorateado por los meses corridos desde el ultimo aniversario.
  v_vacation_rate := case when v_whole_years >= 5 then 18 else 14 end;
  v_vacation_days := round(v_vacation_rate * (v_months_since_anniv / 12.0), 2);
  v_vacation_amount := round(v_vacation_days * v_daily_salary, 2);

  -- Regalia pascual proporcional (Art. 219): tambien es un derecho ganado,
  -- se paga sin importar el motivo. Proporcional a los meses trabajados
  -- en el ano calendario en curso.
  v_year_start := greatest(date_trunc('year', p_last_working_day)::date, v_hire_date);
  v_year_age := age(p_last_working_day, v_year_start);
  v_months_this_year := extract(year from v_year_age)::numeric * 12
    + extract(month from v_year_age)::numeric
    + (extract(day from v_year_age)::numeric / 30.0);
  v_christmas_bonus := round(p_monthly_salary * (v_months_this_year / 12.0), 2);

  v_total := v_preaviso_amount + v_cesantia_amount + v_vacation_amount + v_christmas_bonus;

  insert into public.offboarding_processes (
    tenant_id, employee_id, reason, last_working_day, monthly_salary,
    years_of_service, preaviso_days, preaviso_amount, cesantia_days, cesantia_amount,
    vacation_days_pending, vacation_amount, christmas_bonus_amount, total_liquidation, notes
  )
  values (
    v_tenant_id, p_employee_id, p_reason, p_last_working_day, p_monthly_salary,
    round(v_whole_months / 12.0, 2), v_preaviso_days, v_preaviso_amount, v_cesantia_days, v_cesantia_amount,
    v_vacation_days, v_vacation_amount, v_christmas_bonus, v_total, p_notes
  )
  returning id into v_process_id;

  insert into public.offboarding_tasks (process_id, title, description, order_index)
  values
    (v_process_id, 'Notificar la salida a supervisor y equipo', null, 0),
    (v_process_id, 'Desactivar accesos y cuentas (correo, sistemas internos)', null, 1),
    (v_process_id, 'Recuperar equipos y materiales de la empresa', null, 2),
    (v_process_id, 'Realizar entrevista de salida', null, 3),
    (v_process_id, 'Preparar y firmar carta de trabajo / certificacion laboral', null, 4),
    (v_process_id, 'Entregar liquidacion final y firmar recibo de descargo', null, 5);

  update public.employees
  set status = 'terminated'
  where id = p_employee_id;

  return v_process_id;
end;
$$;

grant execute on function public.start_offboarding_process(uuid, text, date, numeric, text) to authenticated;

-- ---------- RLS ----------
alter table public.offboarding_processes enable row level security;
alter table public.offboarding_tasks enable row level security;

create policy offboarding_processes_select on public.offboarding_processes
  for select using (tenant_id in (select public.my_manager_tenant_ids()));

create policy offboarding_processes_insert on public.offboarding_processes
  for insert with check (tenant_id in (select public.my_manager_tenant_ids()));

create policy offboarding_processes_update on public.offboarding_processes
  for update using (tenant_id in (select public.my_manager_tenant_ids()));

create policy offboarding_processes_delete on public.offboarding_processes
  for delete using (tenant_id in (select public.my_manager_tenant_ids()));

create policy offboarding_tasks_select on public.offboarding_tasks
  for select using (tenant_id in (select public.my_manager_tenant_ids()));

create policy offboarding_tasks_insert on public.offboarding_tasks
  for insert with check (
    process_id in (
      select id from public.offboarding_processes
      where tenant_id in (select public.my_manager_tenant_ids())
    )
  );

create policy offboarding_tasks_update on public.offboarding_tasks
  for update using (tenant_id in (select public.my_manager_tenant_ids()));

create policy offboarding_tasks_delete on public.offboarding_tasks
  for delete using (tenant_id in (select public.my_manager_tenant_ids()));
