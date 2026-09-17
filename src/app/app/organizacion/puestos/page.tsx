import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, isManagerRole } from "@/lib/supabase/tenant";
import { createJobPosition, deleteJobPosition, updateJobPosition } from "./actions";

type JobPosition = {
  id: string;
  title: string;
  mission: string | null;
  department_id: string | null;
};

export default async function PuestosPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: errorMessage } = await searchParams;
  const tenant = await getCurrentTenant();

  if (!tenant) {
    redirect("/app/onboarding");
  }
  if (!isManagerRole(tenant.myRole)) {
    redirect("/app/mi-espacio");
  }

  const supabase = await createClient();

  const [{ data: positions, error }, { data: departments }, { data: employees }] =
    await Promise.all([
      supabase
        .from("job_positions")
        .select("id, title, mission, department_id")
        .eq("tenant_id", tenant.id)
        .order("title", { ascending: true }),
      supabase
        .from("departments")
        .select("id, name")
        .eq("tenant_id", tenant.id),
      supabase
        .from("employees")
        .select("job_position_id")
        .eq("tenant_id", tenant.id)
        .not("job_position_id", "is", null),
    ]);

  if (error) {
    console.error("puestos load error:", error.message);
  }

  const allDepartments = departments ?? [];
  const allPositions: JobPosition[] = positions ?? [];
  const employeeCountByPosition = new Map<string, number>();
  for (const e of employees ?? []) {
    if (!e.job_position_id) continue;
    employeeCountByPosition.set(
      e.job_position_id,
      (employeeCountByPosition.get(e.job_position_id) ?? 0) + 1
    );
  }

  const departmentName = (id: string | null) =>
    allDepartments.find((d) => d.id === id)?.name ?? "—";

  const createPositionForTenant = createJobPosition.bind(null, tenant.id);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Catálogo de puestos — {tenant.name}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Puestos de tu empresa, independientes de los departamentos. Un
            empleado se asigna a un puesto desde{" "}
            <Link href="/app/empleados" className="underline">
              Empleados
            </Link>
            .
          </p>
        </div>
        <Link
          href="/app/organizacion"
          className="text-sm text-blue-600 hover:underline"
        >
          Ver departamentos
        </Link>
      </div>

      {errorMessage && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">Nuevo puesto</h2>
        <form action={createPositionForTenant} className="mt-3 flex flex-wrap gap-3">
          <input
            name="title"
            type="text"
            placeholder="Título del puesto"
            required
            className="min-w-[200px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <select
            name="department_id"
            defaultValue=""
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Sin departamento</option>
            {allDepartments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Agregar
          </button>
        </form>
        <p className="mt-2 text-xs text-gray-400">
          La misión del puesto se puede completar después, al editarlo.
        </p>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        {allPositions.length === 0 ? (
          <p className="px-2 py-4 text-sm text-gray-500">
            Aún no hay puestos. Crea el primero arriba.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {allPositions.map((p) => {
              const updateAction = updateJobPosition.bind(null, tenant.id, p.id);
              const deleteAction = deleteJobPosition.bind(null, p.id);
              const employeeCount = employeeCountByPosition.get(p.id) ?? 0;

              return (
                <li key={p.id} className="px-2 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <details className="flex-1">
                      <summary className="cursor-pointer list-none text-sm text-gray-900">
                        {p.title}
                        <span className="ml-2 text-xs text-gray-400">
                          {departmentName(p.department_id)}
                        </span>
                        {employeeCount > 0 && (
                          <span className="ml-2 text-xs text-gray-400">
                            · {employeeCount}{" "}
                            {employeeCount === 1 ? "empleado" : "empleados"}
                          </span>
                        )}
                        <span className="ml-2 text-xs text-blue-600 hover:underline">
                          Editar
                        </span>
                      </summary>
                      <form
                        action={updateAction}
                        className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-gray-50 p-3"
                      >
                        <input
                          name="title"
                          type="text"
                          defaultValue={p.title}
                          required
                          className="min-w-[160px] flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                        />
                        <select
                          name="department_id"
                          defaultValue={p.department_id ?? ""}
                          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm"
                        >
                          <option value="">Sin departamento</option>
                          {allDepartments.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                        <textarea
                          name="mission"
                          defaultValue={p.mission ?? ""}
                          placeholder="Misión del puesto (opcional)"
                          rows={2}
                          className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                        />
                        <button
                          type="submit"
                          className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
                        >
                          Guardar
                        </button>
                      </form>
                    </details>
                    <form action={deleteAction}>
                      <button
                        type="submit"
                        className="text-xs text-red-600 hover:underline"
                      >
                        Eliminar
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
