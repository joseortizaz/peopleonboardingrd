-- =========================================================
-- Gestion documental v1: expediente digital por empleado.
--
-- Bucket privado de Supabase Storage ("employee-documents") + tabla de
-- metadatos (employee_documents). Cada objeto se guarda en la ruta
-- {tenant_id}/{employee_id}/{uuid}-{nombre original}, que es lo que
-- permite expresar las policies de storage como simples comparaciones
-- de segmentos de carpeta (storage.foldername) contra los helpers de
-- tenant existentes -- mismo enfoque que el resto de las policies del
-- proyecto (siempre via my_manager_tenant_ids()/my_employee_ids(),
-- nunca confiando en datos que vengan del cliente).
--
-- v1 deliberadamente simple: el "tipo de documento" es texto libre (con
-- sugerencias en la UI, no una lista cerrada) y el "vencimiento" es solo
-- una fecha opcional que la UI usa para pintar un badge Vigente/Por
-- vencer/Vencido -- no hay envio de recordatorios por correo todavia.
-- =========================================================

insert into storage.buckets (id, name, public)
values ('employee-documents', 'employee-documents', false)
on conflict (id) do nothing;

create table public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  doc_type text not null,
  file_name text not null,
  storage_path text not null unique,
  file_size bigint,
  mime_type text,
  expires_at date,
  notes text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index employee_documents_tenant_id_idx on public.employee_documents(tenant_id);
create index employee_documents_employee_id_idx on public.employee_documents(employee_id);

alter table public.employee_documents enable row level security;

create policy employee_documents_select_manager on public.employee_documents
  for select using (tenant_id in (select public.my_manager_tenant_ids()));

create policy employee_documents_select_self on public.employee_documents
  for select using (employee_id in (select public.my_employee_ids()));

create policy employee_documents_insert on public.employee_documents
  for insert with check (tenant_id in (select public.my_manager_tenant_ids()));

create policy employee_documents_update on public.employee_documents
  for update using (tenant_id in (select public.my_manager_tenant_ids()));

create policy employee_documents_delete on public.employee_documents
  for delete using (tenant_id in (select public.my_manager_tenant_ids()));

-- ---------- Policies de Storage ----------
-- Ruta de cada objeto: {tenant_id}/{employee_id}/{uuid}-{nombre}.
-- storage.foldername(name) devuelve los segmentos de carpeta como
-- array: [1] = tenant_id, [2] = employee_id.

create policy employee_documents_storage_select_manager
  on storage.objects for select
  using (
    bucket_id = 'employee-documents'
    and (storage.foldername(name))[1]::uuid in (select public.my_manager_tenant_ids())
  );

create policy employee_documents_storage_select_self
  on storage.objects for select
  using (
    bucket_id = 'employee-documents'
    and (storage.foldername(name))[2]::uuid in (select public.my_employee_ids())
  );

create policy employee_documents_storage_insert
  on storage.objects for insert
  with check (
    bucket_id = 'employee-documents'
    and (storage.foldername(name))[1]::uuid in (select public.my_manager_tenant_ids())
  );

create policy employee_documents_storage_delete
  on storage.objects for delete
  using (
    bucket_id = 'employee-documents'
    and (storage.foldername(name))[1]::uuid in (select public.my_manager_tenant_ids())
  );
