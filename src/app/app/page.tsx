import { createClient } from "@/lib/supabase/server";
import { logout } from "../login/actions";

export default async function AppHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">
            Panel — People Onboarding RD
          </h1>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
            >
              Cerrar sesión
            </button>
          </form>
        </div>

        <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-500">Sesión activa</p>
          <p className="mt-1 text-lg font-medium text-gray-900">{user?.email}</p>
          <p className="mt-4 text-sm text-gray-500">
            Aquí vivirá el resto de la suite: estructura organizacional, ATS,
            evaluación de desempeño y, más adelante, nómina y autoservicio.
          </p>
        </div>
      </div>
    </div>
  );
}
