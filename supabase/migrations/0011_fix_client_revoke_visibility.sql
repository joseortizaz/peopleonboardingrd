-- =========================================================
-- Fix: "Revocar acceso" en el portal del cliente no borraba la
-- membresia real.
--
-- La policy memberships_delete_client_by_manager (0010) es correcta,
-- pero en Postgres una fila solo puede ser identificada para
-- UPDATE/DELETE si tambien es visible bajo alguna policy de SELECT.
-- La unica policy de SELECT que existia sobre memberships
-- (memberships_select_self) solo permite ver la propia membresia
-- (profile_id = auth.uid()), asi que un gestor no podia "ver" la
-- membresia 'client' de otra persona y, por lo tanto, tampoco podia
-- borrarla — aunque la policy de DELETE en si misma fuera correcta.
--
-- Se agrega una policy de SELECT adicional (se combinan con OR junto
-- a memberships_select_self) que da visibilidad de las membresias
-- role = 'client' dentro de los tenants que el usuario gestiona.
-- =========================================================

create policy memberships_select_client_by_manager on public.memberships
  for select using (
    role = 'client'
    and tenant_id in (select public.my_manager_tenant_ids())
  );
