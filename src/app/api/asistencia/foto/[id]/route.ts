import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const which = searchParams.get("which");

  if (which !== "in" && which !== "out") {
    return NextResponse.json(
      { error: "Parametro 'which' invalido" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data: entry } = await supabase
    .from("time_clock_entries")
    .select("clock_in_photo_path, clock_out_photo_path")
    .eq("id", id)
    .maybeSingle();

  if (!entry) {
    return NextResponse.json(
      { error: "Marcaje no encontrado" },
      { status: 404 }
    );
  }

  const storagePath =
    which === "in" ? entry.clock_in_photo_path : entry.clock_out_photo_path;

  if (!storagePath) {
    return NextResponse.json(
      { error: "Este marcaje no tiene foto registrada" },
      { status: 404 }
    );
  }

  const { data: signed, error } = await supabase.storage
    .from("time-clock-photos")
    .createSignedUrl(storagePath, 60);

  if (error || !signed) {
    return NextResponse.json(
      { error: "No se pudo generar el enlace de la foto" },
      { status: 500 }
    );
  }

  return NextResponse.json({ url: signed.signedUrl });
}
