"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createClimateSurvey(tenantId: string, formData: FormData) {
  const supabase = await createClient();

  const title = (formData.get("title") as string)?.trim() || "";
  const description = (formData.get("description") as string)?.trim() || null;
  const questionTexts = formData.getAll("question_text") as string[];
  const questionTypes = formData.getAll("question_type") as string[];

  if (!title) {
    redirect(
      "/app/encuestas?error=" + encodeURIComponent("El título de la encuesta es obligatorio.")
    );
  }

  const questions = questionTexts
    .map((text, i) => ({ text: text?.trim() || "", type: questionTypes[i] || "scale" }))
    .filter((q) => q.text.length > 0);

  if (questions.length === 0) {
    redirect(
      "/app/encuestas?error=" +
        encodeURIComponent("Agrega al menos una pregunta a la encuesta.")
    );
  }

  const { data: survey, error: surveyError } = await supabase
    .from("climate_surveys")
    .insert({ tenant_id: tenantId, title, description })
    .select("id")
    .single();

  if (surveyError || !survey) {
    redirect(
      "/app/encuestas?error=" +
        encodeURIComponent("No se pudo crear la encuesta: " + surveyError?.message)
    );
  }

  const { error: questionsError } = await supabase.from("climate_survey_questions").insert(
    questions.map((q, i) => ({
      survey_id: survey.id,
      tenant_id: tenantId,
      order_index: i,
      question_text: q.text,
      question_type: q.type === "texto" ? "texto" : "scale",
    }))
  );

  if (questionsError) {
    await supabase.from("climate_surveys").delete().eq("id", survey.id);
    redirect(
      "/app/encuestas?error=" +
        encodeURIComponent("No se pudieron guardar las preguntas: " + questionsError.message)
    );
  }

  revalidatePath("/app/encuestas");
  redirect(`/app/encuestas/${survey.id}`);
}

export async function closeSurveyAction(surveyId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("climate_surveys")
    .update({ status: "cerrada" })
    .eq("id", surveyId);

  if (error) {
    console.error("closeSurveyAction error:", error.message);
  }

  revalidatePath(`/app/encuestas/${surveyId}`);
  revalidatePath("/app/encuestas");
}

export async function deleteSurveyAction(surveyId: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("climate_surveys").delete().eq("id", surveyId);

  if (error) {
    console.error("deleteSurveyAction error:", error.message);
  }

  revalidatePath("/app/encuestas");
  redirect("/app/encuestas");
}

export async function submitSurveyResponseAction(surveyId: string, formData: FormData) {
  const supabase = await createClient();

  const answers: { question_id: string; scale_value: number | null; text_value: string | null }[] = [];

  for (const [key, value] of formData.entries()) {
    if (key.startsWith("answer_scale_")) {
      const questionId = key.slice("answer_scale_".length);
      const scale = Number(value);
      if (questionId && !Number.isNaN(scale)) {
        answers.push({ question_id: questionId, scale_value: scale, text_value: null });
      }
    } else if (key.startsWith("answer_text_")) {
      const questionId = key.slice("answer_text_".length);
      const text = (value as string)?.trim();
      if (questionId && text) {
        answers.push({ question_id: questionId, scale_value: null, text_value: text });
      }
    }
  }

  const { error } = await supabase.rpc("submit_climate_survey_response", {
    p_survey_id: surveyId,
    p_answers: answers,
  });

  if (error) {
    redirect(
      `/app/encuestas/${surveyId}?error=` +
        encodeURIComponent("No se pudo enviar tu respuesta: " + error.message)
    );
  }

  revalidatePath(`/app/encuestas/${surveyId}`);
}
