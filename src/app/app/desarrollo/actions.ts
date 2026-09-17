"use server";

import { randomUUID } from "crypto";
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

  const { data: goal } = await supabase
    .from("development_plan_goals")
    .select("evidence_path")
    .eq("id", goalId)
    .maybeSingle();

  const { error } = await supabase.from("development_plan_goals").delete().eq("id", goalId);

  if (error) {
    console.error("deleteDevelopmentGoal error:", error.message);
  } else if (goal?.evidence_path) {
    const { error: storageError } = await supabase.storage
      .from("development-plan-evidence")
      .remove([goal.evidence_path]);
    if (storageError) {
      console.error("deleteDevelopmentGoal storage cleanup error:", storageError.message);
    }
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


// Adjunta o actualiza la evidencia de una meta (archivo y/o nota de texto,
// ambos opcionales e independientes de `status`). Reutilizada tanto en la
// vista de gestion como en el autoservicio -- la RLS de
// development_plan_goals_update decide quien puede tocarla (mismo criterio
// que updateDevelopmentGoalStatus). Subir o cambiar evidence_path/
// evidence_note despues de verificada des-verifica automaticamente la meta
// (trigger clear_development_goal_verification_trigger, migracion 0042).
export async function attachDevelopmentGoalEvidence(
  goalId: string,
  revalidateTo: string,
  formData: FormData
) {
  const supabase = await createClient();

  const note = (String(formData.get("evidence_note") ?? "").trim() || null) as
    | string
    | null;
  const file = formData.get("evidence_file") as File | null;

  const update: { evidence_note: string | null; evidence_path?: string } = {
    evidence_note: note,
  };

  if (file && file.size > 0) {
    const { data: goal } = await supabase
      .from("development_plan_goals")
      .select("tenant_id, evidence_path, development_plans(employee_id)")
      .eq("id", goalId)
      .maybeSingle();

    if (!goal) {
      redirect(`${revalidateTo}?error=${encodeURIComponent("Meta no encontrada")}`);
    }

    const employeeId = (
      goal.development_plans as unknown as { employee_id: string } | null
    )?.employee_id;

    if (!employeeId) {
      redirect(
        `${revalidateTo}?error=${encodeURIComponent(
          "No se pudo determinar el empleado de esta meta"
        )}`
      );
    }

    const safeName = (file.name || "evidencia").replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${goal.tenant_id}/${employeeId}/${goalId}-${randomUUID()}-${safeName}`;
    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from("development-plan-evidence")
      .upload(storagePath, arrayBuffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      redirect(
        `${revalidateTo}?error=${encodeURIComponent(
          "No se pudo subir la evidencia: " + uploadError.message
        )}`
      );
    }

    // Reemplaza cualquier evidencia anterior -- se borra despues de subir
    // la nueva para no dejar la meta sin evidencia si la subida fallara.
    if (goal.evidence_path) {
      await supabase.storage.from("development-plan-evidence").remove([goal.evidence_path]);
    }

    update.evidence_path = storagePath;
  }

  const { error } = await supabase
    .from("development_plan_goals")
    .update(update)
    .eq("id", goalId);

  if (error) {
    redirect(
      `${revalidateTo}?error=${encodeURIComponent(
        "No se pudo guardar la evidencia: " + error.message
      )}`
    );
  }

  revalidatePath(revalidateTo);
  revalidatePath(PATH);
  redirect(revalidateTo);
}

// Confirmacion de gestion (verify_development_goal, migracion 0042): un
// empleado nunca puede autoverificarse -- la funcion valida
// my_manager_tenant_ids() en el propio RPC, defensa en profundidad
// independiente de que boton se muestre en cada vista.
export async function verifyDevelopmentGoal(goalId: string, revalidateTo: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("verify_development_goal", { p_goal_id: goalId });

  if (error) {
    redirect(
      `${revalidateTo}?error=${encodeURIComponent("No se pudo verificar la meta: " + error.message)}`
    );
  }

  revalidatePath(revalidateTo);
  revalidatePath(PATH);
  redirect(revalidateTo);
}

// Revierte una verificacion hecha por error, sin depender de editar
// status/evidencia (que ya la limpiarian automaticamente via trigger).
export async function unverifyDevelopmentGoal(goalId: string, revalidateTo: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("unverify_development_goal", { p_goal_id: goalId });

  if (error) {
    redirect(
      `${revalidateTo}?error=${encodeURIComponent(
        "No se pudo revertir la verificacion: " + error.message
      )}`
    );
  }

  revalidatePath(revalidateTo);
  revalidatePath(PATH);
  redirect(revalidateTo);
}
