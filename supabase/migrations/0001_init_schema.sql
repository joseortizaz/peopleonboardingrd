-- =========================================================
-- NexusHR / People Onboarding RD - Esquema inicial Fase 1
-- Modelo: account -> tenant -> employee (multi-tenant)
-- =========================================================

-- ---------- Tipos ----------
create type public.account_kind as enum ('company', 'outsourcing_agency');

create type public.member_role as enum (
  'super_admin',    -- plataforma (Narnia Tech)
  'account_admin',  -- dueño de la cuenta: gerente RR.HH. o gestor de outsourcing
  'hr_manager',     -- gestor de RR.HH. (uno o varios tenants)
  'supervisor',     -- jefe de equipo
  'employee',       -- autoservicio
  'client',         -- solo lectura, modo agencia
  'candidate'       -- publico, aplica a vacantes
);

-- ---------- Cuentas (quien paga la suscripcion) ----------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind public.account_kind not null default 'company',
  rnc text,
  created_at timestamptz not null default now()
);

-- ---------- Tenants (empresa operativa dentro de una cuenta) ----------
-- Una cuenta 'company' tiene 1 tenant. Una cuenta 'outsourcing_agency'
-- tiene 1 tenant por cada cliente que gestiona.
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null,
  slug text not null unique,
  rnc text,
  white_label boolean not null default false,
  logo_url text,
  created_at timestamptz not null default now()
);

create index tenants_account_id_idx on public.tenants(account_id);

-- ---------- Perfiles (extiende auth.users) ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  created_at timestamptz not null default now()
);

-- ---------- Membresias (rol de un perfil dentro de una cuenta o tenant) ----------
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  constraint membership_scope_check check (
    (account_id is not null and tenant_id is null)
    or (tenant_id is not null)
  )
);

create index memberships_profile_id_idx on public.memberships(profile_id);
create index memberships_tenant_id_idx on public.memberships(tenant_id);
create index memberships_account_id_idx on public.memberships(account_id);

-- ---------- Departamentos (estructura organizacional minima) ----------
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  parent_department_id uuid references public.departments(id) on delete set null,
  created_at timestamptz not null default now()
);

create index departments_tenant_id_idx on public.departments(tenant_id);

-- ---------- Empleados (registro base, autoservicio v1) ----------
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  full_name text not null,
  position text,
  hire_date date,
  status text not null default 'active', -- active | on_leave | terminated
  created_at timestamptz not null default now()
);

create index employees_tenant_id_idx on public.employees(tenant_id);

-- =========================================================
-- Helpers de autorizacion
-- =========================================================

-- IDs de tenant a los que el usuario autenticado tiene acceso directo
create or replace function public.my_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.tenant_id
  from public.memberships m
  where m.profile_id = auth.uid()
    and m.tenant_id is not null
$$;

-- IDs de tenant accesibles via una cuenta (account_admin / hr_manager a nivel cuenta,
-- o super_admin implicito via cuenta) mas los directos de arriba
create or replace function public.my_accessible_tenant_ids()
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
  union
  select * from public.my_tenant_ids()
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.profile_id = auth.uid() and m.role = 'super_admin'
  )
$$;

-- =========================================================
-- Row Level Security
-- =========================================================

alter table public.accounts enable row level security;
alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.departments enable row level security;
alter table public.employees enable row level security;

-- accounts: visible si el usuario tiene alguna membresia en la cuenta o en un tenant hijo
create policy accounts_select on public.accounts
  for select using (
    public.is_super_admin()
    or id in (select account_id from public.memberships where profile_id = auth.uid() and account_id is not null)
    or id in (select account_id from public.tenants where id in (select public.my_tenant_ids()))
  );

-- tenants: visible si es accesible para el usuario
create policy tenants_select on public.tenants
  for select using (
    public.is_super_admin()
    or id in (select public.my_accessible_tenant_ids())
  );

-- profiles: cada quien ve/edita su propio perfil; los admins ven perfiles de su(s) tenant(s)
create policy profiles_select_self on public.profiles
  for select using (id = auth.uid());

create policy profiles_update_self on public.profiles
  for update using (id = auth.uid());

-- memberships: el usuario ve sus propias membresias
create policy memberships_select_self on public.memberships
  for select using (profile_id = auth.uid());

-- departments / employees: scoped por tenant accesible
create policy departments_select on public.departments
  for select using (
    public.is_super_admin()
    or tenant_id in (select public.my_accessible_tenant_ids())
  );

create policy employees_select on public.employees
  for select using (
    public.is_super_admin()
    or tenant_id in (select public.my_accessible_tenant_ids())
  );

-- Nota: las policies de select cubren el arranque (lectura por tenant).
-- Las policies de insert/update/delete por rol (hr_manager, supervisor, etc.)
-- se agregan en la migracion de Fase 1 cuando se construyan las pantallas
-- de administracion, para no bloquear el desarrollo inicial con reglas
-- de escritura aun no validadas contra la UI real.
