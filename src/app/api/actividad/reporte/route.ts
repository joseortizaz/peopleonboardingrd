import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, isTenantManagerRole } from "@/lib/supabase/tenant";

export const dynamic = "force-dynamic";

function csvEscape(value: string) {
  if (/["\,\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const ACTIVITY_TYPE_LABEL: Record<string, string> = {
  vacante_publicada: "Vacante publicada",
  candidato_contratado: "Candidato contratado",
  evaluacion_completada: "Evaluación completada",
  incorporacion_iniciada: "Incorporación iniciada",
  baja_iniciada: "Baja iniciada",
};

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET(request: Request) {
  const tenant = await getCurrentTenant();
  if (!tenant || !isTenantManagerRole(tenant.myRole)) {
    return new Response("No autorizado", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const mesParam = searchParams.get("mes");
  const mes = mesParam && /^\d{4}-\d{2}$/.test(mesParam) ? mesParam : currentMonth();

  const [year, month] = mes.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1)).toISOString();
  const end = new Date(Date.UTC(year, month, 1)).toISOString();

  const supabase = await createClient();
  const { data: entries } = await supabase
    .from("activity_log")
    .select("activity_type, description, occurred_at")
    .eq("tenant_id", tenant.id)
    .gte("occurred_at", start)
    .lt("occurred_at", end)
    .order("occurred_at", { ascending: true });

  const rows = [
    ["Fecha", "Tipo", "Descripción"],
    ...(entries ?? []).map((e) => [
      new Date(e.occurred_at).toLocaleString("es-DO"),
      ACTIVITY_TYPE_LABEL[e.activity_type] ?? e.activity_type,
      e.description,
    ]),
  ];

  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="actividad-${tenant.slug}-${mes}.csv"`,
    },
  });
}
