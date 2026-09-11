import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, isManagerRole } from "@/lib/supabase/tenant";
import { logout } from "../login/actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const tenant = await getCurrentTenant();
  const isManager = isManagerRole(tenant?.myRole ?? null);
  const { data: isSuperAdmin } = await supabase.rpc("is_super_admin");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <nav className="flex items-center gap-5">
            <Link href="/app" className="text-sm font-semibold text-gray-900">
              People Onboarding RD
            </Link>
            {isManager && (
              <>
                <Link
                  href="/app/organizacion"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Estructura organizacional
                </Link>
                <Link
                  href="/app/ats"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Reclutamiento
                </Link>
                <Link
                  href="/app/empleados"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Empleados
                </Link>
                <Link
                  href="/app/evaluaciones"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Evaluaciones
                </Link>
                <Link
                  href="/app/incorporacion"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Incorporación
                </Link>
                <Link
                  href="/app/bajas"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Bajas
                </Link>
                <Link
                  href="/app/nomina"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Nómina
                </Link>
                <Link
                  href="/app/documentos"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Documentos
                </Link>
                <Link
                  href="/app/asistencia"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Asistencia
                </Link>
                <Link
                  href="/app/permisos"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Permisos
                </Link>
                <Link
                  href="/app/beneficios"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Beneficios
                </Link>
                <Link
                  href="/app/capacitacion"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Capacitación
                </Link>
                <Link
                  href="/app/comunicacion"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Comunicación
                </Link>
                <Link
                  href="/app/encuestas"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Encuestas
                </Link>
                <Link
                  href="/app/analytics"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Analytics
                </Link>
                <Link
                  href="/app/portal-cliente/gestionar"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Portal del cliente
                </Link>
              </>
            )}
            {isSuperAdmin && (
              <Link
                href="/app/superadmin"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Super Admin
              </Link>
            )}
            {tenant?.myRole && tenant.myRole !== "client" && !isManager && (
              <>
                <Link
                  href="/app/comunicacion"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Comunicación
                </Link>
                <Link
                  href="/app/encuestas"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Encuestas
                </Link>
              </>
            )}
            {tenant?.myRole === "client" ? (
              <Link
                href="/app/portal-cliente"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Portal del cliente
              </Link>
            ) : (
              <Link
                href="/app/mi-espacio"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Mi espacio
              </Link>
            )}
            <Link
              href="/app/seguridad"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Seguridad
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{user?.email}</span>
            <form action={logout}>
              <button
                type="submit"
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
              >
                Cerrar sesión
              </button>
            </form>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
