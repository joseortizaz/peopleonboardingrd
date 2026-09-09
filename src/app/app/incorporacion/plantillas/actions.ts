"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createOnboardingTemplate(tenantId: string, formData: FormData) {
  const supabase = await createClient();

  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;

  if (!name) return;

  const { error } = await supabase
    .from("onboarding_templates")
    .insert({ tenant_id: tenantId, name, description });

  if (error) {
    console.error("createOnboardingTemplate error:", error.message);
  }

  revalidatePath("/app/incorporacion/plantillas");
}

export async function deleteOnboardingTemplate(templateId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("onboarding_templates")
    .delete()
    .eq("id", templateId);

  if (error) {
    console.error("deleteOnboardingTemplate error:", error.message);
  }

  revalidatePath("/app/incorporacion/plantillas");
  redirect("/app/incorporacion/plantillas");
}

export async function addOnboardingTask(templateId: string, formData: FormData) {
  const supabase = await createClient();

  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const days_offset = Number(formData.get("days_offset")) || 0;
  const responsible = (formData.get("responsible") as string) || "rrhh";

  if (!title) return;

  const { error } = await supabase.from("onboarding_template_tasks").insert({
    template_id: templateId,
    title,
    description,
    days_offset,
    responsible,
  });

  if (error) {
    console.error("addOnboardingTask error:", error.message);
  }

  revalidatePath(`/app/incorporacion/plantillas/${templateId}`);
}

export async function deleteOnboardingTemplateTask(
  templateId: string,
  taskId: string
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("onboarding_template_tasks")
    .delete()
    .eq("id", taskId);

  if (error) {
    console.error("deleteOnboardingTemplateTask error:", error.message);
  }

  revalidatePath(`/app/incorporacion/plantillas/${templateId}`);
}
