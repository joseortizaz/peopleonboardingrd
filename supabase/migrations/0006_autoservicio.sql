-- =========================================================
-- Autoservicio del empleado:
--  1) email en employees + auto-vinculo de acceso al registrarse
--  2) my_manager_tenant_ids(): antes, cualquier miembro del tenant
--     (incluido un futuro rol 'employee') podia crear/editar/borrar
--     departamentos, empleados, vacantes y evaluaciones. Ahora que
--     los empleados van a tener su propio login, eso hay que cerrarlo:
--     solo super_admin/account_admin/hr_manager pueden escribir.
--  3) el empleado puede ver sus propias evaluaciones completadas
--     (y solo esas), no las de sus companeros.
-- =========================================================

alter table public.employees add column email text;

-- ---------- Auto-vinculo de acceso ----------
-- Si RR.HH. ya creo un registro de empleado con este correo (en cualquiera
-- de sus tenants), al registrarse esa persona queda vinculada como
-- 'employee' de ese tenant automaticamente.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee record;
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));

  for v_employee in
    select id, tenant_id from public.employees
    where email = new.email and profile_id is null
  loop
    update public.employees
    set profile_id = new.id
    where id = v_employee.id;

    insert into public.memberships (profile_id, tenant_id, role)
    values (new.id, v_employee.tenant_id, 'employee')
    on conflict do nothing;
  end loop;

  return new;
end;
$$;

-- ---------- Tenants donde el usuario tiene rol de gestion ----------
create or replace function public.my_manager_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.id
  from public.tenants t
  join public.memberships m on m.account_id = t.account_id
  where m.profile_id = auth.uid()
    and m.role in ('super_admin', 'account_admin', 'hr_manager')
  union
  select m.tenant_id
  from public.memberships m
  where m.profile_id = auth.uid()
    and m.tenant_id is not null
    and m.role in ('super_admin', 'account_admin', 'hr_manager')
$$;

-- ---------- Empleados propios del usuario autenticado ----------
create or replace function public.my_employee_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.employees where profile_id = auth.uid()
$$;

-- =========================================================
-- Endurecer policies de escritura: my_accessible_tenant_ids()
-- -> my_manager_tenant_ids()
-- =========================================================

drop policy if exists departments_insert on public.departments;
create policy departments_insert on public.departments
  for insert with check (tenant_id in (select public.my_manager_tenant_ids()));

drop policy if exists departments_update on public.departments;
create policy departments_update on public.departments
  for update using (tenant_id in (select public.my_manager_tenant_ids()));

drop policy if exists departments_delete on public.departments;
create policy departments_delete on public.departments
  for delete using (tenant_id in (select public.my_manager_tenant_ids()));

drop policy if exists employees_insert on public.employees;
create policy employees_insert on public.employees
  for insert with check (tenant_id in (select public.my_manager_tenant_ids()));

drop policy if exists employees_update on public.employees;
create policy employees_update on public.employees
  for update using (tenant_id in (select public.my_manager_tenant_ids()));

drop policy if exists employees_delete on public.employees;
create policy employees_delete on public.employees
  for delete using (tenant_id in (select public.my_manager_tenant_ids()));

drop policy if exists vacancies_insert on public.vacancies;
create policy vacancies_insert on public.vacancies
  for insert with check (tenant_id in (select public.my_manager_tenant_ids()));

drop policy if exists vacancies_update on public.vacancies;
create policy vacancies_update on public.vacancies
  for update using (tenant_id in (select public.my_manager_tenant_ids()));

drop policy if exists vacancies_delete on public.vacancies;
create policy vacancies_delete on public.vacancies
  for delete using (tenant_id in (select public.my_manager_tenant_ids()));

drop policy if exists candidates_update_team on public.candidates;
create policy candidates_update_team on public.candidates
  for update using (tenant_id in (select public.my_manager_tenant_ids()));

drop policy if exists candidates_delete_team on public.candidates;
create policy candidates_delete_team on public.candidates
  for delete using (tenant_id in (select public.my_manager_tenant_ids()));

-- evaluation_templates / template_competencies: separar select (equipo)
-- de escritura (solo gestores)
drop policy if exists evaluation_templates_all on public.evaluation_templates;

create policy evaluation_templates_select on public.evaluation_templates
  for select using (tenant_id in (select public.my_accessible_tenant_ids()));

create policy evaluation_templates_write on public.evaluation_templates
  for insert with check (tenant_id in (select public.my_manager_tenant_ids()));

create policy evaluation_templates_update on public.evaluation_templates
  for update using (tenant_id in (select public.my_manager_tenant_ids()));

create policy evaluation_templates_delete on public.evaluation_templates
  for delete using (tenant_id in (select public.my_manager_tenant_ids()));

drop policy if exists template_competencies_insert on public.template_competencies;
create policy template_competencies_insert on public.template_competencies
  for insert with check (
    template_id in (
      select id from public.evaluation_templates
      where tenant_id in (select public.my_manager_tenant_ids())
    )
  );

drop policy if exists template_competencies_delete on public.template_competencies;
create policy template_competencies_delete on public.template_competencies
  for delete using (tenant_id in (select public.my_manager_tenant_ids()));

-- evaluations: separar select de gestor (todo el tenant) de select propio
-- (solo su(s) evaluacion(es) completada(s)); escritura solo gestores
drop policy if exists evaluations_all on public.evaluations;

create policy evaluations_select_manager on public.evaluations
  for select using (
    public.is_super_admin()
    or tenant_id in (select public.my_manager_tenant_ids())
  );

create policy evaluations_select_self on public.evaluations
  for select using (
    status = 'completada'
    and employee_id in (select public.my_employee_ids())
  );

create policy evaluations_write on public.evaluations
  for insert with check (tenant_id in (select public.my_manager_tenant_ids()));

create policy evaluations_update on public.evaluations
  for update using (tenant_id in (select public.my_manager_tenant_ids()));

create policy evaluations_delete on public.evaluations
  for delete using (tenant_id in (select public.my_manager_tenant_ids()));

-- evaluation_scores: mismo criterio
drop policy if exists evaluation_scores_select on public.evaluation_scores;

create policy evaluation_scores_select_manager on public.evaluation_scores
  for select using (tenant_id in (select public.my_manager_tenant_ids()));

create policy evaluation_scores_select_self on public.evaluation_scores
  for select using (
    evaluation_id in (
      select id from public.evaluations
      where status = 'completada'
        and employee_id in (select public.my_employee_ids())
    )
  );

drop policy if exists evaluation_scores_insert on public.evaluation_scores;
create policy evaluation_scores_insert on public.evaluation_scores
  for insert with check (
    evaluation_id in (
      select id from public.evaluations
      where tenant_id in (select public.my_manager_tenant_ids())
    )
  );

drop policy if exists evaluation_scores_update on public.evaluation_scores;
create policy evaluation_scores_update on public.evaluation_scores
  for update using (tenant_id in (select public.my_manager_tenant_ids()));
