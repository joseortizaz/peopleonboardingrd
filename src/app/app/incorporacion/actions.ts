"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function startOnboardingProcess(formData: FormData) {
  const supabase = await createClient();

  const employee_id = formData.get("employee_id") as string;
  const template_id = formData.get("template_id") as string;
  const started_at = (formData.get("started_at") as string) || undefined;

  if (!employee_id || !template_id) return;

  const { data, error } = await supabase.rpc("start_onboarding_process", {
    p_employee_id: employee_id,
    p_template_id: template_id,
    p_started_at: started_at,
  });

  if (error || !data) {
    console.error("startOnboardingProcess error:", error?.message);
    revalidatePath("/app/incorporacion");
    return;
  }

  redirect(`/app/incorporacion/${data}`);
}

export async function deleteOnboardingProcess(processId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("onboarding_processes")
    .delete()
    .eq("id", processId);

  if (error) {
    console.error("deleteOnboardingProcess error:", error.message);
  }

  revalidatePath("/app/incorporacion");
  redirect("/app/incorporacion");
}

// Reutilizada tanto en la vista de gestión (/app/incorporacion/[id]) como
// en el autoservicio (/app/mi-espacio): la RLS decide qué tareas puede
// tocar cada quien (RR.HH. cualquiera de su tenant, el empleado solo las
// suyas con responsible = 'empleado').
export async function toggleOnboardingTask(
  taskId: string,
  nextStatus: "pendiente" | "completada",
  revalidateTo: string
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("onboarding_tasks")
    .update({
      status: nextStatus,
      completed_at: nextStatus === "completada" ? new Date().toISOString() : null,
    })
    .eq("id", taskId);

  if (error) {
    console.error("toggleOnboardingTask error:", error.message);
  }

  revalidatePath(revalidateTo);
}
