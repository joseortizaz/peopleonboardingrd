-- =========================================================
-- Portal del cliente (solo lectura):
--  1) client_invites: RR.HH./gestor invita a un correo como 'client'
--     de un tenant (mismo patron que employees.email + handle_new_user,
--     pero sin registro de "empleado" detras: el cliente no es un
--     colaborador, solo un contacto externo con acceso de lectura).
--  2) handle_new_user() se extiende para consumir invitaciones de
--     cliente pendientes al registrarse.
--  3) link_my_client_record(): reintento retroactivo, mismo patron
--     que link_my_employee_record() (0007), para el caso en que la
--     cuenta ya existia antes de la invitacion.
--  4) my_client_tenant_ids(): tenants donde el usuario es 'client'.
--  5) my_team_tenant_ids(): variante de my_accessible_tenant_ids()
--     que EXCLUYE membresias 'client' — se usa para angostar
--     vacancies_select_team y candidates_select_team, que hasta ahora
--     daban lectura completa (cualquier estado/etapa) a cualquier
--     miembro del tenant. Sin este cambio, agregar el rol 'client'
--     habria heredado esa lectura amplia por accidente.
--  6) Policies de select especificas para 'client':
--     - vacantes: solo publicadas o cerradas (no borradores).
--     - candidatos: solo etapa 'contratado' ("perfiles aprobados").
--     - evaluaciones / evaluation_scores: solo completadas, todo el
--       tenant (igual alcance que evaluations_select_manager pero
--       limitado a status = 'completada', sin poder escribir nada).
--  7) Revocar acceso: borrar el client_invite despues de consumido no
--     quita el acceso por si solo (la membresia ya existe aparte), asi
--     que client_invites guarda consumed_by y se agrega una policy de
--     delete sobre memberships acotada a role = 'client' dentro de los
--     tenants del gestor, para poder revocar de verdad.
-- =========================================================

create table public.client_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null,
  consumed_at timestamptz,
  consumed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index client_invites_tenant_id_idx on public.client_invites(tenant_id);
create index client_invites_email_idx on public.client_invites(email);

alter table public.client_invites enable row level security;

create policy client_invites_select on public.client_invites
  for select using (tenant_id in (select public.my_manager_tenant_ids()));

create policy client_invites_insert on public.client_invites
  for insert with check (tenant_id in (select public.my_manager_tenant_ids()));

create policy client_invites_delete on public.client_invites
  for delete using (tenant_id in (select public.my_manager_tenant_ids()));

-- Permite a un gestor revocar el acceso de un cliente ya activo: borra la
-- membresia 'client' correspondiente (acotado a ese rol y a sus propios
-- tenants — no puede tocar membresias de otros roles).
create policy memberships_delete_client_by_manager on public.memberships
  for delete using (
    role = 'client'
    and tenant_id in (select public.my_manager_tenant_ids())
  );

-- ---------- handle_new_user(): tambien consume invitaciones de cliente ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee record;
  v_invite record;
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

  for v_invite in
    select id, tenant_id from public.client_invites
    where email = new.email and consumed_at is null
  loop
    update public.client_invites
    set consumed_at = now(), consumed_by = new.id
    where id = v_invite.id;

    insert into public.memberships (profile_id, tenant_id, role)
    values (new.id, v_invite.tenant_id, 'client')
    on conflict do nothing;
  end loop;

  return new;
end;
$$;

-- ---------- Reintento retroactivo (cuenta creada antes de la invitacion) ----------
create or replace function public.link_my_client_record()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_email text;
  v_invite record;
begin
  select email into v_user_email from auth.users where id = auth.uid();
  if v_user_email is null then
    return;
  end if;

  for v_invite in
    select id, tenant_id from public.client_invites
    where email = v_user_email and consumed_at is null
  loop
    update public.client_invites
    set consumed_at = now(), consumed_by = auth.uid()
    where id = v_invite.id;

    insert into public.memberships (profile_id, tenant_id, role)
    values (auth.uid(), v_invite.tenant_id, 'client')
    on conflict do nothing;
  end loop;
end;
$$;

grant execute on function public.link_my_client_record() to authenticated;

-- ---------- Tenants donde el usuario es 'client' ----------
create or replace function public.my_client_tenant_ids()
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
    and m.role = 'client'
  union
  select m.tenant_id
  from public.memberships m
  where m.profile_id = auth.uid()
    and m.tenant_id is not null
    and m.role = 'client'
$$;

-- ---------- Tenants accesibles EXCLUYENDO membresias 'client' ----------
-- (para no heredar por accidente la lectura amplia de vacancies/candidates)
create or replace function public.my_team_tenant_ids()
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
    and m.role <> 'client'
  union
  select m.tenant_id
  from public.memberships m
  where m.profile_id = auth.uid()
    and m.tenant_id is not null
    and m.role <> 'client'
$$;

-- ---------- Angostar lectura amplia existente de vacancies/candidates ----------
drop policy if exists vacancies_select_team on public.vacancies;
create policy vacancies_select_team on public.vacancies
  for select using (
    public.is_super_admin()
    or tenant_id in (select public.my_team_tenant_ids())
  );

drop policy if exists candidates_select_team on public.candidates;
create policy candidates_select_team on public.candidates
  for select using (
    public.is_super_admin()
    or tenant_id in (select public.my_team_tenant_ids())
  );

-- ---------- Lectura para 'client' ----------
create policy vacancies_select_client on public.vacancies
  for select using (
    tenant_id in (select public.my_client_tenant_ids())
    and status in ('published', 'closed')
  );

create policy candidates_select_client on public.candidates
  for select using (
    tenant_id in (select public.my_client_tenant_ids())
    and stage = 'contratado'
  );

create policy evaluations_select_client on public.evaluations
  for select using (
    tenant_id in (select public.my_client_tenant_ids())
    and status = 'completada'
  );

create policy evaluation_scores_select_client on public.evaluation_scores
  for select using (
    evaluation_id in (
      select id from public.evaluations
      where status = 'completada'
        and tenant_id in (select public.my_client_tenant_ids())
    )
  );
