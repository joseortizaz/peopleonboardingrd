import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, isManagerRole } from "@/lib/supabase/tenant";
import { createOnboardingTemplate } from "./actions";

export default async function OnboardingPlantillasPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/onboarding");
  if (!isManagerRole(tenant.myRole)) redirect("/app/mi-espacio");

  const supabase = await createClient();
  const { data: templates } = await supabase
    .from("onboarding_templates")
    .select("id, name, description, onboarding_template_tasks(count)")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false });

  const createTemplateForTenant = createOnboardingTemplate.bind(null, tenant.id);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/app/incorporacion" className="text-sm text-gray-500 hover:underline">
        ← Incorporación
      </Link>
      <h1 className="mt-1 text-xl font-semibold text-gray-900">
        Plantillas de incorporación
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Define un plan de tareas reutilizable (ej. 30-60-90 días) para
        asignarlo a cada nuevo ingreso.
      </p>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">Nueva plantilla</h2>
        <form action={createTemplateForTenant} className="mt-3 space-y-3">
          <input
            name="name"
            type="text"
            placeholder="Nombre (ej. Plan de incorporación estándar)"
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
          const taskCount = Array.isArray(t.onboarding_template_tasks)
            ? (t.onboarding_template_tasks[0] as { count: number } | undefined)
                ?.count ?? 0
            : 0;
          return (
            <Link
              key={t.id}
              href={`/app/incorporacion/plantillas/${t.id}`}
              className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-gray-300"
            >
              <p className="font-medium text-gray-900">{t.name}</p>
              <p className="text-xs text-gray-500">{taskCount} tarea(s)</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
