import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, isManagerRole } from "@/lib/supabase/tenant";
import { startOffboardingProcess } from "./actions";

const statusLabel: Record<string, string> = {
  en_proceso: "En proceso",
  completado: "Completado",
};

const reasonLabel: Record<string, string> = {
  renuncia: "Renuncia voluntaria",
  despido_justificado: "Despido con causa justificada",
  despido_injustificado: "Despido sin causa justificada",
  mutuo_acuerdo: "Mutuo acuerdo",
  fin_contrato: "Fin de contrato por tiempo determinado",
};

const currency = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "DOP",
});

export default async function BajasPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/onboarding");
  if (!isManagerRole(tenant.myRole)) redirect("/app/mi-espacio");

  const supabase = await createClient();

  const [{ data: processes }, { data: employees }] = await Promise.all([
    supabase
      .from("offboarding_processes")
      .select(
        "id, status, reason, last_working_day, total_liquidation, employees(full_name)"
      )
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("employees")
      .select("id, full_name, hire_date")
      .eq("tenant_id", tenant.id)
      .eq("status", "active"),
  ]);

  const hasEmployees = (employees ?? []).length > 0;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">
          Bajas — {tenant.name}
        </h1>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        Checklist de salida y calculo de referencia de preaviso, cesantia,
        vacaciones y regalia proporcional segun el Codigo de Trabajo
        dominicano. No sustituye la validacion de un contador o gestor
        laboral antes de pagar una liquidacion real.
      </p>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">Nueva baja</h2>

        {!hasEmployees ? (
          <p className="mt-3 text-sm text-gray-500">
            No hay empleados activos disponibles. Ve a{" "}
            <Link href="/app/empleados" className="text-blue-700 hover:underline">
              Empleados
            </Link>{" "}
            para registrar uno (con fecha de ingreso) antes de iniciar una baja.
          </p>
        ) : (
          <form
            action={startOffboardingProcess}
            className="mt-3 flex flex-wrap gap-3"
          >
            <select
              name="employee_id"
              required
              defaultValue=""
              className="min-w-[180px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Empleado
              </option>
              {(employees ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                  {!e.hire_date ? " (sin fecha de ingreso)" : ""}
                </option>
              ))}
            </select>
            <select
              name="reason"
              required
              defaultValue=""
              className="min-w-[220px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Motivo de la baja
              </option>
              {Object.entries(reasonLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <input
              name="last_working_day"
              type="date"
              required
              defaultValue={today}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              name="monthly_salary"
              type="number"
              step="0.01"
              min="0"
              required
              placeholder="Salario mensual (RD$)"
              className="w-48 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              name="notes"
              type="text"
              placeholder="Notas (opcional)"
              className="min-w-[200px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Iniciar baja
            </button>
          </form>
        )}
        <p className="mt-2 text-xs text-gray-400">
          El salario mensual se pide aqui porque todavia no hay un modulo de
          nomina que lo tenga registrado.
        </p>
      </div>

      <div className="mt-6 space-y-3">
        {(processes ?? []).length === 0 && (
          <p className="text-sm text-gray-500">Aún no hay bajas registradas.</p>
        )}
        {(processes ?? []).map((p) => {
          const employeeName =
            (p.employees as unknown as { full_name: string } | null)
              ?.full_name ?? "—";
          return (
            <Link
              key={p.id}
              href={`/app/bajas/${p.id}`}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-gray-300"
            >
              <div>
                <p className="font-medium text-gray-900">
                  {employeeName} — {reasonLabel[p.reason] ?? p.reason}
                </p>
                <p className="text-xs text-gray-500">
                  Último día {p.last_working_day} ·{" "}
                  {statusLabel[p.status] ?? p.status}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-900">
                  {currency.format(Number(p.total_liquidation))}
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    p.status === "completado"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-gray-900 text-white"
                  }`}
                >
                  {statusLabel[p.status] ?? p.status}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
