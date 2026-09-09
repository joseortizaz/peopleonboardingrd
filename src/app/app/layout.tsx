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
              </>
            )}
            <Link
              href="/app/mi-espacio"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Mi espacio
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
