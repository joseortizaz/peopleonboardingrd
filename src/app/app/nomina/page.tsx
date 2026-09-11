import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, isManagerRole } from "@/lib/supabase/tenant";
import { createPayrollPeriod, generateRegaliaPascual } from "./actions";

const currency = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "DOP",
});

const dateFmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("es-DO");

const periodTypeLabel: Record<string, string> = {
  mensual: "Mensual",
  quincenal: "Quincenal",
  regalia: "Regalía pascual",
  liquidacion: "Liquidación",
};

export default async function NominaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/onboarding");
  if (!isManagerRole(tenant.myRole)) redirect("/app/mi-espacio");

  const supabase = await createClient();

  const [{ data: periods }, { count: employeesWithSalary }] = await Promise.all([
    supabase
      .from("payroll_periods")
      .select("id, period_type, start_date, end_date, pay_date, status, fiscal_year, created_at")
      .eq("tenant_id", tenant.id)
      .order("start_date", { ascending: false }),
    supabase
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .eq("status", "active")
      .not("monthly_salary", "is", null)
      .gt("monthly_salary", 0),
  ]);

  let totalsByPeriod: Record<string, { count: number; net: number }> = {};
  if (periods && periods.length > 0) {
    const { data: entries } = await supabase
      .from("payroll_entries")
      .select("period_id, net_pay")
      .in("period_id", periods.map((p) => p.id));

    totalsByPeriod = (entries ?? []).reduce((acc, e) => {
      const bucket = acc[e.period_id] ?? { count: 0, net: 0 };
      bucket.count += 1;
      bucket.net += Number(e.net_pay);
      acc[e.period_id] = bucket;
      return acc;
    }, {} as Record<string, { count: number; net: number }>);
  }

  const createPeriodForTenant = createPayrollPeriod.bind(null, tenant.id);
  const generateRegaliaForTenant = generateRegaliaPascual.bind(null, tenant.id);
  const currentYear = new Date().getFullYear();

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Nómina — {tenant.name}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Cálculo de referencia de nómina dominicana (SFS, AFP, SRL, INFOTEP
            e ISR) para los empleados activos con salario mensual registrado.
          </p>
        </div>
        <Link
          href="/app/nomina/reglas-fiscales"
          className="whitespace-nowrap text-sm text-gray-500 hover:underline"
        >
          Reglas fiscales
        </Link>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">Generar periodo de nómina</h2>
        <form action={createPeriodForTenant} className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500">Tipo</label>
            <select
              name="period_type"
              defaultValue="mensual"
              className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="mensual">Mensual</option>
              <option value="quincenal">Quincenal</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500">Inicio</label>
            <input
              name="start_date"
              type="date"
              required
              className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500">Fin</label>
            <input
              name="end_date"
              type="date"
              required
              className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500">Fecha de pago</label>
            <input
              name="pay_date"
              type="date"
              required
              className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Generar
          </button>
        </form>
        <p className="mt-2 text-xs text-gray-400">
          Se incluirá a los {employeesWithSalary ?? 0} empleado(s) activo(s)
          con salario mensual registrado en{" "}
          <Link href="/app/empleados" className="underline">
            Empleados
          </Link>
          . Las horas extra se calculan automáticamente a partir del marcaje
          registrado en{" "}
          <Link href="/app/asistencia" className="underline">
            Asistencia
          </Link>{" "}
          (Art. 203-204: recargo de 35% de la hora 45 a la 68 semanal, 100%
          de ahí en adelante). Este es un cálculo de referencia — valídalo
          con un contador o gestor laboral antes de usarlo para pagos
          reales.
        </p>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">Generar regalía pascual</h2>
        <form action={generateRegaliaForTenant} className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500">Año</label>
            <input
              name="year"
              type="number"
              defaultValue={currentYear}
              min="2020"
              required
              className="mt-1 w-24 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500">Fecha de pago</label>
            <input
              name="pay_date"
              type="date"
              defaultValue={`${currentYear}-12-15`}
              required
              className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Generar
          </button>
        </form>
        <p className="mt-2 text-xs text-gray-400">
          Paga a cada empleado activo la doceava parte de su salario
          acumulado en el año (Art. 219-222), exenta de TSS/ISR. La fecha de
          pago debe ser antes del 20 de diciembre (Art. 220). Solo se puede
          generar una vez por año; un empleado que se da de baja durante el
          año recibe su regalía proporcional dentro de su liquidación, no
          aquí.
        </p>
      </div>

      <div className="mt-6 space-y-3">
        {(periods ?? []).length === 0 && (
          <p className="text-sm text-gray-500">Aún no hay periodos de nómina generados.</p>
        )}
        {(periods ?? []).map((p) => {
          const totals = totalsByPeriod[p.id] ?? { count: 0, net: 0 };
          return (
            <Link
              key={p.id}
              href={`/app/nomina/${p.id}`}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-gray-300"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {periodTypeLabel[p.period_type] ?? p.period_type} ·{" "}
                  {dateFmt(p.start_date)} – {dateFmt(p.end_date)}
                </p>
                <p className="text-xs text-gray-500">
                  Pago: {dateFmt(p.pay_date)} · {totals.count} empleado(s) ·
                  Año fiscal {p.fiscal_year}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">
                  {currency.format(totals.net)}
                </p>
                <span
                  className={
                    "text-xs " +
                    (p.status === "cerrado" ? "text-gray-500" : "text-emerald-600")
                  }
                >
                  {p.status === "cerrado" ? "Cerrado" : "Abierto"}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
