"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveScore(
  evaluationId: string,
  competencyId: string,
  formData: FormData
) {
  const supabase = await createClient();

  const score = Number(formData.get("score"));
  const comments = (formData.get("comments") as string)?.trim() || null;

  if (!score || score < 1 || score > 5) return;

  const { error } = await supabase
    .from("evaluation_scores")
    .upsert(
      { evaluation_id: evaluationId, competency_id: competencyId, score, comments },
      { onConflict: "evaluation_id,competency_id" }
    );

  if (error) {
    console.error("saveScore error:", error.message);
  }

  revalidatePath(`/app/evaluaciones/${evaluationId}`);
}

export async function completeEvaluation(evaluationId: string) {
  const supabase = await createClient();

  const { data: scores, error: scoresError } = await supabase
    .from("evaluation_scores")
    .select("score, template_competencies(weight)")
    .eq("evaluation_id", evaluationId);

  if (scoresError || !scores || scores.length === 0) {
    console.error("completeEvaluation: no hay puntajes", scoresError?.message);
    return;
  }

  let weightedSum = 0;
  let totalWeight = 0;

  for (const row of scores) {
    if (row.score === null) continue;
    const weight = Number(
      (row.template_competencies as unknown as { weight: number } | null)
        ?.weight ?? 1
    );
    weightedSum += row.score * weight;
    totalWeight += weight;
  }

  const overallScore = totalWeight > 0 ? weightedSum / totalWeight : null;

  const { error } = await supabase
    .from("evaluations")
    .update({
      status: "completada",
      overall_score: overallScore ? Number(overallScore.toFixed(2)) : null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", evaluationId);

  if (error) {
    console.error("completeEvaluation error:", error.message);
  }

  revalidatePath(`/app/evaluaciones/${evaluationId}`);
  revalidatePath("/app/evaluaciones");
}
