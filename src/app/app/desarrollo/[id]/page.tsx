import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/supabase/tenant";
import {
  addDevelopmentGoal,
  deleteDevelopmentGoal,
  deleteDevelopmentPlan,
  updateDevelopmentGoalStatus,
} from "../actions";
import GoalStatusSelect from "../GoalStatusSelect";

const statusLabel: Record<string, string> = {
  en_progreso: "En progreso",
  completado: "Completado",
};

const goalStatusLabel: Record<string, string> = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  completado: "Completado",
};

const goalStatusClass: Record<string, string> = {
  pendiente: "bg-gray-100 text-gray-600",
  en_progreso: "bg-gray-900 text-white",
  completado: "bg-emerald-100 text-emerald-800",
};

const dateFmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("es-DO");

export default async function DevelopmentPlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/onboarding");

  const supabase = await createClient();

  const { data: plan } = await supabase
    .from("development_plans")
    .select("id, title, notes, status, created_at, employees(full_name)")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (!plan) notFound();

  const { data: goals } = await supabase
    .from("development_plan_goals")
    .select("id, description, target_date, status, order_index")
    .eq("plan_id", id)
    .order("target_date", { ascending: true })
    .order("order_index", { ascending: true });

  const employeeName =
    (plan.employees as unknown as { full_name: string } | null)?.full_name ?? "—";
  const removePlan = deleteDevelopmentPlan.bind(null, plan.id);
  const revalidateTo = `/app/desarrollo/${plan.id}`;

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/app/desarrollo" className="text-sm text-gray-500 hover:underline">
        ← Planes de desarrollo
      </Link>

      <div className="mt-1 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{employeeName}</h1>
          <p className="text-sm text-gray-500">{plan.title}</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              plan.status === "completado"
                ? "bg-emerald-100 text-emerald-800"
                : "bg-gray-900 text-white"
            }`}
          >
            {statusLabel[plan.status] ?? plan.status}
          </span>
          <form action={removePlan}>
            <button className="text-xs text-red-600 hover:underline">Eliminar</button>
          </form>
        </div>
      </div>

      {plan.notes && <p className="mt-3 text-sm text-gray-600">{plan.notes}</p>}

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">Agregar meta</h2>
        <form
          action={addDevelopmentGoal.bind(null, plan.id, revalidateTo)}
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <input
            name="description"
            type="text"
            required
            placeholder="Descripción de la meta"
            className="min-w-[220px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <div>
            <label className="block text-xs text-gray-500">Fecha objetivo</label>
            <input
              name="target_date"
              type="date"
              className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Agregar
          </button>
        </form>
      </div>

      <div className="mt-6 space-y-2">
        {(goals ?? []).length === 0 && (
          <p className="text-sm text-gray-500">Este plan todavía no tiene metas.</p>
        )}
        {(goals ?? []).map((g) => {
          const updateStatus = updateDevelopmentGoalStatus.bind(null, g.id, revalidateTo);
          const removeGoal = deleteDevelopmentGoal.bind(null, g.id, revalidateTo);
          return (
            <div
              key={g.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex-1">
                <p
                  className={`text-sm font-medium ${
                    g.status === "completado" ? "text-gray-400 line-through" : "text-gray-900"
                  }`}
                >
                  {g.description}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  {g.target_date ? `Vence ${dateFmt(g.target_date)}` : "Sin fecha objetivo"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    goalStatusClass[g.status] ?? "bg-gray-100 text-gray-600"
                  }`}
                >
                  {goalStatusLabel[g.status] ?? g.status}
                </span>
                <GoalStatusSelect action={updateStatus} defaultValue={g.status} />
                <form action={removeGoal}>
                  <button className="text-xs text-red-600 hover:underline">Eliminar</button>
                </form>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
