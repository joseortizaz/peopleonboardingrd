import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, isManagerRole } from "@/lib/supabase/tenant";
import { createClimateSurvey } from "./actions";

const statusLabel: Record<string, string> = {
  activa: "Activa",
  cerrada: "Cerrada",
};

const QUESTION_ROWS = 6;

export default async function EncuestasPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/onboarding");
  if (tenant.myRole === "client") redirect("/app/portal-cliente");

  const supabase = await createClient();
  const isManager = isManagerRole(tenant.myRole);

  const { data: surveys } = await supabase
    .from("climate_surveys")
    .select("id, title, description, status, created_at")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false });

  let respondedMap: Record<string, boolean> = {};
  let countMap: Record<string, number> = {};

  if (!isManager) {
    const results = await Promise.all(
      (surveys ?? [])
        .filter((s) => s.status === "activa")
        .map((s) => supabase.rpc("has_employee_responded_survey", { p_survey_id: s.id }))
    );
    (surveys ?? [])
      .filter((s) => s.status === "activa")
      .forEach((s, i) => {
        respondedMap[s.id] = !!results[i].data;
      });
  } else {
    const results = await Promise.all(
      (surveys ?? []).map((s) => supabase.rpc("count_climate_survey_responses", { p_survey_id: s.id }))
    );
    (surveys ?? []).forEach((s, i) => {
      countMap[s.id] = Number(results[i].data ?? 0);
    });
  }

  const createForTenant = createClimateSurvey.bind(null, tenant.id);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-xl font-semibold text-gray-900">
        Encuestas de clima — {tenant.name}
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Las respuestas son anónimas: nadie, ni siquiera gestión, puede ver qué
        respondió cada persona — solo promedios y respuestas de texto sin
        vincular a nadie.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {isManager && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-medium text-gray-700">Nueva encuesta</h2>
          <form action={createForTenant} className="mt-3 space-y-3">
            <input
              name="title"
              type="text"
              required
              placeholder="Título de la encuesta"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <textarea
              name="description"
              rows={2}
              placeholder="Descripción (opcional)"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <div className="space-y-2">
              <p className="text-xs text-gray-500">
                Preguntas (deja en blanco las que no uses):
              </p>
              {Array.from({ length: QUESTION_ROWS }).map((_, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    name="question_text"
                    type="text"
                    placeholder={`Pregunta ${i + 1}`}
                    className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                  <select
                    name="question_type"
                    defaultValue="scale"
                    className="rounded-md border border-gray-300 bg-white px-2 py-2 text-sm"
                  >
                    <option value="scale">Escala 1-5</option>
                    <option value="texto">Texto libre</option>
                  </select>
                </div>
              ))}
            </div>
            <button
              type="submit"
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Crear encuesta
            </button>
          </form>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {(surveys ?? []).length === 0 && (
          <p className="text-sm text-gray-500">Aún no hay encuestas.</p>
        )}
        {(surveys ?? [])
          .filter((s) => isManager || s.status === "activa")
          .map((s) => (
            <Link
              key={s.id}
              href={`/app/encuestas/${s.id}`}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-gray-300"
            >
              <div>
                <p className="font-medium text-gray-900">{s.title}</p>
                {s.description && (
                  <p className="text-xs text-gray-500">{s.description}</p>
                )}
                {!isManager && respondedMap[s.id] && (
                  <p className="mt-1 text-xs text-emerald-700">Ya respondiste</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                {isManager && (
                  <span className="text-xs text-gray-500">
                    {countMap[s.id] ?? 0} respuesta(s)
                  </span>
                )}
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    s.status === "activa"
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {statusLabel[s.status] ?? s.status}
                </span>
              </div>
            </Link>
          ))}
      </div>
    </div>
  );
}
