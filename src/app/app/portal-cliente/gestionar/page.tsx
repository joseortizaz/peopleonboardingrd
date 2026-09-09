import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, isManagerRole } from "@/lib/supabase/tenant";
import { createClientInvite, deleteClientInvite } from "../actions";

export default async function PortalClienteGestionarPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: errorMessage } = await searchParams;
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/onboarding");
  if (!isManagerRole(tenant.myRole)) {
    redirect(tenant.myRole === "client" ? "/app/portal-cliente" : "/app/mi-espacio");
  }

  const supabase = await createClient();

  const { data: invites } = await supabase
    .from("client_invites")
    .select("id, email, consumed_at, consumed_by, created_at")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false });

  const inviteForTenant = createClientInvite.bind(null, tenant.id);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-xl font-semibold text-gray-900">
        Portal del cliente — {tenant.name}
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Invita al correo de tu cliente para darle acceso de solo lectura a
        vacantes publicadas, candidatos contratados y evaluaciones
        completadas de este tenant.
      </p>

      {errorMessage && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">Invitar cliente</h2>
        <form action={inviteForTenant} className="mt-3 flex flex-wrap gap-3">
          <input
            name="email"
            type="email"
            required
            placeholder="correo@delcliente.com"
            className="min-w-[240px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Invitar
          </button>
        </form>
        <p className="mt-2 text-xs text-gray-400">
          El acceso se activa automáticamente cuando esa persona se registra
          (o inicia sesión, si ya tenía cuenta) con ese correo.
        </p>
      </div>

      <div className="mt-6 space-y-2">
        {(invites ?? []).length === 0 && (
          <p className="text-sm text-gray-500">
            Aún no has invitado a ningún cliente.
          </p>
        )}
        {(invites ?? []).map((inv) => {
          const remove = deleteClientInvite.bind(
            null,
            inv.id,
            tenant.id,
            inv.consumed_by
          );
          return (
            <div
              key={inv.id}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {inv.email}
                </p>
                <p className="text-xs text-gray-500">
                  {inv.consumed_at
                    ? `Activo desde ${new Date(inv.consumed_at).toLocaleDateString("es-DO")}`
                    : "Pendiente de registro"}
                </p>
              </div>
              <form action={remove}>
                <button className="text-xs text-red-600 hover:underline">
                  {inv.consumed_at ? "Revocar acceso" : "Cancelar invitación"}
                </button>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
