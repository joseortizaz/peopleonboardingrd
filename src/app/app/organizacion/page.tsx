import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, isManagerRole } from "@/lib/supabase/tenant";
import { createDepartment, deleteDepartment, updateDepartment } from "./actions";

type Department = {
  id: string;
  name: string;
  parent_department_id: string | null;
};

type DeptTree = Department & { children: DeptTree[] };

function buildTree(departments: Department[], parentId: string | null): DeptTree[] {
  return departments
    .filter((d) => d.parent_department_id === parentId)
    .map((d) => ({ ...d, children: buildTree(departments, d.id) }));
}

function getDescendantIds(departments: Department[], id: string): string[] {
  const children = departments.filter((d) => d.parent_department_id === id);
  return children.flatMap((c) => [c.id, ...getDescendantIds(departments, c.id)]);
}

function DepartmentNode({
  node,
  depth,
  allDepartments,
  tenantId,
}: {
  node: DeptTree;
  depth: number;
  allDepartments: Department[];
  tenantId: string;
}) {
  const excluded = new Set([node.id, ...getDescendantIds(allDepartments, node.id)]);
  const parentOptions = allDepartments.filter((d) => !excluded.has(d.id));
  const updateAction = updateDepartment.bind(null, tenantId, node.id);
  const deleteAction = deleteDepartment.bind(null, node.id);

  return (
    <li>
      <div
        className="flex items-center justify-between gap-3 rounded-md px-3 py-2 hover:bg-gray-50"
        style={{ marginLeft: depth * 20 }}
      >
        <details className="flex-1">
          <summary className="cursor-pointer list-none text-sm text-gray-900">
            {node.name}
            <span className="ml-2 text-xs text-blue-600 hover:underline">
              Editar
            </span>
          </summary>
          <form
            action={updateAction}
            className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-gray-50 p-3"
          >
            <input
              name="name"
              type="text"
              defaultValue={node.name}
              required
              className="flex-1 min-w-[160px] rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            />
            <select
              name="parent_department_id"
              defaultValue={node.parent_department_id ?? ""}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm"
            >
              <option value="">Sin padre (nivel raíz)</option>
              {parentOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
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
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <DepartmentNode
              key={child.id}
              node={child}
              depth={depth + 1}
              allDepartments={allDepartments}
              tenantId={tenantId}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export default async function OrganizacionPage({
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
  const { data: departments, error } = await supabase
    .from("departments")
    .select("id, name, parent_department_id")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("organizacion load error:", error.message);
  }

  const allDepartments = departments ?? [];
  const tree = buildTree(allDepartments, null);
  const createDepartmentForTenant = createDepartment.bind(null, tenant.id);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-xl font-semibold text-gray-900">
        Estructura organizacional — {tenant.name}
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Departamentos de tu empresa. Puedes anidarlos eligiendo un departamento padre.
      </p>

      {errorMessage && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">Nuevo departamento</h2>
        <form action={createDepartmentForTenant} className="mt-3 flex flex-wrap gap-3">
          <input
            name="name"
            type="text"
            placeholder="Nombre del departamento"
            required
            className="flex-1 min-w-[200px] rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <select
            name="parent_department_id"
            defaultValue=""
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Sin padre (nivel raíz)</option>
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
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        {tree.length === 0 ? (
          <p className="px-2 py-4 text-sm text-gray-500">
            Aún no hay departamentos. Crea el primero arriba.
          </p>
        ) : (
          <ul>
            {tree.map((node) => (
              <DepartmentNode
                key={node.id}
                node={node}
                depth={0}
                allDepartments={allDepartments}
                tenantId={tenant.id}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
