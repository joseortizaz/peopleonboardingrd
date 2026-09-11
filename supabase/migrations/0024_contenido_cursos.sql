-- =========================================================
-- Contenido propio del curso para capacitacion: video y material
-- adjunto por curso (siguiente pendiente de la seccion 3 del plan de
-- desarrollo, elegido por el usuario despues de Facturacion SaaS v1).
--
-- Dos piezas, deliberadamente separadas:
--  1) training_courses.video_url: un enlace de video (YouTube/Vimeo
--     u otro) por curso -- texto libre, no un archivo, para no
--     depender de Storage ni de limites de tamano para el contenido
--     mas pesado (video). Se reconoce YouTube/Vimeo en la UI para
--     incrustarlo; cualquier otro enlace se muestra como "Ver video".
--  2) training_course_materials + bucket privado "training-materials":
--     material adjunto real (PDF, slides, documentos) por curso,
--     mismo patron de Storage + tabla de metadatos que
--     employee_documents (0013_documentos.sql), pero con visibilidad
--     de curso en vez de empleado: gestion del tenant, o cualquier
--     empleado inscrito en ese curso (misma regla de visibilidad que
--     ya usa training_courses_select en 0018_capacitacion.sql).
-- =========================================================

alter table public.training_courses
  add column video_url text;

insert into storage.buckets (id, name, public)
values ('training-materials', 'training-materials', false)
on conflict (id) do nothing;

create table public.training_course_materials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  course_id uuid not null references public.training_courses(id) on delete cascade,
  title text not null,
  file_name text not null,
  storage_path text not null unique,
  file_size bigint,
  mime_type text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index training_course_materials_tenant_id_idx on public.training_course_materials(tenant_id);
create index training_course_materials_course_id_idx on public.training_course_materials(course_id);

-- ---------- RLS: training_course_materials ----------
-- Misma regla de visibilidad que training_courses_select: gestion del
-- tenant, o un empleado inscrito en ese curso especifico.
alter table public.training_course_materials enable row level security;

create policy training_course_materials_select on public.training_course_materials
  for select using (
    tenant_id in (select public.my_manager_tenant_ids())
    or course_id in (
      select course_id from public.training_enrollments
      where employee_id in (select public.my_employee_ids())
    )
  );

create policy training_course_materials_insert on public.training_course_materials
  for insert with check (tenant_id in (select public.my_manager_tenant_ids()));

create policy training_course_materials_delete on public.training_course_materials
  for delete using (tenant_id in (select public.my_manager_tenant_ids()));

-- ---------- Policies de Storage ----------
-- Ruta de cada objeto: {tenant_id}/{course_id}/{uuid}-{nombre}.
-- storage.foldername(name) devuelve los segmentos de carpeta como
-- array: [1] = tenant_id, [2] = course_id.

create policy training_materials_storage_select_manager
  on storage.objects for select
  using (
    bucket_id = 'training-materials'
    and (storage.foldername(name))[1]::uuid in (select public.my_manager_tenant_ids())
  );

create policy training_materials_storage_select_enrolled
  on storage.objects for select
  using (
    bucket_id = 'training-materials'
    and (storage.foldername(name))[2]::uuid in (
      select course_id from public.training_enrollments
      where employee_id in (select public.my_employee_ids())
    )
  );

create policy training_materials_storage_insert
  on storage.objects for insert
  with check (
    bucket_id = 'training-materials'
    and (storage.foldername(name))[1]::uuid in (select public.my_manager_tenant_ids())
  );

create policy training_materials_storage_delete
  on storage.objects for delete
  using (
    bucket_id = 'training-materials'
    and (storage.foldername(name))[1]::uuid in (select public.my_manager_tenant_ids())
  );
