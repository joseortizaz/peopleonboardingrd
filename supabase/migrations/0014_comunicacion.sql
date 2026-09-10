-- =========================================================
-- Comunicacion interna y people analytics v1:
--  1) announcements: tablon de anuncios (gestion publica; todo el
--     equipo del tenant -- gestion, supervisores, empleados -- lee).
--  2) recognitions: reconocimientos entre companeros. Cualquier
--     empleado puede enviarle uno a otro empleado del mismo tenant.
--  3) climate_surveys / climate_survey_questions: encuestas de clima
--     con preguntas de escala 1-5 y/o texto libre, creadas por gestion.
--  4) climate_survey_responses / climate_survey_answers: respuestas.
--     Deliberadamente SIN policy de select para nadie, ni siquiera
--     gestion -- el vinculo respuesta<->empleado solo existe para
--     impedir una segunda respuesta, nunca para exponer "quien dijo
--     que". Todo el acceso pasa por las RPCs de abajo, que es donde
--     vive la garantia de anonimato.
--  5) send_recognition(): RPC que resuelve el employee_id propio del
--     usuario en el tenant del destinatario, para no depender de que
--     el cliente arme el from_employee_id a mano.
--  6) submit_climate_survey_response() / has_employee_responded_survey()
--     / count_climate_survey_responses() / get_climate_survey_results():
--     RPCs security definer -- la ultima nunca devuelve employee_id,
--     solo promedios y una lista de respuestas de texto sin vincular.
--
--  People analytics (rotacion, costo de nomina) no necesita tablas
--  nuevas: se calcula en la app a partir de employees/offboarding_processes
--  /payroll_periods/payroll_entries ya existentes.
-- =========================================================

-- ---------- Tablon de anuncios ----------
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  body text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index announcements_tenant_id_idx on public.announcements(tenant_id);

alter table public.announcements enable row level security;

create policy announcements_select on public.announcements
  for select using (tenant_id in (select public.my_team_tenant_ids()));

create policy announcements_insert on public.announcements
  for insert with check (tenant_id in (select public.my_manager_tenant_ids()));

create policy announcements_update on public.announcements
  for update using (tenant_id in (select public.my_manager_tenant_ids()));

create policy announcements_delete on public.announcements
  for delete using (tenant_id in (select public.my_manager_tenant_ids()));

-- ---------- Reconocimientos entre companeros ----------
create table public.recognitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  from_employee_id uuid not null references public.employees(id) on delete cascade,
  to_employee_id uuid not null references public.employees(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now(),
  check (from_employee_id <> to_employee_id)
);

create index recognitions_tenant_id_idx on public.recognitions(tenant_id);

alter table public.recognitions enable row level security;

create policy recognitions_select on public.recognitions
  for select using (tenant_id in (select public.my_team_tenant_ids()));

-- El insert real pasa por send_recognition() (security definer), que
-- resuelve from_employee_id por su cuenta; esta policy queda como
-- respaldo si alguna vez se inserta directo confiando solo en RLS.
create policy recognitions_insert on public.recognitions
  for insert with check (
    from_employee_id in (select public.my_employee_ids())
    and tenant_id in (select public.my_team_tenant_ids())
  );

create policy recognitions_delete on public.recognitions
  for delete using (
    from_employee_id in (select public.my_employee_ids())
    or tenant_id in (select public.my_manager_tenant_ids())
  );

