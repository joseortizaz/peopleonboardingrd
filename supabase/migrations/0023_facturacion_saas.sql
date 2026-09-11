-- =========================================================
-- Facturacion SaaS v1: panel de Super Admin con activacion y
-- fechas de suscripcion manuales (sin cobro automatico todavia).
--
-- Contexto: hasta ahora la fila "Facturacion SaaS" del plan de
-- desarrollo era la brecha mas grande del modelo de negocio -- no
-- existia ningun control de suscripcion sobre las cuentas
-- (accounts), ni forma de bloquear el acceso de una cuenta que deja
-- de pagar. El usuario pidio explicitamente: (1) que el Super Admin
-- pueda activar/desactivar suscripciones y fijar sus fechas de
-- inicio/fin manualmente, y (2) que el diseno contemple una futura
-- integracion de cobro recurrente con CardNet, mientras esa
-- integracion se aplaza hasta tener al menos un cliente facturando.
--
-- Esta migracion agrega tres tablas nuevas (subscription_plans,
-- account_subscriptions, subscription_events), una funcion
-- security definer para que cualquier pantalla protegida (via
-- middleware) sepa si el usuario actual debe ser bloqueado por
-- suscripcion, y un RPC unico para que el Super Admin cree/actualice
-- la suscripcion de una cuenta dejando bitacora del cambio.
--
-- Decisiones del usuario aplicadas aqui:
-- 1. Al aplicar esta migracion, TODAS las cuentas ya existentes
--    (incluida la cuenta real en produccion, Ceapsi SRL) se siembran
--    como 'activa' y sin fecha de fin, para que nadie quede
--    bloqueado por accidente el dia que se active este control.
-- 2. El bloqueo por suscripcion inactiva NO debe afectar el Portal
--    del cliente de solo lectura -- por eso la funcion de bloqueo
--    excluye explicitamente las membresias con rol 'client'.
-- 3. El account_admin/gestor de cada cuenta debe poder ver su propio
--    plan y fecha de vencimiento -- por eso account_subscriptions
--    tiene, ademas de la policy de Super Admin, una policy de
--    lectura propia para el account_admin de esa cuenta.
-- =========================================================

create type public.subscription_status as enum ('activa', 'suspendida', 'cancelada');

-- ---------- Catalogo de planes ----------
create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  price_reference numeric(12, 2),
  billing_period text not null default 'mensual', -- mensual | anual (referencia -- todavia no hay cobro automatico)
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- Suscripcion de cada cuenta (una por cuenta) ----------
create table public.account_subscriptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references public.accounts(id) on delete cascade,
  plan_id uuid references public.subscription_plans(id),
  status public.subscription_status not null default 'activa',
  start_date date not null default current_date,
  end_date date,
  -- Columnas reservadas para cuando se conecte el cobro recurrente con
  -- CardNet -- se dejan vacias a proposito (ver nota en el plan de
  -- desarrollo) para que esa integracion futura no requiera una
  -- migracion que rompa el esquema.
  cardnet_subscription_id text,
  cardnet_customer_id text,
  auto_renew boolean not null default false,
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint account_subscriptions_dates_check check (end_date is null or end_date >= start_date)
);

create index account_subscriptions_account_id_idx on public.account_subscriptions(account_id);

-- ---------- Bitacora de cambios (auditoria) ----------
create table public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  account_subscription_id uuid not null references public.account_subscriptions(id) on delete cascade,
  event_type text not null, -- creada | cambio_estado | fechas_o_plan_actualizado
  from_status public.subscription_status,
  to_status public.subscription_status,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index subscription_events_account_subscription_id_idx on public.subscription_events(account_subscription_id);

-- =========================================================
-- RLS
-- =========================================================

alter table public.subscription_plans enable row level security;
alter table public.account_subscriptions enable row level security;
alter table public.subscription_events enable row level security;

-- Planes: lectura abierta a cualquier usuario autenticado (el nombre y
-- precio de referencia de un plan no son sensibles, y el account_admin
-- de una cuenta necesita poder ver el nombre de su propio plan);
-- escritura solo Super Admin.
create policy subscription_plans_select on public.subscription_plans
  for select using (auth.uid() is not null);

create policy subscription_plans_insert on public.subscription_plans
  for insert with check (public.is_super_admin());

create policy subscription_plans_update on public.subscription_plans
  for update using (public.is_super_admin());

create policy subscription_plans_delete on public.subscription_plans
  for delete using (public.is_super_admin());

-- account_subscriptions: el Super Admin ve y administra todas; el
-- account_admin de la cuenta solo puede LEER la suya (decision 3 del
-- usuario) -- toda escritura pasa por el RPC de mas abajo.
create policy account_subscriptions_select_super_admin on public.account_subscriptions
  for select using (public.is_super_admin());

create policy account_subscriptions_select_own on public.account_subscriptions
  for select using (
    account_id in (
      select account_id from public.memberships
      where profile_id = auth.uid() and role = 'account_admin' and account_id is not null
    )
  );

