import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, isTenantManagerRole } from "@/lib/supabase/tenant";
import ExportActivityCsvButton from "./ExportActivityCsvButton";

const ACTIVITY_TYPE_LABEL: Record<string, string> = {
  vacante_publicada: "Vacante publicada",
  candidato_contratado: "Candidato contratado",
  evaluacion_completada: "Evaluación completada",
  incorporacion_iniciada: "Incorporación iniciada",
  baja_iniciada: "Baja iniciada",
};

function monthRangeIso(mes: string) {
  const [year, month] = mes.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function shiftMonth(mes: string, delta: number) {
  const [year, month] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default async function ActividadPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes: mesParam } = await searchParams;
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/onboarding");
  if (!isTenantManagerRole(tenant.myRole)) redirect("/app/mi-espacio");

  const mes = mesParam && /^\d{4}-\d{2}$/.test(mesParam) ? mesParam : currentMonth();
  const { startIso, endIso } = monthRangeIso(mes);

  const supabase = await createClient();
  const { data: entries } = await supabase
    .from("activity_log")
    .select("id, activity_type, description, occurred_at")
    .eq("tenant_id", tenant.id)
    .gte("occurred_at", startIso)
    .lt("occurred_at", endIso)
    .order("occurred_at", { ascending: false });

  const counts: Record<string, number> = {};
  for (const e of entries ?? []) {
    counts[e.activity_type] = (counts[e.activity_type] ?? 0) + 1;
  }

  const [year, month] = mes.split("-").map(Number);
  const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("es-DO", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-xl font-semibold text-gray-900">
        Registro de actividad — {tenant.name}
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Hitos facturables registrados automáticamente (vacantes publicadas,
        contrataciones, evaluaciones completadas, incorporaciones y bajas
        iniciadas), para usar como insumo de la factura mensual de este
        cliente. Solo de referencia — sin montos; arma la factura afuera con
        tus propias tarifas.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <Link
            href={`/app/actividad?mes=${shiftMonth(mes, -1)}`}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
          >
            ← Anterior
          </Link>
          <span className="text-sm font-medium capitalize text-gray-900">
            {monthLabel}
          </span>
          <Link
            href={`/app/actividad?mes=${shiftMonth(mes, 1)}`}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
          >
            Siguiente →
          </Link>
        </div>
        <ExportActivityCsvButton
          mes={mes}
          fileName={`actividad-${tenant.slug}-${mes}.csv`}
        />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {Object.entries(ACTIVITY_TYPE_LABEL).map(([type, label]) => (
          <div
            key={type}
            className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <p className="text-2xl font-semibold text-gray-900">
              {counts[type] ?? 0}
            </p>
            <p className="text-sm text-gray-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 space-y-2">
        {(entries ?? []).length === 0 && (
          <p className="text-sm text-gray-500">
            Sin actividad registrada en {monthLabel}.
          </p>
        )}
        {(entries ?? []).map((e) => (
          <div
            key={e.id}
            className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div>
              <p className="text-sm font-medium text-gray-900">{e.description}</p>
              <p className="text-xs text-gray-500">
                {ACTIVITY_TYPE_LABEL[e.activity_type] ?? e.activity_type}
              </p>
            </div>
            <span className="shrink-0 text-xs text-gray-400">
              {new Date(e.occurred_at).toLocaleString("es-DO")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
