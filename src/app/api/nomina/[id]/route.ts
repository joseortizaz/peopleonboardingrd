import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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

  const { data: period } = await supabase
    .from("payroll_periods")
    .select("id, period_type, start_date, end_date, pay_date")
    .eq("id", id)
    .maybeSingle();

  if (!period) {
    return new Response("Periodo no encontrado", { status: 404 });
  }

  const { data: entries } = await supabase
    .from("payroll_entries")
    .select(
      "gross_salary, sfs_employee, sfs_employer, afp_employee, afp_employer, srl_employer, infotep_employer, isr_withholding, overtime_hours_35, overtime_hours_100, overtime_pay, other_bonuses, other_deductions, net_pay, employees(full_name)"
    )
    .eq("period_id", id)
    .order("created_at", { ascending: true });

  const rows = [
    [
      "Empleado",
      "Salario bruto",
      "SFS empleado",
      "SFS empleador",
      "AFP empleado",
      "AFP empleador",
      "SRL empleador",
      "INFOTEP empleador",
      "ISR retenido",
      "Horas extra 35%",
      "Horas extra 100%",
      "Pago horas extra",
      "Bono",
      "Deduccion",
      "Neto a pagar",
    ],
    ...(entries ?? []).map((e) => {
      const employeeName =
        (e.employees as unknown as { full_name: string } | null)?.full_name ?? "";
      return [
        employeeName,
        String(e.gross_salary),
        String(e.sfs_employee),
        String(e.sfs_employer),
        String(e.afp_employee),
        String(e.afp_employer),
        String(e.srl_employer),
        String(e.infotep_employer),
        String(e.isr_withholding),
        String(e.overtime_hours_35),
        String(e.overtime_hours_100),
        String(e.overtime_pay),
        String(e.other_bonuses),
        String(e.other_deductions),
        String(e.net_pay),
      ];
    }),
  ];

  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nomina-${period.start_date}-${period.end_date}.csv"`,
    },
  });
}
