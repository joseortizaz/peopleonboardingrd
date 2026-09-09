-- =========================================================
-- Onboarding: crear cuenta + tenant + membresia en una transaccion
-- y policies de escritura para departamentos (estructura organizacional)
-- =========================================================

create or replace function public.create_account_with_tenant(
  p_account_name text,
  p_kind public.account_kind,
  p_rnc text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
  v_tenant_id uuid;
  v_slug text;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if exists (select 1 from public.memberships where profile_id = auth.uid()) then
    raise exception 'El usuario ya pertenece a una cuenta';
  end if;

  insert into public.accounts (name, kind, rnc)
  values (p_account_name, p_kind, p_rnc)
  returning id into v_account_id;

  v_slug := lower(regexp_replace(p_account_name, '[^a-zA-Z0-9]+', '-', 'g'))
            || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  insert into public.tenants (account_id, name, slug, rnc)
  values (v_account_id, p_account_name, v_slug, p_rnc)
  returning id into v_tenant_id;

  insert into public.memberships (profile_id, account_id, role)
  values (auth.uid(), v_account_id, 'account_admin');

  return v_tenant_id;
end;
$$;

grant execute on function public.create_account_with_tenant(text, public.account_kind, text) to authenticated;

-- ---------- Policies de escritura para departments ----------
create policy departments_insert on public.departments
  for insert with check (tenant_id in (select public.my_accessible_tenant_ids()));

create policy departments_update on public.departments
  for update using (tenant_id in (select public.my_accessible_tenant_ids()));

create policy departments_delete on public.departments
  for delete using (tenant_id in (select public.my_accessible_tenant_ids()));
