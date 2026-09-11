import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createPlan, upsertSubscription } from "./actions";

const currency = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "DOP",
});

const dateFmt = (d: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("es-DO") : "—";

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

  const [{ data: accounts }, { data: plans }, { data: subs }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, kind, rnc, created_at")
      .order("created_at", { ascending: true }),
    supabase
      .from("subscription_plans")
      .select("id, name, price_reference, billing_period")
      .order("created_at", { ascending: true }),
    supabase
      .from("account_subscriptions")
      .select("id, account_id, plan_id, status, start_date, end_date, notes, updated_at"),
  ]);

  const typedAccounts = (accounts ?? []) as Account[];
  const typedPlans = (plans ?? []) as Plan[];
  const typedSubs = (subs ?? []) as Subscription[];
  const subByAccount = new Map(typedSubs.map((s) => [s.account_id, s]));
  const planById = new Map(typedPlans.map((p) => [p.id, p]));

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
        configura sus fechas de inicio/fin. Todavía no hay cobro recurrente
        automático — eso queda para cuando se integre CardNet, una vez haya
        al menos un cliente facturando.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

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
            </div>
          ))}
          {typedPlans.length === 0 && (
            <p className="text-xs text-gray-400">Aún no hay planes creados.</p>
          )}
        </div>

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
