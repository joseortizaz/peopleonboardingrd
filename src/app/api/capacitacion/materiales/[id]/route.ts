import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: material } = await supabase
    .from("training_course_materials")
    .select("storage_path, file_name")
    .eq("id", id)
    .maybeSingle();

  if (!material) {
    return NextResponse.json(
      { error: "Material no encontrado" },
      { status: 404 }
    );
  }

  const { data: signed, error } = await supabase.storage
    .from("training-materials")
    .createSignedUrl(material.storage_path, 60, { download: material.file_name });

  if (error || !signed) {
    return NextResponse.json(
      { error: "No se pudo generar el enlace de descarga" },
      { status: 500 }
    );
  }

  return NextResponse.json({ url: signed.signedUrl, fileName: material.file_name });
}
