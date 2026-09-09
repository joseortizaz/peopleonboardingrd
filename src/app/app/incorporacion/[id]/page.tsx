import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/supabase/tenant";
import { deleteOnboardingProcess, toggleOnboardingTask } from "../actions";

const responsibleLabel: Record<string, string> = {
  rrhh: "RR.HH.",
  empleado: "Empleado",
};

const statusLabel: Record<string, string> = {
  en_progreso: "En progreso",
  completado: "Completado",
};

export default async function OnboardingProcessDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/onboarding");

  const supabase = await createClient();

  const { data: process } = await supabase
    .from("onboarding_processes")
    .select("id, status, started_at, template_name, employees(full_name)")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (!process) notFound();

  const { data: tasks } = await supabase
    .from("onboarding_tasks")
    .select("id, title, description, due_date, responsible, status")
    .eq("process_id", id)
    .order("due_date", { ascending: true })
    .order("order_index", { ascending: true });

  const employeeName =
    (process.employees as unknown as { full_name: string } | null)
      ?.full_name ?? "—";
  const removeProcess = deleteOnboardingProcess.bind(null, process.id);
  const revalidateTo = `/app/incorporacion/${process.id}`;

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/app/incorporacion" className="text-sm text-gray-500 hover:underline">
        ← Incorporación
      </Link>

      <div className="mt-1 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{employeeName}</h1>
          <p className="text-sm text-gray-500">
            {process.template_name ?? "—"} · Inicio {process.started_at}
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

      <div className="mt-6 space-y-2">
        {(tasks ?? []).length === 0 && (
          <p className="text-sm text-gray-500">Esta plantilla no tenía tareas.</p>
        )}
        {(tasks ?? []).map((t) => {
          const isDone = t.status === "completada";
          const toggle = toggleOnboardingTask.bind(
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
                <p className="mt-1 text-xs text-gray-400">
                  {t.due_date ? `Vence ${t.due_date}` : "Sin fecha"} ·{" "}
                  {responsibleLabel[t.responsible] ?? t.responsible}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
