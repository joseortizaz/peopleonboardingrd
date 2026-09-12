-- =========================================================
-- Turnos rotativos/nocturnos (horario semanal variable por dia) y
-- marcaje con geolocalizacion + foto obligatoria.
--
-- Hasta ahora (0015_asistencia.sql):
--  - employee_shifts guardaba un unico horario fijo de lunes a viernes
--    por empleado (una fila, sin distincion por dia de la semana, sin
--    turnos que crucen medianoche).
--  - clock_in()/clock_out() no capturaban ubicacion ni evidencia
--    fotografica -- el marcaje era solo "aqui estoy, a esta hora".
--
-- Esta migracion:
--  1) Reemplaza employee_shifts por employee_shift_schedules: una fila
--     por empleado Y dia de la semana (0=domingo...6=sabado, misma
--     convencion que extract(dow from ...)), con su propia hora de
--     inicio/fin y un flag crosses_midnight para turnos nocturnos (ej.
--     22:00-06:00). Un dia sin fila = ese dia el empleado no tiene
--     horario asignado (nunca se marca tardanza ese dia), igual que el
--     comportamiento anterior para "sin horario en absoluto". La
--     deteccion de tardanza sigue comparando solo la hora de inicio del
--     dia correspondiente (con 10 minutos de tolerancia, igual que
--     antes) -- crosses_midnight es informativo para mostrar el turno
--     correctamente en la UI; no cambia la formula de tardanza ni se
--     usa (todavia) para atribuir horas extra que cruzan medianoche a
--     la semana correcta -- eso queda como una simplificacion de
--     referencia, igual que el resto del sistema.
--  2) Agrega captura de geolocalizacion (lat/lng, de referencia --
--     nunca bloquea el marcaje, decision explicita del usuario: un
--     empleado de campo o remoto puede marcar desde cualquier lugar) y
--     foto obligatoria (selfie via camara del navegador) tanto en
--     clock_in() como en clock_out(). La foto se sube primero a un
--     bucket privado nuevo (time-clock-photos) desde la propia Server
--     Action (mismo patron ya usado en documentos/firma), y clock_in()/
--     clock_out() rechazan la operacion si no se les pasa una ruta de
--     foto ya subida.
-- =========================================================

-- ---------- Horario semanal variable por dia ----------
create table public.employee_shift_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  crosses_midnight boolean not null default false,
  created_at timestamptz not null default now(),
  unique (employee_id, day_of_week)
);

comment on column public.employee_shift_schedules.day_of_week is
  '0=domingo, 1=lunes, ..., 6=sabado (misma convencion que extract(dow from ...)).';
comment on column public.employee_shift_schedules.crosses_midnight is
  'Turno nocturno que termina al dia siguiente (ej. 22:00-06:00). Informativo para la UI; no cambia la formula de tardanza.';

create index employee_shift_schedules_tenant_id_idx on public.employee_shift_schedules(tenant_id);
create index employee_shift_schedules_employee_id_idx on public.employee_shift_schedules(employee_id);

alter table public.employee_shift_schedules enable row level security;

create policy employee_shift_schedules_select on public.employee_shift_schedules
  for select using (
    tenant_id in (select public.my_manager_tenant_ids())
    or employee_id in (select public.my_employee_ids())
  );

create policy employee_shift_schedules_insert on public.employee_shift_schedules
  for insert with check (tenant_id in (select public.my_manager_tenant_ids()));

create policy employee_shift_schedules_update on public.employee_shift_schedules
  for update using (tenant_id in (select public.my_manager_tenant_ids()));

create policy employee_shift_schedules_delete on public.employee_shift_schedules
  for delete using (tenant_id in (select public.my_manager_tenant_ids()));

-- Migra el horario fijo existente (lunes a viernes) a la nueva tabla,
-- preservando cualquier horario ya asignado antes de esta migracion.
insert into public.employee_shift_schedules (tenant_id, employee_id, day_of_week, start_time, end_time, crosses_midnight)
select tenant_id, employee_id, d, start_time, end_time, false
from public.employee_shifts, generate_series(1, 5) as d
on conflict (employee_id, day_of_week) do nothing;

drop function if exists public.upsert_employee_shift(uuid, time, time);
drop table if exists public.employee_shifts;

