import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, isManagerRole } from "@/lib/supabase/tenant";
import { createDevelopmentPlan } from "./actions";

const statusLabel: Record<string, string> = {
  en_progreso: "En progreso",
  completado: "Completado",
};

export default async function DesarrolloPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/onboarding");
  if (!isManagerRole(tenant.myRole)) redirect("/app/mi-espacio");

  const supabase = await createClient();

  const [{ data: plans }, { data: employees }] = await Promise.all([
    supabase
      .from("development_plans")
      .select(
        "id, title, status, created_at, employees(full_name), development_plan_goals(status)"
      )
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("employees")
      .select("id, full_name")
      .eq("tenant_id", tenant.id)
      .order("full_name", { ascending: true }),
  ]);

  const hasEmployees = (employees ?? []).length > 0;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-xl font-semibold text-gray-900">
        Planes de desarrollo — {tenant.name}
      </h1>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">
          Nuevo plan de desarrollo individual (PDI)
        </h2>

        {!hasEmployees ? (
          <p className="mt-3 text-sm text-gray-500">
            Necesitas al menos{" "}
            <Link href="/app/empleados" className="text-blue-700 hover:underline">
              un empleado
            </Link>{" "}
            antes de crear un plan.
          </p>
        ) : (
          <form action={createDevelopmentPlan.bind(null, tenant.id)} className="mt-3 flex flex-wrap gap-3">
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
            <input
              name="title"
              type="text"
              required
              placeholder="Título del plan (ej. Plan de desarrollo 2026)"
              className="min-w-[220px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
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
        {(plans ?? []).length === 0 && (
          <p className="text-sm text-gray-500">
            Aún no hay planes de desarrollo individual.
          </p>
        )}
        {(plans ?? []).map((p) => {
          const employeeName =
            (p.employees as unknown as { full_name: string } | null)?.full_name ?? "—";
          const goalStatuses = (p.development_plan_goals ?? []) as unknown as {
            status: string;
          }[];
          const total = goalStatuses.length;
          const done = goalStatuses.filter((g) => g.status === "completado").length;
          return (
            <Link
              key={p.id}
              href={`/app/desarrollo/${p.id}`}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-gray-300"
            >
              <div>
                <p className="font-medium text-gray-900">
                  {employeeName} — {p.title}
                </p>
                <p className="text-xs text-gray-500">
                  {statusLabel[p.status] ?? p.status} · {done}/{total} metas
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
