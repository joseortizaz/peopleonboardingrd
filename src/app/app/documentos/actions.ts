"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function uploadDocument(tenantId: string, formData: FormData) {
  const supabase = await createClient();

  const employee_id = (formData.get("employee_id") as string) || "";
  const doc_type = (formData.get("doc_type") as string)?.trim() || "";
  const expires_at = (formData.get("expires_at") as string) || null;
  const notes = (formData.get("notes") as string)?.trim() || null;
  const file = formData.get("file") as File | null;

  if (!employee_id || !doc_type || !file || file.size === 0) {
    redirect(
      "/app/documentos?error=" +
        encodeURIComponent(
          "Empleado, tipo de documento y archivo son obligatorios."
        )
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${tenantId}/${employee_id}/${randomUUID()}-${safeName}`;

  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from("employee-documents")
    .upload(storagePath, arrayBuffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    redirect(
      "/app/documentos?error=" +
        encodeURIComponent("No se pudo subir el archivo: " + uploadError.message)
    );
  }

  const { error: insertError } = await supabase.from("employee_documents").insert({
    tenant_id: tenantId,
    employee_id,
    doc_type,
    file_name: file.name,
    storage_path: storagePath,
    file_size: file.size,
    mime_type: file.type || null,
    expires_at,
    notes,
    uploaded_by: user?.id ?? null,
  });

  if (insertError) {
    await supabase.storage.from("employee-documents").remove([storagePath]);
    redirect(
      "/app/documentos?error=" +
        encodeURIComponent(
          "No se pudo registrar el documento: " + insertError.message
        )
    );
  }

  revalidatePath("/app/documentos");
}

export async function deleteDocument(documentId: string, storagePath: string) {
  const supabase = await createClient();

  const { error: storageError } = await supabase.storage
    .from("employee-documents")
    .remove([storagePath]);

  if (storageError) {
    console.error("deleteDocument storage error:", storageError.message);
  }

  const { error } = await supabase
    .from("employee_documents")
    .delete()
    .eq("id", documentId);

  if (error) {
    console.error("deleteDocument error:", error.message);
  }

  revalidatePath("/app/documentos");
}
