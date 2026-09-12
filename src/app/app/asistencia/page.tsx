import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, isManagerRole } from "@/lib/supabase/tenant";
import {
  setEmployeeShiftDay,
  deleteEmployeeShiftDay,
  deleteTimeClockEntry,
} from "./actions";
import ViewPhotoLink from "./ViewPhotoLink";

const timeFmt = (t: string) => t.slice(0, 5);

const DAY_LABELS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

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

function mapsLink(lat: number | null, lng: number | null) {
  if (lat === null || lng === null) return null;
  return `https://maps.google.com/?q=${lat},${lng}`;
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

  const [{ data: employees }, { data: schedules }, { data: entries }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name")
      .eq("tenant_id", tenant.id)
      .eq("status", "active")
      .order("full_name", { ascending: true }),
    supabase
      .from("employee_shift_schedules")
      .select("employee_id, day_of_week, start_time, end_time, crosses_midnight, employees(full_name)")
      .eq("tenant_id", tenant.id)
      .order("day_of_week", { ascending: true }),
    supabase
      .from("time_clock_entries")
      .select(
        "id, clock_in, clock_out, is_late, clock_in_lat, clock_in_lng, clock_in_photo_path, clock_out_lat, clock_out_lng, clock_out_photo_path, employees(full_name)"
      )
      .eq("tenant_id", tenant.id)
      .gte("clock_in", thirtyDaysAgo.toISOString())
      .order("clock_in", { ascending: false })
      .limit(100),
  ]);

  const setShiftDayForTenant = setEmployeeShiftDay.bind(null, tenant.id);

  // Agrupa los horarios por empleado para mostrar los 7 dias juntos.
  const schedulesByEmployee = new Map<
    string,
    { name: string; days: NonNullable<typeof schedules>[number][] }
  >();
  for (const s of schedules ?? []) {
    const name =
      (s.employees as unknown as { full_name: string } | null)?.full_name ?? "—";
    const bucket = schedulesByEmployee.get(s.employee_id) ?? { name, days: [] };
    bucket.days.push(s);
    schedulesByEmployee.set(s.employee_id, bucket);
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-xl font-semibold text-gray-900">
        Asistencia y tiempo — {tenant.name}
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Horario semanal por empleado (turnos rotativos/nocturnos) y registro
        de marcaje web de los últimos 30 días, con geolocalización de
        referencia y foto obligatoria en cada marcaje.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">Horario por empleado y día</h2>
        <form action={setShiftDayForTenant} className="mt-3 flex flex-wrap items-end gap-3">
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
            <label className="block text-xs text-gray-500">Día</label>
            <select
              name="day_of_week"
              required
              defaultValue=""
              className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Seleccionar...
              </option>
              {DAY_LABELS.map((label, i) => (
                <option key={i} value={i}>
                  {label}
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
          <label className="flex items-center gap-1.5 pb-2 text-xs text-gray-600">
            <input type="checkbox" name="crosses_midnight" className="rounded border-gray-300" />
            Turno nocturno (cruza medianoche)
          </label>
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Guardar día
          </button>
        </form>
        <p className="mt-2 text-xs text-gray-400">
          Un horario por empleado y día de la semana — así se pueden armar
          turnos rotativos o nocturnos (ej. 22:00–06:00) en vez de un único
          horario fijo de lunes a viernes. Un día sin horario asignado nunca
          marca tardanza ese día. Se usa solo para marcar tardanzas en el
          marcaje, con 10 minutos de tolerancia sobre la hora de inicio.
        </p>

        {schedulesByEmployee.size > 0 && (
          <div className="mt-4 divide-y divide-gray-100 border-t border-gray-100">
            {Array.from(schedulesByEmployee.entries()).map(([employeeId, bucket]) => (
              <div key={employeeId} className="py-2">
                <p className="text-sm font-medium text-gray-900">{bucket.name}</p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  {bucket.days.map((d) => (
                    <span
                      key={d.day_of_week}
                      className="flex items-center gap-1.5 text-xs text-gray-500"
                    >
                      {DAY_LABELS[d.day_of_week]}: {timeFmt(d.start_time)}–{timeFmt(d.end_time)}
                      {d.crosses_midnight && (
                        <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
                          nocturno
                        </span>
                      )}
                      <form action={deleteEmployeeShiftDay.bind(null, employeeId, d.day_of_week)}>
                        <button className="text-red-500 hover:underline">Quitar</button>
                      </form>
                    </span>
                  ))}
                </div>
              </div>
            ))}
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
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Empleado</th>
                <th className="px-4 py-2">Entrada</th>
                <th className="px-4 py-2">Salida</th>
                <th className="px-4 py-2">Duración</th>
                <th className="px-4 py-2">Evidencia</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(entries ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                    Aún no hay marcajes registrados.
                  </td>
                </tr>
              )}
              {(entries ?? []).map((e) => {
                const name =
                  (e.employees as unknown as { full_name: string } | null)?.full_name ?? "—";
                const inMapsLink = mapsLink(e.clock_in_lat, e.clock_in_lng);
                const outMapsLink = mapsLink(e.clock_out_lat, e.clock_out_lng);
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
                    <td className="px-4 py-2">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          {e.clock_in_photo_path ? (
                            <ViewPhotoLink entryId={e.id} which="in" label="Foto entrada" />
                          ) : (
                            <span className="text-xs text-gray-300">Sin foto</span>
                          )}
                          {inMapsLink && (
                            <a
                              href={inMapsLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-gray-500 underline"
                            >
                              Ubicación
                            </a>
                          )}
                        </div>
                        {e.clock_out && (
                          <div className="flex items-center gap-2">
                            {e.clock_out_photo_path ? (
                              <ViewPhotoLink entryId={e.id} which="out" label="Foto salida" />
                            ) : (
                              <span className="text-xs text-gray-300">Sin foto</span>
                            )}
                            {outMapsLink && (
                              <a
                                href={outMapsLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-gray-500 underline"
                              >
                                Ubicación
                              </a>
                            )}
                          </div>
                        )}
                      </div>
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
