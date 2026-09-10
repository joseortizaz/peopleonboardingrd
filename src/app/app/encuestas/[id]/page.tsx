import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, isManagerRole } from "@/lib/supabase/tenant";
import { closeSurveyAction, deleteSurveyAction, submitSurveyResponseAction } from "../actions";

const statusLabel: Record<string, string> = {
  activa: "Activa",
  cerrada: "Cerrada",
};

export default async function EncuestaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/onboarding");
  if (tenant.myRole === "client") redirect("/app/portal-cliente");

  const supabase = await createClient();
  const isManager = isManagerRole(tenant.myRole);

  const { data: survey } = await supabase
    .from("climate_surveys")
    .select("id, title, description, status, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!survey) redirect("/app/encuestas");

  const { data: questions } = await supabase
    .from("climate_survey_questions")
    .select("id, question_text, question_type, order_index")
    .eq("survey_id", id)
    .order("order_index", { ascending: true });

  const submitForSurvey = submitSurveyResponseAction.bind(null, id);
  const closeThisSurvey = closeSurveyAction.bind(null, id);
  const deleteThisSurvey = deleteSurveyAction.bind(null, id);

  let results: {
    question_id: string;
    question_text: string;
    question_type: string;
    response_count: number;
    avg_scale: number | null;
    text_answers: string[];
  }[] = [];
  let hasResponded = false;

  if (isManager) {
    const { data } = await supabase.rpc("get_climate_survey_results", {
      p_survey_id: id,
    });
    results = data ?? [];
  } else {
    const { data } = await supabase.rpc("has_employee_responded_survey", {
      p_survey_id: id,
    });
    hasResponded = !!data;
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">{survey.title}</h1>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            survey.status === "activa"
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {statusLabel[survey.status] ?? survey.status}
        </span>
      </div>
      {survey.description && (
        <p className="mt-1 text-sm text-gray-500">{survey.description}</p>
      )}
      <Link
        href="/app/encuestas"
        className="mt-2 inline-block text-xs text-blue-700 hover:underline"
      >
        ← Volver a encuestas
      </Link>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {isManager && (
        <div className="mt-6 space-y-6">
          <div className="flex gap-3">
            {survey.status === "activa" && (
              <form action={closeThisSurvey}>
                <button className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100">
                  Cerrar encuesta
                </button>
              </form>
            )}
            <form action={deleteThisSurvey}>
              <button className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
                Eliminar encuesta
              </button>
            </form>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-medium text-gray-700">
              Resultados (anónimos)
            </h2>
            <div className="mt-4 space-y-5">
              {results.length === 0 && (
                <p className="text-sm text-gray-500">Aún no hay respuestas.</p>
              )}
              {results.map((r) => (
                <div key={r.question_id}>
                  <p className="text-sm font-medium text-gray-900">
                    {r.question_text}
                  </p>
                  <p className="text-xs text-gray-500">
                    {r.response_count} respuesta(s)
                  </p>
                  {r.question_type === "scale" ? (
                    r.avg_scale !== null ? (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className="h-2 rounded-full bg-gray-900"
                            style={{ width: `${(Number(r.avg_scale) / 5) * 100}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium text-gray-900">
                          {r.avg_scale}/5
                        </span>
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-gray-400">Sin respuestas aún</p>
                    )
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {(r.text_answers ?? []).length === 0 && (
                        <li className="text-xs text-gray-400">Sin respuestas aún</li>
                      )}
                      {(r.text_answers ?? []).map((t, i) => (
                        <li
                          key={i}
                          className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700"
                        >
                          {t}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!isManager && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          {survey.status !== "activa" ? (
            <p className="text-sm text-gray-500">Esta encuesta ya cerró.</p>
          ) : hasResponded ? (
            <p className="text-sm text-emerald-700">
              Ya respondiste esta encuesta. ¡Gracias por tu opinión!
            </p>
          ) : (
            <form action={submitForSurvey} className="space-y-5">
              {(questions ?? []).map((q) => (
                <div key={q.id}>
                  <p className="text-sm font-medium text-gray-900">
                    {q.question_text}
                  </p>
                  {q.question_type === "scale" ? (
                    <div className="mt-2 flex gap-2">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <label
                          key={n}
                          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-gray-300 text-sm has-[:checked]:border-gray-900 has-[:checked]:bg-gray-900 has-[:checked]:text-white"
                        >
                          <input
                            type="radio"
                            name={`answer_scale_${q.id}`}
                            value={n}
                            required
                            className="sr-only"
                          />
                          {n}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <textarea
                      name={`answer_text_${q.id}`}
                      rows={2}
                      className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                  )}
                </div>
              ))}
              {(questions ?? []).length === 0 && (
                <p className="text-sm text-gray-500">
                  Esta encuesta todavía no tiene preguntas.
                </p>
              )}
              {(questions ?? []).length > 0 && (
                <button
                  type="submit"
                  className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                >
                  Enviar respuesta
                </button>
              )}
            </form>
          )}
        </div>
      )}
    </div>
  );
}
