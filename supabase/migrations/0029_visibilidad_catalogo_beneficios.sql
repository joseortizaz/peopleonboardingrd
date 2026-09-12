-- La seccion "Solicitar un beneficio" en Mi espacio (migracion 0028)
-- necesita que el empleado pueda ver el catalogo completo de beneficios
-- de su propio tenant, no solo los que ya tiene asignados -- la policy
-- de select de 0017_beneficios.sql solo permitia esto ultimo (via
-- employee_benefits), asi que el catalogo aparecia vacio para cualquier
-- empleado sin beneficios ya asignados. Se amplia la policy para incluir
-- cualquier beneficio del propio tenant del empleado (nombre, categoria,
-- proveedor y aportes de referencia no son datos sensibles) -- esto
-- reemplaza la condicion anterior por completo (era un subconjunto).

drop policy if exists benefit_types_select on public.benefit_types;

create policy benefit_types_select on public.benefit_types
  for select using (
    tenant_id in (select public.my_manager_tenant_ids())
    or tenant_id in (
      select tenant_id from public.employees
      where id in (select public.my_employee_ids())
    )
  );
