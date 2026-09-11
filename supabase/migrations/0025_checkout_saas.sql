-- =========================================================
-- Checkout self-service con captura manual de pago.
--
-- Contexto: Facturacion SaaS v1 (migracion 0023) dejo el modelo de
-- suscripciones listo, pero el UNICO punto de entrada para activar
-- o cambiar una suscripcion era el panel de Super Admin -- el cliente
-- no tenia ninguna forma de pedir/cambiar su plan por su cuenta. El
-- usuario eligio construir ahora un checkout self-service con
-- captura manual (sin depender todavia de credenciales de CardNet):
-- el cliente elige un plan y "solicita" pagarlo, ve instrucciones de
-- transferencia, y el Super Admin confirma el pago manualmente desde
-- su panel para activar la suscripcion -- exactamente el mismo botón
-- "Guardar" que ya existia, pero ahora alimentado por una solicitud
-- del cliente en vez de partir siempre de cero.
--
-- Diseñado para no perder nada al conectar CardNet real mas adelante:
-- el paso que hoy es "el Super Admin confirma manualmente" es,
-- estructuralmente, el mismo paso que ocupara un webhook de CardNet
-- confirmando el pago -- solo cambia quien/que dispara la
-- confirmacion, nunca el modelo de datos.
-- =========================================================

-- ---------- Metadatos publicos de un plan (para el checkout) ----------
alter table public.subscription_plans
  add column if not exists is_public boolean not null default false,
  add column if not exists description text,
  add column if not exists features jsonb not null default '[]'::jsonb;

comment on column public.subscription_plans.is_public is
  'true = aparece en /precios y en el selector de checkout de /app/facturacion. Los planes internos/de referencia (como el sembrado por la migracion 0023) quedan en false.';
comment on column public.subscription_plans.features is
  'Arreglo jsonb de strings cortos para mostrar como lista de caracteristicas en /precios, p.ej. ["Hasta 25 colaboradores", "Nomina TSS/ISR", "Soporte por correo"].';

-- ---------- Solicitudes de pago (intencion de compra/renovacion) ----------
create type public.payment_request_status as enum ('pendiente', 'confirmada', 'rechazada');

create table public.subscription_payment_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  status public.payment_request_status not null default 'pendiente',
  note text,
  requested_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  resolution_note text,
  resulting_subscription_id uuid references public.account_subscriptions(id)
);

create index subscription_payment_requests_account_id_idx on public.subscription_payment_requests(account_id);
create index subscription_payment_requests_status_idx on public.subscription_payment_requests(status);

alter table public.subscription_payment_requests enable row level security;

-- Select: Super Admin ve todas; el account_admin de la cuenta ve solo las suyas.
-- No hay policies de insert/update -- toda escritura pasa por los RPCs de abajo,
-- que corren con los privilegios de su dueño (mismo patron que
-- superadmin_upsert_subscription en la migracion 0023).
create policy subscription_payment_requests_select_super_admin on public.subscription_payment_requests
  for select using (public.is_super_admin());

create policy subscription_payment_requests_select_own on public.subscription_payment_requests
  for select using (
    account_id in (
      select account_id from public.memberships
      where profile_id = auth.uid() and role = 'account_admin' and account_id is not null
    )
  );

-- =========================================================
-- RPCs
-- =========================================================

-- El account_admin pide un plan publico para su propia cuenta. Resuelve
-- el account_id del propio usuario en vez de recibirlo del cliente, para
-- que nadie pueda solicitar en nombre de otra cuenta.
create or replace function public.request_subscription_plan(
  p_plan_id uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
  v_request_id uuid;
  v_is_public boolean;
begin
  select account_id into v_account_id
  from public.memberships
  where profile_id = auth.uid() and role = 'account_admin' and account_id is not null
  limit 1;

  if v_account_id is null then
    raise exception 'Solo el administrador de la cuenta puede solicitar un plan';
  end if;

  select is_public into v_is_public
  from public.subscription_plans
  where id = p_plan_id;

  if v_is_public is not true then
    raise exception 'Ese plan no esta disponible para autoservicio';
  end if;

  insert into public.subscription_payment_requests (account_id, plan_id, note, requested_by)
  values (v_account_id, p_plan_id, p_note, auth.uid())
  returning id into v_request_id;

  return v_request_id;
end;
$$;

grant execute on function public.request_subscription_plan(uuid, text) to authenticated;

-- El Super Admin confirma o rechaza una solicitud de pago. Al confirmar,
-- calcula la fecha de fin segun el periodo del plan (mensual = +1 mes,
-- cualquier otro valor = +1 año) y reutiliza superadmin_upsert_subscription
-- para activar la suscripcion -- mismo camino de escritura y de bitacora
-- que ya usa el panel para cambios manuales, para no duplicar logica.
create or replace function public.superadmin_resolve_payment_request(
  p_request_id uuid,
  p_action text, -- 'confirmar' | 'rechazar'
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
  v_end_date date;
  v_sub_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'No autorizado';
  end if;

  select * into v_request
  from public.subscription_payment_requests
  where id = p_request_id
  for update;

  if v_request is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if v_request.status <> 'pendiente' then
    raise exception 'Esta solicitud ya fue resuelta';
  end if;

  if p_action = 'confirmar' then
    select case
      when billing_period = 'anual' then current_date + interval '1 year'
      else current_date + interval '1 month'
    end::date into v_end_date
    from public.subscription_plans
    where id = v_request.plan_id;

    v_sub_id := public.superadmin_upsert_subscription(
      v_request.account_id,
      v_request.plan_id,
      'activa',
      current_date,
      v_end_date,
      coalesce(p_note, 'Confirmado a partir de solicitud de pago del cliente')
    );

    update public.subscription_payment_requests
    set status = 'confirmada',
        resolved_at = now(),
        resolved_by = auth.uid(),
        resolution_note = p_note,
        resulting_subscription_id = v_sub_id
    where id = p_request_id;
  elsif p_action = 'rechazar' then
    update public.subscription_payment_requests
    set status = 'rechazada',
        resolved_at = now(),
        resolved_by = auth.uid(),
        resolution_note = p_note
    where id = p_request_id;
  else
    raise exception 'Accion invalida: %', p_action;
  end if;
end;
$$;

grant execute on function public.superadmin_resolve_payment_request(uuid, text, text) to authenticated;

-- =========================================================
-- Siembra de ejemplo: marca el plan base sembrado por 0023 como NO
-- publico (es un marcador de posicion interno) y crea dos planes
-- publicos de referencia para que /precios y el checkout tengan algo
-- que mostrar de inmediato. El usuario puede editar precios/features
-- reales despues -- no hay UI de alta de planes públicos en v1 mas
-- alla del formulario ya existente en /app/superadmin (que ahora
-- tambien acepta is_public/description/features via SQL directo).
-- =========================================================

update public.subscription_plans
set is_public = false
where name = 'Plan base (referencia)';

insert into public.subscription_plans (name, price_reference, billing_period, is_public, description, features)
values
  (
    'Starter',
    4500,
    'mensual',
    true,
    'Para empresas de hasta 25 colaboradores con RR.HH. propio.',
    '["Hasta 25 colaboradores", "ATS, estructura y evaluación de desempeño", "Autoservicio del empleado", "Nómina TSS/ISR"]'::jsonb
  ),
  (
    'Growth',
    9500,
    'mensual',
    true,
    'Para empresas medianas que necesitan el conjunto completo del sistema.',
    '["Colaboradores ilimitados", "Todo lo de Starter", "Asistencia, beneficios y capacitación", "Comunicación interna y people analytics"]'::jsonb
  )
on conflict (name) do nothing;
