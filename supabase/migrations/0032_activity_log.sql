-- =========================================================
-- Registro de actividad para facturacion de outsourcing:
-- registra automaticamente hitos facturables (vacante publicada,
-- candidato contratado, evaluacion completada, incorporacion
-- iniciada, baja iniciada) para que un gestor de outsourcing arme
-- la factura mensual de cada cliente (tenant) que administra.
--
-- v1: solo conteo/listado de referencia, sin monto por actividad
-- (el gestor arma la factura afuera con sus propias tarifas).
-- Solo lectura para gestion del tenant (my_manager_tenant_ids());
-- el cliente (rol 'client') nunca lo ve -- es informacion interna
-- de facturacion del gestor, no del portal de solo lectura.
-- =========================================================

create type public.activity_log_type as enum (
  'vacante_publicada',
  'candidato_contratado',
  'evaluacion_completada',
  'incorporacion_iniciada',
  'baja_iniciada'
);

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  activity_type public.activity_log_type not null,
  description text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index activity_log_tenant_id_idx on public.activity_log(tenant_id);
create index activity_log_occurred_at_idx on public.activity_log(occurred_at);

alter table public.activity_log enable row level security;

create policy activity_log_select on public.activity_log
  for select using (tenant_id in (select public.my_manager_tenant_ids()));

-- El insert en la practica solo lo hacen los triggers de abajo (todos
-- security definer, corren como el dueno de la funcion y por lo tanto no
-- dependen de esta policy) -- se deja de todas formas como defensa en
-- profundidad, mismo criterio que el resto del sistema.
create policy activity_log_insert on public.activity_log
  for insert with check (tenant_id in (select public.my_manager_tenant_ids()));

-- ---------- Trigger: vacante publicada ----------
create or replace function public.log_vacancy_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'published' and (old.status is distinct from 'published') then
    insert into public.activity_log (tenant_id, activity_type, description)
    values (new.tenant_id, 'vacante_publicada', 'Vacante publicada: ' || new.title);
  end if;
  return new;
end;
$$;

drop trigger if exists log_vacancy_published_trigger on public.vacancies;

create trigger log_vacancy_published_trigger
  after update of status on public.vacancies
  for each row execute function public.log_vacancy_published();

-- ---------- Trigger: candidato contratado ----------
create or replace function public.log_candidate_hired()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vacancy_title text;
begin
  if new.stage = 'contratado' and (old.stage is distinct from 'contratado') then
    select title into v_vacancy_title from public.vacancies where id = new.vacancy_id;
    insert into public.activity_log (tenant_id, activity_type, description)
    values (
      new.tenant_id,
      'candidato_contratado',
      'Candidato contratado: ' || new.full_name
        || case when v_vacancy_title is not null then ' (' || v_vacancy_title || ')' else '' end
    );
  end if;
  return new;
end;
$$;

drop trigger if exists log_candidate_hired_trigger on public.candidates;

create trigger log_candidate_hired_trigger
  after update of stage on public.candidates
  for each row execute function public.log_candidate_hired();

-- ---------- Trigger: evaluacion completada ----------
create or replace function public.log_evaluation_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_name text;
begin
  if new.status = 'completada' and (old.status is distinct from 'completada') then
    select full_name into v_employee_name from public.employees where id = new.employee_id;
    insert into public.activity_log (tenant_id, activity_type, description)
    values (
      new.tenant_id,
      'evaluacion_completada',
      'Evaluación completada: ' || coalesce(v_employee_name, 'empleado') || ' (' || new.type || '°)'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists log_evaluation_completed_trigger on public.evaluations;

create trigger log_evaluation_completed_trigger
  after update of status on public.evaluations
  for each row execute function public.log_evaluation_completed();

-- ---------- Trigger: incorporacion iniciada ----------
create or replace function public.log_onboarding_started()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_name text;
begin
  select full_name into v_employee_name from public.employees where id = new.employee_id;
  insert into public.activity_log (tenant_id, activity_type, description)
  values (
    new.tenant_id,
    'incorporacion_iniciada',
    'Incorporación iniciada: ' || coalesce(v_employee_name, 'empleado')
  );
  return new;
end;
$$;

drop trigger if exists log_onboarding_started_trigger on public.onboarding_processes;

create trigger log_onboarding_started_trigger
  after insert on public.onboarding_processes
  for each row execute function public.log_onboarding_started();

-- ---------- Trigger: baja iniciada ----------
create or replace function public.log_offboarding_started()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_name text;
begin
  select full_name into v_employee_name from public.employees where id = new.employee_id;
  insert into public.activity_log (tenant_id, activity_type, description)
  values (
    new.tenant_id,
    'baja_iniciada',
    'Baja iniciada: ' || coalesce(v_employee_name, 'empleado') || ' (' || new.reason || ')'
  );
  return new;
end;
$$;

drop trigger if exists log_offboarding_started_trigger on public.offboarding_processes;

create trigger log_offboarding_started_trigger
  after insert on public.offboarding_processes
  for each row execute function public.log_offboarding_started();
