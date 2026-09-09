import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/supabase/tenant";
import { createVacancy, deleteVacancy, updateVacancyStatus } from "./actions";

const statusLabel: Record<string, string> = {
  draft: "Borrador",
  published: "Publicada",
  closed: "Cerrada",
};

const statusColor: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  published: "bg-green-100 text-green-700",
  closed: "bg-red-100 text-red-700",
};

export default async function AtsPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/onboarding");

  const supabase = await createClient();

  const [{ data: vacancies }, { data: departments }] = await Promise.all([
    supabase
      .from("vacancies")
      .select("id, title, slug, status, department_id, candidates(count)")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("departments")
      .select("id, name")
      .eq("tenant_id", tenant.id),
  ]);

  const createVacancyForTenant = createVacancy.bind(null, tenant.id);
  const departmentName = (id: string | null) =>
    departments?.find((d) => d.id === id)?.name ?? "—";

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-xl font-semibold text-gray-900">
        Reclutamiento — {tenant.name}
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Vacantes y su pipeline de candidatos.
      </p>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">Nueva vacante</h2>
        <form action={createVacancyForTenant} className="mt-3 space-y-3">
          <input
            name="title"
            type="text"
            placeholder="Título del puesto"
            required
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <select
            name="department_id"
            defaultValue=""
            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Sin departamento</option>
            {(departments ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <textarea
            name="description"
            placeholder="Descripción del puesto"
            rows={3}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <textarea
            name="requirements"
            placeholder="Requisitos"
            rows={3}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Crear vacante (borrador)
          </button>
        </form>
      </div>

      <div className="mt-6 space-y-3">
        {(vacancies ?? []).length === 0 && (
          <p className="text-sm text-gray-500">Aún no hay vacantes.</p>
        )}
        {(vacancies ?? []).map((v) => {
          const candidateCount = Array.isArray(v.candidates)
            ? (v.candidates[0] as { count: number } | undefined)?.count ?? 0
            : 0;

          const publish = updateVacancyStatus.bind(null, v.id, "published");
          const close = updateVacancyStatus.bind(null, v.id, "closed");
          const reopenDraft = updateVacancyStatus.bind(null, v.id, "draft");
          const remove = deleteVacancy.bind(null, v.id);

          return (
            <div
              key={v.id}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div>
                  <Link
                    href={`/app/ats/${v.id}`}
                    className="font-medium text-gray-900 hover:underline"
                  >
                    {v.title}
                  </Link>
                  <p className="text-xs text-gray-500">
                    {departmentName(v.department_id)} · {candidateCount}{" "}
                    candidato(s)
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[v.status]}`}
                >
                  {statusLabel[v.status]}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                {v.status !== "published" && (
                  <form action={publish}>
                    <button className="rounded-md border border-gray-300 px-2 py-1 hover:bg-gray-50">
                      Publicar
                    </button>
                  </form>
                )}
                {v.status === "published" && (
                  <form action={close}>
                    <button className="rounded-md border border-gray-300 px-2 py-1 hover:bg-gray-50">
                      Cerrar
                    </button>
                  </form>
                )}
                {v.status === "closed" && (
                  <form action={reopenDraft}>
                    <button className="rounded-md border border-gray-300 px-2 py-1 hover:bg-gray-50">
                      Volver a borrador
                    </button>
                  </form>
                )}
                {v.status === "published" && (
                  <a
                    href={`/apply/${v.slug}`}
                    target="_blank"
                    className="rounded-md border border-gray-300 px-2 py-1 text-blue-700 hover:bg-gray-50"
                  >
                    Ver formulario público
                  </a>
                )}
                <form action={remove}>
                  <button className="rounded-md border border-gray-300 px-2 py-1 text-red-600 hover:bg-gray-50">
                    Eliminar
                  </button>
                </form>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
