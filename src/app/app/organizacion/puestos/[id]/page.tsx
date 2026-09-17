import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, isManagerRole } from "@/lib/supabase/tenant";
import { createSalaryBand } from "./actions";

const currency = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "DOP",
});

const dateFormatter = new Intl.DateTimeFormat("es-DO", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

function formatDate(value: string) {
  // value viene como "YYYY-MM-DD" (date de Postgres). Se arma en UTC y se
  // formatea forzando timeZone: "UTC" -- sin esto, Intl.DateTimeFormat usa
  // la zona horaria del servidor y un dia arrancando en UTC medianoche
  // puede mostrarse como el dia anterior (ej. servidor en UTC-4).
  return dateFormatter.format(new Date(`${value}T00:00:00Z`));
}

export default async function PuestoDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error: errorMessage } = await searchParams;
  const tenant = await getCurrentTenant();

  if (!tenant) {
    redirect("/app/onboarding");
  }
  if (!isManagerRole(tenant.myRole)) {
    redirect("/app/mi-espacio");
  }

  const supabase = await createClient();

  const { data: position } = await supabase
    .from("job_positions")
    .select("id, title, mission, department_id, departments(name)")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (!position) {
    notFound();
  }

  const { data: bands } = await supabase
    .from("job_position_salary_bands")
    .select("id, min_salary, max_salary, effective_from, notes, created_at")
    .eq("job_position_id", id)
    .order("effective_from", { ascending: false })
    .order("created_at", { ascending: false });

  const allBands = bands ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const currentBand = allBands.find((b) => b.effective_from <= today) ?? null;
  const futureBands = allBands.filter((b) => b.effective_from > today);
  const pastBands = allBands.filter(
    (b) => b.id !== currentBand?.id && b.effective_from <= today
  );

  const departmentName =
    (position.departments as unknown as { name: string } | null)?.name ?? "—";
  const createBandForPosition = createSalaryBand.bind(
    null,
    tenant.id,
    position.id
  );

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link
        href="/app/organizacion/puestos"
        className="text-sm text-blue-600 hover:underline"
      >
        ← Catálogo de puestos
      </Link>

      <h1 className="mt-2 text-xl font-semibold text-gray-900">
        {position.title}
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        {departmentName}
        {position.mission && (
          <>
            {" — "}
            {position.mission}
          </>
        )}
      </p>

      {errorMessage && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">Banda salarial vigente</h2>
        {currentBand ? (
          <>
            <p className="mt-2 text-2xl font-semibold text-gray-900">
              {currency.format(Number(currentBand.min_salary))} —{" "}
              {currency.format(Number(currentBand.max_salary))}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Vigente desde {formatDate(currentBand.effective_from)}
              {currentBand.notes && ` · ${currentBand.notes}`}
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-gray-500">
            Este puesto todavía no tiene una banda salarial registrada.
          </p>
        )}

        {futureBands.length > 0 && (
          <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {futureBands.map((b) => (
              <p key={b.id}>
                Programada desde {formatDate(b.effective_from)}:{" "}
                {currency.format(Number(b.min_salary))} —{" "}
                {currency.format(Number(b.max_salary))}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">Nueva versión</h2>
        <p className="mt-1 text-xs text-gray-400">
          No se edita una banda existente: cada cambio queda registrado como
          una versión nueva, para conservar el historial.
        </p>
        <form action={createBandForPosition} className="mt-3 flex flex-wrap gap-3">
          <input
            name="min_salary"
            type="number"
            min="0"
            step="0.01"
            placeholder="Mínimo (RD$)"
            required
            className="w-36 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            name="max_salary"
            type="number"
            min="0"
            step="0.01"
            placeholder="Máximo (RD$)"
            required
            className="w-36 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            name="effective_from"
            type="date"
            defaultValue={today}
            required
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            name="notes"
            type="text"
            placeholder="Nota (opcional, ej. ajuste anual)"
            className="min-w-[180px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Guardar versión
          </button>
        </form>
      </div>

      {pastBands.length > 0 && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <details>
            <summary className="cursor-pointer text-sm font-medium text-gray-700">
              Historial ({pastBands.length}{" "}
              {pastBands.length === 1 ? "versión anterior" : "versiones anteriores"})
            </summary>
            <ul className="mt-3 divide-y divide-gray-100 text-sm">
              {pastBands.map((b) => (
                <li key={b.id} className="py-2 text-gray-600">
                  {currency.format(Number(b.min_salary))} —{" "}
                  {currency.format(Number(b.max_salary))}
                  <span className="ml-2 text-xs text-gray-400">
                    desde {formatDate(b.effective_from)}
                    {b.notes && ` · ${b.notes}`}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}
