-- =========================================================
-- Inscripcion propia del empleado a un beneficio (autoservicio):
-- resuelve la brecha de la seccion 3 de Beneficios ("inscripcion
-- propia del empleado, hoy solo gestion asigna"), con el mismo
-- patron de solicitud + decision ya usado por leave_requests (0015):
-- el empleado solicita un beneficio del catalogo de su tenant desde
-- Mi espacio, gestion aprueba (lo que crea la fila real en
-- employee_benefits) o rechaza -- nunca se toca employee_benefits
-- directamente desde la solicitud del empleado.
--
-- Alcance v1 (decidido con el usuario): cualquier beneficio ya
-- creado por gestion en el catalogo puede ser solicitado (no hay
-- bandera de "disponible para autoservicio" todavia); la solicitud
-- no incluye dependientes -- si se aprueba, gestion los agrega
-- despues desde el detalle de la asignacion ya existente
-- (/app/beneficios/[id]), igual que con cualquier asignacion manual.
-- =========================================================

create table public.benefit_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  benefit_type_id uuid not null references public.benefit_types(id) on delete cascade,
  status text not null default 'pendiente' check (status in ('pendiente', 'aprobada', 'rechazada')),
  note text,
  resolution_note text,
  employee_benefit_id uuid references public.employee_benefits(id) on delete set null,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create index benefit_requests_tenant_id_idx on public.benefit_requests(tenant_id);
create index benefit_requests_employee_id_idx on public.benefit_requests(employee_id);

-- Como mucho una solicitud pendiente por empleado y beneficio a la vez
-- (evita que el empleado duplique el mismo pedido mientras espera
-- respuesta); una vez decidida (aprobada o rechazada) puede volver a
-- solicitarlo sin problema.
create unique index benefit_requests_one_pending_idx
  on public.benefit_requests(employee_id, benefit_type_id)
  where status = 'pendiente';

alter table public.benefit_requests enable row level security;

create policy benefit_requests_select on public.benefit_requests
  for select using (
    tenant_id in (select public.my_manager_tenant_ids())
    or employee_id in (select public.my_employee_ids())
  );

-- Respaldo directo (el flujo real pasa por request_benefit()):
create policy benefit_requests_insert on public.benefit_requests
  for insert with check (employee_id in (select public.my_employee_ids()));

-- El empleado puede cancelar su propia solicitud mientras siga
-- pendiente; gestion puede borrar cualquiera de su tenant (mismo
-- patron que leave_requests_delete).
create policy benefit_requests_delete on public.benefit_requests
  for delete using (
    (employee_id in (select public.my_employee_ids()) and status = 'pendiente')
    or tenant_id in (select public.my_manager_tenant_ids())
  );

-- La decision (aprobar/rechazar) pasa por decide_benefit_request();
-- esta policy es solo un respaldo si alguna vez se actualiza directo.
create policy benefit_requests_update on public.benefit_requests
  for update using (tenant_id in (select public.my_manager_tenant_ids()));

create or replace function public.request_benefit(
  p_tenant_id uuid,
  p_benefit_type_id uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id uuid;
  v_request_id uuid;
begin
  select id into v_employee_id
  from public.employees
  where profile_id = auth.uid() and tenant_id = p_tenant_id;

  if v_employee_id is null then
    raise exception 'No tienes un registro de empleado en este tenant';
  end if;

  if not exists (
    select 1 from public.benefit_types
    where id = p_benefit_type_id and tenant_id = p_tenant_id
  ) then
    raise exception 'El beneficio no existe en esta cuenta';
  end if;

  insert into public.benefit_requests (tenant_id, employee_id, benefit_type_id, note)
  values (p_tenant_id, v_employee_id, p_benefit_type_id, nullif(trim(coalesce(p_note, '')), ''))
  returning id into v_request_id;

  return v_request_id;
end;
$$;

grant execute on function public.request_benefit(uuid, uuid, text) to authenticated;

create or replace function public.decide_benefit_request(
  p_request_id uuid,
  p_decision text,
  p_resolution_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_employee_id uuid;
  v_benefit_type_id uuid;
  v_note text;
  v_status text;
  v_new_benefit_id uuid;
begin
  if p_decision not in ('aprobada', 'rechazada') then
    raise exception 'Decision invalida';
  end if;

  select tenant_id, employee_id, benefit_type_id, note, status
  into v_tenant_id, v_employee_id, v_benefit_type_id, v_note, v_status
  from public.benefit_requests
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

  if p_decision = 'aprobada' then
    insert into public.employee_benefits (tenant_id, employee_id, benefit_type_id, start_date, notes)
    values (v_tenant_id, v_employee_id, v_benefit_type_id, current_date, v_note)
    returning id into v_new_benefit_id;
  end if;

  update public.benefit_requests
  set status = p_decision,
      resolution_note = nullif(trim(coalesce(p_resolution_note, '')), ''),
      employee_benefit_id = v_new_benefit_id,
      decided_by = auth.uid(),
      decided_at = now()
  where id = p_request_id;
end;
$$;

grant execute on function public.decide_benefit_request(uuid, text, text) to authenticated;
