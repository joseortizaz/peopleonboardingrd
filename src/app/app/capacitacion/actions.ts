"use server";

import { randomUUID } from "crypto";
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
    video_url: (String(formData.get("video_url") ?? "").trim() || null) as string | null,
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

export async function updateCourseVideo(courseId: string, formData: FormData) {
  const supabase = await createClient();

  const video_url = (String(formData.get("video_url") ?? "").trim() || null) as string | null;

  const { error } = await supabase
    .from("training_courses")
    .update({ video_url })
    .eq("id", courseId);

  if (error) {
    redirect(`${PATH}?error=${encodeURIComponent("No se pudo actualizar el video: " + error.message)}`);
  }

  revalidatePath(PATH);
  revalidatePath("/app/mi-espacio");
  redirect(PATH);
}

export async function uploadCourseMaterial(
  tenantId: string,
  courseId: string,
  formData: FormData
) {
  const supabase = await createClient();

  const title = (formData.get("title") as string)?.trim() || "";
  const file = formData.get("file") as File | null;

  if (!title || !file || file.size === 0) {
    redirect(`${PATH}?error=${encodeURIComponent("Título y archivo son obligatorios para el material.")}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${tenantId}/${courseId}/${randomUUID()}-${safeName}`;

  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from("training-materials")
    .upload(storagePath, arrayBuffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    redirect(`${PATH}?error=${encodeURIComponent("No se pudo subir el material: " + uploadError.message)}`);
  }

  const { error: insertError } = await supabase.from("training_course_materials").insert({
    tenant_id: tenantId,
    course_id: courseId,
    title,
    file_name: file.name,
    storage_path: storagePath,
    file_size: file.size,
    mime_type: file.type || null,
    uploaded_by: user?.id ?? null,
  });

  if (insertError) {
    await supabase.storage.from("training-materials").remove([storagePath]);
    redirect(`${PATH}?error=${encodeURIComponent("No se pudo registrar el material: " + insertError.message)}`);
  }

  revalidatePath(PATH);
  revalidatePath("/app/mi-espacio");
  redirect(PATH);
}

export async function deleteCourseMaterial(materialId: string, storagePath: string) {
  const supabase = await createClient();

  const { error: storageError } = await supabase.storage
    .from("training-materials")
    .remove([storagePath]);

  if (storageError) {
    console.error("deleteCourseMaterial storage error:", storageError.message);
  }

  const { error } = await supabase.from("training_course_materials").delete().eq("id", materialId);

  if (error) {
    console.error("deleteCourseMaterial error:", error.message);
  }

  revalidatePath(PATH);
  revalidatePath("/app/mi-espacio");
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
