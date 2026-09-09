"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const STAGES = [
  "recibido",
  "en_revision",
  "entrevista_rh",
  "entrevista_gerencia",
  "prueba",
  "oferta",
  "contratado",
  "rechazado",
] as const;

export type CandidateStage = (typeof STAGES)[number];

export async function moveCandidateStage(
  vacancyId: string,
  candidateId: string,
  formData: FormData
) {
  const stage = formData.get("stage") as CandidateStage;
  if (!STAGES.includes(stage)) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("candidates")
    .update({ stage })
    .eq("id", candidateId);

  if (error) {
    console.error("moveCandidateStage error:", error.message);
  }

  revalidatePath(`/app/ats/${vacancyId}`);
}
