"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addQuestion(
  vacancyId: string,
  tenantId: string,
  formData: FormData
) {
  const supabase = await createClient();

  const question_text = (formData.get("question_text") as string)?.trim();
  const question_type =
    (formData.get("question_type") as string) || "texto";
  const required = formData.get("required") === "on";
  const optionsRaw = (formData.get("options") as string)?.trim();

  if (!question_text) return;

  let options: string[] | null = null;
  if (question_type === "opcion_multiple" && optionsRaw) {
    options = optionsRaw
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
  }

  const { count } = await supabase
    .from("vacancy_questions")
    .select("id", { count: "exact", head: true })
    .eq("vacancy_id", vacancyId);

  await supabase.from("vacancy_questions").insert({
    tenant_id: tenantId,
    vacancy_id: vacancyId,
    question_text,
    question_type,
    options,
    required,
    order_index: count ?? 0,
  });

  revalidatePath(`/app/ats/${vacancyId}/preguntas`);
}

export async function deleteQuestion(vacancyId: string, questionId: string) {
  const supabase = await createClient();
  await supabase.from("vacancy_questions").delete().eq("id", questionId);
  revalidatePath(`/app/ats/${vacancyId}/preguntas`);
}

async function swapWithNeighbor(
  vacancyId: string,
  questionId: string,
  direction: "up" | "down"
) {
  const supabase = await createClient();

  const { data: questions } = await supabase
    .from("vacancy_questions")
    .select("id, order_index")
    .eq("vacancy_id", vacancyId)
    .order("order_index", { ascending: true });

  if (!questions) return;

  const idx = questions.findIndex((q) => q.id === questionId);
  if (idx === -1) return;

  const neighborIdx = direction === "up" ? idx - 1 : idx + 1;
  if (neighborIdx < 0 || neighborIdx >= questions.length) return;

  const current = questions[idx];
  const neighbor = questions[neighborIdx];

  await supabase
    .from("vacancy_questions")
    .update({ order_index: neighbor.order_index })
    .eq("id", current.id);
  await supabase
    .from("vacancy_questions")
    .update({ order_index: current.order_index })
    .eq("id", neighbor.id);

  revalidatePath(`/app/ats/${vacancyId}/preguntas`);
}

export async function moveQuestionUp(vacancyId: string, questionId: string) {
  await swapWithNeighbor(vacancyId, questionId, "up");
}

export async function moveQuestionDown(
  vacancyId: string,
  questionId: string
) {
  await swapWithNeighbor(vacancyId, questionId, "down");
}
