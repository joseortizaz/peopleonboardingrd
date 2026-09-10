-- =========================================================
-- Fix: clock_in() comparaba now()::time (hora del servidor,
-- UTC en Supabase) contra employee_shifts.start_time (hora
-- local de Republica Dominicana). Esto hacia que la deteccion
-- de tardanza fuera incorrecta casi todo el dia (UTC-4).
-- Se corrige convirtiendo now() a la zona horaria de RD antes
-- de extraer la hora.
-- =========================================================

create or replace function public.clock_in(p_tenant_id uuid)
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
begin
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

  select start_time into v_shift from public.employee_shifts where employee_id = v_employee_id;

  if v_shift.start_time is not null then
    v_is_late := (now() at time zone 'America/Santo_Domingo')::time
      > (v_shift.start_time + interval '10 minutes');
  end if;

  insert into public.time_clock_entries (tenant_id, employee_id, clock_in, is_late)
  values (p_tenant_id, v_employee_id, now(), v_is_late)
  returning id into v_entry_id;

  return v_entry_id;
end;
$$;
