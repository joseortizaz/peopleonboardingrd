import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/supabase/tenant";
import { createTemplate } from "./actions";

export default async function PlantillasPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/onboarding");

  const supabase = await createClient();
  const { data: templates } = await supabase
    .from("evaluation_templates")
    .select("id, name, description, template_competencies(count)")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false });

  const createTemplateForTenant = createTemplate.bind(null, tenant.id);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/app/evaluaciones" className="text-sm text-gray-500 hover:underline">
        ← Evaluaciones
      </Link>
      <h1 className="mt-1 text-xl font-semibold text-gray-900">
        Plantillas de evaluación
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Define competencias reutilizables para tus evaluaciones de 90°, 180° o 360°.
      </p>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">Nueva plantilla</h2>
        <form action={createTemplateForTenant} className="mt-3 space-y-3">
          <input
            name="name"
            type="text"
            placeholder="Nombre (ej. Evaluación de desempeño — Ventas)"
            required
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <textarea
            name="description"
            placeholder="Descripción (opcional)"
            rows={2}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Crear plantilla
          </button>
        </form>
      </div>

      <div className="mt-6 space-y-3">
        {(templates ?? []).length === 0 && (
          <p className="text-sm text-gray-500">Aún no hay plantillas.</p>
        )}
        {(templates ?? []).map((t) => {
          const competencyCount = Array.isArray(t.template_competencies)
            ? (t.template_competencies[0] as { count: number } | undefined)
                ?.count ?? 0
            : 0;
          return (
            <Link
              key={t.id}
              href={`/app/evaluaciones/plantillas/${t.id}`}
              className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-gray-300"
            >
              <p className="font-medium text-gray-900">{t.name}</p>
              <p className="text-xs text-gray-500">
                {competencyCount} competencia(s)
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
