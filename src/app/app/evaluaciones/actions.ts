"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createEvaluation(tenantId: string, formData: FormData) {
  const supabase = await createClient();

  const employee_id = formData.get("employee_id") as string;
  const template_id = formData.get("template_id") as string;
  const type = formData.get("type") as "90" | "180" | "360";

  if (!employee_id || !template_id) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("evaluations")
    .insert({
      tenant_id: tenantId,
      employee_id,
      template_id,
      type,
      evaluator_profile_id: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("createEvaluation error:", error?.message);
    revalidatePath("/app/evaluaciones");
    return;
  }

  redirect(`/app/evaluaciones/${data.id}`);
}
