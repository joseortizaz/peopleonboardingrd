-- =========================================================
-- Estructura y puestos: catalogo de puestos (job_positions).
-- Ver claude/plan-robustecer-estructura-puestos.md, seccion 1.
--
-- Hasta ahora "puesto" no era una entidad -- solo el texto libre
-- employees.position, sin relacion a nada. Esta migracion crea el
-- catalogo de puestos por tenant, migra automaticamente los valores
-- de texto ya existentes hacia filas de la tabla nueva, y agrega
-- employees.job_position_id apuntando al puesto correspondiente.
-- La columna employees.position NO se elimina (queda como respaldo/
-- heredada), pero los formularios de empleado pasan a usar el
-- selector del catalogo en vez de texto libre.
-- =========================================================

create table public.job_positions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  title text not null,
  mission text,
  created_at timestamptz not null default now()
);

create index job_positions_tenant_id_idx on public.job_positions(tenant_id);

comment on column public.job_positions.mission is
  'Mision/proposito del puesto (opcional). Funciones y competencias tecnicas/blandas quedan '
  'fuera de esta primera version -- ver claude/plan-robustecer-estructura-puestos.md, seccion 3.';

alter table public.job_positions enable row level security;

-- Mismo patron que departments: select abierto a cualquiera con acceso
-- al tenant, escritura restringida a roles de gestion (my_manager_tenant_ids).
create policy job_positions_select on public.job_positions
  for select using (
    public.is_super_admin()
    or tenant_id in (select public.my_accessible_tenant_ids())
  );

create policy job_positions_insert on public.job_positions
  for insert with check (tenant_id in (select public.my_manager_tenant_ids()));

create policy job_positions_update on public.job_positions
  for update using (tenant_id in (select public.my_manager_tenant_ids()));

create policy job_positions_delete on public.job_positions
  for delete using (tenant_id in (select public.my_manager_tenant_ids()));

-- ---------- employees.job_position_id ----------
alter table public.employees
  add column job_position_id uuid references public.job_positions(id) on delete set null;

comment on column public.employees.position is
  'Heredado: texto libre de puesto anterior al catalogo job_positions. Se conserva por '
  'compatibilidad, pero los formularios ya usan job_position_id. Ver migracion 0038.';

-- ---------- Migracion de datos: texto libre -> catalogo ----------
-- Un job_position por cada valor distinto (tenant_id, position) que ya
-- exista hoy, agrupando por texto exacto (recortado de espacios).
insert into public.job_positions (tenant_id, title)
select distinct e.tenant_id, trim(e.position)
from public.employees e
where e.position is not null
  and trim(e.position) <> ''
  and not exists (
    select 1 from public.job_positions jp
    where jp.tenant_id = e.tenant_id and jp.title = trim(e.position)
  );

-- Enlaza cada empleado con el puesto recien creado (o ya existente)
-- que coincida exactamente con su texto de position actual.
update public.employees e
set job_position_id = jp.id
from public.job_positions jp
where jp.tenant_id = e.tenant_id
  and jp.title = trim(e.position)
  and e.position is not null
  and trim(e.position) <> ''
  and e.job_position_id is null;
