import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/supabase/tenant";
import { toggleOnboardingTask } from "../incorporacion/actions";
import DownloadDocumentButton from "../documentos/DownloadDocumentButton";
import {
  clockInAction,
  clockOutAction,
  requestLeaveAction,
  cancelLeaveRequestAction,
} from "../asistencia/actions";
import { updateEnrollmentStatus } from "../capacitacion/actions";
import EnrollmentStatusSelect from "../capacitacion/EnrollmentStatusSelect";

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

const leaveTypeLabel: Record<string, string> = {
  vacaciones: "Vacaciones",
  permiso: "Permiso",
};

const leaveStatusLabel: Record<string, string> = {
  pendiente: "Pendiente",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
};

const leaveStatusClass: Record<string, string> = {
  pendiente: "bg-gray-900 text-white",
  aprobada: "bg-emerald-100 text-emerald-800",
  rechazada: "bg-red-100 text-red-700",
};

const dateTimeFmt = (d: string) =>
  new Date(d).toLocaleString("es-DO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const benefitCategoryLabel: Record<string, string> = {
  ars: "ARS",
  seguro_vida: "Seguro de vida",
  vale_alimentacion: "Vale de alimentación",
  convenio: "Convenio",
  otro: "Otro",
};

const dependentRelationshipLabel: Record<string, string> = {
  conyuge: "Cónyuge",
  hijo: "Hijo",
  hija: "Hija",
  padre: "Padre",
  madre: "Madre",
  otro: "Otro",
};

const currency = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "DOP",
});

const trainingStatusLabel: Record<string, string> = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  completada: "Completada",
};

const trainingStatusClass: Record<string, string> = {
  pendiente: "bg-gray-100 text-gray-600",
  en_progreso: "bg-gray-900 text-white",
  completada: "bg-emerald-100 text-emerald-800",
};

