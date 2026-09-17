-- =========================================================
-- Verificacion de metas en Planes de Desarrollo Individual (PDI)
--
-- Hasta ahora (0031_desarrollo_individual.sql): development_plan_goals
-- solo tenia `status`, marcado unicamente por el propio empleado desde
-- su autoservicio -- 100% autorreportado, sin evidencia ni
-- confirmacion de gestion.
--
-- Esta migracion agrega una capa de verificacion opcional, sin tocar
-- el flujo de `status` existente (decision confirmada con el usuario:
-- "Comentario + evidencia adjunta + confirmacion de gestion"):
--  1) `evidence_path`/`evidence_note`: el empleado puede adjuntar un
--     archivo de evidencia y/o una nota al marcar (o despues de
--     marcar) una meta, mismo patron de bucket privado + RLS por
--     segmento de ruta que time-clock-photos (migracion 0027).
--  2) `verified_by`/`verified_at`: gestion confirma la meta via
--     verify_development_goal() -- un empleado nunca puede
--     autoverificarse, la funcion valida my_manager_tenant_ids() igual
--     que decide_leave_request (0015_asistencia.sql).
--  3) Cualquier edicion posterior de status/evidencia despues de
--     verificada limpia automaticamente verified_by/verified_at (la
--     meta vuelve a "pendiente de verificar") -- trigger acotado a
--     esas columnas, igual estilo que check_development_plan_completion.
-- =========================================================

alter table public.development_plan_goals
  add column evidence_path text,
  add column evidence_note text,
  add column verified_by uuid references auth.users(id),
  add column verified_at timestamptz;

comment on column public.development_plan_goals.evidence_path is
  'Ruta en el bucket development-plan-evidence de un archivo adjunto como evidencia (opcional). Ej: {tenant_id}/{employee_id}/{goal_id}/{archivo}.';
comment on column public.development_plan_goals.evidence_note is
  'Nota de texto opcional que acompana la evidencia (o la reemplaza, si no se adjunta archivo).';
comment on column public.development_plan_goals.verified_by is
  'Usuario de gestion que confirmo la meta via verify_development_goal(). Null = no verificada. Un empleado nunca puede autoverificarse.';
comment on column public.development_plan_goals.verified_at is
  'Momento de verificacion. Se limpia automaticamente (junto con verified_by) si status, evidence_path o evidence_note cambian despues de verificada.';

-- ---------- Storage: evidencia de PDI ----------
insert into storage.buckets (id, name, public)
values ('development-plan-evidence', 'development-plan-evidence', false)
on conflict (id) do nothing;

-- Ruta de cada objeto: {tenant_id}/{employee_id}/{goal_id}-{nombre}.
-- Mismo patron de RLS por segmento de ruta que time-clock-photos
-- (0027_turnos_geolocalizacion_foto.sql).
create policy development_plan_evidence_storage_select_manager
  on storage.objects for select
  using (
    bucket_id = 'development-plan-evidence'
    and (storage.foldername(name))[1]::uuid in (select public.my_manager_tenant_ids())
  );

create policy development_plan_evidence_storage_select_self
  on storage.objects for select
  using (
    bucket_id = 'development-plan-evidence'
    and (storage.foldername(name))[2]::uuid in (select public.my_employee_ids())
  );

-- El propio empleado sube su evidencia (igual que time-clock-photos) --
-- se valida contra el segmento de empleado de la ruta, no el de tenant.
create policy development_plan_evidence_storage_insert_self
  on storage.objects for insert
  with check (
    bucket_id = 'development-plan-evidence'
    and (storage.foldername(name))[2]::uuid in (select public.my_employee_ids())
  );

create policy development_plan_evidence_storage_delete_manager
  on storage.objects for delete
  using (
    bucket_id = 'development-plan-evidence'
    and (storage.foldername(name))[1]::uuid in (select public.my_manager_tenant_ids())
  );

-- El empleado tambien puede borrar su propia evidencia (ej. si subio
-- el archivo equivocado antes de que gestion la revise).
create policy development_plan_evidence_storage_delete_self
  on storage.objects for delete
  using (
    bucket_id = 'development-plan-evidence'
    and (storage.foldername(name))[2]::uuid in (select public.my_employee_ids())
  );

-- ---------- Verificacion de gestion ----------
create or replace function public.verify_development_goal(p_goal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id
  from public.development_plan_goals
  where id = p_goal_id;

  if v_tenant_id is null then
    raise exception 'Meta invalida';
  end if;

  if v_tenant_id not in (select public.my_manager_tenant_ids()) then
    raise exception 'No autorizado';
  end if;

  update public.development_plan_goals
  set verified_by = auth.uid(),
      verified_at = now()
  where id = p_goal_id;
end;
$$;

grant execute on function public.verify_development_goal(uuid) to authenticated;

-- Permite a gestion revertir una verificacion manualmente (ej. se
-- confirmo por error), sin depender de editar status/evidencia.
create or replace function public.unverify_development_goal(p_goal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id
  from public.development_plan_goals
  where id = p_goal_id;

  if v_tenant_id is null then
    raise exception 'Meta invalida';
  end if;

  if v_tenant_id not in (select public.my_manager_tenant_ids()) then
    raise exception 'No autorizado';
  end if;

  update public.development_plan_goals
  set verified_by = null,
      verified_at = null
  where id = p_goal_id;
end;
$$;

grant execute on function public.unverify_development_goal(uuid) to authenticated;

-- Cualquier edicion de status/evidencia despues de verificada
-- des-verifica automaticamente la meta (vuelve a "pendiente de
-- verificar"). No se dispara con el update de verify_development_goal
-- (que solo toca verified_by/verified_at, columnas fuera del alcance
-- de este trigger).
create or replace function public.clear_development_goal_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.verified_by is not null and (
    new.status is distinct from old.status
    or new.evidence_path is distinct from old.evidence_path
    or new.evidence_note is distinct from old.evidence_note
  ) then
    new.verified_by := null;
    new.verified_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists clear_development_goal_verification_trigger on public.development_plan_goals;

create trigger clear_development_goal_verification_trigger
  before update of status, evidence_path, evidence_note on public.development_plan_goals
  for each row execute function public.clear_development_goal_verification();
