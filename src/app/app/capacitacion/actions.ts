"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const PATH = "/app/capacitacion";

function toNumber(v: FormDataEntryValue | null): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function createCourse(tenantId: string, formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase.from("training_courses").insert({
    tenant_id: tenantId,
    name: String(formData.get("name") ?? "").trim(),
    description: (String(formData.get("description") ?? "").trim() || null) as string | null,
    category: (String(formData.get("category") ?? "").trim() || null) as string | null,
    duration_hours: toNumber(formData.get("duration_hours")),
    counts_toward_infotep: formData.get("counts_toward_infotep") === "on",
  });

  if (error) {
    redirect(`${PATH}?error=${encodeURIComponent("No se pudo crear el curso: " + error.message)}`);
  }

  revalidatePath(PATH);
  redirect(PATH);
}

export async function deleteCourse(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("training_courses").delete().eq("id", id);

  if (error) {
    redirect(`${PATH}?error=${encodeURIComponent("No se pudo eliminar el curso: " + error.message)}`);
  }

  revalidatePath(PATH);
  redirect(PATH);
}

export async function enrollEmployee(tenantId: string, formData: FormData) {
  const supabase = await createClient();

  const dueDateRaw = String(formData.get("due_date") ?? "").trim();

  const { error } = await supabase.from("training_enrollments").insert({
    tenant_id: tenantId,
    employee_id: String(formData.get("employee_id") ?? ""),
    course_id: String(formData.get("course_id") ?? ""),
    due_date: dueDateRaw || null,
  });

  if (error) {
    const message = error.code === "23505" ? "Ese empleado ya está inscrito en ese curso" : error.message;
    redirect(`${PATH}?error=${encodeURIComponent("No se pudo inscribir al empleado: " + message)}`);
  }

  revalidatePath(PATH);
  redirect(PATH);
}

export async function deleteEnrollment(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("training_enrollments").delete().eq("id", id);

  if (error) {
    redirect(`${PATH}?error=${encodeURIComponent("No se pudo eliminar la inscripción: " + error.message)}`);
  }

  revalidatePath(PATH);
  redirect(PATH);
}

export async function updateEnrollmentStatus(
  enrollmentId: string,
  revalidateTo: string,
  formData: FormData
) {
  const supabase = await createClient();
  const status = String(formData.get("status") ?? "pendiente");

  if (!["pendiente", "en_progreso", "completada"].includes(status)) {
    redirect(`${revalidateTo}?error=${encodeURIComponent("Estado inválido")}`);
  }

  const { error } = await supabase
    .from("training_enrollments")
    .update({
      status,
      completed_at: status === "completada" ? new Date().toISOString() : null,
    })
    .eq("id", enrollmentId);

  if (error) {
    redirect(
      `${revalidateTo}?error=${encodeURIComponent(
        "No se pudo actualizar el curso: " + error.message
      )}`
    );
  }

  revalidatePath(revalidateTo);
  revalidatePath(PATH);
  redirect(revalidateTo);
}
