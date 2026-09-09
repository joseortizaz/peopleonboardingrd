import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, isManagerRole } from "@/lib/supabase/tenant";
import { createEvaluation } from "./actions";

const typeLabel: Record<string, string> = {
  "90": "90°",
  "180": "180°",
  "360": "360°",
};

const statusLabel: Record<string, string> = {
  en_progreso: "En progreso",
  completada: "Completada",
};

export default async function EvaluacionesPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/onboarding");
  if (!isManagerRole(tenant.myRole)) redirect("/app/mi-espacio");

  const supabase = await createClient();

  const [{ data: evaluations }, { data: employees }, { data: templates }] =
    await Promise.all([
      supabase
        .from("evaluations")
        .select(
          "id, type, status, overall_score, created_at, employees(full_name), evaluation_templates(name)"
        )
        .eq("tenant_id", tenant.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("employees")
        .select("id, full_name")
        .eq("tenant_id", tenant.id),
      supabase
        .from("evaluation_templates")
        .select("id, name")
        .eq("tenant_id", tenant.id),
    ]);

  const createEvaluationForTenant = createEvaluation.bind(null, tenant.id);
  const hasEmployees = (employees ?? []).length > 0;
  const hasTemplates = (templates ?? []).length > 0;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">
          Evaluación de desempeño — {tenant.name}
        </h1>
        <Link
          href="/app/evaluaciones/plantillas"
          className="text-sm text-gray-600 hover:underline"
        >
          Plantillas
        </Link>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">Nueva evaluación</h2>

        {!hasEmployees || !hasTemplates ? (
          <p className="mt-3 text-sm text-gray-500">
            Necesitas al menos {" "}
            {!hasEmployees && (
              <Link href="/app/empleados" className="text-blue-700 hover:underline">
                un empleado
              </Link>
            )}
            {!hasEmployees && !hasTemplates && " y "}
            {!hasTemplates && (
              <Link
                href="/app/evaluaciones/plantillas"
                className="text-blue-700 hover:underline"
              >
                una plantilla con competencias
              </Link>
            )}{" "}
            antes de crear una evaluación.
          </p>
        ) : (
          <form action={createEvaluationForTenant} className="mt-3 flex flex-wrap gap-3">
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
            <select
              name="type"
              defaultValue="90"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="90">90°</option>
              <option value="180">180°</option>
              <option value="360">360°</option>
            </select>
            <button
              type="submit"
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Crear
            </button>
          </form>
        )}
      </div>

      <div className="mt-6 space-y-3">
        {(evaluations ?? []).length === 0 && (
          <p className="text-sm text-gray-500">Aún no hay evaluaciones.</p>
        )}
        {(evaluations ?? []).map((ev) => {
          const employeeName =
            (ev.employees as unknown as { full_name: string } | null)
              ?.full_name ?? "—";
          const templateName =
            (ev.evaluation_templates as unknown as { name: string } | null)
              ?.name ?? "—";
          return (
            <Link
              key={ev.id}
              href={`/app/evaluaciones/${ev.id}`}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-gray-300"
            >
              <div>
                <p className="font-medium text-gray-900">
                  {employeeName} — {templateName}
                </p>
                <p className="text-xs text-gray-500">
                  Evaluación {typeLabel[ev.type]} · {statusLabel[ev.status]}
                </p>
              </div>
              {ev.overall_score !== null && (
                <span className="rounded-full bg-gray-900 px-3 py-1 text-sm font-medium text-white">
                  {ev.overall_score}/5
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
