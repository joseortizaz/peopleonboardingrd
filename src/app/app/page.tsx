import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentTenant, isManagerRole } from "@/lib/supabase/tenant";

export default async function AppHomePage() {
  const tenant = await getCurrentTenant();

  if (!tenant) {
    redirect("/app/onboarding");
  }

  if (!isManagerRole(tenant.myRole)) {
    redirect("/app/mi-espacio");
  }

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
      </div>
    </div>
  );
}
