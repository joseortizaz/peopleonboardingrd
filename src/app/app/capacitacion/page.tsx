import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, isManagerRole } from "@/lib/supabase/tenant";
import { createCourse, deleteCourse, enrollEmployee, deleteEnrollment } from "./actions";

const statusLabel: Record<string, string> = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  completada: "Completada",
};

const statusClass: Record<string, string> = {
  pendiente: "bg-gray-100 text-gray-600",
  en_progreso: "bg-gray-900 text-white",
  completada: "bg-emerald-100 text-emerald-800",
};

const dateFmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("es-DO");
const dateTimeFmt = (d: string) => new Date(d).toLocaleDateString("es-DO");

const categorySuggestions = [
  "Liderazgo",
  "Seguridad ocupacional",
  "Servicio al cliente",
  "Ventas",
  "Técnico",
  "Cumplimiento",
];

export default async function CapacitacionPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/onboarding");
  if (!isManagerRole(tenant.myRole)) redirect("/app/mi-espacio");

  const supabase = await createClient();

  const [{ data: employees }, { data: courses }, { data: enrollments }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name")
      .eq("tenant_id", tenant.id)
      .eq("status", "active")
      .order("full_name", { ascending: true }),
    supabase
      .from("training_courses")
      .select("id, name, description, category, duration_hours, counts_toward_infotep")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("training_enrollments")
      .select(
        "id, due_date, status, completed_at, employee_id, employees(full_name), training_courses(name, category, duration_hours, counts_toward_infotep)"
      )
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false }),
  ]);

  const infotepHoursByEmployee = new Map<string, number>();
  (enrollments ?? []).forEach((e) => {
    const course = e.training_courses as unknown as {
      duration_hours: number;
      counts_toward_infotep: boolean;
    } | null;
    if (e.status === "completada" && course?.counts_toward_infotep) {
      infotepHoursByEmployee.set(
        e.employee_id,
        (infotepHoursByEmployee.get(e.employee_id) ?? 0) + Number(course.duration_hours)
      );
    }
  });

  const infotepRows = (employees ?? [])
    .map((e) => ({ id: e.id, name: e.full_name, hours: infotepHoursByEmployee.get(e.id) ?? 0 }))
    .filter((r) => r.hours > 0);

  const totalInfotepHours = infotepRows.reduce((acc, r) => acc + r.hours, 0);

  const createCourseForTenant = createCourse.bind(null, tenant.id);
  const enrollForTenant = enrollEmployee.bind(null, tenant.id);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-xl font-semibold text-gray-900">Capacitación — {tenant.name}</h1>
      <p className="mt-1 text-sm text-gray-500">
        Catálogo de cursos, inscripción de empleados y horas INFOTEP acumuladas.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">Catálogo de cursos</h2>
        <form action={createCourseForTenant} className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500">Nombre</label>
            <input
              name="name"
              type="text"
              required
              placeholder="Ej. Liderazgo de equipos"
              className="mt-1 min-w-[200px] rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500">Categoría</label>
            <input
              name="category"
              type="text"
              list="category-suggestions"
              placeholder="Ej. Liderazgo"
              className="mt-1 min-w-[160px] rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <datalist id="category-suggestions">
              {categorySuggestions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-xs text-gray-500">Duración (horas)</label>
            <input
              name="duration_hours"
              type="number"
              step="0.5"
              min="0"
              defaultValue="0"
              className="mt-1 w-28 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input name="counts_toward_infotep" type="checkbox" defaultChecked />
            Cuenta para INFOTEP
          </label>
          <input
            name="description"
            type="text"
            placeholder="Descripción (opcional)"
            className="min-w-[160px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Crear curso
          </button>
        </form>

        <div className="mt-4 divide-y divide-gray-100 border-t border-gray-100">
          {(courses ?? []).length === 0 && (
            <p className="py-3 text-sm text-gray-500">Aún no hay cursos en el catálogo.</p>
          )}
          {(courses ?? []).map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <div>
                <p className="font-medium text-gray-900">
                  {c.name}
                  {c.category && (
                    <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      {c.category}
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-500">
                  {c.duration_hours} hora(s)
                  {c.counts_toward_infotep ? " · cuenta para INFOTEP" : ""}
                  {c.description ? ` · ${c.description}` : ""}
                </p>
              </div>
              <form action={deleteCourse.bind(null, c.id)}>
                <button className="shrink-0 text-xs text-red-600 hover:underline">Eliminar</button>
              </form>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">Inscribir empleado a un curso</h2>
        <form action={enrollForTenant} className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500">Empleado</label>
            <select
              name="employee_id"
              required
              defaultValue=""
              className="mt-1 min-w-[160px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Seleccionar...
              </option>
              {(employees ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500">Curso</label>
            <select
              name="course_id"
              required
              defaultValue=""
              className="mt-1 min-w-[160px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Seleccionar...
              </option>
              {(courses ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500">Fecha límite (opcional)</label>
            <input
              name="due_date"
              type="date"
              className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Inscribir
          </button>
        </form>
        {(courses ?? []).length === 0 && (
          <p className="mt-2 text-xs text-amber-600">
            Crea al menos un curso en el catálogo antes de inscribir empleados.
          </p>
        )}
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-sm font-medium text-gray-700">Inscripciones</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {(enrollments ?? []).length === 0 && (
            <p className="px-6 py-6 text-center text-sm text-gray-500">
              Aún no hay empleados inscritos en cursos.
            </p>
          )}
          {(enrollments ?? []).map((e) => {
            const employeeName =
              (e.employees as unknown as { full_name: string } | null)?.full_name ?? "—";
            const course = e.training_courses as unknown as {
              name: string;
              category: string | null;
              duration_hours: number;
            } | null;
            return (
              <div key={e.id} className="flex items-center justify-between gap-3 px-6 py-4 text-sm">
                <div>
                  <p className="font-medium text-gray-900">
                    {employeeName} — {course?.name ?? "—"}
                  </p>
                  <p className="text-xs text-gray-500">
                    {course?.category ? `${course.category} · ` : ""}
                    {course?.duration_hours} hora(s)
                    {e.due_date ? ` · Vence ${dateFmt(e.due_date)}` : ""}
                    {e.completed_at ? ` · Completado ${dateTimeFmt(e.completed_at)}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      statusClass[e.status] ?? "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {statusLabel[e.status] ?? e.status}
                  </span>
                  {e.status === "completada" && (
                    <a
                      href={`/api/capacitacion/${e.id}/certificado`}
                      className="text-xs text-gray-600 hover:text-gray-900 hover:underline"
                    >
                      Certificado
                    </a>
                  )}
                  <form action={deleteEnrollment.bind(null, e.id)}>
                    <button className="text-xs text-red-600 hover:underline">Eliminar</button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-sm font-medium text-gray-700">Horas INFOTEP acumuladas</h2>
          <p className="text-xs text-gray-500">
            Suma de horas de cursos completados que cuentan para el reporte anual a INFOTEP, por
            empleado. Es un cálculo de referencia — verifica el detalle exacto que exige INFOTEP
            para tu reporte formal.
          </p>
        </div>
        <div className="px-6 py-4 text-sm">
          <p className="text-xs text-gray-500">Total del tenant</p>
          <p className="font-medium text-gray-900">{totalInfotepHours} hora(s)</p>
        </div>
        <div className="overflow-x-auto border-t border-gray-100">
          <table className="w-full min-w-[400px] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Empleado</th>
                <th className="px-4 py-2">Horas acumuladas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {infotepRows.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-6 text-center text-gray-500">
                    Aún no hay cursos completados que cuenten para INFOTEP.
                  </td>
                </tr>
              )}
              {infotepRows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 text-gray-900">{r.name}</td>
                  <td className="px-4 py-2 text-gray-600">{r.hours} hora(s)</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
