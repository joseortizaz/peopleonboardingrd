import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, isManagerRole } from "@/lib/supabase/tenant";
import { setEmployeeShift, deleteTimeClockEntry } from "./actions";

const timeFmt = (t: string) => t.slice(0, 5);

const dateTimeFmt = (d: string) =>
  new Date(d).toLocaleString("es-DO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

function formatDuration(clockIn: string, clockOut: string | null) {
  if (!clockOut) return "En curso";
  const ms = new Date(clockOut).getTime() - new Date(clockIn).getTime();
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.round((ms % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m`;
}

export default async function AsistenciaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/onboarding");
  if (!isManagerRole(tenant.myRole)) redirect("/app/mi-espacio");

  const supabase = await createClient();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [{ data: employees }, { data: shifts }, { data: entries }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name")
      .eq("tenant_id", tenant.id)
      .eq("status", "active")
      .order("full_name", { ascending: true }),
    supabase
      .from("employee_shifts")
      .select("employee_id, start_time, end_time, employees(full_name)")
      .eq("tenant_id", tenant.id),
    supabase
      .from("time_clock_entries")
      .select("id, clock_in, clock_out, is_late, employees(full_name)")
      .eq("tenant_id", tenant.id)
      .gte("clock_in", thirtyDaysAgo.toISOString())
      .order("clock_in", { ascending: false })
      .limit(100),
  ]);

  const setShiftForTenant = setEmployeeShift.bind(null, tenant.id);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-xl font-semibold text-gray-900">
        Asistencia y tiempo — {tenant.name}
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Horarios por empleado y registro de marcaje web de los últimos 30 días.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">Horario por empleado</h2>
        <form action={setShiftForTenant} className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500">Empleado</label>
            <select
              name="employee_id"
              required
              defaultValue=""
              className="mt-1 min-w-[180px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
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
            <label className="block text-xs text-gray-500">Hora de inicio</label>
            <input
              name="start_time"
              type="time"
              required
              className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500">Hora de fin</label>
            <input
              name="end_time"
              type="time"
              required
              className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Guardar horario
          </button>
        </form>
        <p className="mt-2 text-xs text-gray-400">
          Horario fijo de lunes a viernes (v1 no contempla turnos rotativos ni
          nocturnos que crucen medianoche). Se usa solo para marcar tardanzas
          en el marcaje, con 10 minutos de tolerancia.
        </p>

        {(shifts ?? []).length > 0 && (
          <div className="mt-4 divide-y divide-gray-100 border-t border-gray-100">
            {(shifts ?? []).map((s) => {
              const name =
                (s.employees as unknown as { full_name: string } | null)?.full_name ?? "—";
              return (
                <div key={s.employee_id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-gray-900">{name}</span>
                  <span className="text-gray-500">
                    {timeFmt(s.start_time)} – {timeFmt(s.end_time)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-sm font-medium text-gray-700">
            Marcaje (últimos 30 días)
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Empleado</th>
                <th className="px-4 py-2">Entrada</th>
                <th className="px-4 py-2">Salida</th>
                <th className="px-4 py-2">Duración</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(entries ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                    Aún no hay marcajes registrados.
                  </td>
                </tr>
              )}
              {(entries ?? []).map((e) => {
                const name =
                  (e.employees as unknown as { full_name: string } | null)?.full_name ?? "—";
                return (
                  <tr key={e.id}>
                    <td className="px-4 py-2 text-gray-900">{name}</td>
                    <td className="px-4 py-2 text-gray-600">
                      {dateTimeFmt(e.clock_in)}
                      {e.is_late && (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                          Tardanza
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {e.clock_out ? dateTimeFmt(e.clock_out) : "—"}
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {formatDuration(e.clock_in, e.clock_out)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <form action={deleteTimeClockEntry.bind(null, e.id)}>
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
    </div>
  );
}
