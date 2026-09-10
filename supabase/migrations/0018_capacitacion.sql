-- =========================================================
-- Capacitacion (LMS) v1:
--  1) training_courses: catalogo de cursos del tenant (nombre,
--     descripcion, categoria libre, duracion en horas, si cuenta
--     para el reporte anual de horas INFOTEP).
--  2) training_enrollments: inscripcion de un empleado a un curso,
--     con fecha limite opcional y estado (pendiente/en_progreso/
--     completada). Gestion inscribe; el empleado actualiza su
--     propio estado en autoservicio (mismo patron de confianza en
--     la Server Action, no en columnas de RLS, que toggleOnboardingTask
--     en 0008_onboarding.sql). Al completarse (completed_at no nulo)
--     funciona como registro de certificado -- v1 no genera un PDF
--     descargable, solo la fecha y las horas del curso.
--  3) Sin RPC: CRUD directo via RLS, mismo patron que employee_documents
--     y employee_benefits -- no hay invariante que justifique
--     security definer.
-- =========================================================

create table public.training_courses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  category text,
  duration_hours numeric(6, 2) not null default 0,
  counts_toward_infotep boolean not null default true,
  created_at timestamptz not null default now()
);

create index training_courses_tenant_id_idx on public.training_courses(tenant_id);

create table public.training_enrollments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  course_id uuid not null references public.training_courses(id) on delete cascade,
  due_date date,
  status text not null default 'pendiente' check (status in ('pendiente', 'en_progreso', 'completada')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (employee_id, course_id)
);

create index training_enrollments_tenant_id_idx on public.training_enrollments(tenant_id);
create index training_enrollments_employee_id_idx on public.training_enrollments(employee_id);
create index training_enrollments_course_id_idx on public.training_enrollments(course_id);

-- ---------- RLS: training_courses ----------
alter table public.training_courses enable row level security;

create policy training_courses_select on public.training_courses
  for select using (
    tenant_id in (select public.my_manager_tenant_ids())
    or id in (
      select course_id from public.training_enrollments
      where employee_id in (select public.my_employee_ids())
    )
  );

create policy training_courses_insert on public.training_courses
  for insert with check (tenant_id in (select public.my_manager_tenant_ids()));

create policy training_courses_update on public.training_courses
  for update using (tenant_id in (select public.my_manager_tenant_ids()));

create policy training_courses_delete on public.training_courses
  for delete using (tenant_id in (select public.my_manager_tenant_ids()));

-- ---------- RLS: training_enrollments ----------
alter table public.training_enrollments enable row level security;

create policy training_enrollments_select on public.training_enrollments
  for select using (
    tenant_id in (select public.my_manager_tenant_ids())
    or employee_id in (select public.my_employee_ids())
  );

create policy training_enrollments_insert on public.training_enrollments
  for insert with check (tenant_id in (select public.my_manager_tenant_ids()));

-- Gestion puede editar cualquier campo; el empleado dueno de la
-- inscripcion tambien puede actualizar (la Server Action de
-- autoservicio solo envia status/completed_at, mismo patron de
-- confianza que toggleOnboardingTask).
create policy training_enrollments_update on public.training_enrollments
  for update using (
    tenant_id in (select public.my_manager_tenant_ids())
    or employee_id in (select public.my_employee_ids())
  );

create policy training_enrollments_delete on public.training_enrollments
  for delete using (tenant_id in (select public.my_manager_tenant_ids()));
