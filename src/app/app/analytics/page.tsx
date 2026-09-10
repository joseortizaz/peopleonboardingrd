import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, isManagerRole } from "@/lib/supabase/tenant";

const currency = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "DOP",
  maximumFractionDigits: 0,
});

const monthLabel = (key: string) => {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("es-DO", {
    month: "short",
    year: "2-digit",
  });
};

function last12MonthKeys() {
  const keys: string[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

export default async function AnalyticsPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/onboarding");
  if (!isManagerRole(tenant.myRole)) redirect("/app/mi-espacio");

  const supabase = await createClient();

  const [{ data: employees }, { data: offboarding }, { data: periods }, { data: entries }] =
    await Promise.all([
      supabase
        .from("employees")
        .select("hire_date, status")
        .eq("tenant_id", tenant.id)
        .not("hire_date", "is", null),
      supabase
        .from("offboarding_processes")
        .select("last_working_day")
        .eq("tenant_id", tenant.id),
      supabase
        .from("payroll_periods")
        .select("id, period_type, start_date, pay_date, status")
        .eq("tenant_id", tenant.id)
        .order("start_date", { ascending: true }),
      supabase
        .from("payroll_entries")
        .select("period_id, gross_salary, sfs_employer, afp_employer, srl_employer, infotep_employer, net_pay")
        .eq("tenant_id", tenant.id),
    ]);

  const monthKeys = last12MonthKeys();
  const hires: Record<string, number> = Object.fromEntries(monthKeys.map((k) => [k, 0]));
  const exits: Record<string, number> = Object.fromEntries(monthKeys.map((k) => [k, 0]));

  (employees ?? []).forEach((e) => {
    if (!e.hire_date) return;
    const key = e.hire_date.slice(0, 7);
    if (key in hires) hires[key]++;
  });

  (offboarding ?? []).forEach((o) => {
    if (!o.last_working_day) return;
    const key = o.last_working_day.slice(0, 7);
    if (key in exits) exits[key]++;
  });

  const activeCount = (employees ?? []).filter((e) => e.status === "active").length;
  const maxHeadcountEvent = Math.max(1, ...monthKeys.map((k) => Math.max(hires[k], exits[k])));

  const periodTotals = (periods ?? []).map((p) => {
    const rows = (entries ?? []).filter((e) => e.period_id === p.id);
    const gross = rows.reduce((s, r) => s + Number(r.gross_salary), 0);
    const employerCost = rows.reduce(
      (s, r) =>
        s +
        Number(r.sfs_employer) +
        Number(r.afp_employer) +
        Number(r.srl_employer) +
        Number(r.infotep_employer),
      0
    );
    const net = rows.reduce((s, r) => s + Number(r.net_pay), 0);
    return { ...p, gross, employerCost, net, totalCost: gross + employerCost };
  });

  const maxTotalCost = Math.max(1, ...periodTotals.map((p) => p.totalCost));

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-xl font-semibold text-gray-900">
        People analytics — {tenant.name}
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Rotación de personal y costo de nómina, calculados a partir de los
        datos ya registrados en Empleados, Bajas y Nómina. El ausentismo
        queda pendiente hasta construir el módulo de asistencia y tiempo.
      </p>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-700">
            Rotación (últimos 12 meses)
          </h2>
          <span className="text-xs text-gray-500">
            {activeCount} empleado(s) activo(s) hoy
          </span>
        </div>
        <div className="mt-4 flex items-end gap-1.5" style={{ height: 140 }}>
          {monthKeys.map((k) => (
            <div key={k} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-24 w-full items-end justify-center gap-0.5">
                <div
                  className="w-2.5 rounded-t bg-emerald-500"
                  style={{ height: `${(hires[k] / maxHeadcountEvent) * 100}%` }}
                  title={`${hires[k]} alta(s)`}
                />
                <div
                  className="w-2.5 rounded-t bg-red-400"
                  style={{ height: `${(exits[k] / maxHeadcountEvent) * 100}%` }}
                  title={`${exits[k]} baja(s)`}
                />
              </div>
              <span className="text-[10px] text-gray-400">{monthLabel(k)}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Altas
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-400" /> Bajas
          </span>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">
          Costo de nómina por periodo
        </h2>
        {periodTotals.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">
            Aún no hay periodos de nómina generados.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {periodTotals.map((p) => (
              <div key={p.id}>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {p.start_date} · Pago {p.pay_date} ·{" "}
                    {p.period_type === "quincenal" ? "Quincenal" : "Mensual"}
                    {p.status === "cerrado" && " · Cerrado"}
                  </span>
                  <span className="font-medium text-gray-900">
                    {currency.format(p.totalCost)}
                  </span>
                </div>
                <div className="mt-1 flex h-2.5 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-2.5 bg-gray-900"
                    style={{ width: `${(p.gross / maxTotalCost) * 100}%` }}
                    title={`Bruto: ${currency.format(p.gross)}`}
                  />
                  <div
                    className="h-2.5 bg-amber-400"
                    style={{ width: `${(p.employerCost / maxTotalCost) * 100}%` }}
                    title={`Aportes patronales: ${currency.format(p.employerCost)}`}
                  />
                </div>
              </div>
            ))}
            <div className="flex items-center gap-4 pt-1 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-gray-900" /> Bruto pagado
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-400" /> Aportes patronales
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
