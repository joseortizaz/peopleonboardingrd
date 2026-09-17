import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updatePlan, setPlanArchived } from "../../actions";

type Plan = {
  id: string;
  name: string;
  price_reference: number | null;
  billing_period: string;
  notes: string | null;
  is_public: boolean;
  description: string | null;
  features: string[] | null;
  plan_limits: { max_employees?: number | null; max_tenants?: number | null } | null;
  archived: boolean;
};

export default async function EditPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const { data: isSuperAdmin } = await supabase.rpc("is_super_admin");
  if (!isSuperAdmin) redirect("/app");

  const { data: plan } = await supabase
    .from("subscription_plans")
    .select(
      "id, name, price_reference, billing_period, notes, is_public, description, features, plan_limits, archived"
    )
    .eq("id", id)
    .maybeSingle();

  if (!plan) notFound();

  const typedPlan = plan as Plan;
  const save = updatePlan.bind(null, typedPlan.id);
  const toggleArchived = setPlanArchived.bind(null, typedPlan.id, !typedPlan.archived);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/app/superadmin" className="text-sm text-gray-500 hover:underline">
        ← Super Admin
      </Link>

      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">
          Editar plan: {typedPlan.name}
        </h1>
        {typedPlan.archived && (
          <span className="rounded-full bg-gray-200 px-3 py-1 text-xs font-medium text-gray-600">
            Archivado
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-gray-500">
        Estos cambios afectan lo que ven los clientes en /precios y en el
        checkout de /app/facturacion.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form action={save} className="mt-6 space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500">Nombre del plan</label>
            <input
              name="name"
              type="text"
              required
              defaultValue={typedPlan.name}
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500">Precio ref. (DOP)</label>
            <input
              name="price_reference"
              type="number"
              min="0"
              step="0.01"
              defaultValue={typedPlan.price_reference ?? ""}
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500">Periodo</label>
          <select
            name="billing_period"
            defaultValue={typedPlan.billing_period}
            className="mt-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="mensual">Mensual</option>
            <option value="anual">Anual</option>
          </select>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              name="is_public"
              type="checkbox"
              defaultChecked={typedPlan.is_public}
              className="rounded border-gray-300"
            />
            Público (visible en /precios y en el checkout de autoservicio)
          </label>
        </div>

        <div>
          <label className="block text-xs text-gray-500">Descripción</label>
          <textarea
            name="description"
            rows={2}
            defaultValue={typedPlan.description ?? ""}
            className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            placeholder="Una frase corta que resuma el plan"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500">
            Características (una por línea)
          </label>
          <textarea
            name="features"
            rows={4}
            defaultValue={(typedPlan.features ?? []).join("\n")}
            className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            placeholder={"Hasta 50 colaboradores\nSoporte por WhatsApp\n..."}
          />
          <p className="mt-1 text-xs text-gray-400">
            Solo informativas: se muestran en /precios pero no limitan nada
            por sí solas.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-4">
          <div>
            <label className="block text-xs text-gray-500">
              Límite de colaboradores
            </label>
            <input
              name="max_employees"
              type="number"
              min="0"
              step="1"
              defaultValue={typedPlan.plan_limits?.max_employees ?? ""}
              placeholder="Ilimitado"
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500">
              Límite de tenants/empresas
            </label>
            <input
              name="max_tenants"
              type="number"
              min="0"
              step="1"
              defaultValue={typedPlan.plan_limits?.max_tenants ?? ""}
              placeholder="Ilimitado"
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
        </div>
        <p className="-mt-3 text-xs text-gray-400">
          Deja en blanco para ilimitado. El límite de colaboradores se
          aplica al crear un nuevo colaborador. El límite de tenants aún no
          se aplica: hoy no existe una función para agregar empresas/tenants
          adicionales a una cuenta después de la creación inicial.
        </p>

        <div>
          <label className="block text-xs text-gray-500">
            Notas internas (no visibles para el cliente)
          </label>
          <textarea
            name="notes"
            rows={2}
            defaultValue={typedPlan.notes ?? ""}
            className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 pt-4">
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Guardar cambios
          </button>
        </div>
      </form>

      <form action={toggleArchived} className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-700">
          {typedPlan.archived
            ? "Este plan está archivado: no aparece en /precios ni en el checkout, aunque las cuentas que ya lo tienen asignado lo conservan."
            : "Archivar oculta el plan de /precios y del checkout de autoservicio. Las cuentas que ya lo tienen asignado no se ven afectadas."}
        </p>
        <button
          type="submit"
          className={`mt-3 rounded-md px-4 py-2 text-sm font-medium ${
            typedPlan.archived
              ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : "border border-red-300 text-red-700 hover:bg-red-50"
          }`}
        >
          {typedPlan.archived ? "Reactivar plan" : "Archivar plan"}
        </button>
      </form>
    </div>
  );
}
