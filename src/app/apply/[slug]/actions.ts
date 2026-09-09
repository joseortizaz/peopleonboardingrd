"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function applyToVacancy(
  vacancyId: string,
  slug: string,
  formData: FormData
) {
  const supabase = await createClient();

  const full_name = (formData.get("full_name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim() || null;

  if (!full_name || !email) {
    redirect(`/apply/${slug}?error=Nombre+y+correo+son+obligatorios`);
  }

  const { error } = await supabase.from("candidates").insert({
    vacancy_id: vacancyId,
    full_name,
    email,
    phone,
  });

  if (error) {
    console.error("applyToVacancy error:", error.message);
    redirect(`/apply/${slug}?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/apply/${slug}?ok=1`);
}
