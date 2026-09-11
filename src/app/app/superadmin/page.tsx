import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createPlan, upsertSubscription, resolvePaymentRequest } from "./actions";

const currency = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "DOP",
});

const dateFmt = (d: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("es-DO") : "—";

const dateTimeFmt = (d: string | null) =>
  d ? new Date(d).toLocaleString("es-DO") : "—";

type Account = {
  id: string;
  name: string;
  kind: string;
  rnc: string | null;
  created_at: string;
};

type Plan = {
  id: string;
  name: string;
  price_reference: number | null;
  billing_period: string;
  is_public: boolean;
};

type Subscription = {
  id: string;
  account_id: string;
  plan_id: string | null;
  status: "activa" | "suspendida" | "cancelada";
  start_date: string;
  end_date: string | null;
  notes: string | null;
  updated_at: string;
};

type PaymentRequest = {
  id: string;
  account_id: string;
  plan_id: string;
  status: "pendiente" | "confirmada" | "rechazada";
  note: string | null;
  created_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
};

const statusLabel: Record<Subscription["status"], string> = {
  activa: "Activa",
  suspendida: "Suspendida",
  cancelada: "Cancelada",
};

const statusColor: Record<Subscription["status"], string> = {
  activa: "bg-emerald-100 text-emerald-700",
  suspendida: "bg-amber-100 text-amber-700",
  cancelada: "bg-gray-200 text-gray-600",
};

export default async function SuperAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const { data: isSuperAdmin } = await supabase.rpc("is_super_admin");
  if (!isSuperAdmin) redirect("/app");

  const [{ data: accounts }, { data: plans }, { data: subs }, { data: requests }] =
    await Promise.all([
      supabase
        .from("accounts")
        .select("id, name, kind, rnc, created_at")
        .order("created_at", { ascending: true }),
      supabase
        .from("subscription_plans")
        .select("id, name, price_reference, billing_period, is_public")
        .order("created_at", { ascending: true }),
      supabase
        .from("account_subscriptions")
        .select("id, account_id, plan_id, status, start_date, end_date, notes, updated_at"),
      supabase
        .from("subscription_payment_requests")
        .select("id, account_id, plan_id, status, note, created_at, resolved_at, resolution_note")
        .order("created_at", { ascending: false }),
    ]);

  const typedAccounts = (accounts ?? []) as Account[];
  const typedPlans = (plans ?? []) as Plan[];
  const typedSubs = (subs ?? []) as Subscription[];
  const typedRequests = (requests ?? []) as PaymentRequest[];
  const subByAccount = new Map(typedSubs.map((s) => [s.account_id, s]));
  const planById = new Map(typedPlans.map((p) => [p.id, p]));
  const accountById = new Map(typedAccounts.map((a) => [a.id, a]));

  const pendingRequests = typedRequests.filter((r) => r.status === "pendiente");
  const resolvedRequests = typedRequests.filter((r) => r.status !== "pendiente").slice(0, 10);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link href="/app" className="text-sm text-gray-500 hover:underline">
        ← Inicio
      </Link>

      <h1 className="mt-2 text-xl font-semibold text-gray-900">
        Super Admin — Facturación SaaS
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Activa o desactiva manualmente la suscripción de cada cuenta y
        configura sus fechas de inicio/fin, o confirma las solicitudes de
        pago que los clientes envían desde su propio checkout
        (/app/facturacion). Todavía no hay cobro recurrente automático — eso
        queda para cuando se integre CardNet, una vez haya al menos un
        cliente facturando.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-gray-900">
          Solicitudes de pago pendientes
          {pendingRequests.length > 0 && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              {pendingRequests.length}
            </span>
          )}
        </h2>
        <div className="mt-3 space-y-3">
          {pendingRequests.map((r) => {
            const acc = accountById.get(r.account_id);
            const plan = planById.get(r.plan_id);
            const confirm = resolvePaymentRequest.bind(null, r.id, "confirmar");
            const reject = resolvePaymentRequest.bind(null, r.id, "rechazar");
            return (
              <div
                key={r.id}
                className="rounded-xl border border-amber-200 bg-amber-50 p-4"
              >
                <p className="text-sm text-gray-900">
                  <span className="font-medium">{acc?.name ?? "cuenta desconocida"}</span>
                  {" solicita "}
                  <span className="font-medium">{plan?.name ?? "plan desconocido"}</span>
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Enviada el {dateTimeFmt(r.created_at)}
                  {r.note ? ` · Nota del cliente: "${r.note}"` : ""}
                </p>
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <form action={confirm} className="flex items-end gap-2">
                    <input
                      name="note"
                      type="text"
                      placeholder="Nota (opcional)"
                      className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                    />
                    <button
                      type="submit"
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                    >
                      Confirmar pago y activar
                    </button>
                  </form>
                  <form action={reject} className="flex items-end gap-2">
                    <input
                      name="note"
                      type="text"
                      placeholder="Motivo del rechazo (opcional)"
                      className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                    />
                    <button
                      type="submit"
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                    >
                      Rechazar
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
          {pendingRequests.length === 0 && (
            <p className="text-xs text-gray-400">No hay solicitudes pendientes.</p>
          )}
        </div>

        {resolvedRequests.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">
              Ver últimas solicitudes resueltas
            </summary>
            <div className="mt-2 space-y-1">
              {resolvedRequests.map((r) => {
                const acc = accountById.get(r.account_id);
                const plan = planById.get(r.plan_id);
                return (
                  <p key={r.id} className="text-xs text-gray-500">
                    {acc?.name ?? "—"} · {plan?.name ?? "—"} ·{" "}
                    {r.status === "confirmada" ? "Confirmada" : "Rechazada"} el{" "}
                    {dateTimeFmt(r.resolved_at)}
                    {r.resolution_note ? ` · "${r.resolution_note}"` : ""}
                  </p>
                );
              })}
            </div>
          </details>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-gray-900">Planes</h2>
        <div className="mt-2 flex flex-wrap gap-3">
          {typedPlans.map((p) => (
            <div
              key={p.id}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600"
            >
              <span className="font-medium text-gray-900">{p.name}</span>
              {" · "}
              {p.price_reference != null ? currency.format(p.price_reference) : "sin precio"}
              {" / "}
              {p.billing_period}
              {p.is_public && (
                <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">
                  público
                </span>
              )}
            </div>
          ))}
          {typedPlans.length === 0 && (
            <p className="text-xs text-gray-400">Aún no hay planes creados.</p>
          )}
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Un plan creado aquí queda privado (no aparece en /precios ni en el
          checkout) hasta marcarlo como público — eso se hace por ahora
          directo en Supabase (columna <code>is_public</code> de{" "}
          <code>subscription_plans</code>).
        </p>

        <form action={createPlan} className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs text-gray-500">Nombre del plan</label>
            <input
              name="name"
              type="text"
              required
              className="mt-1 w-40 rounded-md border border-gray-300 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500">Precio ref. (DOP)</label>
            <input
              name="price_reference"
              type="number"
              min="0"
              step="0.01"
              className="mt-1 w-32 rounded-md border border-gray-300 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500">Periodo</label>
            <select
              name="billing_period"
              className="mt-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
            >
              <option value="mensual">Mensual</option>
              <option value="anual">Anual</option>
            </select>
          </div>
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            Crear plan
          </button>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-gray-900">Cuentas</h2>
        <div className="mt-3 space-y-4">
          {typedAccounts.map((acc) => {
            const sub = subByAccount.get(acc.id);
            const plan = sub?.plan_id ? planById.get(sub.plan_id) : null;
            const update = upsertSubscription.bind(null, acc.id);
            return (
              <div
                key={acc.id}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{acc.name}</p>
                    <p className="text-xs text-gray-400">
                      {acc.kind === "outsourcing_agency" ? "Agencia de outsourcing" : "Empresa"}
                      {acc.rnc ? ` · RNC ${acc.rnc}` : ""}
                    </p>
                  </div>
                  {sub && (
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${statusColor[sub.status]}`}
                    >
                      {statusLabel[sub.status]}
                    </span>
                  )}
                </div>

                {sub && (
                  <p className="mt-1 text-xs text-gray-400">
                    Plan actual: {plan ? plan.name : "sin plan"} · Desde{" "}
                    {dateFmt(sub.start_date)} · Hasta {dateFmt(sub.end_date)}
                  </p>
                )}

                <form
                  action={update}
                  className="mt-3 flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3"
                >
                  <div>
                    <label className="block text-xs text-gray-500">Plan</label>
                    <select
                      name="plan_id"
                      defaultValue={sub?.plan_id ?? ""}
                      className="mt-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
                    >
                      <option value="">Sin plan</option>
                      {typedPlans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500">Estado</label>
                    <select
                      name="status"
                      defaultValue={sub?.status ?? "activa"}
                      className="mt-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
                    >
                      <option value="activa">Activa</option>
                      <option value="suspendida">Suspendida</option>
                      <option value="cancelada">Cancelada</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500">Inicio</label>
                    <input
                      name="start_date"
                      type="date"
                      required
                      defaultValue={sub?.start_date ?? new Date().toISOString().slice(0, 10)}
                      className="mt-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500">Fin (opcional)</label>
                    <input
                      name="end_date"
                      type="date"
                      defaultValue={sub?.end_date ?? ""}
                      className="mt-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
                    />
                  </div>
                  <div className="flex-1 min-w-[160px]">
                    <label className="block text-xs text-gray-500">Nota (opcional)</label>
                    <input
                      name="note"
                      type="text"
                      placeholder="motivo del cambio"
                      className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
                  >
                    Guardar
                  </button>
                </form>
              </div>
            );
          })}
          {typedAccounts.length === 0 && (
            <p className="text-sm text-gray-500">Aún no hay cuentas registradas.</p>
          )}
        </div>
      </section>
    </div>
  );
}