create or replace function public.upsert_employee_shift_day(
  p_employee_id uuid,
  p_day_of_week smallint,
  p_start_time time,
  p_end_time time,
  p_crosses_midnight boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  if p_day_of_week < 0 or p_day_of_week > 6 then
    raise exception 'Dia de la semana invalido';
  end if;

  select tenant_id into v_tenant_id from public.employees where id = p_employee_id;

  if v_tenant_id is null or v_tenant_id not in (select public.my_manager_tenant_ids()) then
    raise exception 'No autorizado';
  end if;

  insert into public.employee_shift_schedules
    (tenant_id, employee_id, day_of_week, start_time, end_time, crosses_midnight)
  values (v_tenant_id, p_employee_id, p_day_of_week, p_start_time, p_end_time, p_crosses_midnight)
  on conflict (employee_id, day_of_week) do update
    set start_time = excluded.start_time,
        end_time = excluded.end_time,
        crosses_midnight = excluded.crosses_midnight;
end;
$$;

grant execute on function public.upsert_employee_shift_day(uuid, smallint, time, time, boolean) to authenticated;

create or replace function public.delete_employee_shift_day(
  p_employee_id uuid,
  p_day_of_week smallint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id from public.employees where id = p_employee_id;

  if v_tenant_id is null or v_tenant_id not in (select public.my_manager_tenant_ids()) then
    raise exception 'No autorizado';
  end if;

  delete from public.employee_shift_schedules
  where employee_id = p_employee_id and day_of_week = p_day_of_week;
end;
$$;

grant execute on function public.delete_employee_shift_day(uuid, smallint) to authenticated;

-- ---------- Marcaje: geolocalizacion + foto ----------
alter table public.time_clock_entries
  add column clock_in_lat numeric(9, 6),
  add column clock_in_lng numeric(9, 6),
  add column clock_in_photo_path text,
  add column clock_out_lat numeric(9, 6),
  add column clock_out_lng numeric(9, 6),
  add column clock_out_photo_path text;

comment on column public.time_clock_entries.clock_in_lat is
  'Latitud capturada por el navegador al marcar entrada. Solo de referencia -- nunca bloquea el marcaje.';
comment on column public.time_clock_entries.clock_in_photo_path is
  'Ruta en el bucket time-clock-photos de la foto tomada al marcar entrada. Obligatoria.';

insert into storage.buckets (id, name, public)
values ('time-clock-photos', 'time-clock-photos', false)
on conflict (id) do nothing;

-- Ruta de cada objeto: {tenant_id}/{employee_id}/{uuid}-in|out-{nombre}.
create policy time_clock_photos_storage_select_manager
  on storage.objects for select
  using (
    bucket_id = 'time-clock-photos'
    and (storage.foldername(name))[1]::uuid in (select public.my_manager_tenant_ids())
  );

create policy time_clock_photos_storage_select_self
  on storage.objects for select
  using (
    bucket_id = 'time-clock-photos'
    and (storage.foldername(name))[2]::uuid in (select public.my_employee_ids())
  );

-- El propio empleado sube su foto (a diferencia de documentos, donde
-- solo gestion sube archivos) -- se valida contra el segmento de
-- empleado de la ruta, no el de tenant.
create policy time_clock_photos_storage_insert_self
  on storage.objects for insert
  with check (
    bucket_id = 'time-clock-photos'
    and (storage.foldername(name))[2]::uuid in (select public.my_employee_ids())
  );

create policy time_clock_photos_storage_delete_manager
  on storage.objects for delete
  using (
    bucket_id = 'time-clock-photos'
    and (storage.foldername(name))[1]::uuid in (select public.my_manager_tenant_ids())
  );

drop function if exists public.clock_in(uuid);
drop function if exists public.clock_out(uuid);

create or replace function public.clock_in(
  p_tenant_id uuid,
  p_lat numeric default null,
  p_lng numeric default null,
  p_photo_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id uuid;
  v_shift record;
  v_is_late boolean := false;
  v_entry_id uuid;
  v_now_local timestamp;
  v_dow smallint;
begin
  if p_photo_path is null or length(trim(p_photo_path)) = 0 then
    raise exception 'Debes tomar una foto para marcar la entrada';
  end if;

  select id into v_employee_id
  from public.employees
  where profile_id = auth.uid() and tenant_id = p_tenant_id;

  if v_employee_id is null then
    raise exception 'No tienes un registro de empleado en este tenant';
  end if;

  if exists (
    select 1 from public.time_clock_entries
    where employee_id = v_employee_id and clock_out is null
  ) then
    raise exception 'Ya tienes una entrada marcada sin salida';
  end if;

  v_now_local := now() at time zone 'America/Santo_Domingo';
  v_dow := extract(dow from v_now_local)::smallint;

  select start_time into v_shift
  from public.employee_shift_schedules
  where employee_id = v_employee_id and day_of_week = v_dow;

  if v_shift.start_time is not null then
    v_is_late := v_now_local::time > (v_shift.start_time + interval '10 minutes');
  end if;

  insert into public.time_clock_entries (
    tenant_id, employee_id, clock_in, is_late,
    clock_in_lat, clock_in_lng, clock_in_photo_path
  )
  values (p_tenant_id, v_employee_id, now(), v_is_late, p_lat, p_lng, p_photo_path)
  returning id into v_entry_id;

  return v_entry_id;
end;
$$;

grant execute on function public.clock_in(uuid, numeric, numeric, text) to authenticated;

create or replace function public.clock_out(
  p_tenant_id uuid,
  p_lat numeric default null,
  p_lng numeric default null,
  p_photo_path text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id uuid;
  v_entry_id uuid;
begin
  if p_photo_path is null or length(trim(p_photo_path)) = 0 then
    raise exception 'Debes tomar una foto para marcar la salida';
  end if;

  select id into v_employee_id
  from public.employees
  where profile_id = auth.uid() and tenant_id = p_tenant_id;

  if v_employee_id is null then
    raise exception 'No tienes un registro de empleado en este tenant';
  end if;

  select id into v_entry_id
  from public.time_clock_entries
  where employee_id = v_employee_id and clock_out is null
  order by clock_in desc
  limit 1;

  if v_entry_id is null then
    raise exception 'No tienes una entrada marcada actualmente';
  end if;

  update public.time_clock_entries
  set clock_out = now(),
      clock_out_lat = p_lat,
      clock_out_lng = p_lng,
      clock_out_photo_path = p_photo_path
  where id = v_entry_id;
end;
$$;

grant execute on function public.clock_out(uuid, numeric, numeric, text) to authenticated;
