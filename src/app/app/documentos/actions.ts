"use server";

import { createHash } from "crypto";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export async function uploadDocument(tenantId: string, formData: FormData) {
  const supabase = await createClient();

  const employee_id = (formData.get("employee_id") as string) || "";
  const doc_type = (formData.get("doc_type") as string)?.trim() || "";
  const expires_at = (formData.get("expires_at") as string) || null;
  const notes = (formData.get("notes") as string)?.trim() || null;
  const requires_signature = formData.get("requires_signature") === "on";
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
    requires_signature,
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

// Firma electronica simple v1 (ver migracion 0021): mientras no haya
// acceso a la API de un proveedor certificado, el propio empleado
// firma escribiendo su nombre completo. Esta accion calcula la
// evidencia (hash del archivo, IP) que Postgres no puede obtener por
// si solo, y delega la validacion de reglas de negocio al RPC
// security definer sign_employee_document.
export async function signDocument(documentId: string, formData: FormData) {
  const supabase = await createClient();

  const full_name = (formData.get("full_name") as string)?.trim() || "";

  if (full_name.length < 3) {
    redirect(
      "/app/mi-espacio?error=" +
        encodeURIComponent("Escribe tu nombre completo para firmar.")
    );
  }

  const { data: doc } = await supabase
    .from("employee_documents")
    .select("storage_path")
    .eq("id", documentId)
    .maybeSingle();

  if (!doc) {
    redirect(
      "/app/mi-espacio?error=" + encodeURIComponent("Documento no encontrado.")
    );
  }

  const { data: file, error: downloadError } = await supabase.storage
    .from("employee-documents")
    .download(doc.storage_path);

  if (downloadError || !file) {
    redirect(
      "/app/mi-espacio?error=" +
        encodeURIComponent("No se pudo leer el archivo para firmarlo.")
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const documentHash = createHash("sha256")
    .update(Buffer.from(arrayBuffer))
    .digest("hex");

  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for");
  const signerIp = forwardedFor?.split(",")[0]?.trim() || "No disponible";

  const { error } = await supabase.rpc("sign_employee_document", {
    p_document_id: documentId,
    p_full_name: full_name,
    p_document_hash: documentHash,
    p_signer_ip: signerIp,
  });

  if (error) {
    redirect("/app/mi-espacio?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/app/mi-espacio");
  revalidatePath("/app/documentos");
  redirect(
    "/app/mi-espacio?message=" +
      encodeURIComponent("Documento firmado correctamente.")
  );
}
