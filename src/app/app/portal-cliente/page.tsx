import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, isManagerRole } from "@/lib/supabase/tenant";

const vacancyStatusLabel: Record<string, string> = {
  published: "Publicada",
  closed: "Cerrada",
};

const typeLabel: Record<string, string> = {
  "90": "90°",
  "180": "180°",
  "360": "360°",
};

export default async function PortalClientePage() {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/onboarding");
  if (!isManagerRole(tenant.myRole) && tenant.myRole !== "client") {
    redirect("/app/mi-espacio");
  }

  const supabase = await createClient();

  const [{ data: vacancies }, { data: candidates }, { data: evaluations }] =
    await Promise.all([
      supabase
        .from("vacancies")
        .select("id, title, status, department_id, departments(name)")
        .eq("tenant_id", tenant.id)
        .in("status", ["published", "closed"])
        .order("created_at", { ascending: false }),
      supabase
        .from("candidates")
        .select("id, full_name, email, created_at, vacancy_id, vacancies(title)")
        .eq("tenant_id", tenant.id)
        .eq("stage", "contratado")
        .order("created_at", { ascending: false }),
      supabase
        .from("evaluations")
        .select(
          "id, type, overall_score, completed_at, employees(full_name), evaluation_templates(name)"
        )
        .eq("tenant_id", tenant.id)
        .eq("status", "completada")
        .order("completed_at", { ascending: false }),
    ]);

  const candidateCountByVacancy = (candidates ?? []).reduce<Record<string, number>>(
    (acc, c) => {
      acc[c.vacancy_id] = (acc[c.vacancy_id] ?? 0) + 1;
      return acc;
    },
    {}
  );

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Portal del cliente — {tenant.name}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Vista de solo lectura: vacantes publicadas, candidatos
            contratados y evaluaciones de desempeño completadas.
          </p>
        </div>
        {isManagerRole(tenant.myRole) && (
          <Link
            href="/app/portal-cliente/gestionar"
            className="whitespace-nowrap text-sm text-gray-600 hover:underline"
          >
            Gestionar accesos
          </Link>
        )}
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-sm font-medium text-gray-700">Vacantes</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {(vacancies ?? []).length === 0 && (
            <p className="px-6 py-6 text-center text-sm text-gray-500">
              No hay vacantes publicadas todavía.
            </p>
          )}
          {(vacancies ?? []).map((v) => {
            const departmentName =
              (v.departments as unknown as { name: string } | null)?.name ??
              "—";
            return (
              <div key={v.id} className="flex items-center justify-between px-6 py-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">{v.title}</p>
                  <p className="text-xs text-gray-500">
                    {departmentName} · {candidateCountByVacancy[v.id] ?? 0}{" "}
                    contratado(s)
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    v.status === "published"
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {vacancyStatusLabel[v.status] ?? v.status}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-sm font-medium text-gray-700">
            Candidatos contratados
          </h2>
          <a
            href="/api/portal-cliente/candidatos"
            className="text-xs text-blue-700 hover:underline"
          >
            Exportar CSV
          </a>
        </div>
        <div className="divide-y divide-gray-100">
          {(candidates ?? []).length === 0 && (
            <p className="px-6 py-6 text-center text-sm text-gray-500">
              Aún no hay candidatos contratados.
            </p>
          )}
          {(candidates ?? []).map((c) => {
            const vacancyTitle =
              (c.vacancies as unknown as { title: string } | null)?.title ??
              "—";
            return (
              <div key={c.id} className="px-6 py-4">
                <p className="text-sm font-medium text-gray-900">
                  {c.full_name}
                </p>
                <p className="text-xs text-gray-500">
                  {vacancyTitle} · {c.email} ·{" "}
                  {new Date(c.created_at).toLocaleDateString("es-DO")}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-sm font-medium text-gray-700">
            Evaluaciones de desempeño completadas
          </h2>
          <a
            href="/api/portal-cliente/evaluaciones"
            className="text-xs text-blue-700 hover:underline"
          >
            Exportar CSV
          </a>
        </div>
        <div className="divide-y divide-gray-100">
          {(evaluations ?? []).length === 0 && (
            <p className="px-6 py-6 text-center text-sm text-gray-500">
              Aún no hay evaluaciones completadas.
            </p>
          )}
          {(evaluations ?? []).map((ev) => {
            const employeeName =
              (ev.employees as unknown as { full_name: string } | null)
                ?.full_name ?? "—";
            const templateName =
              (ev.evaluation_templates as unknown as { name: string } | null)
                ?.name ?? "—";
            return (
              <div
                key={ev.id}
                className="flex items-center justify-between px-6 py-4"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {employeeName}
                  </p>
                  <p className="text-xs text-gray-500">
                    {templateName} · Evaluación {typeLabel[ev.type] ?? ev.type}{" "}
                    ·{" "}
                    {ev.completed_at
                      ? new Date(ev.completed_at).toLocaleDateString("es-DO")
                      : "—"}
                  </p>
                </div>
                {ev.overall_score !== null && (
                  <span className="rounded-full bg-gray-900 px-3 py-1 text-sm font-medium text-white">
                    {ev.overall_score}/5
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
