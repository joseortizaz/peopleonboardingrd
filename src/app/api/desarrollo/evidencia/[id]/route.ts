import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Genera un enlace firmado de corta duracion a la evidencia adjunta de una
// meta de un plan de desarrollo (bucket privado development-plan-evidence).
// La select respeta RLS: solo gestion del tenant o el propio empleado dueno
// del plan pueden llegar a leer evidence_path (development_plan_goals_select).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: goal } = await supabase
    .from("development_plan_goals")
    .select("evidence_path")
    .eq("id", id)
    .maybeSingle();

  if (!goal) {
    return NextResponse.json({ error: "Meta no encontrada" }, { status: 404 });
  }

  if (!goal.evidence_path) {
    return NextResponse.json(
      { error: "Esta meta no tiene evidencia adjunta" },
      { status: 404 }
    );
  }

  const { data: signed, error } = await supabase.storage
    .from("development-plan-evidence")
    .createSignedUrl(goal.evidence_path, 60);

  if (error || !signed) {
    return NextResponse.json(
      { error: "No se pudo generar el enlace de la evidencia" },
      { status: 500 }
    );
  }

  return NextResponse.json({ url: signed.signedUrl });
}
