import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const STAGE_LABELS: Record<string, string> = {
  recibido: "Recibido",
  en_revision: "En revisión",
  entrevista_rh: "Entrevista RH",
  entrevista_gerencia: "Entrevista gerencia",
  prueba: "Prueba",
  oferta: "Oferta",
  contratado: "Contratado",
  rechazado: "Rechazado",
};

function csvEscape(value: string) {
  if (/["\,\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: vacancy } = await supabase
    .from("vacancies")
    .select("id, title")
    .eq("id", id)
    .maybeSingle();

  if (!vacancy) {
    return new Response("Vacante no encontrada", { status: 404 });
  }

  const { data: candidates } = await supabase
    .from("candidates")
    .select(
      "full_name, email, phone, stage, resume_file_name, notes, rejection_reason, created_at"
    )
    .eq("vacancy_id", id)
    .order("created_at", { ascending: true });

  const rows = [
    [
      "Nombre completo",
      "Correo",
      "Teléfono",
      "Etapa",
      "CV adjunto",
      "Notas internas",
      "Motivo de rechazo",
      "Fecha de aplicación",
    ],
    ...(candidates ?? []).map((c) => [
      c.full_name,
      c.email,
      c.phone ?? "",
      STAGE_LABELS[c.stage] ?? c.stage,
      c.resume_file_name ? "Sí" : "No",
      c.notes ?? "",
      c.rejection_reason ?? "",
      new Date(c.created_at).toLocaleString("es-DO"),
    ]),
  ];

  const csv = rows.map((r) => r.map((v) => csvEscape(String(v))).join(",")).join("\n");

  const safeTitle = vacancy.title.replace(/[^a-zA-Z0-9._-]/g, "_");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="candidatos-${safeTitle}.csv"`,
    },
  });
}
