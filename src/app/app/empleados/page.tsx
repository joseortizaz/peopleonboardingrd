import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, isManagerRole } from "@/lib/supabase/tenant";
import { createEmployee, deleteEmployee, updateEmployeeSalary } from "./actions";

const statusLabel: Record<string, string> = {
  active: "Activo",
  on_leave: "De permiso",
  terminated: "Baja",
};

const currency = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "DOP",
});

export default async function EmpleadosPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/onboarding");
  if (!isManagerRole(tenant.myRole)) redirect("/app/mi-espacio");

  const supabase = await createClient();

  const [{ data: employees }, { data: departments }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name, position, hire_date, status, department_id, email, monthly_salary")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("departments")
      .select("id, name")
      .eq("tenant_id", tenant.id),
  ]);

  const createEmployeeForTenant = createEmployee.bind(null, tenant.id);
  const departmentName = (id: string | null) =>
    departments?.find((d) => d.id === id)?.name ?? "—";

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-xl font-semibold text-gray-900">
        Empleados — {tenant.name}
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Registro base de colaboradores, para asignarlos a departamentos y evaluarlos.
      </p>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">Nuevo empleado</h2>
        <form
          action={createEmployeeForTenant}
          className="mt-3 flex flex-wrap gap-3"
        >
          <input
            name="full_name"
            type="text"
            placeholder="Nombre completo"
            required
            className="min-w-[200px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            name="email"
            type="email"
            placeholder="Correo (para su acceso de autoservicio)"
            className="min-w-[220px] rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <select
            name="department_id"
            defaultValue=""
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Sin departamento</option>
            {(departments ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <input
            name="position"
            type="text"
            placeholder="Puesto"
            className="min-w-[150px] rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            name="hire_date"
            type="date"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            name="monthly_salary"
            type="number"
            min="0"
            step="0.01"
            placeholder="Salario mensual (RD$)"
            className="min-w-[170px] rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Agregar
          </button>
        </form>
        <p className="mt-2 text-xs text-gray-400">
          El salario mensual es opcional al crear, pero es necesario para
          incluir al empleado en un periodo de nómina.
        </p>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Correo</th>
              <th className="px-4 py-2">Departamento</th>
              <th className="px-4 py-2">Puesto</th>
              <th className="px-4 py-2">Salario mensual</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(employees ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                  Aún no hay empleados registrados.
                </td>
              </tr>
            )}
            {(employees ?? []).map((e) => {
              const remove = deleteEmployee.bind(null, e.id);
              const updateSalary = updateEmployeeSalary.bind(null, e.id);
              return (
                <tr key={e.id}>
                  <td className="px-4 py-2 text-gray-900">{e.full_name}</td>
                  <td className="px-4 py-2 text-gray-600">{e.email ?? "—"}</td>
                  <td className="px-4 py-2 text-gray-600">
                    {departmentName(e.department_id)}
                  </td>
                  <td className="px-4 py-2 text-gray-600">{e.position ?? "—"}</td>
                  <td className="px-4 py-2 text-gray-600">
                    <form action={updateSalary} className="flex items-center gap-1">
                      <input
                        name="monthly_salary"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={e.monthly_salary ?? ""}
                        placeholder="Sin registrar"
                        className="w-28 rounded-md border border-gray-300 px-2 py-1 text-xs"
                      />
                      <button
                        type="submit"
                        className="text-xs text-gray-500 hover:text-gray-900 hover:underline"
                      >
                        Guardar
                      </button>
                    </form>
                    {e.monthly_salary != null && (
                      <p className="mt-0.5 text-xs text-gray-400">
                        {currency.format(Number(e.monthly_salary))}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {statusLabel[e.status] ?? e.status}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <form action={remove}>
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
  );
}
