import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const currency = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "DOP",
  maximumFractionDigits: 0,
});

type PublicPlan = {
  id: string;
  name: string;
  price_reference: number | null;
  billing_period: string;
  description: string | null;
  features: string[];
};

export default async function PreciosPage() {
  const supabase = await createClient();

  const { data: plans } = await supabase
    .from("subscription_plans")
    .select("id, name, price_reference, billing_period, description, features")
    .eq("is_public", true)
    .order("price_reference", { ascending: true, nullsFirst: true });

  const typedPlans = (plans ?? []) as PublicPlan[];

  return (
    <div className="min-h-screen bg-white px-6 py-16">
      <div className="mx-auto max-w-4xl text-center">
        <h1 className="text-3xl font-semibold text-gray-900">Planes</h1>
        <p className="mt-3 text-gray-500">
          Elige el plan que se ajuste a tu empresa. Puedes empezar hoy y
          activar el pago desde tu panel una vez creada tu cuenta.
        </p>
      </div>

      <div className="mx-auto mt-12 grid max-w-4xl gap-6 sm:grid-cols-2">
        {typedPlans.map((plan) => (
          <div
            key={plan.id}
            className="flex flex-col rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
          >
            <h2 className="text-lg font-semibold text-gray-900">{plan.name}</h2>
            {plan.description && (
              <p className="mt-1 text-sm text-gray-500">{plan.description}</p>
            )}
            <p className="mt-4 text-2xl font-semibold text-gray-900">
              {plan.price_reference != null
                ? currency.format(plan.price_reference)
                : "A cotizar"}
              {plan.price_reference != null && (
                <span className="text-sm font-normal text-gray-400">
                  {" "}
                  / {plan.billing_period}
                </span>
              )}
            </p>
            <ul className="mt-5 flex-1 space-y-2 text-left text-sm text-gray-600">
              {(plan.features ?? []).map((f, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 text-emerald-600">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/login"
              className="mt-6 rounded-md bg-gray-900 px-4 py-2 text-center text-sm font-medium text-white hover:bg-gray-800"
            >
              Comenzar
            </Link>
          </div>
        ))}
        {typedPlans.length === 0 && (
          <p className="col-span-2 text-sm text-gray-400">
            Aún no hay planes publicados.
          </p>
        )}
      </div>

      <p className="mx-auto mt-10 max-w-2xl text-center text-xs text-gray-400">
        El pago se confirma manualmente por ahora — al crear tu cuenta podrás
        solicitar el plan y ver las instrucciones para completar el pago.
      </p>
    </div>
  );
}
