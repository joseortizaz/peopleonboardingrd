-- =========================================================
-- Auto-vinculo retroactivo:
-- El trigger handle_new_user (0006) solo vincula el correo del empleado
-- en el momento del REGISTRO. Si la cuenta del usuario ya existia antes
-- de que RR.HH. creara su registro de empleado (orden inverso, muy
-- probable en la practica), esa cuenta se queda sin tenant para siempre
-- a menos que se reintente el vinculo. Esta funcion permite reintentarlo
-- en cualquier momento, de forma segura (security definer, pero solo
-- opera sobre el propio auth.uid() y sobre filas con profile_id nulo).
-- =========================================================

create or replace function public.link_my_employee_record()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_email text;
  v_employee record;
begin
  select email into v_user_email from auth.users where id = auth.uid();
  if v_user_email is null then
    return;
  end if;

  for v_employee in
    select id, tenant_id from public.employees
    where email = v_user_email and profile_id is null
  loop
    update public.employees
    set profile_id = auth.uid()
    where id = v_employee.id;

    insert into public.memberships (profile_id, tenant_id, role)
    values (auth.uid(), v_employee.tenant_id, 'employee')
    on conflict do nothing;
  end loop;
end;
$$;

grant execute on function public.link_my_employee_record() to authenticated;
