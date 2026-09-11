import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, isManagerRole } from "@/lib/supabase/tenant";
import { deleteOffboardingProcess, toggleOffboardingTask } from "../actions";

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

export default async function OffboardingProcessDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/onboarding");
  if (!isManagerRole(tenant.myRole)) redirect("/app/mi-espacio");

  const supabase = await createClient();

  const { data: process } = await supabase
    .from("offboarding_processes")
    .select(
      `id, status, reason, last_working_day, monthly_salary, years_of_service,
       preaviso_days, preaviso_amount, cesantia_days, cesantia_amount,
       vacation_days_pending, vacation_amount, christmas_bonus_amount,
       total_liquidation, notes, payroll_period_id, employees(full_name)`
    )
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (!process) notFound();

  const { data: tasks } = await supabase
    .from("offboarding_tasks")
    .select("id, title, description, status")
    .eq("process_id", id)
    .order("order_index", { ascending: true });

  const employeeName =
    (process.employees as unknown as { full_name: string } | null)
      ?.full_name ?? "—";
  const removeProcess = deleteOffboardingProcess.bind(null, process.id);
  const revalidateTo = `/app/bajas/${process.id}`;

  const rows: Array<[string, number]> = [
    [`Preaviso (${process.preaviso_days} días)`, process.preaviso_amount],
    [`Cesantía (${process.cesantia_days} días)`, process.cesantia_amount],
    [
      `Vacaciones no disfrutadas (${process.vacation_days_pending} días)`,
      process.vacation_amount,
    ],
    ["Regalía pascual proporcional", process.christmas_bonus_amount],
  ];

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/app/bajas" className="text-sm text-gray-500 hover:underline">
        ← Bajas
      </Link>

      <div className="mt-1 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{employeeName}</h1>
          <p className="text-sm text-gray-500">
            {reasonLabel[process.reason] ?? process.reason} · Último día{" "}
            {process.last_working_day} · {process.years_of_service} años de
            servicio
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              process.status === "completado"
                ? "bg-emerald-100 text-emerald-800"
                : "bg-gray-900 text-white"
            }`}
          >
            {statusLabel[process.status] ?? process.status}
          </span>
          <form action={removeProcess}>
            <button className="text-xs text-red-600 hover:underline">
              Eliminar
            </button>
          </form>
        </div>
      </div>

      {process.notes && (
        <p className="mt-3 text-sm text-gray-600">{process.notes}</p>
      )}

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">
          Liquidación de referencia
        </h2>
        <p className="mt-1 text-xs text-gray-400">
          Cálculo automático basado en el Código de Trabajo dominicano
          (Ley 16-92), salario mensual de {currency.format(Number(process.monthly_salary))}{" "}
          y un divisor estándar de 23.83 días/mes. Es un punto de partida:
          valida las cifras con un contador o gestor laboral antes de pagar
          una liquidación real.
        </p>
        <dl className="mt-4 divide-y divide-gray-100 text-sm">
          {rows.map(([label, amount]) => (
            <div key={label} className="flex items-center justify-between py-2">
              <dt className="text-gray-600">{label}</dt>
              <dd className="font-medium text-gray-900">
                {currency.format(Number(amount))}
              </dd>
            </div>
          ))}
          <div className="flex items-center justify-between py-2 text-base">
            <dt className="font-semibold text-gray-900">Total</dt>
            <dd className="font-semibold text-gray-900">
              {currency.format(Number(process.total_liquidation))}
            </dd>
          </div>
        </dl>
        {process.payroll_period_id && (
          <p className="mt-3 text-xs text-gray-400">
            Este total quedó registrado en{" "}
            <Link
              href={`/app/nomina/${process.payroll_period_id}`}
              className="underline"
            >
              Nómina
            </Link>{" "}
            para su historial y export bancario.
          </p>
        )}
      </div>

      <div className="mt-6 space-y-2">
        <h2 className="text-sm font-medium text-gray-700">
          Checklist de salida
        </h2>
        {(tasks ?? []).length === 0 && (
          <p className="text-sm text-gray-500">Esta baja no tiene tareas.</p>
        )}
        {(tasks ?? []).map((t) => {
          const isDone = t.status === "completada";
          const toggle = toggleOffboardingTask.bind(
            null,
            t.id,
            isDone ? "pendiente" : "completada",
            revalidateTo
          );
          return (
            <div
              key={t.id}
              className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <form action={toggle} className="pt-0.5">
                <button
                  type="submit"
                  aria-label={isDone ? "Marcar como pendiente" : "Marcar como completada"}
                  className={`flex h-5 w-5 items-center justify-center rounded border text-xs ${
                    isDone
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-gray-300 bg-white text-transparent"
                  }`}
                >
                  ✓
                </button>
              </form>
              <div className="flex-1">
                <p
                  className={`text-sm font-medium ${
                    isDone ? "text-gray-400 line-through" : "text-gray-900"
                  }`}
                >
                  {t.title}
                </p>
                {t.description && (
                  <p className="text-xs text-gray-500">{t.description}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
