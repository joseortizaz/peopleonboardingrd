import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/supabase/tenant";

export default async function AppHomePage() {
  const tenant = await getCurrentTenant();

  if (!tenant) {
    redirect("/app/onboarding");
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

        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-gray-400">
          <h2 className="font-medium">ATS — próximamente</h2>
          <p className="mt-1 text-sm">
            Vacantes, candidatos y pipeline de reclutamiento.
          </p>
        </div>
      </div>
    </div>
  );
}
