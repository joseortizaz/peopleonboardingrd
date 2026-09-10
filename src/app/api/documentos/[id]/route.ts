import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("employee_documents")
    .select("storage_path, file_name")
    .eq("id", id)
    .maybeSingle();

  if (!doc) {
    return NextResponse.json(
      { error: "Documento no encontrado" },
      { status: 404 }
    );
  }

  const { data: signed, error } = await supabase.storage
    .from("employee-documents")
    .createSignedUrl(doc.storage_path, 60, { download: doc.file_name });

  if (error || !signed) {
    return NextResponse.json(
      { error: "No se pudo generar el enlace de descarga" },
      { status: 500 }
    );
  }

  return NextResponse.json({ url: signed.signedUrl, fileName: doc.file_name });
}
