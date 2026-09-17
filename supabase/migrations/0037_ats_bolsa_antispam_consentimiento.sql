-- =========================================================
-- ATS: bolsa de empleo pública por tenant, proteccion anti-spam
-- del formulario publico, y consentimiento de datos personales
-- (Ley 172-13). Ver claude/plan-robustecer-ats.md, seccion 4
-- ("Recomendacion de dejar para mas adelante").
-- =========================================================

-- ---------------------------------------------------------
-- 1. Bolsa de empleo publica: /careers/[tenantSlug]
--
-- La tabla `tenants` no tiene (ni debe tener) una policy de select
-- publica -- expondria columnas sensibles (rnc, account_id) a
-- cualquier visitante anonimo. En vez de abrir RLS, se usa una
-- funcion security definer que devuelve solo las columnas
-- necesarias para la bolsa de empleo, y solo para tenants que
-- tengan al menos una vacante publicada (asi no se puede usar
-- para enumerar todos los tenants del sistema por fuerza bruta
-- de slugs).
-- ---------------------------------------------------------

create or replace function public.get_public_tenant_by_slug(p_slug text)
returns table (id uuid, name text, slug text, logo_url text)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.name, t.slug, t.logo_url
  from public.tenants t
  where t.slug = p_slug
    and exists (
      select 1 from public.vacancies v
      where v.tenant_id = t.id and v.status = 'published'
    );
$$;

grant execute on function public.get_public_tenant_by_slug(text) to anon, authenticated;

-- ---------------------------------------------------------
-- 2. Anti-spam del formulario publico de aplicacion.
--
-- Capa 1 y 2 (honeypot + time-trap) viven enteramente en el
-- frontend/Server Action, sin necesidad de esquema. Esta migracion
-- cubre la capa 3: limite de intentos por IP en una ventana de
-- tiempo, para frenar envios automatizados en rafaga.
--
-- La tabla queda sin ninguna policy de RLS (habilitado pero sin
-- policies = nadie puede leer ni escribir directo, ni siquiera un
-- usuario autenticado): todo el acceso pasa por la funcion de abajo,
-- que inserta y cuenta atomicamente. Se guarda un hash de la IP
-- (nunca la IP en claro) para no acumular datos personales
-- innecesarios.
-- ---------------------------------------------------------

create table public.public_form_attempts (
  id uuid primary key default gen_random_uuid(),
  route text not null,
  ip_hash text not null,
  created_at timestamptz not null default now()
);

create index public_form_attempts_lookup_idx
  on public.public_form_attempts(route, ip_hash, created_at);

alter table public.public_form_attempts enable row level security;

-- Limpieza pasiva: nunca hace falta consultar mas alla de la ventana
-- mas amplia que use la app, asi que no se necesita un job de borrado
-- aparte por ahora -- si la tabla crece demasiado, se puede agregar
-- despues.

create or replace function public.check_public_form_rate_limit(
  p_route text,
  p_ip_hash text,
  p_window_minutes int default 10,
  p_max_attempts int default 5
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.public_form_attempts
  where route = p_route
    and ip_hash = p_ip_hash
    and created_at > now() - (p_window_minutes || ' minutes')::interval;

  if v_count >= p_max_attempts then
    return false;
  end if;

  insert into public.public_form_attempts (route, ip_hash) values (p_route, p_ip_hash);
  return true;
end;
$$;

grant execute on function public.check_public_form_rate_limit(text, text, int, int) to anon, authenticated;

-- ---------------------------------------------------------
-- 3. Consentimiento de datos personales (Ley 172-13).
--
-- Se guarda como timestamp (no boolean) para que quede registro de
-- CUANDO se dio el consentimiento, no solo de que se dio -- util si
-- alguna vez cambia el texto del aviso y hay que saber bajo cual
-- version aplico cada candidato. Nullable porque candidatos ya
-- existentes (previos a este cambio) no lo tienen y no se les puede
-- pedir retroactivamente.
-- ---------------------------------------------------------

alter table public.candidates
  add column if not exists data_consent_at timestamptz;

comment on column public.candidates.data_consent_at is
  'Momento en que el candidato acepto el aviso de tratamiento de datos personales (Ley 172-13) en el formulario publico. Null = candidato previo a este cambio, nunca se le pidio.';
