import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { unenrollFactor } from "./actions";
import { MfaEnroll } from "./MfaEnroll";

export default async function SeguridadPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: factorsData } = await supabase.auth.mfa.listFactors();
  const verifiedFactor = factorsData?.totp?.find((f) => f.status === "verified");

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-xl font-semibold text-gray-900">Seguridad de la cuenta</h1>
      <p className="mt-1 text-sm text-gray-500">
        Verificación en dos pasos con una app de autenticación. Es opcional y
        se activa desde aquí, para tu cuenta ({user.email}).
      </p>

      {message && (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        {verifiedFactor ? (
          <div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Verificación en dos pasos activada
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Cada vez que inicies sesión, se te pedirá además el código
                  de tu app de autenticación.
                </p>
              </div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                Activa
              </span>
            </div>
            <form action={unenrollFactor.bind(null, verifiedFactor.id)} className="mt-4">
              <button type="submit" className="text-xs text-red-600 hover:underline">
                Desactivar verificación en dos pasos
              </button>
            </form>
          </div>
        ) : (
          <MfaEnroll />
        )}
      </div>
    </div>
  );
}
