"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const PATH = "/app/desarrollo";

export async function createDevelopmentPlan(tenantId: string, formData: FormData) {
  const supabase = await createClient();

  const employee_id = String(formData.get("employee_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();

  if (!employee_id || !title) {
    redirect(`${PATH}?error=${encodeURIComponent("Empleado y título son obligatorios")}`);
  }

  const { data, error } = await supabase
    .from("development_plans")
    .insert({
      tenant_id: tenantId,
      employee_id,
      title,
      notes: (String(formData.get("notes") ?? "").trim() || null) as string | null,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(`${PATH}?error=${encodeURIComponent("No se pudo crear el plan: " + (error?.message ?? ""))}`);
  }

  revalidatePath(PATH);
  redirect(`${PATH}/${data.id}`);
}

export async function deleteDevelopmentPlan(planId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("development_plans").delete().eq("id", planId);

  if (error) {
    redirect(`${PATH}?error=${encodeURIComponent("No se pudo eliminar el plan: " + error.message)}`);
  }

  revalidatePath(PATH);
  redirect(PATH);
}

export async function addDevelopmentGoal(planId: string, revalidateTo: string, formData: FormData) {
  const supabase = await createClient();

  const description = String(formData.get("description") ?? "").trim();
  if (!description) {
    redirect(`${revalidateTo}?error=${encodeURIComponent("La descripción de la meta es obligatoria")}`);
  }

  const target_date = (String(formData.get("target_date") ?? "").trim() || null) as string | null;

  const { error } = await supabase.from("development_plan_goals").insert({
    plan_id: planId,
    description,
    target_date,
  });

  if (error) {
    redirect(`${revalidateTo}?error=${encodeURIComponent("No se pudo agregar la meta: " + error.message)}`);
  }

  revalidatePath(revalidateTo);
  redirect(revalidateTo);
}

export async function deleteDevelopmentGoal(goalId: string, revalidateTo: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("development_plan_goals").delete().eq("id", goalId);

  if (error) {
    console.error("deleteDevelopmentGoal error:", error.message);
  }

  revalidatePath(revalidateTo);
  redirect(revalidateTo);
}

// Reutilizada tanto en la vista de gestión (/app/desarrollo/[id]) como en
// el autoservicio (/app/mi-espacio): la RLS decide qué metas puede tocar
// cada quien (RR.HH. cualquiera de su tenant, el empleado solo las suyas).
export async function updateDevelopmentGoalStatus(
  goalId: string,
  revalidateTo: string,
  formData: FormData
) {
  const supabase = await createClient();
  const status = String(formData.get("status") ?? "pendiente");

  if (!["pendiente", "en_progreso", "completado"].includes(status)) {
    redirect(`${revalidateTo}?error=${encodeURIComponent("Estado inválido")}`);
  }

  const { error } = await supabase
    .from("development_plan_goals")
    .update({
      status,
      completed_at: status === "completado" ? new Date().toISOString() : null,
    })
    .eq("id", goalId);

  if (error) {
    redirect(
      `${revalidateTo}?error=${encodeURIComponent("No se pudo actualizar la meta: " + error.message)}`
    );
  }

  revalidatePath(revalidateTo);
  revalidatePath(PATH);
  redirect(revalidateTo);
}
