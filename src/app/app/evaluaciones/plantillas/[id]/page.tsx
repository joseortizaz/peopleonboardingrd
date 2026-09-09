import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/supabase/tenant";
import { addCompetency, deleteCompetency, deleteTemplate } from "../actions";

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/onboarding");

  const supabase = await createClient();

  const { data: template } = await supabase
    .from("evaluation_templates")
    .select("id, name, description")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (!template) notFound();

  const { data: competencies } = await supabase
    .from("template_competencies")
    .select("id, name, weight")
    .eq("template_id", id)
    .order("order_index", { ascending: true });

  const addCompetencyForTemplate = addCompetency.bind(null, template.id);
  const removeTemplate = deleteTemplate.bind(null, template.id);
  const totalWeight = (competencies ?? []).reduce(
    (sum, c) => sum + Number(c.weight),
    0
  );

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link
        href="/app/evaluaciones/plantillas"
        className="text-sm text-gray-500 hover:underline"
      >
        ← Plantillas
      </Link>
      <div className="mt-1 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">{template.name}</h1>
        <form action={removeTemplate}>
          <button className="text-xs text-red-600 hover:underline">
            Eliminar plantilla
          </button>
        </form>
      </div>
      {template.description && (
        <p className="mt-1 text-sm text-gray-500">{template.description}</p>
      )}

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">Agregar competencia</h2>
        <form action={addCompetencyForTemplate} className="mt-3 flex flex-wrap gap-3">
          <input
            name="name"
            type="text"
            placeholder="Nombre de la competencia"
            required
            className="min-w-[200px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            name="weight"
            type="number"
            min="0"
            step="0.5"
            defaultValue="1"
            placeholder="Peso"
            className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Agregar
          </button>
        </form>
        <p className="mt-2 text-xs text-gray-400">
          El peso es relativo entre competencias (no necesita sumar 100); el
          puntaje final se pondera automáticamente.
        </p>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Competencia</th>
              <th className="px-4 py-2">Peso</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(competencies ?? []).length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-500">
                  Agrega al menos una competencia antes de usar esta plantilla.
                </td>
              </tr>
            )}
            {(competencies ?? []).map((c) => {
              const remove = deleteCompetency.bind(null, template.id, c.id);
              return (
                <tr key={c.id}>
                  <td className="px-4 py-2 text-gray-900">{c.name}</td>
                  <td className="px-4 py-2 text-gray-600">
                    {c.weight} (
                    {totalWeight > 0
                      ? Math.round((Number(c.weight) / totalWeight) * 100)
                      : 0}
                    %)
                  </td>
                  <td className="px-4 py-2 text-right">
                    <form action={remove}>
                      <button className="text-xs text-red-600 hover:underline">
                        Eliminar
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
