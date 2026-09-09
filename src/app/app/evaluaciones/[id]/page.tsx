import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/supabase/tenant";
import { completeEvaluation, saveScore } from "./actions";

const typeLabel: Record<string, string> = {
  "90": "90°",
  "180": "180°",
  "360": "360°",
};

export default async function EvaluationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/onboarding");

  const supabase = await createClient();

  const { data: evaluation } = await supabase
    .from("evaluations")
    .select(
      "id, type, status, overall_score, template_id, employees(full_name), evaluation_templates(name)"
    )
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (!evaluation) notFound();

  const [{ data: competencies }, { data: scores }] = await Promise.all([
    supabase
      .from("template_competencies")
      .select("id, name, weight")
      .eq("template_id", evaluation.template_id)
      .order("order_index", { ascending: true }),
    supabase
      .from("evaluation_scores")
      .select("competency_id, score, comments")
      .eq("evaluation_id", id),
  ]);

  const scoreFor = (competencyId: string) =>
    scores?.find((s) => s.competency_id === competencyId);

  const employeeName =
    (evaluation.employees as unknown as { full_name: string } | null)
      ?.full_name ?? "—";
  const templateName =
    (evaluation.evaluation_templates as unknown as { name: string } | null)
      ?.name ?? "—";

  const isCompleted = evaluation.status === "completada";
  const allScored =
    (competencies ?? []).length > 0 &&
    (competencies ?? []).every((c) => scoreFor(c.id)?.score);

  const complete = completeEvaluation.bind(null, evaluation.id);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/app/evaluaciones" className="text-sm text-gray-500 hover:underline">
        ← Evaluaciones
      </Link>

      <div className="mt-1 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{employeeName}</h1>
          <p className="text-sm text-gray-500">
            {templateName} · Evaluación {typeLabel[evaluation.type]}
          </p>
        </div>
        {evaluation.overall_score !== null && (
          <span className="rounded-full bg-gray-900 px-3 py-1 text-sm font-medium text-white">
            {evaluation.overall_score}/5
          </span>
        )}
      </div>

      {isCompleted && (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          Evaluación completada.
        </p>
      )}

      <div className="mt-6 space-y-4">
        {(competencies ?? []).map((c) => {
          const existing = scoreFor(c.id);
          const save = saveScore.bind(null, evaluation.id, c.id);
          return (
            <div
              key={c.id}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <p className="text-sm font-medium text-gray-900">{c.name}</p>
              <form action={save} className="mt-2 space-y-2">
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <label
                      key={n}
                      className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-gray-300 text-sm has-[:checked]:border-gray-900 has-[:checked]:bg-gray-900 has-[:checked]:text-white"
                    >
                      <input
                        type="radio"
                        name="score"
                        value={n}
                        defaultChecked={existing?.score === n}
                        className="sr-only"
                        disabled={isCompleted}
                      />
                      {n}
                    </label>
                  ))}
                </div>
                <textarea
                  name="comments"
                  placeholder="Comentarios (opcional)"
                  rows={2}
                  defaultValue={existing?.comments ?? ""}
                  disabled={isCompleted}
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
                />
                {!isCompleted && (
                  <button
                    type="submit"
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Guardar
                  </button>
                )}
              </form>
            </div>
          );
        })}
      </div>

      {!isCompleted && (
        <form action={complete} className="mt-6">
          <button
            type="submit"
            disabled={!allScored}
            className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {allScored
              ? "Marcar como completada y calcular puntaje"
              : "Puntúa todas las competencias para completar"}
          </button>
        </form>
      )}
    </div>
  );
}
