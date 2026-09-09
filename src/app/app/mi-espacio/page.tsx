import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/supabase/tenant";

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

export default async function MiEspacioPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/onboarding");

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

  const { data: evaluations } = await supabase
    .from("evaluations")
    .select("id, type, status, overall_score, completed_at, evaluation_templates(name)")
    .eq("employee_id", employee.id)
    .eq("status", "completada")
    .order("completed_at", { ascending: false });

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
