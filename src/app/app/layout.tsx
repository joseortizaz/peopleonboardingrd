import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, isTenantManagerRole } from "@/lib/supabase/tenant";
import { logout } from "../login/actions";
import { TopNav } from "./TopNav";

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
  // Gestiona el tenant (ve Nómina, Documentos, etc.) solo si es de verdad
  // account_admin/hr_manager de ese tenant -- un super_admin de plataforma
  // NO cuenta, aunque técnicamente esté atado a un tenant (ver tenant.ts).
  const isManager = isTenantManagerRole(tenant?.myRole ?? null);
  const isPureSuperAdmin = tenant?.myRole === "super_admin";
  const { data: isSuperAdmin } = await supabase.rpc("is_super_admin");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-2.5">
          <TopNav
            isManager={isManager}
            isPureSuperAdmin={isPureSuperAdmin}
            isSuperAdmin={!!isSuperAdmin}
            myRole={tenant?.myRole ?? null}
          />
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden text-sm text-gray-500 sm:inline">
              {user?.email}
            </span>
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
