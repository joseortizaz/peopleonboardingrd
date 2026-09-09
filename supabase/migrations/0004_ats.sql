-- =========================================================
-- ATS: vacantes y candidatos, con acceso publico controlado
-- para el formulario de aplicacion (/apply/:slug)
-- =========================================================

create type public.vacancy_status as enum ('draft', 'published', 'closed');

create type public.candidate_stage as enum (
  'recibido',
  'en_revision',
  'entrevista_rh',
  'entrevista_gerencia',
  'prueba',
  'oferta',
  'contratado',
  'rechazado'
);

create table public.vacancies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  title text not null,
  slug text not null unique,
  description text,
  requirements text,
  status public.vacancy_status not null default 'draft',
  created_at timestamptz not null default now()
);

create index vacancies_tenant_id_idx on public.vacancies(tenant_id);

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  vacancy_id uuid not null references public.vacancies(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  resume_url text,
  stage public.candidate_stage not null default 'recibido',
  notes text,
  created_at timestamptz not null default now()
);

create index candidates_vacancy_id_idx on public.candidates(vacancy_id);
create index candidates_tenant_id_idx on public.candidates(tenant_id);

-- El tenant_id de un candidato se deriva siempre de su vacante, nunca del
-- cliente (importante porque el insert puede venir de un postulante anonimo).
create or replace function public.set_candidate_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select tenant_id into new.tenant_id
  from public.vacancies
  where id = new.vacancy_id;

  if new.tenant_id is null then
    raise exception 'Vacante invalida';
  end if;

  return new;
end;
$$;

drop trigger if exists set_candidate_tenant_trigger on public.candidates;

create trigger set_candidate_tenant_trigger
  before insert on public.candidates
  for each row execute function public.set_candidate_tenant();

-- =========================================================
-- Row Level Security
-- =========================================================

alter table public.vacancies enable row level security;
alter table public.candidates enable row level security;

-- Vacantes: el equipo del tenant ve todas las suyas (cualquier estado)
create policy vacancies_select_team on public.vacancies
  for select using (
    public.is_super_admin()
    or tenant_id in (select public.my_accessible_tenant_ids())
  );

-- Vacantes: cualquiera (incluido publico anonimo) ve las publicadas,
-- para el formulario de aplicacion y una futura bolsa de empleo publica.
create policy vacancies_select_public on public.vacancies
  for select using (status = 'published');

create policy vacancies_insert on public.vacancies
  for insert with check (tenant_id in (select public.my_accessible_tenant_ids()));

create policy vacancies_update on public.vacancies
  for update using (tenant_id in (select public.my_accessible_tenant_ids()));

create policy vacancies_delete on public.vacancies
  for delete using (tenant_id in (select public.my_accessible_tenant_ids()));

-- Candidatos: el equipo del tenant ve/gestiona los de sus vacantes
create policy candidates_select_team on public.candidates
  for select using (
    public.is_super_admin()
    or tenant_id in (select public.my_accessible_tenant_ids())
  );

create policy candidates_update_team on public.candidates
  for update using (tenant_id in (select public.my_accessible_tenant_ids()));

create policy candidates_delete_team on public.candidates
  for delete using (tenant_id in (select public.my_accessible_tenant_ids()));

-- Candidatos: cualquiera puede postularse (insert) a una vacante publicada.
-- El trigger de arriba fuerza el tenant_id correcto sin confiar en el cliente.
create policy candidates_insert_public on public.candidates
  for insert with check (
    exists (
      select 1 from public.vacancies v
      where v.id = vacancy_id and v.status = 'published'
    )
  );
