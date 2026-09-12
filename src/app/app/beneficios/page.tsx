import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, isManagerRole } from "@/lib/supabase/tenant";
import {
  createBenefitType,
  deleteBenefitType,
  assignBenefit,
  endAssignment,
  deleteAssignment,
  decideBenefitRequest,
  deleteBenefitRequest,
} from "./actions";
import ExportBenefitReportButton from "./ExportBenefitReportButton";

const categoryLabel: Record<string, string> = {
  ars: "ARS",
  seguro_vida: "Seguro de vida",
  vale_alimentacion: "Vale de alimentación",
  convenio: "Convenio",
  otro: "Otro",
};

const currency = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "DOP",
});

const dateFmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("es-DO");

const requestStatusLabel: Record<string, string> = {
  pendiente: "Pendiente",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
};

const requestStatusClass: Record<string, string> = {
  pendiente: "bg-gray-900 text-white",
  aprobada: "bg-emerald-100 text-emerald-800",
  rechazada: "bg-red-100 text-red-700",
};

export default async function BeneficiosPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/onboarding");
  if (!isManagerRole(tenant.myRole)) redirect("/app/mi-espacio");

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: employees },
    { data: benefitTypes },
    { data: assignments },
    { data: activeBenefitsForCost },
    { data: employeesForCost },
    { data: benefitRequests },
  ] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name")
      .eq("tenant_id", tenant.id)
      .eq("status", "active")
      .order("full_name", { ascending: true }),
    supabase
      .from("benefit_types")
      .select("id, name, category, provider, employer_cost, employee_cost, notes")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("employee_benefits")
      .select(
        "id, start_date, end_date, employees(full_name), benefit_types(name, category, provider, employer_cost, employee_cost)"
      )
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("employee_benefits")
      .select("employee_id, benefit_types(employer_cost)")
      .eq("tenant_id", tenant.id)
      .or(`end_date.is.null,end_date.gte.${today}`),
    supabase
      .from("employees")
      .select("id, full_name, monthly_salary")
      .eq("tenant_id", tenant.id)
      .eq("status", "active")
      .order("full_name", { ascending: true }),
    supabase
      .from("benefit_requests")
      .select(
        "id, status, note, resolution_note, created_at, employees(full_name), benefit_types(name)"
      )
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false }),
  ]);

  const pendingBenefitRequests = (benefitRequests ?? []).filter((r) => r.status === "pendiente");
  const decidedBenefitRequests = (benefitRequests ?? []).filter((r) => r.status !== "pendiente");

  const benefitsCostByEmployee = new Map<string, number>();
  (activeBenefitsForCost ?? []).forEach((b) => {
    const cost =
      (b.benefit_types as unknown as { employer_cost: number } | null)?.employer_cost ?? 0;
    benefitsCostByEmployee.set(
      b.employee_id,
      (benefitsCostByEmployee.get(b.employee_id) ?? 0) + Number(cost)
    );
  });

  const compensationRows = (employeesForCost ?? [])
    .filter((e) => e.monthly_salary != null || benefitsCostByEmployee.has(e.id))
    .map((e) => {
      const salary = Number(e.monthly_salary ?? 0);
      const benefitsCost = benefitsCostByEmployee.get(e.id) ?? 0;
      return { id: e.id, name: e.full_name, salary, benefitsCost, total: salary + benefitsCost };
    });

  const totals = compensationRows.reduce(
    (acc, r) => ({
      salary: acc.salary + r.salary,
      benefits: acc.benefits + r.benefitsCost,
      total: acc.total + r.total,
    }),
    { salary: 0, benefits: 0, total: 0 }
  );

  const assignForTenant = assignBenefit.bind(null, tenant.id);
  const createTypeForTenant = createBenefitType.bind(null, tenant.id);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-xl font-semibold text-gray-900">Beneficios — {tenant.name}</h1>
      <p className="mt-1 text-sm text-gray-500">
        Catálogo de beneficios, asignación por empleado y costo total de compensación.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">Catálogo de beneficios</h2>
        <p className="mt-1 text-xs text-gray-400">
          &quot;Exportar reporte&quot; genera un CSV con los empleados activos en ese beneficio y
          sus dependientes, listo para enviar manualmente al corredor o a la aseguradora (por
          ejemplo, tu proveedor de ARS) — no requiere que el proveedor tenga acceso a la app.
        </p>
        <form action={createTypeForTenant} className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500">Nombre</label>
            <input
              name="name"
              type="text"
              required
              placeholder="Ej. ARS Humano Plan Básico"
              className="mt-1 min-w-[200px] rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500">Categoría</label>
            <select
              name="category"
              defaultValue="otro"
              className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="ars">ARS</option>
              <option value="seguro_vida">Seguro de vida</option>
              <option value="vale_alimentacion">Vale de alimentación</option>
              <option value="convenio">Convenio</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500">Proveedor</label>
            <input
              name="provider"
              type="text"
              placeholder="Ej. Humano"
              className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500">Aporte empresa (RD$/mes)</label>
            <input
              name="employer_cost"
              type="number"
              step="0.01"
              min="0"
              defaultValue="0"
              className="mt-1 w-32 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500">Aporte empleado (RD$/mes)</label>
            <input
              name="employee_cost"
              type="number"
              step="0.01"
              min="0"
              defaultValue="0"
              className="mt-1 w-32 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <input
            name="notes"
            type="text"
            placeholder="Notas (opcional)"
            className="min-w-[160px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Crear beneficio
          </button>
        </form>

        <div className="mt-4 divide-y divide-gray-100 border-t border-gray-100">
          {(benefitTypes ?? []).length === 0 && (
            <p className="py-3 text-sm text-gray-500">Aún no hay beneficios en el catálogo.</p>
          )}
          {(benefitTypes ?? []).map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <div>
                <p className="font-medium text-gray-900">
                  {b.name}{" "}
                  <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                    {categoryLabel[b.category] ?? b.category}
                  </span>
                </p>
                <p className="text-xs text-gray-500">
                  {b.provider ? `${b.provider} · ` : ""}Empresa {currency.format(b.employer_cost)} ·
                  Empleado {currency.format(b.employee_cost)}
                  {b.notes ? ` · ${b.notes}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <ExportBenefitReportButton
                  benefitTypeId={b.id}
                  fileName={`reporte-${b.name
                    .replace(/[^a-zA-Z0-9]+/g, "-")
                    .toLowerCase()}-${today}.csv`}
                />
                <form action={deleteBenefitType.bind(null, b.id)}>
                  <button className="text-xs text-red-600 hover:underline">Eliminar</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">Asignar beneficio a un empleado</h2>
        <form action={assignForTenant} className="mt-3 flex flex-wrap items-end gap-3">
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
            <label className="block text-xs text-gray-500">Beneficio</label>
            <select
              name="benefit_type_id"
              required
              defaultValue=""
              className="mt-1 min-w-[160px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Seleccionar...
              </option>
              {(benefitTypes ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500">Desde</label>
            <input
              name="start_date"
              type="date"
              defaultValue={today}
              required
              className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500">Hasta (opcional)</label>
            <input
              name="end_date"
              type="date"
              className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Asignar
          </button>
        </form>
        {(benefitTypes ?? []).length === 0 && (
          <p className="mt-2 text-xs text-amber-600">
            Crea al menos un beneficio en el catálogo antes de asignarlo.
          </p>
        )}
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="flex items-center gap-2 text-sm font-medium text-gray-700">
            Solicitudes de beneficios
            {pendingBenefitRequests.length > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                {pendingBenefitRequests.length} pendiente(s)
              </span>
            )}
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Solicitudes de empleados para inscribirse a un beneficio del catálogo por su cuenta;
            al aprobar se crea la asignación (sin dependientes — agrégalos después desde su
            detalle).
          </p>
        </div>
        <div className="divide-y divide-gray-100">
          {(benefitRequests ?? []).length === 0 && (
            <p className="px-6 py-6 text-center text-sm text-gray-500">
              Aún no hay solicitudes de beneficios.
            </p>
          )}
          {pendingBenefitRequests.map((r) => {
            const employeeName =
              (r.employees as unknown as { full_name: string } | null)?.full_name ?? "—";
            const benefitName =
              (r.benefit_types as unknown as { name: string } | null)?.name ?? "—";
            return (
              <div key={r.id} className="flex items-start justify-between gap-3 px-6 py-4 text-sm">
                <div>
                  <p className="font-medium text-gray-900">
                    {employeeName} — {benefitName}
                  </p>
                  {r.note && <p className="text-xs text-gray-500">{r.note}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <form action={decideBenefitRequest.bind(null, r.id, "aprobada")}>
                    <button className="rounded-md border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50">
                      Aprobar
                    </button>
                  </form>
                  <form
                    action={decideBenefitRequest.bind(null, r.id, "rechazada")}
                    className="flex items-center gap-2"
                  >
                    <input
                      name="notes"
                      type="text"
                      placeholder="Motivo (opcional)"
                      className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                    />
                    <button className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
                      Rechazar
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
          {decidedBenefitRequests.map((r) => {
            const employeeName =
              (r.employees as unknown as { full_name: string } | null)?.full_name ?? "—";
            const benefitName =
              (r.benefit_types as unknown as { name: string } | null)?.name ?? "—";
            return (
              <div key={r.id} className="flex items-start justify-between gap-3 px-6 py-4 text-sm">
                <div>
                  <p className="text-gray-900">
                    {employeeName} — {benefitName}
                  </p>
                  {r.resolution_note && (
                    <p className="text-xs text-gray-400">Nota: {r.resolution_note}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      requestStatusClass[r.status] ?? "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {requestStatusLabel[r.status] ?? r.status}
                  </span>
                  <form action={deleteBenefitRequest.bind(null, r.id)}>
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
          <h2 className="text-sm font-medium text-gray-700">Asignaciones</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {(assignments ?? []).length === 0 && (
            <p className="px-6 py-6 text-center text-sm text-gray-500">
              Aún no hay beneficios asignados.
            </p>
          )}
          {(assignments ?? []).map((a) => {
            const employeeName =
              (a.employees as unknown as { full_name: string } | null)?.full_name ?? "—";
            const benefit = a.benefit_types as unknown as {
              name: string;
              category: string;
              provider: string | null;
            } | null;
            const isActive = !a.end_date || a.end_date >= today;
            return (
              <div key={a.id} className="flex items-center justify-between gap-3 px-6 py-4 text-sm">
                <div>
                  <Link href={`/app/beneficios/${a.id}`} className="font-medium text-gray-900 hover:underline">
                    {employeeName} — {benefit?.name ?? "—"}
                  </Link>
                  <p className="text-xs text-gray-500">
                    {categoryLabel[benefit?.category ?? "otro"]}
                    {benefit?.provider ? ` · ${benefit.provider}` : ""} · Desde{" "}
                    {dateFmt(a.start_date)}
                    {a.end_date ? ` · Hasta ${dateFmt(a.end_date)}` : ""}
                    {isActive ? (
                      <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                        Activa
                      </span>
                    ) : (
                      <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        Finalizada
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {isActive && (
                    <form action={endAssignment.bind(null, a.id)}>
                      <button className="text-xs text-amber-700 hover:underline">Finalizar</button>
                    </form>
                  )}
                  <form action={deleteAssignment.bind(null, a.id)}>
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
          <h2 className="text-sm font-medium text-gray-700">Costo total de compensación</h2>
          <p className="text-xs text-gray-500">
            Salario mensual + aporte de empresa de los beneficios activos, por empleado.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 px-6 py-4 text-sm">
          <div>
            <p className="text-xs text-gray-500">Salarios</p>
            <p className="font-medium text-gray-900">{currency.format(totals.salary)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Beneficios (aporte empresa)</p>
            <p className="font-medium text-gray-900">{currency.format(totals.benefits)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Compensación total</p>
            <p className="font-medium text-gray-900">{currency.format(totals.total)}</p>
          </div>
        </div>
        <div className="overflow-x-auto border-t border-gray-100">
          <table className="w-full min-w-[500px] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Empleado</th>
                <th className="px-4 py-2">Salario</th>
                <th className="px-4 py-2">Beneficios</th>
                <th className="px-4 py-2">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {compensationRows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                    Sin datos de compensación todavía.
                  </td>
                </tr>
              )}
              {compensationRows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 text-gray-900">{r.name}</td>
                  <td className="px-4 py-2 text-gray-600">{currency.format(r.salary)}</td>
                  <td className="px-4 py-2 text-gray-600">{currency.format(r.benefitsCost)}</td>
                  <td className="px-4 py-2 font-medium text-gray-900">
                    {currency.format(r.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
