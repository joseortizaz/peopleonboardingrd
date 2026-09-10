import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, isManagerRole } from "@/lib/supabase/tenant";
import { decideLeaveRequestAction, deleteLeaveRequestAction } from "./actions";

const typeLabel: Record<string, string> = {
  vacaciones: "Vacaciones",
  permiso: "Permiso",
};

const statusLabel: Record<string, string> = {
  pendiente: "Pendiente",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
};

const statusClass: Record<string, string> = {
  pendiente: "bg-gray-900 text-white",
  aprobada: "bg-emerald-100 text-emerald-800",
  rechazada: "bg-red-100 text-red-700",
};

const dateFmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("es-DO");

export default async function PermisosPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/onboarding");
  if (!isManagerRole(tenant.myRole)) redirect("/app/mi-espacio");

  const supabase = await createClient();

  const { data: requests } = await supabase
    .from("leave_requests")
    .select(
      "id, type, start_date, end_date, days_requested, reason, status, decision_notes, employees(full_name)"
    )
    .eq("tenant_id", tenant.id)
    .order("status", { ascending: true })
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-xl font-semibold text-gray-900">
        Vacaciones y permisos — {tenant.name}
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Solicitudes de vacaciones y permisos enviadas por los empleados desde
        su autoservicio. Aprobar una solicitud de vacaciones valida el balance
        disponible del empleado.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 space-y-3">
        {(requests ?? []).length === 0 && (
          <p className="text-sm text-gray-500">Aún no hay solicitudes.</p>
        )}
        {(requests ?? []).map((r) => {
          const name =
            (r.employees as unknown as { full_name: string } | null)?.full_name ?? "—";
          return (
            <div key={r.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {name} — {typeLabel[r.type] ?? r.type}
                  </p>
                  <p className="text-xs text-gray-500">
                    {dateFmt(r.start_date)} → {dateFmt(r.end_date)} ·{" "}
                    {r.days_requested} día(s)
                  </p>
                  {r.reason && (
                    <p className="mt-1 text-sm text-gray-600">{r.reason}</p>
                  )}
                  {r.decision_notes && (
                    <p className="mt-1 text-xs text-gray-400">
                      Nota de gestión: {r.decision_notes}
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                    statusClass[r.status] ?? "bg-gray-100 text-gray-600"
                  }`}
                >
                  {statusLabel[r.status] ?? r.status}
                </span>
              </div>

              {r.status === "pendiente" ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <form
                    action={decideLeaveRequestAction.bind(null, r.id, "aprobada")}
                    className="flex items-center gap-2"
                  >
                    <input
                      name="notes"
                      type="text"
                      placeholder="Nota (opcional)"
                      className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                    />
                    <button className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
                      Aprobar
                    </button>
                  </form>
                  <form action={decideLeaveRequestAction.bind(null, r.id, "rechazada")}>
                    <button className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
                      Rechazar
                    </button>
                  </form>
                </div>
              ) : (
                <form action={deleteLeaveRequestAction.bind(null, r.id)} className="mt-3">
                  <button className="text-xs text-red-600 hover:underline">Eliminar</button>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
