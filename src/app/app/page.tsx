import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, isManagerRole } from "@/lib/supabase/tenant";

export default async function AppHomePage() {
  const tenant = await getCurrentTenant();

  if (!tenant) {
    redirect("/app/onboarding");
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

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-500">Cuenta activa</p>
        <p className="mt-1 text-lg font-medium text-gray-900">{tenant.name}</p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Link
          href="/app/organizacion"
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:border-gray-300"
        >
          <h2 className="font-medium text-gray-900">Estructura organizacional</h2>
          <p className="mt-1 text-sm text-gray-500">
            Crea y organiza los departamentos de tu empresa.
          </p>
        </Link>

        <Link
          href="/app/ats"
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:border-gray-300"
        >
          <h2 className="font-medium text-gray-900">Reclutamiento (ATS)</h2>
          <p className="mt-1 text-sm text-gray-500">
            Vacantes, candidatos y pipeline de reclutamiento.
          </p>
        </Link>

        <Link
          href="/app/empleados"
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:border-gray-300"
        >
          <h2 className="font-medium text-gray-900">Empleados</h2>
          <p className="mt-1 text-sm text-gray-500">
            Registro base de colaboradores y acceso a su autoservicio.
          </p>
        </Link>

        <Link
          href="/app/evaluaciones"
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:border-gray-300"
        >
          <h2 className="font-medium text-gray-900">Evaluación de desempeño</h2>
          <p className="mt-1 text-sm text-gray-500">
            Plantillas de competencias y evaluaciones 90°/180°/360°.
          </p>
        </Link>

        <Link
          href="/app/incorporacion"
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:border-gray-300"
        >
          <h2 className="font-medium text-gray-900">Incorporación</h2>
          <p className="mt-1 text-sm text-gray-500">
            Plan de incorporación (30-60-90) para cada nuevo ingreso.
          </p>
        </Link>

        <Link
          href="/app/bajas"
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:border-gray-300"
        >
          <h2 className="font-medium text-gray-900">Bajas</h2>
          <p className="mt-1 text-sm text-gray-500">
            Checklist de salida y cálculo de referencia de liquidación.
          </p>
        </Link>

        <Link
          href="/app/portal-cliente/gestionar"
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:border-gray-300"
        >
          <h2 className="font-medium text-gray-900">Portal del cliente</h2>
          <p className="mt-1 text-sm text-gray-500">
            Invita a tu cliente a una vista de solo lectura de vacantes,
            contrataciones y evaluaciones.
          </p>
        </Link>

        <Link
          href="/app/nomina"
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:border-gray-300"
        >
          <h2 className="font-medium text-gray-900">Nómina</h2>
          <p className="mt-1 text-sm text-gray-500">
            Genera periodos de nómina con SFS, AFP, SRL, INFOTEP e ISR de referencia.
          </p>
        </Link>

        <Link
          href="/app/documentos"
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:border-gray-300"
        >
          <h2 className="flex items-center gap-2 font-medium text-gray-900">
            Documentos
            {!!expiringDocs && expiringDocs > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                {expiringDocs} por vencer
              </span>
            )}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Expediente digital por empleado, con alerta de documentos por vencer.
          </p>
        </Link>

        <Link
          href="/app/asistencia"
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:border-gray-300"
        >
          <h2 className="font-medium text-gray-900">Asistencia</h2>
          <p className="mt-1 text-sm text-gray-500">
            Horarios por empleado y registro de marcaje web.
          </p>
        </Link>

        <Link
          href="/app/permisos"
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:border-gray-300"
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
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:border-gray-300"
        >
          <h2 className="font-medium text-gray-900">Beneficios</h2>
          <p className="mt-1 text-sm text-gray-500">
            Catálogo, asignación por empleado y costo total de compensación.
          </p>
        </Link>

        <Link
          href="/app/capacitacion"
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:border-gray-300"
        >
          <h2 className="font-medium text-gray-900">Capacitación</h2>
          <p className="mt-1 text-sm text-gray-500">
            Catálogo de cursos, inscripciones y horas INFOTEP acumuladas.
          </p>
        </Link>

        <Link
          href="/app/comunicacion"
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:border-gray-300"
        >
          <h2 className="font-medium text-gray-900">Comunicación</h2>
          <p className="mt-1 text-sm text-gray-500">
            Tablón de anuncios y reconocimientos entre compañeros.
          </p>
        </Link>

        <Link
          href="/app/encuestas"
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:border-gray-300"
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
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:border-gray-300"
        >
          <h2 className="font-medium text-gray-900">People analytics</h2>
          <p className="mt-1 text-sm text-gray-500">
            Rotación de personal y costo de nómina por periodo.
          </p>
        </Link>
      </div>
    </div>
  );
}
