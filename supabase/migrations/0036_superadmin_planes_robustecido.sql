-- =========================================================
-- Robustecer el panel de Super Admin: editar/archivar planes y
-- niveles de acceso (limites) reales por plan.
--
-- Contexto: hasta ahora se podian crear planes (`createPlan`) pero no
-- editarlos ni archivarlos -- las policies de RLS de update/delete ya
-- existian desde la migracion 0023 (super_admin), pero nada en el
-- codigo las usaba. Tampoco existia ningun limite real asociado a un
-- plan: la columna `features` (migracion 0025) es solo texto de
-- marketing para /precios, nunca se lee para restringir nada.
--
-- Esta migracion:
-- 1. Agrega `archived boolean` a subscription_plans -- se prefiere
--    archivar en vez de permitir un delete fisico, porque
--    account_subscriptions.plan_id referencia el plan sin on delete
--    explicito (= RESTRICT): borrar un plan con al menos una cuenta
--    suscrita (activa, suspendida o incluso cancelada, porque el
--    historial no se borra) fallaria con un error crudo de base de
--    datos. Un plan archivado deja de ofrecerse (se filtra en
--    /precios y /app/facturacion) pero las cuentas que ya lo tienen
--    asignado no se ven afectadas.
-- 2. Agrega `plan_limits jsonb` -- limites numericos reales del plan.
--    v1 deliberadamente acotado a los dos limites mas claramente
--    monetizables de un SaaS de RR.HH.: cantidad de colaboradores y
--    cantidad de tenants (empresas cliente) por cuenta. Se eligio
--    jsonb en vez de columnas nuevas por cada limite -- mismo
--    razonamiento ya aplicado a `options` en las preguntas filtro del
--    ATS (migracion 0035): nunca se filtra/ordena por estos valores en
--    SQL, y asi se puede agregar un limite nuevo despues sin otra
--    migracion. Forma esperada (una clave ausente o null = ilimitado):
--      { "max_employees": 50, "max_tenants": 3 }
-- 3. Agrega la funcion `get_account_plan_limits(account_id)` --
--    punto unico de lectura de los limites vigentes de una cuenta,
--    para que cualquier Server Action que necesite verificar un
--    limite (hoy: creacion de empleados) lo haga de forma consistente.
-- =========================================================

alter table public.subscription_plans
  add column if not exists archived boolean not null default false,
  add column if not exists plan_limits jsonb not null default '{}'::jsonb;

comment on column public.subscription_plans.archived is
  'true = el plan ya no se ofrece (se oculta de /precios y /app/facturacion), pero las cuentas que ya lo tienen asignado no se ven afectadas. Preferido sobre un delete fisico porque account_subscriptions.plan_id no tiene on delete cascade.';
comment on column public.subscription_plans.plan_limits is
  'jsonb con limites numericos del plan. Una clave ausente o en null significa "ilimitado". Forma v1: { "max_employees": int|null, "max_tenants": int|null }. Pensado para crecer con claves booleanas de feature-gating por modulo mas adelante, sin necesitar otra migracion.';

-- Devuelve los limites vigentes de una cuenta segun su suscripcion
-- actual (plan_limits del plan asignado), o '{}'::jsonb (= sin
-- limites) si la cuenta no tiene suscripcion o no tiene plan asignado.
-- Callable por cualquier usuario autenticado que pertenezca a esa
-- cuenta (para que sus propias Server Actions puedan verificar el
-- limite) o por super_admin -- mismo patron de resolucion de cuenta
-- (via membership directa o via tenant) ya usado en
-- is_my_access_blocked_by_subscription (migracion 0023).
create or replace function public.get_account_plan_limits(p_account_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limits jsonb;
begin
  if not (
    public.is_super_admin()
    or p_account_id in (
      select coalesce(m.account_id, t.account_id)
      from public.memberships m
      left join public.tenants t on t.id = m.tenant_id
      where m.profile_id = auth.uid()
    )
  ) then
    raise exception 'No autorizado';
  end if;

  select sp.plan_limits into v_limits
  from public.account_subscriptions asub
  join public.subscription_plans sp on sp.id = asub.plan_id
  where asub.account_id = p_account_id;

  return coalesce(v_limits, '{}'::jsonb);
end;
$$;

grant execute on function public.get_account_plan_limits(uuid) to authenticated;
