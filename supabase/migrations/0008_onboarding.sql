-- =========================================================
-- Onboarding del empleado (checklist de incorporacion, plan 30-60-90):
--  1) plantillas reutilizables de tareas de incorporacion
--  2) al asignar una plantilla a un empleado se crea un "proceso" con
--     una copia de las tareas (con fecha limite calculada desde el
--     dia de inicio), para que editar la plantilla despues no afecte
--     procesos ya en marcha
--  3) el empleado ve y marca sus propias tareas (responsible = 'empleado')
--     desde /app/mi-espacio; RR.HH. ve y marca todas
-- =========================================================

create table public.onboarding_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create index onboarding_templates_tenant_id_idx on public.onboarding_templates(tenant_id);

create table public.onboarding_template_tasks (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.onboarding_templates(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  description text,
  days_offset int not null default 0,
  responsible text not null default 'rrhh' check (responsible in ('rrhh', 'empleado')),
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

create index onboarding_template_tasks_template_id_idx on public.onboarding_template_tasks(template_id);

create or replace function public.set_onboarding_template_task_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select tenant_id into new.tenant_id
  from public.onboarding_templates
  where id = new.template_id;

  if new.tenant_id is null then
    raise exception 'Plantilla invalida';
  end if;

  return new;
end;
$$;

drop trigger if exists set_onboarding_template_task_tenant_trigger on public.onboarding_template_tasks;

create trigger set_onboarding_template_task_tenant_trigger
  before insert on public.onboarding_template_tasks
  for each row execute function public.set_onboarding_template_task_tenant();

create table public.onboarding_processes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  template_id uuid references public.onboarding_templates(id) on delete set null,
  template_name text,
  started_at date not null default current_date,
  status text not null default 'en_progreso' check (status in ('en_progreso', 'completado')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index onboarding_processes_tenant_id_idx on public.onboarding_processes(tenant_id);
create index onboarding_processes_employee_id_idx on public.onboarding_processes(employee_id);

create table public.onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.onboarding_processes(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  description text,
  due_date date,
  responsible text not null default 'rrhh' check (responsible in ('rrhh', 'empleado')),
  order_index int not null default 0,
  status text not null default 'pendiente' check (status in ('pendiente', 'completada')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index onboarding_tasks_process_id_idx on public.onboarding_tasks(process_id);

create or replace function public.set_onboarding_task_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select tenant_id into new.tenant_id
  from public.onboarding_processes
  where id = new.process_id;

  if new.tenant_id is null then
    raise exception 'Proceso invalido';
  end if;

  return new;
end;
$$;

drop trigger if exists set_onboarding_task_tenant_trigger on public.onboarding_tasks;

create trigger set_onboarding_task_tenant_trigger
  before insert on public.onboarding_tasks
  for each row execute function public.set_onboarding_task_tenant();

-- Recalcula el estado del proceso cada vez que cambia el estado de una tarea
create or replace function public.check_onboarding_process_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending int;
begin
  select count(*) into v_pending
  from public.onboarding_tasks
  where process_id = new.process_id and status <> 'completada';

  if v_pending = 0 then
    update public.onboarding_processes
    set status = 'completado', completed_at = now()
    where id = new.process_id and status <> 'completado';
  else
    update public.onboarding_processes
    set status = 'en_progreso', completed_at = null
    where id = new.process_id and status = 'completado';
  end if;

  return new;
end;
$$;

drop trigger if exists check_onboarding_process_completion_trigger on public.onboarding_tasks;

create trigger check_onboarding_process_completion_trigger
  after update of status on public.onboarding_tasks
  for each row execute function public.check_onboarding_process_completion();

-- Crea el proceso + copia las tareas de la plantilla, validando que quien
-- llama tenga rol de gestion sobre el tenant del empleado (esta funcion es
-- security definer, asi que la validacion no puede depender solo de RLS).
create or replace function public.start_onboarding_process(
  p_employee_id uuid,
  p_template_id uuid,
  p_started_at date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_template_name text;
  v_process_id uuid;
  v_task record;
begin
  select tenant_id into v_tenant_id from public.employees where id = p_employee_id;
  if v_tenant_id is null then
    raise exception 'Empleado invalido';
  end if;

  if v_tenant_id not in (select public.my_manager_tenant_ids()) then
    raise exception 'No autorizado';
  end if;

  select name into v_template_name
  from public.onboarding_templates
  where id = p_template_id and tenant_id = v_tenant_id;

  if v_template_name is null then
    raise exception 'Plantilla invalida';
  end if;

  insert into public.onboarding_processes (tenant_id, employee_id, template_id, template_name, started_at)
  values (v_tenant_id, p_employee_id, p_template_id, v_template_name, p_started_at)
  returning id into v_process_id;

  for v_task in
    select title, description, days_offset, responsible, order_index
    from public.onboarding_template_tasks
    where template_id = p_template_id
    order by order_index
  loop
    insert into public.onboarding_tasks (process_id, title, description, due_date, responsible, order_index)
    values (
      v_process_id,
      v_task.title,
      v_task.description,
      p_started_at + v_task.days_offset,
      v_task.responsible,
      v_task.order_index
    );
  end loop;

  return v_process_id;
end;
$$;

grant execute on function public.start_onboarding_process(uuid, uuid, date) to authenticated;

-- ---------- RLS ----------
alter table public.onboarding_templates enable row level security;
alter table public.onboarding_template_tasks enable row level security;
alter table public.onboarding_processes enable row level security;
alter table public.onboarding_tasks enable row level security;

create policy onboarding_templates_select on public.onboarding_templates
  for select using (tenant_id in (select public.my_accessible_tenant_ids()));

create policy onboarding_templates_insert on public.onboarding_templates
  for insert with check (tenant_id in (select public.my_manager_tenant_ids()));

create policy onboarding_templates_update on public.onboarding_templates
  for update using (tenant_id in (select public.my_manager_tenant_ids()));

create policy onboarding_templates_delete on public.onboarding_templates
  for delete using (tenant_id in (select public.my_manager_tenant_ids()));

create policy onboarding_template_tasks_select on public.onboarding_template_tasks
  for select using (tenant_id in (select public.my_accessible_tenant_ids()));

create policy onboarding_template_tasks_insert on public.onboarding_template_tasks
  for insert with check (
    template_id in (
      select id from public.onboarding_templates
      where tenant_id in (select public.my_manager_tenant_ids())
    )
  );

create policy onboarding_template_tasks_delete on public.onboarding_template_tasks
  for delete using (tenant_id in (select public.my_manager_tenant_ids()));

create policy onboarding_processes_select_manager on public.onboarding_processes
  for select using (tenant_id in (select public.my_manager_tenant_ids()));

create policy onboarding_processes_select_self on public.onboarding_processes
  for select using (employee_id in (select public.my_employee_ids()));

create policy onboarding_processes_insert on public.onboarding_processes
  for insert with check (tenant_id in (select public.my_manager_tenant_ids()));

create policy onboarding_processes_update on public.onboarding_processes
  for update using (tenant_id in (select public.my_manager_tenant_ids()));

create policy onboarding_processes_delete on public.onboarding_processes
  for delete using (tenant_id in (select public.my_manager_tenant_ids()));

create policy onboarding_tasks_select_manager on public.onboarding_tasks
  for select using (tenant_id in (select public.my_manager_tenant_ids()));

create policy onboarding_tasks_select_self on public.onboarding_tasks
  for select using (
    process_id in (
      select id from public.onboarding_processes
      where employee_id in (select public.my_employee_ids())
    )
  );

create policy onboarding_tasks_insert on public.onboarding_tasks
  for insert with check (
    process_id in (
      select id from public.onboarding_processes
      where tenant_id in (select public.my_manager_tenant_ids())
    )
  );

create policy onboarding_tasks_update_manager on public.onboarding_tasks
  for update using (tenant_id in (select public.my_manager_tenant_ids()));

-- El empleado solo puede marcar sus propias tareas (responsible = 'empleado')
-- de su propio proceso. No puede tocar tareas de RR.HH. ni de otros.
create policy onboarding_tasks_update_self on public.onboarding_tasks
  for update using (
    responsible = 'empleado'
    and process_id in (
      select id from public.onboarding_processes
      where employee_id in (select public.my_employee_ids())
    )
  );

create policy onboarding_tasks_delete on public.onboarding_tasks
  for delete using (tenant_id in (select public.my_manager_tenant_ids()));
