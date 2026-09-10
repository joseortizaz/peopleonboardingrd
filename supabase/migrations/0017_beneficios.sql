-- =========================================================
-- Beneficios v1:
--  1) benefit_types: catalogo de tipos de beneficio del tenant
--     (ARS, seguro de vida, vale de alimentacion, convenio, otro),
--     con proveedor y aporte de referencia de empresa/empleado.
--  2) employee_benefits: asignacion de un beneficio a un empleado,
--     con fecha de inicio y fin opcional (null o futura = activa).
--     CRUD directo via RLS (mismo patron que employee_documents),
--     sin RPC -- no hay invariante que justifique security definer.
--  3) benefit_dependents: dependientes cubiertos bajo una asignacion
--     (conyuge, hijos, etc.); tenant_id derivado por trigger desde
--     la asignacion, nunca del cliente (mismo patron que ATS/bajas).
--     Solo gestion los registra en v1 (sin autoservicio de escritura).
--
-- Nota: las tres tablas se crean primero (sin RLS todavia) porque la
-- policy de select de benefit_types necesita poder referenciar ya a
-- employee_benefits.
-- =========================================================

-- Limpieza defensiva: el primer intento de esta migracion fallo a medio
-- correr (el orden original creaba la policy de benefit_types antes de
-- que existiera employee_benefits), dejando el tipo/tabla benefit_types
-- ya creados sin sus policies. Este bloque deja todo en blanco antes de
-- recrear, sin importar cuanto haya avanzado el intento anterior.
drop table if exists public.benefit_dependents cascade;
drop table if exists public.employee_benefits cascade;
drop table if exists public.benefit_types cascade;
drop type if exists public.benefit_category;

create type public.benefit_category as enum ('ars', 'seguro_vida', 'vale_alimentacion', 'convenio', 'otro');

create table public.benefit_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  category public.benefit_category not null default 'otro',
  provider text,
  employer_cost numeric(12, 2) not null default 0,
  employee_cost numeric(12, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create index benefit_types_tenant_id_idx on public.benefit_types(tenant_id);

create table public.employee_benefits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  benefit_type_id uuid not null references public.benefit_types(id) on delete cascade,
  start_date date not null default current_date,
  end_date date,
  notes text,
  created_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create index employee_benefits_tenant_id_idx on public.employee_benefits(tenant_id);
create index employee_benefits_employee_id_idx on public.employee_benefits(employee_id);
create index employee_benefits_benefit_type_id_idx on public.employee_benefits(benefit_type_id);

create table public.benefit_dependents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_benefit_id uuid not null references public.employee_benefits(id) on delete cascade,
  full_name text not null,
  relationship text not null check (relationship in ('conyuge', 'hijo', 'hija', 'padre', 'madre', 'otro')),
  birth_date date,
  created_at timestamptz not null default now()
);

create index benefit_dependents_tenant_id_idx on public.benefit_dependents(tenant_id);
create index benefit_dependents_employee_benefit_id_idx on public.benefit_dependents(employee_benefit_id);

-- ---------- RLS: benefit_types ----------
alter table public.benefit_types enable row level security;

create policy benefit_types_select on public.benefit_types
  for select using (
    tenant_id in (select public.my_manager_tenant_ids())
    or id in (
      select benefit_type_id from public.employee_benefits
      where employee_id in (select public.my_employee_ids())
    )
  );

create policy benefit_types_insert on public.benefit_types
  for insert with check (tenant_id in (select public.my_manager_tenant_ids()));

create policy benefit_types_update on public.benefit_types
  for update using (tenant_id in (select public.my_manager_tenant_ids()));

create policy benefit_types_delete on public.benefit_types
  for delete using (tenant_id in (select public.my_manager_tenant_ids()));

-- ---------- RLS: employee_benefits ----------
alter table public.employee_benefits enable row level security;

create policy employee_benefits_select on public.employee_benefits
  for select using (
    tenant_id in (select public.my_manager_tenant_ids())
    or employee_id in (select public.my_employee_ids())
  );

create policy employee_benefits_insert on public.employee_benefits
  for insert with check (tenant_id in (select public.my_manager_tenant_ids()));

create policy employee_benefits_update on public.employee_benefits
  for update using (tenant_id in (select public.my_manager_tenant_ids()));

create policy employee_benefits_delete on public.employee_benefits
  for delete using (tenant_id in (select public.my_manager_tenant_ids()));

-- ---------- RLS: benefit_dependents ----------
alter table public.benefit_dependents enable row level security;

create policy benefit_dependents_select on public.benefit_dependents
  for select using (
    tenant_id in (select public.my_manager_tenant_ids())
    or employee_benefit_id in (
      select id from public.employee_benefits
      where employee_id in (select public.my_employee_ids())
    )
  );

create policy benefit_dependents_insert on public.benefit_dependents
  for insert with check (tenant_id in (select public.my_manager_tenant_ids()));

create policy benefit_dependents_update on public.benefit_dependents
  for update using (tenant_id in (select public.my_manager_tenant_ids()));

create policy benefit_dependents_delete on public.benefit_dependents
  for delete using (tenant_id in (select public.my_manager_tenant_ids()));

-- El tenant_id de un dependiente se deriva de su asignacion, nunca del
-- cliente (mismo patron que set_candidate_tenant / set_offboarding_task_tenant).
create or replace function public.set_benefit_dependent_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select tenant_id into new.tenant_id
  from public.employee_benefits
  where id = new.employee_benefit_id;

  if new.tenant_id is null then
    raise exception 'Asignacion de beneficio invalida';
  end if;

  return new;
end;
$$;

drop trigger if exists set_benefit_dependent_tenant_trigger on public.benefit_dependents;

create trigger set_benefit_dependent_tenant_trigger
  before insert on public.benefit_dependents
  for each row execute function public.set_benefit_dependent_tenant();
