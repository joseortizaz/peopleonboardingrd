-- =========================================================
-- Estructura y puestos: bandas salariales versionadas por puesto.
-- Ver claude/plan-robustecer-estructura-puestos.md, seccion 2.
--
-- Mismo principio que payroll_fiscal_rules (migracion 0019): nunca se
-- sobrescribe una fila. Cambiar el rango de un puesto siempre inserta
-- una version nueva con una effective_from mas reciente; la banda
-- "vigente" en cualquier momento es la de mayor effective_from que sea
-- <= hoy. Por eso esta tabla, a diferencia del resto del esquema, NO
-- tiene policies de update ni delete -- el historial es inmutable por
-- diseno; corregir un error de captura significa insertar una version
-- nueva, no editar la anterior.
--
-- A diferencia de payroll_fiscal_rules (tasas de ley, iguales para
-- todos los tenants, lectura abierta a cualquier autenticado), una
-- banda salarial es dato propio y sensible de cada tenant: select
-- restringido a my_accessible_tenant_ids(), igual que el resto del
-- modulo de estructura. Nunca debe quedar expuesta a la bolsa de
-- empleo publica ni al formulario de aplicacion.
-- =========================================================

create table public.job_position_salary_bands (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  job_position_id uuid not null references public.job_positions(id) on delete cascade,
  min_salary numeric not null check (min_salary >= 0),
  max_salary numeric not null check (max_salary >= min_salary),
  effective_from date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index job_position_salary_bands_lookup_idx
  on public.job_position_salary_bands(job_position_id, effective_from desc);

alter table public.job_position_salary_bands enable row level security;

create policy job_position_salary_bands_select on public.job_position_salary_bands
  for select using (
    public.is_super_admin()
    or tenant_id in (select public.my_accessible_tenant_ids())
  );

create policy job_position_salary_bands_insert on public.job_position_salary_bands
  for insert with check (tenant_id in (select public.my_manager_tenant_ids()));

-- Deliberadamente sin policies de update/delete: el historial de bandas
-- es insert-only. Ver comentario de cabecera.
