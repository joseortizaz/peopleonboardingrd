"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function postAnnouncement(tenantId: string, formData: FormData) {
  const supabase = await createClient();

  const title = (formData.get("title") as string)?.trim() || "";
  const body = (formData.get("body") as string)?.trim() || "";

  if (!title || !body) {
    redirect(
      "/app/comunicacion?error=" +
        encodeURIComponent("Título y contenido del anuncio son obligatorios.")
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("announcements").insert({
    tenant_id: tenantId,
    title,
    body,
    created_by: user?.id ?? null,
  });

  if (error) {
    redirect(
      "/app/comunicacion?error=" +
        encodeURIComponent("No se pudo publicar el anuncio: " + error.message)
    );
  }

  revalidatePath("/app/comunicacion");
}

export async function deleteAnnouncement(announcementId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("announcements")
    .delete()
    .eq("id", announcementId);

  if (error) {
    console.error("deleteAnnouncement error:", error.message);
  }

  revalidatePath("/app/comunicacion");
}

export async function sendRecognitionAction(formData: FormData) {
  const supabase = await createClient();

  const to_employee_id = (formData.get("to_employee_id") as string) || "";
  const message = (formData.get("message") as string)?.trim() || "";

  if (!to_employee_id || !message) {
    redirect(
      "/app/comunicacion?error=" +
        encodeURIComponent("Elige un compañero y escribe un mensaje.")
    );
  }

  const { error } = await supabase.rpc("send_recognition", {
    p_to_employee_id: to_employee_id,
    p_message: message,
  });

  if (error) {
    redirect(
      "/app/comunicacion?error=" +
        encodeURIComponent("No se pudo enviar el reconocimiento: " + error.message)
    );
  }

  revalidatePath("/app/comunicacion");
}

export async function deleteRecognitionAction(recognitionId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("recognitions")
    .delete()
    .eq("id", recognitionId);

  if (error) {
    console.error("deleteRecognitionAction error:", error.message);
  }

  revalidatePath("/app/comunicacion");
}
