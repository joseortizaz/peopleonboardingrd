import { createClient } from "@/lib/supabase/server";

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET() {
  const supabase = await createClient();

  const { data: candidates } = await supabase
    .from("candidates")
    .select("full_name, email, phone, created_at, vacancies(title)")
    .eq("stage", "contratado")
    .order("created_at", { ascending: false });

  const rows = [
    ["Nombre", "Correo", "Teléfono", "Vacante", "Fecha de contratación"],
    ...(candidates ?? []).map((c) => {
      const vacancyTitle =
        (c.vacancies as unknown as { title: string } | null)?.title ?? "";
      return [
        c.full_name,
        c.email,
        c.phone ?? "",
        vacancyTitle,
        new Date(c.created_at).toLocaleDateString("es-DO"),
      ];
    }),
  ];

  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="candidatos-contratados.csv"',
    },
  });
}
