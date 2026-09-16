import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: candidate } = await supabase
    .from("candidates")
    .select("resume_url, resume_file_name")
    .eq("id", id)
    .maybeSingle();

  if (!candidate || !candidate.resume_url) {
    return NextResponse.json({ error: "CV no encontrado" }, { status: 404 });
  }

  const { data: signed, error } = await supabase.storage
    .from("candidate-resumes")
    .createSignedUrl(candidate.resume_url, 60, {
      download: candidate.resume_file_name ?? undefined,
    });

  if (error || !signed) {
    return NextResponse.json(
      { error: "No se pudo generar el enlace de descarga" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    url: signed.signedUrl,
    fileName: candidate.resume_file_name ?? "cv.pdf",
  });
}
