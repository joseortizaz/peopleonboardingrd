import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/supabase/tenant";
import { toggleOnboardingTask } from "../incorporacion/actions";
import DownloadDocumentButton from "../documentos/DownloadDocumentButton";

function expirationBadge(expiresAt: string | null) {
  if (!expiresAt) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expiresAt + "T00:00:00");
  const diffDays = Math.round((exp.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) {
    return { label: "Vencido", className: "bg-red-100 text-red-700" };
  }
  if (diffDays <= 30) {
    return { label: "Por vencer", className: "bg-amber-100 text-amber-700" };
  }
  return { label: "Vigente", className: "bg-emerald-100 text-emerald-700" };
}

const dateFmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("es-DO");

const statusLabel: Record<string, string> = {
  active: "Activo",
  on_leave: "De permiso",
  terminated: "Baja",
};

const typeLabel: Record<string, string> = {
  "90": "90°",
  "180": "180°",
  "360": "360°",
};

const onboardingStatusLabel: Record<string, string> = {
  en_progreso: "En progreso",
  completado: "Completado",
};

export default async function MiEspacioPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/onboarding");
  if (tenant.myRole === "client") redirect("/app/portal-cliente");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: employee } = await supabase
    .from("employees")
    .select("id, full_name, email, position, hire_date, status, department_id")
    .eq("tenant_id", tenant.id)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!employee) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-xl font-semibold text-gray-900">Mi espacio</h1>
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          Tu cuenta aún no está vinculada a un registro de empleado en{" "}
          <strong>{tenant.name}</strong>. Pídele a Recursos Humanos que
          registre tu correo (
          <span className="font-mono">{user.email}</span>) en el módulo de
          Empleados para activar tu acceso.
        </div>
      </div>
    );
  }

  const department = employee.department_id
    ? (
        await supabase
          .from("departments")
          .select("name")
          .eq("id", employee.department_id)
          .maybeSingle()
      ).data
    : null;

  const [{ data: evaluations }, { data: onboardingProcess }, { data: myDocuments }] =
    await Promise.all([
      supabase
        .from("evaluations")
        .select("id, type, status, overall_score, completed_at, evaluation_templates(name)")
        .eq("employee_id", employee.id)
        .eq("status", "completada")
        .order("completed_at", { ascending: false }),
      supabase
        .from("onboarding_processes")
        .select("id, status, started_at, template_name")
        .eq("employee_id", employee.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("employee_documents")
        .select("id, doc_type, file_name, expires_at")
        .eq("employee_id", employee.id)
        .order("created_at", { ascending: false }),
    ]);

  const onboardingTasks = onboardingProcess
    ? (
        await supabase
          .from("onboarding_tasks")
          .select("id, title, description, due_date, responsible, status")
          .eq("process_id", onboardingProcess.id)
          .order("due_date", { ascending: true })
          .order("order_index", { ascending: true })
      ).data
    : null;

  const revalidateTo = "/app/mi-espacio";

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-xl font-semibold text-gray-900">Mi espacio</h1>
      <p className="mt-1 text-sm text-gray-500">{tenant.name}</p>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">Mi ficha</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-gray-500">Nombre</dt>
          <dd className="text-gray-900">{employee.full_name}</dd>
          <dt className="text-gray-500">Correo</dt>
          <dd className="text-gray-900">{employee.email ?? "—"}</dd>
          <dt className="text-gray-500">Departamento</dt>
          <dd className="text-gray-900">{department?.name ?? "—"}</dd>
          <dt className="text-gray-500">Puesto</dt>
          <dd className="text-gray-900">{employee.position ?? "—"}</dd>
          <dt className="text-gray-500">Fecha de ingreso</dt>
          <dd className="text-gray-900">{employee.hire_date ?? "—"}</dd>
          <dt className="text-gray-500">Estado</dt>
          <dd className="text-gray-900">
            {statusLabel[employee.status] ?? employee.status}
          </dd>
        </dl>
      </div>

      {onboardingProcess && (
        <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div>
              <h2 className="text-sm font-medium text-gray-700">
                Mi plan de incorporación
              </h2>
              <p className="text-xs text-gray-500">
                {onboardingProcess.template_name ?? "—"} · Inicio{" "}
                {onboardingProcess.started_at}
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                onboardingProcess.status === "completado"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-gray-900 text-white"
              }`}
            >
              {onboardingStatusLabel[onboardingProcess.status] ??
                onboardingProcess.status}
            </span>
          </div>
          <div className="divide-y divide-gray-100">
            {(onboardingTasks ?? []).map((t) => {
              const isDone = t.status === "completada";
              const canToggle = t.responsible === "empleado";
              const toggle = toggleOnboardingTask.bind(
                null,
                t.id,
                isDone ? "pendiente" : "completada",
                revalidateTo
              );
              return (
                <div key={t.id} className="flex items-start gap-3 px-6 py-4">
                  {canToggle ? (
                    <form action={toggle} className="pt-0.5">
                      <button
                        type="submit"
                        aria-label={
                          isDone ? "Marcar como pendiente" : "Marcar como completada"
                        }
                        className={`flex h-5 w-5 items-center justify-center rounded border text-xs ${
                          isDone
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : "border-gray-300 bg-white text-transparent"
                        }`}
                      >
                        ✓
                      </button>
                    </form>
                  ) : (
                    <span
                      className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded border text-xs ${
                        isDone
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-gray-200 bg-gray-50 text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                  )}
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
                      {t.due_date ? `Vence ${t.due_date}` : "Sin fecha"}
                      {!canToggle && " · A cargo de RR.HH."}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-sm font-medium text-gray-700">Mis documentos</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {(myDocuments ?? []).length === 0 && (
            <p className="px-6 py-6 text-center text-sm text-gray-500">
              Aún no tienes documentos cargados en tu expediente.
            </p>
          )}
          {(myDocuments ?? []).map((d) => {
            const badge = expirationBadge(d.expires_at);
            return (
              <div
                key={d.id}
                className="flex items-center justify-between px-6 py-4"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {d.doc_type}
                  </p>
                  <p className="text-xs text-gray-500">
                    {d.file_name}
                    {d.expires_at && (
                      <>
                        {" · "}
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge?.className}`}
                        >
                          {badge?.label}
                        </span>{" "}
                        {dateFmt(d.expires_at)}
                      </>
                    )}
                  </p>
                </div>
                <DownloadDocumentButton documentId={d.id} />
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-sm font-medium text-gray-700">
            Mis evaluaciones de desempeño
          </h2>
        </div>
        <div className="divide-y divide-gray-100">
          {(evaluations ?? []).length === 0 && (
            <p className="px-6 py-6 text-center text-sm text-gray-500">
              Aún no tienes evaluaciones completadas.
            </p>
          )}
          {(evaluations ?? []).map((ev) => {
            const templateName =
              (ev.evaluation_templates as unknown as { name: string } | null)
                ?.name ?? "—";
            return (
              <Link
                key={ev.id}
                href={`/app/mi-espacio/evaluaciones/${ev.id}`}
                className="flex items-center justify-between px-6 py-4 hover:bg-gray-50"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {templateName}
                  </p>
                  <p className="text-xs text-gray-500">
                    Evaluación {typeLabel[ev.type] ?? ev.type} ·{" "}
                    {ev.completed_at
                      ? new Date(ev.completed_at).toLocaleDateString("es-DO")
                      : "—"}
                  </p>
                </div>
                {ev.overall_score !== null && (
                  <span className="rounded-full bg-gray-900 px-3 py-1 text-sm font-medium text-white">
                    {ev.overall_score}/5
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