create or replace function public.send_recognition(
  p_to_employee_id uuid,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_from_employee_id uuid;
  v_recognition_id uuid;
begin
  select tenant_id into v_tenant_id from public.employees where id = p_to_employee_id;

  if v_tenant_id is null then
    raise exception 'Empleado destinatario invalido';
  end if;

  select id into v_from_employee_id
  from public.employees
  where profile_id = auth.uid() and tenant_id = v_tenant_id;

  if v_from_employee_id is null then
    raise exception 'No tienes un registro de empleado en este tenant';
  end if;

  if v_from_employee_id = p_to_employee_id then
    raise exception 'No puedes enviarte un reconocimiento a ti mismo';
  end if;

  if trim(coalesce(p_message, '')) = '' then
    raise exception 'El mensaje no puede estar vacio';
  end if;

  insert into public.recognitions (tenant_id, from_employee_id, to_employee_id, message)
  values (v_tenant_id, v_from_employee_id, p_to_employee_id, trim(p_message))
  returning id into v_recognition_id;

  return v_recognition_id;
end;
$$;

grant execute on function public.send_recognition(uuid, text) to authenticated;

-- ---------- Encuestas de clima ----------
create table public.climate_surveys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'activa' check (status in ('activa', 'cerrada')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index climate_surveys_tenant_id_idx on public.climate_surveys(tenant_id);

create table public.climate_survey_questions (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.climate_surveys(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_index int not null default 0,
  question_text text not null,
  question_type text not null default 'scale' check (question_type in ('scale', 'texto'))
);

create index climate_survey_questions_survey_id_idx on public.climate_survey_questions(survey_id);

create table public.climate_survey_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.climate_surveys(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  unique (survey_id, employee_id)
);

create table public.climate_survey_answers (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.climate_survey_responses(id) on delete cascade,
  question_id uuid not null references public.climate_survey_questions(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  scale_value smallint check (scale_value between 1 and 5),
  text_value text
);

create index climate_survey_answers_response_id_idx on public.climate_survey_answers(response_id);

alter table public.climate_surveys enable row level security;
alter table public.climate_survey_questions enable row level security;
alter table public.climate_survey_responses enable row level security;
alter table public.climate_survey_answers enable row level security;

create policy climate_surveys_select_manager on public.climate_surveys
  for select using (tenant_id in (select public.my_manager_tenant_ids()));

create policy climate_surveys_select_active on public.climate_surveys
  for select using (
    status = 'activa'
    and tenant_id in (select public.my_team_tenant_ids())
  );

create policy climate_surveys_insert on public.climate_surveys
  for insert with check (tenant_id in (select public.my_manager_tenant_ids()));

create policy climate_surveys_update on public.climate_surveys
  for update using (tenant_id in (select public.my_manager_tenant_ids()));

create policy climate_surveys_delete on public.climate_surveys
  for delete using (tenant_id in (select public.my_manager_tenant_ids()));

create policy climate_survey_questions_select_manager on public.climate_survey_questions
  for select using (tenant_id in (select public.my_manager_tenant_ids()));

create policy climate_survey_questions_select_active on public.climate_survey_questions
  for select using (
    tenant_id in (select public.my_team_tenant_ids())
    and survey_id in (select id from public.climate_surveys where status = 'activa')
  );

create policy climate_survey_questions_insert on public.climate_survey_questions
  for insert with check (tenant_id in (select public.my_manager_tenant_ids()));

create policy climate_survey_questions_delete on public.climate_survey_questions
  for delete using (tenant_id in (select public.my_manager_tenant_ids()));

-- Nota deliberada: NO se crean policies de select sobre
-- climate_survey_responses ni climate_survey_answers -- ver comentario
-- de cabecera. Todo pasa por las RPCs de abajo.

create or replace function public.has_employee_responded_survey(p_survey_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id uuid;
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id from public.climate_surveys where id = p_survey_id;
  if v_tenant_id is null then
    return false;
  end if;

  select id into v_employee_id
  from public.employees
  where profile_id = auth.uid() and tenant_id = v_tenant_id;

  if v_employee_id is null then
    return false;
  end if;

  return exists (
    select 1 from public.climate_survey_responses
    where survey_id = p_survey_id and employee_id = v_employee_id
  );
end;
$$;

grant execute on function public.has_employee_responded_survey(uuid) to authenticated;

create or replace function public.count_climate_survey_responses(p_survey_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id from public.climate_surveys where id = p_survey_id;

  if v_tenant_id is null or v_tenant_id not in (select public.my_team_tenant_ids()) then
    raise exception 'No autorizado';
  end if;

  return (select count(*) from public.climate_survey_responses where survey_id = p_survey_id);
end;
$$;

grant execute on function public.count_climate_survey_responses(uuid) to authenticated;

-- p_answers: jsonb array de {"question_id": "...", "scale_value": 1-5 | null, "text_value": "..." | null}
create or replace function public.submit_climate_survey_response(
  p_survey_id uuid,
  p_answers jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_status text;
  v_employee_id uuid;
  v_response_id uuid;
  v_answer jsonb;
begin
  select tenant_id, status into v_tenant_id, v_status
  from public.climate_surveys where id = p_survey_id;

  if v_tenant_id is null then
    raise exception 'Encuesta invalida';
  end if;

  if v_status <> 'activa' then
    raise exception 'Esta encuesta ya no esta activa';
  end if;

  select id into v_employee_id
  from public.employees
  where profile_id = auth.uid() and tenant_id = v_tenant_id;

  if v_employee_id is null then
    raise exception 'No tienes un registro de empleado en este tenant';
  end if;

  if exists (
    select 1 from public.climate_survey_responses
    where survey_id = p_survey_id and employee_id = v_employee_id
  ) then
    raise exception 'Ya respondiste esta encuesta';
  end if;

  insert into public.climate_survey_responses (survey_id, tenant_id, employee_id)
  values (p_survey_id, v_tenant_id, v_employee_id)
  returning id into v_response_id;

  for v_answer in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
  loop
    insert into public.climate_survey_answers (response_id, question_id, tenant_id, scale_value, text_value)
    values (
      v_response_id,
      (v_answer->>'question_id')::uuid,
      v_tenant_id,
      nullif(v_answer->>'scale_value', '')::smallint,
      nullif(v_answer->>'text_value', '')
    );
  end loop;
end;
$$;

grant execute on function public.submit_climate_survey_response(uuid, jsonb) to authenticated;

-- Resultados agregados: solo gestion, y jamas devuelve employee_id.
create or replace function public.get_climate_survey_results(p_survey_id uuid)
returns table (
  question_id uuid,
  question_text text,
  question_type text,
  order_index int,
  response_count bigint,
  avg_scale numeric,
  text_answers text[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id from public.climate_surveys where id = p_survey_id;

  if v_tenant_id is null or v_tenant_id not in (select public.my_manager_tenant_ids()) then
    raise exception 'No autorizado';
  end if;

  return query
  select
    q.id,
    q.question_text,
    q.question_type,
    q.order_index,
    count(a.id) filter (where a.id is not null),
    round(avg(a.scale_value), 2),
    array_remove(array_agg(a.text_value), null)
  from public.climate_survey_questions q
  left join public.climate_survey_answers a on a.question_id = q.id
  where q.survey_id = p_survey_id
  group by q.id, q.question_text, q.question_type, q.order_index
  order by q.order_index;
end;
$$;

grant execute on function public.get_climate_survey_results(uuid) to authenticated;
