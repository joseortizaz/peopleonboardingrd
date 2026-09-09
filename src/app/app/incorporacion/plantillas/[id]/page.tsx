import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/supabase/tenant";
import {
  addOnboardingTask,
  deleteOnboardingTemplate,
  deleteOnboardingTemplateTask,
} from "../actions";

const responsibleLabel: Record<string, string> = {
  rrhh: "RR.HH.",
  empleado: "Empleado",
};

export default async function OnboardingTemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/onboarding");

  const supabase = await createClient();

  const { data: template } = await supabase
    .from("onboarding_templates")
    .select("id, name, description")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (!template) notFound();

  const { data: tasks } = await supabase
    .from("onboarding_template_tasks")
    .select("id, title, description, days_offset, responsible")
    .eq("template_id", id)
    .order("days_offset", { ascending: true })
    .order("order_index", { ascending: true });

  const addTaskForTemplate = addOnboardingTask.bind(null, template.id);
  const removeTemplate = deleteOnboardingTemplate.bind(null, template.id);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link
        href="/app/incorporacion/plantillas"
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
        <h2 className="text-sm font-medium text-gray-700">Agregar tarea</h2>
        <form action={addTaskForTemplate} className="mt-3 flex flex-wrap gap-3">
          <input
            name="title"
            type="text"
            placeholder="Tarea (ej. Firmar contrato)"
            required
            className="min-w-[220px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            name="days_offset"
            type="number"
            min="0"
            defaultValue="0"
            className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm"
            title="Día del plan (0 = primer día)"
          />
          <select
            name="responsible"
            defaultValue="rrhh"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="rrhh">RR.HH.</option>
            <option value="empleado">Empleado</option>
          </select>
          <textarea
            name="description"
            placeholder="Detalle (opcional)"
            rows={1}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Agregar
          </button>
        </form>
        <p className="mt-2 text-xs text-gray-400">
          El día es relativo al inicio del proceso (ej. 0, 30, 60, 90 para un
          plan 30-60-90).
        </p>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Día</th>
              <th className="px-4 py-2">Tarea</th>
              <th className="px-4 py-2">Responsable</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(tasks ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                  Agrega al menos una tarea antes de usar esta plantilla.
                </td>
              </tr>
            )}
            {(tasks ?? []).map((t) => {
              const remove = deleteOnboardingTemplateTask.bind(
                null,
                template.id,
                t.id
              );
              return (
                <tr key={t.id}>
                  <td className="px-4 py-2 text-gray-600">Día {t.days_offset}</td>
                  <td className="px-4 py-2 text-gray-900">
                    {t.title}
                    {t.description && (
                      <p className="text-xs text-gray-500">{t.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {responsibleLabel[t.responsible] ?? t.responsible}
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
