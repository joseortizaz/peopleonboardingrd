-- =========================================================
-- Desempeño: Plan de Desarrollo Individual (PDI)
--
-- Decisiones de alcance (confirmadas con el usuario):
-- 1. Origen: independiente -- gestión puede crear un PDI para
--    cualquier empleado en cualquier momento, sin depender de una
--    evaluación de desempeño completada.
-- 2. Autoría: gestión define el plan y sus metas; el empleado
--    actualiza el progreso/estado de cada meta desde su
--    autoservicio (mismo patrón que Incorporación).
-- 3. Detalle de seguimiento: cada meta tiene descripción, fecha
--    objetivo y estado simple (pendiente/en_progreso/completado) --
--    mismo nivel de detalle que las tareas de Incorporación, sin
--    notas intermedias de checkpoint.
-- =========================================================

create table public.development_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  title text not null,
  notes text,
  status text not null default 'en_progreso' check (status in ('en_progreso', 'completado')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index development_plans_tenant_id_idx on public.development_plans(tenant_id);
create index development_plans_employee_id_idx on public.development_plans(employee_id);

create table public.development_plan_goals (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.development_plans(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  description text not null,
  target_date date,
  status text not null default 'pendiente' check (status in ('pendiente', 'en_progreso', 'completado')),
  order_index int not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index development_plan_goals_plan_id_idx on public.development_plan_goals(plan_id);

-- Deriva tenant_id de la meta a partir de su plan, igual que
-- set_offboarding_task_tenant en 0009_offboarding.sql.
create or replace function public.set_development_goal_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select tenant_id into new.tenant_id
  from public.development_plans
  where id = new.plan_id;

  if new.tenant_id is null then
    raise exception 'Plan de desarrollo invalido';
  end if;

  return new;
end;
$$;

drop trigger if exists set_development_goal_tenant_trigger on public.development_plan_goals;

create trigger set_development_goal_tenant_trigger
  before insert on public.development_plan_goals
  for each row execute function public.set_development_goal_tenant();

-- Recalcula el estado del plan cada vez que se agrega, actualiza o
-- elimina una meta (mismo patrón bidireccional que onboarding/bajas,
-- pero cubriendo también insert/delete porque, a diferencia del
-- checklist fijo de bajas, aquí gestión puede agregar y quitar metas).
-- Guarda explícita: un plan sin metas nunca se marca "completado"
-- automáticamente.
create or replace function public.check_development_plan_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id uuid;
  v_total int;
  v_pending int;
begin
  v_plan_id := coalesce(new.plan_id, old.plan_id);

  select count(*), count(*) filter (where status <> 'completado')
  into v_total, v_pending
  from public.development_plan_goals
  where plan_id = v_plan_id;

  if v_total = 0 or v_pending > 0 then
    update public.development_plans
    set status = 'en_progreso', completed_at = null
    where id = v_plan_id and status = 'completado';
  else
    update public.development_plans
    set status = 'completado', completed_at = now()
    where id = v_plan_id and status <> 'completado';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists check_development_plan_completion_trigger on public.development_plan_goals;

create trigger check_development_plan_completion_trigger
  after insert or update of status or delete on public.development_plan_goals
  for each row execute function public.check_development_plan_completion();

-- ---------- RLS ----------
alter table public.development_plans enable row level security;
alter table public.development_plan_goals enable row level security;

create policy development_plans_select on public.development_plans
  for select using (
    tenant_id in (select public.my_manager_tenant_ids())
    or employee_id in (select public.my_employee_ids())
  );

create policy development_plans_insert on public.development_plans
  for insert with check (tenant_id in (select public.my_manager_tenant_ids()));

create policy development_plans_update on public.development_plans
  for update using (tenant_id in (select public.my_manager_tenant_ids()));

create policy development_plans_delete on public.development_plans
  for delete using (tenant_id in (select public.my_manager_tenant_ids()));

create policy development_plan_goals_select on public.development_plan_goals
  for select using (
    tenant_id in (select public.my_manager_tenant_ids())
    or plan_id in (
      select id from public.development_plans
      where employee_id in (select public.my_employee_ids())
    )
  );

create policy development_plan_goals_insert on public.development_plan_goals
  for insert with check (
    plan_id in (
      select id from public.development_plans
      where tenant_id in (select public.my_manager_tenant_ids())
    )
  );

-- El empleado solo puede actualizar el estado de sus propias metas
-- (la Server Action updateDevelopmentGoalStatus solo envía status y
-- completed_at, igual que toggleOnboardingTask); gestión puede
-- actualizar cualquier meta de su tenant.
create policy development_plan_goals_update on public.development_plan_goals
  for update using (
    tenant_id in (select public.my_manager_tenant_ids())
    or plan_id in (
      select id from public.development_plans
      where employee_id in (select public.my_employee_ids())
    )
  );

create policy development_plan_goals_delete on public.development_plan_goals
  for delete using (tenant_id in (select public.my_manager_tenant_ids()));
