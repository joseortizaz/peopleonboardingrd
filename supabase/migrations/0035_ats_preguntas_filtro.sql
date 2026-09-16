-- =========================================================
-- ATS: preguntas filtro configurables por vacante.
--
-- Dos tablas nuevas, mismo patron que el resto del ATS:
-- `vacancy_questions` (gestion, CRUD normal via my_accessible_tenant_ids)
-- y `candidate_answers` (insert publico junto con el candidato, protegido
-- igual que candidates_insert_public: la pregunta debe pertenecer a una
-- vacante publicada).
--
-- tenant_id en `candidate_answers` se deriva siempre de la pregunta via
-- trigger (nunca del cliente), igual que set_candidate_tenant() ya hace
-- para `candidates` -- necesario porque el insert puede venir de un
-- postulante anonimo.
--
-- v1 deliberadamente simple: sin logica de descalificacion automatica
-- (ver plan-robustecer-ats.md, seccion 2) -- una pregunta marcada
-- eliminatoria que rechace solo al candidato es una extension natural
-- para mas adelante, no bloquea nada de esto.
-- =========================================================

create type public.vacancy_question_type as enum ('texto', 'si_no', 'opcion_multiple');

create table public.vacancy_questions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  vacancy_id uuid not null references public.vacancies(id) on delete cascade,
  question_text text not null,
  question_type public.vacancy_question_type not null default 'texto',
  options jsonb, -- solo se usa cuando question_type = 'opcion_multiple'
  required boolean not null default false,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

create index vacancy_questions_vacancy_id_idx on public.vacancy_questions(vacancy_id);
create index vacancy_questions_tenant_id_idx on public.vacancy_questions(tenant_id);

create table public.candidate_answers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  question_id uuid not null references public.vacancy_questions(id) on delete cascade,
  answer_text text,
  created_at timestamptz not null default now()
);

create index candidate_answers_candidate_id_idx on public.candidate_answers(candidate_id);
create index candidate_answers_question_id_idx on public.candidate_answers(question_id);

create or replace function public.set_candidate_answer_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select tenant_id into new.tenant_id
  from public.vacancy_questions
  where id = new.question_id;

  if new.tenant_id is null then
    raise exception 'Pregunta invalida';
  end if;

  return new;
end;
$$;

drop trigger if exists set_candidate_answer_tenant_trigger on public.candidate_answers;

create trigger set_candidate_answer_tenant_trigger
  before insert on public.candidate_answers
  for each row execute function public.set_candidate_answer_tenant();

-- =========================================================
-- Row Level Security
-- =========================================================

alter table public.vacancy_questions enable row level security;
alter table public.candidate_answers enable row level security;

create policy vacancy_questions_select_team on public.vacancy_questions
  for select using (
    public.is_super_admin()
    or tenant_id in (select public.my_accessible_tenant_ids())
  );

-- El postulante anonimo tambien necesita leer las preguntas para
-- renderizar el formulario publico -- mismo criterio que
-- vacancies_select_public.
create policy vacancy_questions_select_public on public.vacancy_questions
  for select using (
    exists (
      select 1 from public.vacancies v
      where v.id = vacancy_id and v.status = 'published'
    )
  );

create policy vacancy_questions_insert on public.vacancy_questions
  for insert with check (tenant_id in (select public.my_accessible_tenant_ids()));

create policy vacancy_questions_update on public.vacancy_questions
  for update using (tenant_id in (select public.my_accessible_tenant_ids()));

create policy vacancy_questions_delete on public.vacancy_questions
  for delete using (tenant_id in (select public.my_accessible_tenant_ids()));

create policy candidate_answers_select_team on public.candidate_answers
  for select using (
    public.is_super_admin()
    or tenant_id in (select public.my_accessible_tenant_ids())
  );

create policy candidate_answers_insert_public on public.candidate_answers
  for insert with check (
    exists (
      select 1
      from public.vacancy_questions vq
      join public.vacancies v on v.id = vq.vacancy_id
      where vq.id = question_id and v.status = 'published'
    )
  );
