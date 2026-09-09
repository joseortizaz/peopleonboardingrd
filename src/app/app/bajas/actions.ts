"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function startOffboardingProcess(formData: FormData) {
  const supabase = await createClient();

  const employee_id = formData.get("employee_id") as string;
  const reason = formData.get("reason") as string;
  const last_working_day = formData.get("last_working_day") as string;
  const monthly_salary = formData.get("monthly_salary") as string;
  const notes = (formData.get("notes") as string) || null;

  if (!employee_id || !reason || !last_working_day || !monthly_salary) return;

  const { data, error } = await supabase.rpc("start_offboarding_process", {
    p_employee_id: employee_id,
    p_reason: reason,
    p_last_working_day: last_working_day,
    p_monthly_salary: Number(monthly_salary),
    p_notes: notes,
  });

  if (error || !data) {
    console.error("startOffboardingProcess error:", error?.message);
    redirect(`/app/bajas?error=${encodeURIComponent(error?.message ?? "Error desconocido")}`);
  }

  redirect(`/app/bajas/${data}`);
}

export async function deleteOffboardingProcess(processId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("offboarding_processes")
    .delete()
    .eq("id", processId);

  if (error) {
    console.error("deleteOffboardingProcess error:", error.message);
  }

  revalidatePath("/app/bajas");
  redirect("/app/bajas");
}

export async function toggleOffboardingTask(
  taskId: string,
  nextStatus: "pendiente" | "completada",
  revalidateTo: string
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("offboarding_tasks")
    .update({
      status: nextStatus,
      completed_at: nextStatus === "completada" ? new Date().toISOString() : null,
    })
    .eq("id", taskId);

  if (error) {
    console.error("toggleOffboardingTask error:", error.message);
  }

  revalidatePath(revalidateTo);
}
