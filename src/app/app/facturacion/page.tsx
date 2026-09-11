import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/supabase/tenant";
import { requestPlan } from "./actions";

const currency = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "DOP",
  maximumFractionDigits: 0,
});

const dateTimeFmt = (d: string | null) =>
  d ? new Date(d).toLocaleString("es-DO") : "—";

const dateFmt = (d: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("es-DO") : "—";

type Plan = {
  id: string;
  name: string;
  price_reference: number | null;
  billing_period: string;
  description: string | null;
};

type Subscription = {
  status: "activa" | "suspendida" | "cancelada";
  start_date: string;
  end_date: string | null;
  subscription_plans: { name: string } | null;
};

type PaymentRequest = {
  id: string;
  status: "pendiente" | "confirmada" | "rechazada";
  note: string | null;
  created_at: string;
  resolved_at: string | null;
  subscription_plans: { name: string } | null;
};

const subStatusLabel: Record<string, string> = {
  activa: "Activa",
  suspendida: "Suspendida",
  cancelada: "Cancelada",
};

const requestStatusLabel: Record<string, string> = {
  pendiente: "Pendiente de confirmación",
  confirmada: "Confirmada",
  rechazada: "Rechazada",
};

const requestStatusColor: Record<string, string> = {
  pendiente: "bg-amber-100 text-amber-700",
  confirmada: "bg-emerald-100 text-emerald-700",
  rechazada: "bg-gray-200 text-gray-600",
};

// Datos de referencia para la transferencia — reemplaza esto por los datos
// bancarios reales de la cuenta que recibe el pago de las suscripciones.
const BANK_TRANSFER_INFO = {
  bank: "Banco de referencia (pendiente de configurar)",
  accountName: "Narnia Tech Solution, SRL",
  accountNumber: "000-0000000-0",
  accountType: "Corriente",
};

export default async function FacturacionPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;
  const tenant = await getCurrentTenant();

  if (!tenant) redirect("/app/onboarding");
  if (tenant.myRole !== "account_admin") redirect("/app");

  const supabase = await createClient();

  const [{ data: sub }, { data: plans }, { data: requests }] = await Promise.all([
    supabase
      .from("account_subscriptions")
      .select("status, start_date, end_date, subscription_plans(name)")
      .eq("account_id", tenant.accountId)
      .maybeSingle(),
    supabase
      .from("subscription_plans")
      .select("id, name, price_reference, billing_period, description")
      .eq("is_public", true)
      .order("price_reference", { ascending: true, nullsFirst: true }),
    supabase
      .from("subscription_payment_requests")
      .select("id, status, note, created_at, resolved_at, subscription_plans(name)")
      .eq("account_id", tenant.accountId)
      .order("created_at", { ascending: false }),
  ]);

  const subscription = sub as unknown as Subscription | null;
  const typedPlans = (plans ?? []) as Plan[];
  const typedRequests = (requests ?? []) as unknown as PaymentRequest[];
  const hasPendingRequest = typedRequests.some((r) => r.status === "pendiente");

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/app" className="text-sm text-gray-500 hover:underline">
        ← Inicio
      </Link>

      <h1 className="mt-2 text-xl font-semibold text-gray-900">Facturación</h1>
      <p className="mt-1 text-sm text-gray-500">
        Consulta tu plan actual, solicita uno nuevo y sigue las instrucciones
        de pago. La confirmación del pago es manual por ahora.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      )}

      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-500">Tu cuenta</p>
        <p className="mt-1 text-lg font-medium text-gray-900">{tenant.name}</p>
        {subscription ? (
          <p className="mt-2 text-sm text-gray-600">
            Plan: <span className="font-medium">{subscription.subscription_plans?.name ?? "sin plan"}</span>
            {" · "}Estado: {subStatusLabel[subscription.status] ?? subscription.status}
            {" · "}
            {subscription.end_date
              ? `Vence: ${dateFmt(subscription.end_date)}`
              : "Sin fecha de vencimiento"}
          </p>
        ) : (
          <p className="mt-2 text-sm text-gray-500">
            Todavía no tienes ningún plan asignado.
          </p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-gray-900">Planes disponibles</h2>

        {hasPendingRequest && (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Ya tienes una solicitud pendiente de confirmación. Puedes enviar
            otra si necesitas cambiarla.
          </p>
        )}

        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {typedPlans.map((plan) => (
            <div
              key={plan.id}
              className="flex flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <h3 className="font-medium text-gray-900">{plan.name}</h3>
              {plan.description && (
                <p className="mt-1 text-xs text-gray-500">{plan.description}</p>
              )}
              <p className="mt-2 text-lg font-semibold text-gray-900">
                {plan.price_reference != null
                  ? currency.format(plan.price_reference)
                  : "A cotizar"}
                {plan.price_reference != null && (
                  <span className="text-xs font-normal text-gray-400">
                    {" "}
                    / {plan.billing_period}
                  </span>
                )}
              </p>
              <form action={requestPlan} className="mt-3 space-y-2">
                <input type="hidden" name="plan_id" value={plan.id} />
                <input
                  name="note"
                  type="text"
                  placeholder="Nota opcional (ej. fecha en que transferirás)"
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
                />
                <button
                  type="submit"
                  className="w-full rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
                >
                  Solicitar este plan
                </button>
              </form>
            </div>
          ))}
          {typedPlans.length === 0 && (
            <p className="text-sm text-gray-400">
              Aún no hay planes publicados. Contacta al operador de la
              plataforma.
            </p>
          )}
        </div>
      </section>

      <section className="mt-8 rounded-xl border border-gray-200 bg-gray-50 p-5">
        <h2 className="text-sm font-semibold text-gray-900">
          Instrucciones de pago
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          Después de solicitar un plan, realiza la transferencia y espera la
          confirmación — normalmente en menos de 24 horas hábiles.
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-700">
          <dt className="text-gray-500">Banco</dt>
          <dd>{BANK_TRANSFER_INFO.bank}</dd>
          <dt className="text-gray-500">Beneficiario</dt>
          <dd>{BANK_TRANSFER_INFO.accountName}</dd>
          <dt className="text-gray-500">Tipo de cuenta</dt>
          <dd>{BANK_TRANSFER_INFO.accountType}</dd>
          <dt className="text-gray-500">Número de cuenta</dt>
          <dd>{BANK_TRANSFER_INFO.accountNumber}</dd>
        </dl>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-gray-900">Historial de solicitudes</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className="px-4 py-2">Plan</th>
                <th className="px-4 py-2">Solicitada</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2">Resuelta</th>
                <th className="px-4 py-2">Nota</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {typedRequests.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2">{r.subscription_plans?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-gray-500">{dateTimeFmt(r.created_at)}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${requestStatusColor[r.status]}`}
                    >
                      {requestStatusLabel[r.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-500">{dateTimeFmt(r.resolved_at)}</td>
                  <td className="px-4 py-2 text-gray-500">{r.note ?? "—"}</td>
                </tr>
              ))}
              {typedRequests.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-center text-gray-400">
                    Aún no has hecho ninguna solicitud.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
