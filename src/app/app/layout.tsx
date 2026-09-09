import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <nav className="flex items-center gap-5">
            <Link href="/app" className="text-sm font-semibold text-gray-900">
              People Onboarding RD
            </Link>
            <Link
              href="/app/organizacion"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Estructura organizacional
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
