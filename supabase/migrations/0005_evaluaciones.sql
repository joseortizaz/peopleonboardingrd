-- =========================================================
-- Empleados: policies de escritura que faltaban (0001 solo
-- dejo select), y modulo de evaluacion de desempeno
-- =========================================================

create policy employees_insert on public.employees
  for insert with check (tenant_id in (select public.my_accessible_tenant_ids()));

create policy employees_update on public.employees
  for update using (tenant_id in (select public.my_accessible_tenant_ids()));

create policy employees_delete on public.employees
  for delete using (tenant_id in (select public.my_accessible_tenant_ids()));

-- ---------- Tipos ----------
create type public.eval_type as enum ('90', '180', '360');
create type public.evaluation_status as enum ('en_progreso', 'completada');

-- ---------- Plantillas reutilizables ----------
create table public.evaluation_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create index evaluation_templates_tenant_id_idx on public.evaluation_templates(tenant_id);

create table public.template_competencies (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.evaluation_templates(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  weight numeric(6,2) not null default 1,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

create index template_competencies_template_id_idx on public.template_competencies(template_id);

create or replace function public.set_competency_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select tenant_id into new.tenant_id
  from public.evaluation_templates
  where id = new.template_id;

  if new.tenant_id is null then
    raise exception 'Plantilla invalida';
  end if;

  return new;
end;
$$;

drop trigger if exists set_competency_tenant_trigger on public.template_competencies;

create trigger set_competency_tenant_trigger
  before insert on public.template_competencies
  for each row execute function public.set_competency_tenant();

-- ---------- Evaluaciones ----------
create table public.evaluations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  template_id uuid not null references public.evaluation_templates(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete cascade,
  evaluator_profile_id uuid references public.profiles(id) on delete set null,
  type public.eval_type not null default '90',
  status public.evaluation_status not null default 'en_progreso',
  overall_score numeric(4,2),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index evaluations_tenant_id_idx on public.evaluations(tenant_id);
create index evaluations_employee_id_idx on public.evaluations(employee_id);

create table public.evaluation_scores (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  competency_id uuid not null references public.template_competencies(id) on delete cascade,
  score smallint check (score between 1 and 5),
  comments text,
  updated_at timestamptz not null default now(),
  unique (evaluation_id, competency_id)
);

create index evaluation_scores_evaluation_id_idx on public.evaluation_scores(evaluation_id);

create or replace function public.set_evaluation_score_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select tenant_id into new.tenant_id
  from public.evaluations
  where id = new.evaluation_id;

  if new.tenant_id is null then
    raise exception 'Evaluacion invalida';
  end if;

  return new;
end;
$$;

drop trigger if exists set_evaluation_score_tenant_trigger on public.evaluation_scores;

create trigger set_evaluation_score_tenant_trigger
  before insert on public.evaluation_scores
  for each row execute function public.set_evaluation_score_tenant();

-- =========================================================
-- Row Level Security (todo scoped al tenant, sin acceso publico)
-- =========================================================

alter table public.evaluation_templates enable row level security;
alter table public.template_competencies enable row level security;
alter table public.evaluations enable row level security;
alter table public.evaluation_scores enable row level security;

create policy evaluation_templates_all on public.evaluation_templates
  for all using (tenant_id in (select public.my_accessible_tenant_ids()))
  with check (tenant_id in (select public.my_accessible_tenant_ids()));

create policy template_competencies_select on public.template_competencies
  for select using (tenant_id in (select public.my_accessible_tenant_ids()));

create policy template_competencies_insert on public.template_competencies
  for insert with check (
    template_id in (
      select id from public.evaluation_templates
      where tenant_id in (select public.my_accessible_tenant_ids())
    )
  );

create policy template_competencies_delete on public.template_competencies
  for delete using (tenant_id in (select public.my_accessible_tenant_ids()));

create policy evaluations_all on public.evaluations
  for all using (tenant_id in (select public.my_accessible_tenant_ids()))
  with check (tenant_id in (select public.my_accessible_tenant_ids()));

create policy evaluation_scores_select on public.evaluation_scores
  for select using (tenant_id in (select public.my_accessible_tenant_ids()));

create policy evaluation_scores_insert on public.evaluation_scores
  for insert with check (
    evaluation_id in (
      select id from public.evaluations
      where tenant_id in (select public.my_accessible_tenant_ids())
    )
  );

create policy evaluation_scores_update on public.evaluation_scores
  for update using (tenant_id in (select public.my_accessible_tenant_ids()));