create policy account_subscriptions_insert on public.account_subscriptions
  for insert with check (public.is_super_admin());

create policy account_subscriptions_update on public.account_subscriptions
  for update using (public.is_super_admin());

create policy account_subscriptions_delete on public.account_subscriptions
  for delete using (public.is_super_admin());

-- subscription_events: bitacora interna de la plataforma, solo Super Admin.
create policy subscription_events_select on public.subscription_events
  for select using (public.is_super_admin());

create policy subscription_events_insert on public.subscription_events
  for insert with check (public.is_super_admin());

-- =========================================================
-- RPCs
-- =========================================================

-- Punto unico de escritura para el panel de Super Admin: crea la
-- suscripcion de la cuenta si no existe, o la actualiza si ya existe,
-- y deja registrado el cambio en subscription_events -- todo en una
-- sola transaccion.
create or replace function public.superadmin_upsert_subscription(
  p_account_id uuid,
  p_plan_id uuid,
  p_status public.subscription_status,
  p_start_date date,
  p_end_date date,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub_id uuid;
  v_old_status public.subscription_status;
  v_event_type text;
begin
  if not public.is_super_admin() then
    raise exception 'No autorizado';
  end if;

  if p_end_date is not null and p_end_date < p_start_date then
    raise exception 'La fecha de fin no puede ser anterior a la fecha de inicio';
  end if;

  select id, status into v_sub_id, v_old_status
  from public.account_subscriptions
  where account_id = p_account_id;

  if v_sub_id is null then
    insert into public.account_subscriptions (
      account_id, plan_id, status, start_date, end_date, notes, updated_by
    )
    values (p_account_id, p_plan_id, p_status, p_start_date, p_end_date, p_note, auth.uid())
    returning id into v_sub_id;
    v_event_type := 'creada';
  else
    update public.account_subscriptions
    set plan_id = p_plan_id,
        status = p_status,
        start_date = p_start_date,
        end_date = p_end_date,
        notes = coalesce(p_note, notes),
        updated_at = now(),
        updated_by = auth.uid()
    where id = v_sub_id;
    v_event_type := case
      when v_old_status is distinct from p_status then 'cambio_estado'
      else 'fechas_o_plan_actualizado'
    end;
  end if;

  insert into public.subscription_events (
    account_subscription_id, event_type, from_status, to_status, note, created_by
  )
  values (v_sub_id, v_event_type, v_old_status, p_status, p_note, auth.uid());

  return v_sub_id;
end;
$$;

grant execute on function public.superadmin_upsert_subscription(
  uuid, uuid, public.subscription_status, date, date, text
) to authenticated;

-- Usada por el middleware en cada request a /app/*: true si el
-- usuario actual debe ser redirigido a /cuenta-suspendida. Un Super
-- Admin nunca se bloquea a si mismo. Una cuenta sin fila en
-- account_subscriptions (por ejemplo una recien creada por
-- autoservicio antes de que el Super Admin la revise) NO se bloquea
-- -- el bloqueo es explicito, no por omision, para no dejar a nadie
-- fuera por accidente mientras el Super Admin todavia no la gestiona.
-- Las membresias con rol 'client' se excluyen a proposito (decision 2
-- del usuario: el Portal del cliente de solo lectura sigue
-- funcionando aunque el tenant este suspendido).
create or replace function public.is_my_access_blocked_by_subscription()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (not public.is_super_admin())
    and exists (
      select 1
      from public.account_subscriptions asub
      where asub.account_id in (
        select coalesce(m.account_id, t.account_id)
        from public.memberships m
        left join public.tenants t on t.id = m.tenant_id
        where m.profile_id = auth.uid()
          and m.role <> 'client'
      )
      and (
        asub.status <> 'activa'
        or current_date < asub.start_date
        or (asub.end_date is not null and current_date > asub.end_date)
      )
    );
$$;

grant execute on function public.is_my_access_blocked_by_subscription() to authenticated;

-- =========================================================
-- Siembra: plan de referencia + suscripcion activa sin fecha de fin
-- para todas las cuentas ya existentes (decision 1 del usuario).
-- =========================================================

insert into public.subscription_plans (name, price_reference, billing_period, notes)
values (
  'Plan base (referencia)',
  null,
  'mensual',
  'Plan de marcador de posicion sembrado por la migracion 0023 -- crea planes reales con precio desde el panel de Super Admin.'
)
on conflict (name) do nothing;

insert into public.account_subscriptions (account_id, plan_id, status, start_date, end_date, notes)
select
  a.id,
  (select id from public.subscription_plans where name = 'Plan base (referencia)'),
  'activa',
  current_date,
  null,
  'Sembrada automaticamente al aplicar la migracion 0023 -- cuenta ya existente antes de este control, activada sin fecha de fin para no bloquear a nadie por accidente.'
from public.accounts a
on conflict (account_id) do nothing;
