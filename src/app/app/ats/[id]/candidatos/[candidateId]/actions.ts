"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateCandidateNotes(
  vacancyId: string,
  candidateId: string,
  formData: FormData
) {
  const notes = (formData.get("notes") as string)?.trim() || null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("candidates")
    .update({ notes })
    .eq("id", candidateId);

  if (error) {
    console.error("updateCandidateNotes error:", error.message);
  }

  revalidatePath(`/app/ats/${vacancyId}/candidatos/${candidateId}`);
}

export async function updateCandidateRejectionReason(
  vacancyId: string,
  candidateId: string,
  formData: FormData
) {
  const rejection_reason =
    (formData.get("rejection_reason") as string)?.trim() || null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("candidates")
    .update({ rejection_reason })
    .eq("id", candidateId);

  if (error) {
    console.error("updateCandidateRejectionReason error:", error.message);
  }

  revalidatePath(`/app/ats/${vacancyId}/candidatos/${candidateId}`);
}
