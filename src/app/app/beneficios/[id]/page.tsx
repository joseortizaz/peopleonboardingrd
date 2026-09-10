import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, isManagerRole } from "@/lib/supabase/tenant";
import { endAssignment, deleteAssignment, addDependent, deleteDependent } from "../actions";

const categoryLabel: Record<string, string> = {
  ars: "ARS",
  seguro_vida: "Seguro de vida",
  vale_alimentacion: "Vale de alimentación",
  convenio: "Convenio",
  otro: "Otro",
};

const relationshipLabel: Record<string, string> = {
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

const dateFmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("es-DO");

export default async function BenefitAssignmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/onboarding");
  if (!isManagerRole(tenant.myRole)) redirect("/app/mi-espacio");

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: assignment } = await supabase
    .from("employee_benefits")
    .select(
      "id, start_date, end_date, notes, employees(full_name), benefit_types(name, category, provider, employer_cost, employee_cost)"
    )
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (!assignment) notFound();

  const { data: dependents } = await supabase
    .from("benefit_dependents")
    .select("id, full_name, relationship, birth_date")
    .eq("employee_benefit_id", id)
    .order("created_at", { ascending: true });

  const employeeName =
    (assignment.employees as unknown as { full_name: string } | null)?.full_name ?? "—";
  const benefit = assignment.benefit_types as unknown as {
    name: string;
    category: string;
    provider: string | null;
    employer_cost: number;
    employee_cost: number;
  } | null;
  const isActive = !assignment.end_date || assignment.end_date >= today;
  const addDependentForAssignment = addDependent.bind(null, id);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/app/beneficios" className="text-sm text-gray-500 hover:underline">
        ← Beneficios
      </Link>
      <h1 className="mt-2 text-xl font-semibold text-gray-900">
        {employeeName} — {benefit?.name ?? "—"}
      </h1>
      <p className="mt-1 text-sm text-gray-500">{tenant.name}</p>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-gray-500">Categoría</dt>
            <dd className="text-gray-900">{categoryLabel[benefit?.category ?? "otro"]}</dd>
            <dt className="text-gray-500">Proveedor</dt>
            <dd className="text-gray-900">{benefit?.provider ?? "—"}</dd>
            <dt className="text-gray-500">Aporte empresa</dt>
            <dd className="text-gray-900">{currency.format(benefit?.employer_cost ?? 0)}</dd>
            <dt className="text-gray-500">Aporte empleado</dt>
            <dd className="text-gray-900">{currency.format(benefit?.employee_cost ?? 0)}</dd>
            <dt className="text-gray-500">Desde</dt>
            <dd className="text-gray-900">{dateFmt(assignment.start_date)}</dd>
            <dt className="text-gray-500">Hasta</dt>
            <dd className="text-gray-900">
              {assignment.end_date ? dateFmt(assignment.end_date) : "—"}
            </dd>
            {assignment.notes && (
              <>
                <dt className="text-gray-500">Notas</dt>
                <dd className="text-gray-900">{assignment.notes}</dd>
              </>
            )}
          </dl>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
              isActive ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"
            }`}
          >
            {isActive ? "Activa" : "Finalizada"}
          </span>
        </div>

        <div className="mt-4 flex items-center gap-3 border-t border-gray-100 pt-4">
          {isActive && (
            <form action={endAssignment.bind(null, id)}>
              <button className="rounded-md border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50">
                Finalizar asignación
              </button>
            </form>
          )}
          <form action={deleteAssignment.bind(null, id)}>
            <button className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
              Eliminar asignación
            </button>
          </form>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">Dependientes</h2>
        <form
          action={addDependentForAssignment}
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <div>
            <label className="block text-xs text-gray-500">Nombre completo</label>
            <input
              name="full_name"
              type="text"
              required
              className="mt-1 min-w-[160px] rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500">Parentesco</label>
            <select
              name="relationship"
              defaultValue="hijo"
              className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="conyuge">Cónyuge</option>
              <option value="hijo">Hijo</option>
              <option value="hija">Hija</option>
              <option value="padre">Padre</option>
              <option value="madre">Madre</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500">Fecha de nacimiento (opcional)</label>
            <input
              name="birth_date"
              type="date"
              className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Agregar
          </button>
        </form>

        <div className="mt-4 divide-y divide-gray-100 border-t border-gray-100">
          {(dependents ?? []).length === 0 && (
            <p className="py-3 text-sm text-gray-500">Sin dependientes registrados.</p>
          )}
          {(dependents ?? []).map((d) => (
            <div key={d.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-gray-900">
                {d.full_name}{" "}
                <span className="ml-1 text-xs text-gray-500">
                  ({relationshipLabel[d.relationship] ?? d.relationship}
                  {d.birth_date ? ` · ${dateFmt(d.birth_date)}` : ""})
                </span>
              </span>
              <form action={deleteDependent.bind(null, id, d.id)}>
                <button className="text-xs text-red-600 hover:underline">Eliminar</button>
              </form>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
