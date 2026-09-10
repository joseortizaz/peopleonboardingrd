import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Export bancario de referencia para dispersion de nomina.
//
// No modela el formato exacto de un banco especifico (Banreservas,
// Popular y BHD Leon tienen cada uno su propia plantilla): expone las
// columnas universales que casi todos piden -- cedula/RNC, nombre,
// banco, tipo de cuenta, numero de cuenta y monto -- y deja al gestor
// ajustar el orden/formato exacto a la plantilla real de su banco
// antes de subirlo al portal de banca empresarial.
//
// Solo incluye a los empleados con los 4 datos bancarios completos;
// los que falten quedan fuera del archivo (la UI de la pagina del
// periodo ya avisa cuales son antes de exportar).

const accountTypeLabel: Record<string, string> = {
  ahorro: "Ahorro",
  corriente: "Corriente",
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
      "net_pay, employees(full_name, national_id, bank_name, bank_account_type, bank_account_number)"
    )
    .eq("period_id", id)
    .order("created_at", { ascending: true });

  const reference = `Nomina ${period.period_type} ${period.start_date} a ${period.end_date}`;

  const rows = [
    ["Cedula/RNC", "Nombre", "Banco", "Tipo de cuenta", "Numero de cuenta", "Monto", "Referencia"],
    ...(entries ?? [])
      .map((e) => {
        const employee = e.employees as unknown as {
          full_name: string;
          national_id: string | null;
          bank_name: string | null;
          bank_account_type: string | null;
          bank_account_number: string | null;
        } | null;
        if (
          !employee ||
          !employee.national_id ||
          !employee.bank_name ||
          !employee.bank_account_type ||
          !employee.bank_account_number
        ) {
          return null;
        }
        return [
          employee.national_id,
          employee.full_name,
          employee.bank_name,
          accountTypeLabel[employee.bank_account_type] ?? employee.bank_account_type,
          employee.bank_account_number,
          Number(e.net_pay).toFixed(2),
          reference,
        ];
      })
      .filter((row): row is string[] => row !== null),
  ];

  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="export-bancario-${period.start_date}-${period.end_date}.csv"`,
    },
  });
}
