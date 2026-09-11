import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, isManagerRole } from "@/lib/supabase/tenant";
import { adjustPayrollEntry, closePayrollPeriod, deletePayrollPeriod } from "../actions";
import ExportCsvButton from "../ExportCsvButton";
import ExportBankCsvButton from "../ExportBankCsvButton";

const currency = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "DOP",
});

const dateFmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("es-DO");

const periodTypeLabel: Record<string, string> = {
  mensual: "Periodo mensual",
  quincenal: "Periodo quincenal",
  regalia: "Regalía pascual",
  liquidacion: "Liquidación",
};

export default async function NominaPeriodoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/onboarding");
  if (!isManagerRole(tenant.myRole)) redirect("/app/mi-espacio");

  const supabase = await createClient();

  const { data: period } = await supabase
    .from("payroll_periods")
    .select("id, period_type, start_date, end_date, pay_date, status, fiscal_year")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (!period) notFound();

  const { data: entries } = await supabase
    .from("payroll_entries")
    .select(
      "id, gross_salary, sfs_employee, sfs_employer, afp_employee, afp_employer, srl_employer, infotep_employer, isr_withholding, benefits_deduction, overtime_hours_35, overtime_hours_100, overtime_pay, other_bonuses, other_deductions, net_pay, employees(full_name, national_id, bank_name, bank_account_type, bank_account_number)"
    )
    .eq("period_id", id)
    .order("created_at", { ascending: true });

  const isOpen = period.status === "abierto";
  const close = closePayrollPeriod.bind(null, period.id);
  const remove = deletePayrollPeriod.bind(null, period.id);

  const totals = (entries ?? []).reduce(
    (acc, e) => {
      acc.gross += Number(e.gross_salary);
      acc.employerCost +=
        Number(e.sfs_employer) + Number(e.afp_employer) + Number(e.srl_employer) + Number(e.infotep_employer);
      acc.isr += Number(e.isr_withholding);
      acc.benefitsDeduction += Number(e.benefits_deduction);
      acc.overtimePay += Number(e.overtime_pay);
      acc.net += Number(e.net_pay);
      return acc;
    },
    { gross: 0, employerCost: 0, isr: 0, benefitsDeduction: 0, overtimePay: 0, net: 0 }
  );

  const employeesMissingBankInfo = (entries ?? [])
    .map((e) => {
      const employee = e.employees as unknown as {
        full_name: string;
        national_id: string | null;
        bank_name: string | null;
        bank_account_type: string | null;
        bank_account_number: string | null;
      } | null;
      return employee;
    })
    .filter(
      (employee): employee is NonNullable<typeof employee> =>
        !!employee &&
        (!employee.national_id || !employee.bank_name || !employee.bank_account_type || !employee.bank_account_number)
    );

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link href="/app/nomina" className="text-sm text-gray-500 hover:underline">
        ← Nómina
      </Link>

      <div className="mt-2 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            {periodTypeLabel[period.period_type] ?? period.period_type}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {dateFmt(period.start_date)} – {dateFmt(period.end_date)} · Fecha de pago:{" "}
            {dateFmt(period.pay_date)}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Calculado con las reglas del año fiscal {period.fiscal_year} —{" "}
            <Link href="/app/nomina/reglas-fiscales" className="underline">
              ver detalle
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={
              "rounded-full px-3 py-1 text-xs font-medium " +
              (isOpen ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600")
            }
          >
            {isOpen ? "Abierto" : "Cerrado"}
          </span>
          <ExportCsvButton
            periodId={period.id}
            fileName={`nomina-${period.start_date}-${period.end_date}.csv`}
          />
          <ExportBankCsvButton
            periodId={period.id}
            fileName={`export-bancario-${period.start_date}-${period.end_date}.csv`}
          />
        </div>
      </div>

      <p className="mt-2 text-xs text-gray-400">
        El export bancario es un CSV de referencia (cédula/RNC, nombre, banco,
        tipo de cuenta, número de cuenta y monto) — ajusta el orden de las
        columnas a la plantilla exacta que pida el portal de tu banco antes de
        subirlo.
      </p>

      {employeesMissingBankInfo.length > 0 && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {employeesMissingBankInfo.length} empleado(s) sin datos bancarios
          completos quedarán fuera del export bancario:{" "}
          {employeesMissingBankInfo.map((e) => e.full_name).join(", ")}. Complétalos en{" "}
          <Link href="/app/empleados" className="underline">
            Empleados
          </Link>
          .
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-6">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Bruto total</p>
          <p className="mt-1 text-sm font-medium text-gray-900">{currency.format(totals.gross)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Aportes patronales</p>
          <p className="mt-1 text-sm font-medium text-gray-900">{currency.format(totals.employerCost)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">ISR retenido</p>
          <p className="mt-1 text-sm font-medium text-gray-900">{currency.format(totals.isr)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Deducción beneficios</p>
          <p className="mt-1 text-sm font-medium text-gray-900">{currency.format(totals.benefitsDeduction)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Horas extra</p>
          <p className="mt-1 text-sm font-medium text-gray-900">{currency.format(totals.overtimePay)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Neto a pagar</p>
          <p className="mt-1 text-sm font-medium text-gray-900">{currency.format(totals.net)}</p>
        </div>
      </div>

      <p className="mt-2 text-xs text-gray-400">
        La columna &quot;Beneficios&quot; es el aporte del empleado (no el de la
        empresa) a sus beneficios activos durante este periodo — ver{" "}
        <Link href="/app/beneficios" className="underline">
          Beneficios
        </Link>{" "}
        — y ya está descontada del neto. La columna &quot;Horas extra&quot; ya
        está sumada dentro del bruto (cotiza a TSS y es gravable de ISR, a
        diferencia del bono manual) y se calculó a partir del marcaje
        registrado en{" "}
        <Link href="/app/asistencia" className="underline">
          Asistencia
        </Link>{" "}
        durante el rango del periodo. Ambas se calcularon automáticamente al
        generar el periodo; para que cambien en un periodo abierto, ajusta el
        origen (beneficio o marcaje) y vuelve a generar el periodo.
      </p>

      <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[1050px] text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Empleado</th>
              <th className="px-3 py-2 text-right">Bruto</th>
              <th className="px-3 py-2 text-right">SFS (empl.)</th>
              <th className="px-3 py-2 text-right">AFP (empl.)</th>
              <th className="px-3 py-2 text-right">ISR</th>
              <th className="px-3 py-2 text-right">Beneficios</th>
              <th className="px-3 py-2 text-right">Horas extra</th>
              <th className="px-3 py-2 text-right">Bono</th>
              <th className="px-3 py-2 text-right">Deducción</th>
              <th className="px-3 py-2 text-right">Neto</th>
              {isOpen && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(entries ?? []).length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-6 text-center text-gray-500">
                  Sin entradas — ningún empleado activo tenía salario mensual
                  registrado al generar este periodo.
                </td>
              </tr>
            )}
            {(entries ?? []).map((e) => {
              const employeeName =
                (e.employees as unknown as { full_name: string } | null)?.full_name ?? "—";
              const adjust = adjustPayrollEntry.bind(null, e.id, period.id);
              return (
                <tr key={e.id}>
                  <td className="px-3 py-2 text-gray-900">{employeeName}</td>
                  <td className="px-3 py-2 text-right text-gray-600">
                    {currency.format(Number(e.gross_salary))}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600">
                    {currency.format(Number(e.sfs_employee))}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600">
                    {currency.format(Number(e.afp_employee))}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600">
                    {currency.format(Number(e.isr_withholding))}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600">
                    {currency.format(Number(e.benefits_deduction))}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600">
                    {currency.format(Number(e.overtime_pay))}
                    {(Number(e.overtime_hours_35) > 0 || Number(e.overtime_hours_100) > 0) && (
                      <span className="block text-[10px] text-gray-400">
                        {Number(e.overtime_hours_35)}h ·35% + {Number(e.overtime_hours_100)}h ·100%
                      </span>
                    )}
                  </td>
                  {isOpen ? (
                    <>
                      <td className="px-2 py-2">
                        <input
                          form={`adjust-${e.id}`}
                          name="other_bonuses"
                          type="number"
                          min="0"
                          step="0.01"
                          defaultValue={Number(e.other_bonuses) || ""}
                          className="w-24 rounded-md border border-gray-300 px-2 py-1 text-right text-xs"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          form={`adjust-${e.id}`}
                          name="other_deductions"
                          type="number"
                          min="0"
                          step="0.01"
                          defaultValue={Number(e.other_deductions) || ""}
                          className="w-24 rounded-md border border-gray-300 px-2 py-1 text-right text-xs"
                        />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 text-right text-gray-600">
                        {currency.format(Number(e.other_bonuses))}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">
                        {currency.format(Number(e.other_deductions))}
                      </td>
                    </>
                  )}
                  <td className="px-3 py-2 text-right font-medium text-gray-900">
                    {currency.format(Number(e.net_pay))}
                  </td>
                  {isOpen && (
                    <td className="px-2 py-2 text-right">
                      <form id={`adjust-${e.id}`} action={adjust} />
                      <button
                        form={`adjust-${e.id}`}
                        type="submit"
                        className="text-xs text-gray-500 hover:text-gray-900 hover:underline"
                      >
                        Guardar
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isOpen && (
        <div className="mt-4 flex items-center gap-3">
          <form action={close}>
            <button
              type="submit"
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Cerrar periodo
            </button>
          </form>
          <form action={remove}>
            <button
              type="submit"
              className="text-sm text-red-600 hover:underline"
            >
              Eliminar periodo
            </button>
          </form>
        </div>
      )}
      {!isOpen && (
        <p className="mt-4 text-xs text-gray-400">
          Este periodo está cerrado: ya no se pueden ajustar bonos ni
          deducciones.
        </p>
      )}
    </div>
  );
}