export default async function MiEspacioPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
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

  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: evaluations },
    { data: onboardingProcess },
    { data: myDocuments },
    { data: timeEntries },
    { data: vacationBalanceRows },
    { data: myLeaveRequests },
    { data: myBenefits },
    { data: myEnrollments },
  ] = await Promise.all([
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
    supabase
      .from("time_clock_entries")
      .select("id, clock_in, clock_out, is_late")
      .eq("employee_id", employee.id)
      .order("clock_in", { ascending: false })
      .limit(7),
    supabase.rpc("get_vacation_balance", { p_employee_id: employee.id }),
    supabase
      .from("leave_requests")
      .select("id, type, start_date, end_date, days_requested, reason, status, decision_notes")
      .eq("employee_id", employee.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("employee_benefits")
      .select(
        "id, start_date, end_date, benefit_types(name, category, provider, employer_cost, employee_cost)"
      )
      .eq("employee_id", employee.id)
      .or(`end_date.is.null,end_date.gte.${today}`)
      .order("start_date", { ascending: false }),
    supabase
      .from("training_enrollments")
      .select(
        "id, due_date, status, completed_at, training_courses(name, category, duration_hours)"
      )
      .eq("employee_id", employee.id)
      .order("created_at", { ascending: false }),
  ]);

  const myBenefitIds = (myBenefits ?? []).map((b) => b.id);
  const { data: myBenefitDependents } = myBenefitIds.length
    ? await supabase
        .from("benefit_dependents")
        .select("id, employee_benefit_id, full_name, relationship")
        .in("employee_benefit_id", myBenefitIds)
    : { data: [] as { id: string; employee_benefit_id: string; full_name: string; relationship: string }[] };

  const vacationBalance = vacationBalanceRows?.[0] ?? {
    accrued: 0,
    used: 0,
    available: 0,
  };
  const currentlyClockedIn = !!(timeEntries ?? [])[0] && !(timeEntries ?? [])[0].clock_out;

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

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

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

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-700">Marcaje</h2>
          {currentlyClockedIn ? (
            <form action={clockOutAction.bind(null, tenant.id, "/app/mi-espacio")}>
              <button className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
                Marcar salida
              </button>
            </form>
          ) : (
            <form action={clockInAction.bind(null, tenant.id, "/app/mi-espacio")}>
              <button className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
                Marcar entrada
              </button>
            </form>
          )}
        </div>
        <div className="mt-3 divide-y divide-gray-100">
          {(timeEntries ?? []).length === 0 && (
            <p className="py-3 text-sm text-gray-500">Aún no tienes marcajes.</p>
          )}
          {(timeEntries ?? []).map((t) => (
            <div key={t.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-gray-900">
                {dateTimeFmt(t.clock_in)}
                {t.is_late && (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    Tardanza
                  </span>
                )}
              </span>
              <span className="text-gray-500">
                {t.clock_out ? `→ ${dateTimeFmt(t.clock_out)}` : "En curso"}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">Vacaciones y permisos</h2>
        <p className="mt-1 text-xs text-gray-500">
          Balance de vacaciones: {vacationBalance.accrued} día(s) acumulados −{" "}
          {vacationBalance.used} usado(s) ={" "}
          <span className="font-medium text-gray-900">
            {vacationBalance.available} disponible(s)
          </span>
        </p>

        <form
          action={requestLeaveAction.bind(null, tenant.id)}
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <div>
            <label className="block text-xs text-gray-500">Tipo</label>
            <select
              name="type"
              defaultValue="vacaciones"
              className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="vacaciones">Vacaciones</option>
              <option value="permiso">Permiso</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500">Desde</label>
            <input
              name="start_date"
              type="date"
              required
              className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500">Hasta</label>
            <input
              name="end_date"
              type="date"
              required
              className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <input
            name="reason"
            type="text"
            placeholder="Motivo (obligatorio en permisos)"
            className="min-w-[200px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Solicitar
          </button>
        </form>

        <div className="mt-4 divide-y divide-gray-100 border-t border-gray-100">
          {(myLeaveRequests ?? []).length === 0 && (
            <p className="py-3 text-sm text-gray-500">Aún no tienes solicitudes.</p>
          )}
          {(myLeaveRequests ?? []).map((r) => (
            <div key={r.id} className="flex items-start justify-between gap-3 py-3">
              <div>
                <p className="text-sm text-gray-900">
                  {leaveTypeLabel[r.type] ?? r.type} · {dateFmt(r.start_date)} →{" "}
                  {dateFmt(r.end_date)} ({r.days_requested} día(s))
                </p>
                {r.reason && <p className="text-xs text-gray-500">{r.reason}</p>}
                {r.decision_notes && (
                  <p className="text-xs text-gray-400">Nota: {r.decision_notes}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    leaveStatusClass[r.status] ?? "bg-gray-100 text-gray-600"
                  }`}
                >
                  {leaveStatusLabel[r.status] ?? r.status}
                </span>
                {r.status === "pendiente" && (
                  <form action={cancelLeaveRequestAction.bind(null, r.id)}>
                    <button className="text-xs text-red-600 hover:underline">
                      Cancelar
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-sm font-medium text-gray-700">Mis beneficios</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {(myBenefits ?? []).length === 0 && (
            <p className="px-6 py-6 text-center text-sm text-gray-500">
              No tienes beneficios activos asignados.
            </p>
          )}
          {(myBenefits ?? []).map((b) => {
            const benefit = b.benefit_types as unknown as {
              name: string;
              category: string;
              provider: string | null;
              employer_cost: number;
              employee_cost: number;
            } | null;
            const deps = (myBenefitDependents ?? []).filter(
              (d) => d.employee_benefit_id === b.id
            );
            return (
              <div key={b.id} className="px-6 py-4">
                <p className="text-sm font-medium text-gray-900">
                  {benefit?.name ?? "—"}{" "}
                  <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                    {benefitCategoryLabel[benefit?.category ?? "otro"]}
                  </span>
                </p>
                <p className="text-xs text-gray-500">
                  {benefit?.provider ? `${benefit.provider} · ` : ""}Aporte empresa{" "}
                  {currency.format(benefit?.employer_cost ?? 0)} · Mi aporte{" "}
                  {currency.format(benefit?.employee_cost ?? 0)} · Desde {dateFmt(b.start_date)}
                </p>
                {deps.length > 0 && (
                  <p className="mt-1 text-xs text-gray-400">
                    Dependientes:{" "}
                    {deps
                      .map(
                        (d) =>
                          `${d.full_name} (${dependentRelationshipLabel[d.relationship] ?? d.relationship})`
                      )
                      .join(", ")}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-sm font-medium text-gray-700">Mis cursos</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {(myEnrollments ?? []).length === 0 && (
            <p className="px-6 py-6 text-center text-sm text-gray-500">
              No tienes cursos asignados.
            </p>
          )}
          {(myEnrollments ?? []).map((en) => {
            const course = en.training_courses as unknown as {
              name: string;
              category: string | null;
              duration_hours: number;
            } | null;
            const updateStatus = updateEnrollmentStatus.bind(null, en.id, "/app/mi-espacio");
            return (
              <div key={en.id} className="flex items-center justify-between gap-3 px-6 py-4 text-sm">
                <div>
                  <p className="font-medium text-gray-900">
                    {course?.name ?? "—"}
                    {course?.category && (
                      <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        {course.category}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    {course?.duration_hours} hora(s)
                    {en.due_date ? ` · Vence ${dateFmt(en.due_date)}` : ""}
                    {en.completed_at
                      ? ` · Certificado: completado el ${new Date(en.completed_at).toLocaleDateString("es-DO")}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      trainingStatusClass[en.status] ?? "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {trainingStatusLabel[en.status] ?? en.status}
                  </span>
                  <EnrollmentStatusSelect action={updateStatus} defaultValue={en.status} />
                </div>
              </div>
            );
          })}
        </div>
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
