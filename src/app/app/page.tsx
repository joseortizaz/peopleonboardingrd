import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, isManagerRole } from "@/lib/supabase/tenant";

// Mismo esquema de color que TopNav.tsx: cada área del menú superior tiene
// un color fijo, y estas tarjetas usan el mismo color para que la
// asociación visual entre el menú y el dashboard sea consistente. Las
// clases están escritas de forma literal (no interpoladas) para que el
// escaneo de contenido de Tailwind las detecte.
const CARD_ACCENT = {
  indigo: "border-t-indigo-400 hover:border-indigo-300",
  emerald: "border-t-emerald-400 hover:border-emerald-300",
  amber: "border-t-amber-400 hover:border-amber-300",
  rose: "border-t-rose-400 hover:border-rose-300",
  sky: "border-t-sky-400 hover:border-sky-300",
  teal: "border-t-teal-400 hover:border-teal-300",
  violet: "border-t-violet-400 hover:border-violet-300",
} as const;

const CARD_BASE =
  "rounded-xl border border-gray-200 border-t-4 bg-white p-6 shadow-sm transition-colors";

export default async function AppHomePage() {
  const tenant = await getCurrentTenant();

  if (!tenant) {
    redirect("/app/onboarding");
  }

  // Un Super Admin de plataforma no tiene por qué aterrizar en el dashboard
  // operativo de un tenant cualquiera (aquí solo llega atado a un tenant por
  // una restricción del esquema, no porque lo gestione) -- su panel es
  // /app/superadmin. Ver isTenantManagerRole() en tenant.ts para el detalle.
  if (tenant.myRole === "super_admin") {
    redirect("/app/superadmin");
  }

  if (!isManagerRole(tenant.myRole)) {
    redirect(tenant.myRole === "client" ? "/app/portal-cliente" : "/app/mi-espacio");
  }

  const supabase = await createClient();
  const in30Days = new Date();
  in30Days.setDate(in30Days.getDate() + 30);
  const { count: expiringDocs } = await supabase
    .from("employee_documents")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenant.id)
    .not("expires_at", "is", null)
    .lte("expires_at", in30Days.toISOString().slice(0, 10));

  const { count: pendingSignatureDocs } = await supabase
    .from("employee_documents")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenant.id)
    .eq("requires_signature", true)
    .is("signed_at", null);

  const { count: activeSurveys } = await supabase
    .from("climate_surveys")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenant.id)
    .eq("status", "activa");

  const { count: pendingLeaveRequests } = await supabase
    .from("leave_requests")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenant.id)
    .eq("status", "pendiente");

  let subscriptionCard: { planName: string; status: string; endDate: string | null } | null = null;
  if (tenant.myRole === "account_admin") {
    const { data: sub } = await supabase
      .from("account_subscriptions")
      .select("status, end_date, subscription_plans(name)")
      .eq("account_id", tenant.accountId)
      .maybeSingle();
    if (sub) {
      const plan = sub.subscription_plans as unknown as { name: string } | null;
      subscriptionCard = {
        planName: plan?.name ?? "sin plan",
        status: sub.status as string,
        endDate: sub.end_date as string | null,
      };
    }
  }

  const subStatusLabel: Record<string, string> = {
    activa: "Activa",
    suspendida: "Suspendida",
    cancelada: "Cancelada",
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-500">Cuenta activa</p>
        <p className="mt-1 text-lg font-medium text-gray-900">{tenant.name}</p>
        {subscriptionCard && (
          <p className="mt-2 text-xs text-gray-400">
            Plan: {subscriptionCard.planName} · Estado:{" "}
            {subStatusLabel[subscriptionCard.status] ?? subscriptionCard.status}
            {subscriptionCard.endDate
              ? ` · Vence: ${new Date(subscriptionCard.endDate + "T00:00:00").toLocaleDateString("es-DO")}`
              : " · Sin fecha de vencimiento"}
          </p>
        )}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Link
          href="/app/organizacion"
          className={`${CARD_BASE} ${CARD_ACCENT.indigo}`}
        >
          <h2 className="font-medium text-gray-900">Estructura organizacional</h2>
          <p className="mt-1 text-sm text-gray-500">
            Crea y organiza los departamentos de tu empresa.
          </p>
        </Link>

        <Link
          href="/app/ats"
          className={`${CARD_BASE} ${CARD_ACCENT.indigo}`}
        >
          <h2 className="font-medium text-gray-900">Reclutamiento (ATS)</h2>
          <p className="mt-1 text-sm text-gray-500">
            Vacantes, candidatos y pipeline de reclutamiento.
          </p>
        </Link>

        <Link
          href="/app/empleados"
          className={`${CARD_BASE} ${CARD_ACCENT.indigo}`}
        >
          <h2 className="font-medium text-gray-900">Empleados</h2>
          <p className="mt-1 text-sm text-gray-500">
            Registro base de colaboradores y acceso a su autoservicio.
          </p>
        </Link>

        <Link
          href="/app/evaluaciones"
          className={`${CARD_BASE} ${CARD_ACCENT.rose}`}
        >
          <h2 className="font-medium text-gray-900">Evaluación de desempeño</h2>
          <p className="mt-1 text-sm text-gray-500">
            Plantillas de competencias y evaluaciones 90°/180°/360°.
          </p>
        </Link>

        <Link
          href="/app/incorporacion"
          className={`${CARD_BASE} ${CARD_ACCENT.indigo}`}
        >
          <h2 className="font-medium text-gray-900">Incorporación</h2>
          <p className="mt-1 text-sm text-gray-500">
            Plan de incorporación (30-60-90) para cada nuevo ingreso.
          </p>
        </Link>

        <Link
          href="/app/bajas"
          className={`${CARD_BASE} ${CARD_ACCENT.indigo}`}
        >
          <h2 className="font-medium text-gray-900">Bajas</h2>
          <p className="mt-1 text-sm text-gray-500">
            Checklist de salida y cálculo de referencia de liquidación.
          </p>
        </Link>

        <Link
          href="/app/portal-cliente/gestionar"
          className={`${CARD_BASE} ${CARD_ACCENT.teal}`}
        >
          <h2 className="font-medium text-gray-900">Portal del cliente</h2>
          <p className="mt-1 text-sm text-gray-500">
            Invita a tu cliente a una vista de solo lectura de vacantes,
            contrataciones y evaluaciones.
          </p>
        </Link>

        <Link
          href="/app/nomina"
          className={`${CARD_BASE} ${CARD_ACCENT.emerald}`}
        >
          <h2 className="font-medium text-gray-900">Nómina</h2>
          <p className="mt-1 text-sm text-gray-500">
            Genera periodos de nómina con SFS, AFP, SRL, INFOTEP e ISR de referencia.
          </p>
        </Link>

        <Link
          href="/app/documentos"
          className={`${CARD_BASE} ${CARD_ACCENT.amber}`}
        >
          <h2 className="flex items-center gap-2 font-medium text-gray-900">
            Documentos
            {!!expiringDocs && expiringDocs > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                {expiringDocs} por vencer
              </span>
            )}
            {!!pendingSignatureDocs && pendingSignatureDocs > 0 && (
              <span className="rounded-full bg-gray-900 px-2 py-0.5 text-xs font-medium text-white">
                {pendingSignatureDocs} por firmar
              </span>
            )}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Expediente digital por empleado, con alerta de vencimiento y
            firma electrónica de documentos.
          </p>
        </Link>

        <Link
          href="/app/asistencia"
          className={`${CARD_BASE} ${CARD_ACCENT.emerald}`}
        >
          <h2 className="font-medium text-gray-900">Asistencia</h2>
          <p className="mt-1 text-sm text-gray-500">
            Horarios por empleado y registro de marcaje web.
          </p>
        </Link>

        <Link
          href="/app/permisos"
          className={`${CARD_BASE} ${CARD_ACCENT.emerald}`}
        >
          <h2 className="flex items-center gap-2 font-medium text-gray-900">
            Permisos
            {!!pendingLeaveRequests && pendingLeaveRequests > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                {pendingLeaveRequests} pendiente(s)
              </span>
            )}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Solicitudes de vacaciones y permisos por aprobar.
          </p>
        </Link>

        <Link
          href="/app/beneficios"
          className={`${CARD_BASE} ${CARD_ACCENT.emerald}`}
        >
          <h2 className="font-medium text-gray-900">Beneficios</h2>
          <p className="mt-1 text-sm text-gray-500">
            Catálogo, asignación por empleado y costo total de compensación.
          </p>
        </Link>

        <Link
          href="/app/capacitacion"
          className={`${CARD_BASE} ${CARD_ACCENT.rose}`}
        >
          <h2 className="font-medium text-gray-900">Capacitación</h2>
          <p className="mt-1 text-sm text-gray-500">
            Catálogo de cursos, inscripciones y horas INFOTEP acumuladas.
          </p>
        </Link>

        <Link
          href="/app/comunicacion"
          className={`${CARD_BASE} ${CARD_ACCENT.sky}`}
        >
          <h2 className="font-medium text-gray-900">Comunicación</h2>
          <p className="mt-1 text-sm text-gray-500">
            Tablón de anuncios y reconocimientos entre compañeros.
          </p>
        </Link>

        <Link
          href="/app/encuestas"
          className={`${CARD_BASE} ${CARD_ACCENT.sky}`}
        >
          <h2 className="flex items-center gap-2 font-medium text-gray-900">
            Encuestas
            {!!activeSurveys && activeSurveys > 0 && (
              <span className="rounded-full bg-gray-900 px-2 py-0.5 text-xs font-medium text-white">
                {activeSurveys} activa(s)
              </span>
            )}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Encuestas de clima laboral, con respuestas anónimas.
          </p>
        </Link>

        <Link
          href="/app/analytics"
          className={`${CARD_BASE} ${CARD_ACCENT.sky}`}
        >
          <h2 className="font-medium text-gray-900">People analytics</h2>
          <p className="mt-1 text-sm text-gray-500">
            Rotación de personal y costo de nómina por periodo.
          </p>
        </Link>

        {tenant.myRole === "account_admin" && (
          <Link
            href="/app/facturacion"
            className={`${CARD_BASE} ${CARD_ACCENT.violet}`}
          >
            <h2 className="font-medium text-gray-900">Facturación</h2>
            <p className="mt-1 text-sm text-gray-500">
              Consulta tu plan, solicita uno nuevo y sigue el estado de tu
              pago.
            </p>
          </Link>
        )}
      </div>
    </div>
  );
}
