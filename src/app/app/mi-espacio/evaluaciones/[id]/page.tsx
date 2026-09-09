import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/supabase/tenant";

const typeLabel: Record<string, string> = {
  "90": "90°",
  "180": "180°",
  "360": "360°",
};

export default async function MiEvaluacionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/onboarding");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!employee) redirect("/app/mi-espacio");

  // La policy evaluations_select_self solo deja ver evaluaciones propias
  // con status = 'completada', así que este filtro es además reforzado por RLS.
  const { data: evaluation } = await supabase
    .from("evaluations")
    .select(
      "id, type, status, overall_score, completed_at, template_id, evaluation_templates(name)"
    )
    .eq("id", id)
    .eq("employee_id", employee.id)
    .eq("status", "completada")
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

  const templateName =
    (evaluation.evaluation_templates as unknown as { name: string } | null)
      ?.name ?? "—";

  const totalWeight = (competencies ?? []).reduce((sum, c) => sum + c.weight, 0);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link
        href="/app/mi-espacio"
        className="text-sm text-gray-500 hover:underline"
      >
        ← Mi espacio
      </Link>

      <div className="mt-1 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            {templateName}
          </h1>
          <p className="text-sm text-gray-500">
            Evaluación {typeLabel[evaluation.type] ?? evaluation.type} ·
            completada el{" "}
            {evaluation.completed_at
              ? new Date(evaluation.completed_at).toLocaleDateString("es-DO")
              : "—"}
          </p>
        </div>
        {evaluation.overall_score !== null && (
          <span className="rounded-full bg-gray-900 px-3 py-1 text-sm font-medium text-white">
            {evaluation.overall_score}/5
          </span>
        )}
      </div>

      <div className="mt-6 space-y-3">
        {(competencies ?? []).map((c) => {
          const s = scoreFor(c.id);
          const relativeWeight = totalWeight
            ? Math.round((c.weight / totalWeight) * 100)
            : 0;
          return (
            <div
              key={c.id}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-900">{c.name}</p>
                <span className="text-xs text-gray-500">
                  Peso {relativeWeight}%
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <span
                    key={n}
                    className={`flex h-7 w-7 items-center justify-center rounded-md text-sm ${
                      s?.score === n
                        ? "bg-gray-900 text-white"
                        : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {n}
                  </span>
                ))}
              </div>
              {s?.comments && (
                <p className="mt-2 text-sm text-gray-600">{s.comments}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
