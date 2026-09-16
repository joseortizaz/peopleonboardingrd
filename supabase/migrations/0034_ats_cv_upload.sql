-- =========================================================
-- ATS: carga de CV en PDF para candidatos.
--
-- Reutiliza la columna `resume_url` ya existente en `candidates` desde
-- el esquema original (migracion 0004_ats.sql), que nunca se conecto a
-- ninguna UI -- ahora pasa a guardar la ruta del objeto en Supabase
-- Storage (no una URL publica). Se agregan `resume_file_name` y
-- `resume_size` para mostrar el nombre original y validar el tamano
-- sin tener que leer el archivo.
--
-- Bucket privado nuevo (`candidate-resumes`), mismo patron ya usado en
-- Documentos (migracion 0013_documentos.sql). Ruta de cada objeto:
-- {tenant_id}/{vacancy_id}/{uuid}-{nombre original} -- se usa
-- vacancy_id (no candidate_id) porque el archivo se sube ANTES de que
-- exista la fila del candidato, mismo orden que ya usa el formulario
-- publico hoy (primero se valida, despues se inserta).
--
-- La policy de insert de Storage exige la misma condicion que ya
-- protege el insert publico de `candidates` (candidates_insert_public,
-- migracion 0004): la vacante referenciada en la ruta debe existir y
-- estar publicada. Ademas exige que el tenant_id real de esa vacante
-- coincida con el segmento de tenant_id de la ruta, para que un
-- postulante anonimo no pueda subir un archivo bajo un tenant_id que
-- no corresponde a la vacante que esta usando.
-- =========================================================

alter table public.candidates
  add column if not exists resume_file_name text,
  add column if not exists resume_size bigint;

insert into storage.buckets (id, name, public)
values ('candidate-resumes', 'candidate-resumes', false)
on conflict (id) do nothing;

-- ---------- Policies de Storage ----------
-- Ruta de cada objeto: {tenant_id}/{vacancy_id}/{uuid}-{nombre}
-- storage.foldername(name) devuelve los segmentos como array:
-- [1] = tenant_id, [2] = vacancy_id.

create policy candidate_resumes_storage_insert_public
  on storage.objects for insert
  with check (
    bucket_id = 'candidate-resumes'
    and exists (
      select 1 from public.vacancies v
      where v.id = (storage.foldername(name))[2]::uuid
        and v.status = 'published'
        and v.tenant_id::text = (storage.foldername(name))[1]
    )
  );

create policy candidate_resumes_storage_select_manager
  on storage.objects for select
  using (
    bucket_id = 'candidate-resumes'
    and (storage.foldername(name))[1]::uuid in (select public.my_manager_tenant_ids())
  );

create policy candidate_resumes_storage_delete_manager
  on storage.objects for delete
  using (
    bucket_id = 'candidate-resumes'
    and (storage.foldername(name))[1]::uuid in (select public.my_manager_tenant_ids())
  );
