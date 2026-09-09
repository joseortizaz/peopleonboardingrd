"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createTemplate(tenantId: string, formData: FormData) {
  const supabase = await createClient();

  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;

  if (!name) return;

  const { error } = await supabase
    .from("evaluation_templates")
    .insert({ tenant_id: tenantId, name, description });

  if (error) {
    console.error("createTemplate error:", error.message);
  }

  revalidatePath("/app/evaluaciones/plantillas");
}

export async function deleteTemplate(templateId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("evaluation_templates")
    .delete()
    .eq("id", templateId);

  if (error) {
    console.error("deleteTemplate error:", error.message);
  }

  revalidatePath("/app/evaluaciones/plantillas");
  redirect("/app/evaluaciones/plantillas");
}

export async function addCompetency(templateId: string, formData: FormData) {
  const supabase = await createClient();

  const name = (formData.get("name") as string)?.trim();
  const weight = Number(formData.get("weight")) || 1;

  if (!name) return;

  const { error } = await supabase.from("template_competencies").insert({
    template_id: templateId,
    name,
    weight,
  });

  if (error) {
    console.error("addCompetency error:", error.message);
  }

  revalidatePath(`/app/evaluaciones/plantillas/${templateId}`);
}

export async function deleteCompetency(templateId: string, competencyId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("template_competencies")
    .delete()
    .eq("id", competencyId);

  if (error) {
    console.error("deleteCompetency error:", error.message);
  }

  revalidatePath(`/app/evaluaciones/plantillas/${templateId}`);
}
