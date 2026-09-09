import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, isManagerRole } from "@/lib/supabase/tenant";
import { startOnboardingProcess } from "./actions";

const statusLabel: Record<string, string> = {
  en_progreso: "En progreso",
  completado: "Completado",
};

export default async function IncorporacionPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/onboarding");
  if (!isManagerRole(tenant.myRole)) redirect("/app/mi-espacio");

  const supabase = await createClient();

  const [{ data: processes }, { data: employees }, { data: templates }] =
    await Promise.all([
      supabase
        .from("onboarding_processes")
        .select(
          "id, status, started_at, template_name, employees(full_name), onboarding_tasks(status)"
        )
        .eq("tenant_id", tenant.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("employees")
        .select("id, full_name")
        .eq("tenant_id", tenant.id),
      supabase
        .from("onboarding_templates")
        .select("id, name")
        .eq("tenant_id", tenant.id),
    ]);

  const hasEmployees = (employees ?? []).length > 0;
  const hasTemplates = (templates ?? []).length > 0;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">
          Incorporación — {tenant.name}
        </h1>
        <Link
          href="/app/incorporacion/plantillas"
          className="text-sm text-gray-600 hover:underline"
        >
          Plantillas
        </Link>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">
          Nuevo proceso de incorporación
        </h2>

        {!hasEmployees || !hasTemplates ? (
          <p className="mt-3 text-sm text-gray-500">
            Necesitas al menos{" "}
            {!hasEmployees && (
              <Link href="/app/empleados" className="text-blue-700 hover:underline">
                un empleado
              </Link>
            )}
            {!hasEmployees && !hasTemplates && " y "}
            {!hasTemplates && (
              <Link
                href="/app/incorporacion/plantillas"
                className="text-blue-700 hover:underline"
              >
                una plantilla con tareas
              </Link>
            )}{" "}
            antes de iniciar un proceso.
          </p>
        ) : (
          <form action={startOnboardingProcess} className="mt-3 flex flex-wrap gap-3">
            <select
              name="employee_id"
              required
              defaultValue=""
              className="min-w-[180px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Empleado
              </option>
              {(employees ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                </option>
              ))}
            </select>
            <select
              name="template_id"
              required
              defaultValue=""
              className="min-w-[180px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Plantilla
              </option>
              {(templates ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <input
              name="started_at"
              type="date"
              defaultValue={today}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Iniciar
            </button>
          </form>
        )}
      </div>

      <div className="mt-6 space-y-3">
        {(processes ?? []).length === 0 && (
          <p className="text-sm text-gray-500">
            Aún no hay procesos de incorporación.
          </p>
        )}
        {(processes ?? []).map((p) => {
          const employeeName =
            (p.employees as unknown as { full_name: string } | null)
              ?.full_name ?? "—";
          const taskStatuses = (p.onboarding_tasks ?? []) as unknown as {
            status: string;
          }[];
          const total = taskStatuses.length;
          const done = taskStatuses.filter((t) => t.status === "completada").length;
          return (
            <Link
              key={p.id}
              href={`/app/incorporacion/${p.id}`}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-gray-300"
            >
              <div>
                <p className="font-medium text-gray-900">
                  {employeeName} — {p.template_name ?? "—"}
                </p>
                <p className="text-xs text-gray-500">
                  Inicio {p.started_at} · {statusLabel[p.status] ?? p.status} ·{" "}
                  {done}/{total} tareas
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-sm font-medium ${
                  p.status === "completado"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-gray-900 text-white"
                }`}
              >
                {total > 0 ? Math.round((done / total) * 100) : 0}%
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
