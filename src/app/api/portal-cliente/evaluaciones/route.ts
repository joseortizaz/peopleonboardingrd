import { createClient } from "@/lib/supabase/server";

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET() {
  const supabase = await createClient();

  const { data: evaluations } = await supabase
    .from("evaluations")
    .select(
      "type, overall_score, completed_at, employees(full_name), evaluation_templates(name)"
    )
    .eq("status", "completada")
    .order("completed_at", { ascending: false });

  const rows = [
    ["Empleado", "Plantilla", "Tipo", "Puntaje", "Fecha de finalización"],
    ...(evaluations ?? []).map((ev) => {
      const employeeName =
        (ev.employees as unknown as { full_name: string } | null)
          ?.full_name ?? "";
      const templateName =
        (ev.evaluation_templates as unknown as { name: string } | null)
          ?.name ?? "";
      return [
        employeeName,
        templateName,
        `${ev.type}°`,
        ev.overall_score !== null ? String(ev.overall_score) : "",
        ev.completed_at
          ? new Date(ev.completed_at).toLocaleDateString("es-DO")
          : "",
      ];
    }),
  ];

  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="evaluaciones-completadas.csv"',
    },
  });
}
