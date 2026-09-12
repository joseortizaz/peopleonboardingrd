import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { updatePassword } from "./actions";
import PasswordInput from "./PasswordInput";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Restablecer contraseña
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Elige una nueva contraseña para tu cuenta.
          </p>
        </div>

        {params.error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {params.error}
          </p>
        )}

        {!user ? (
          <div className="space-y-3">
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Este enlace ya no es válido o expiró. Solicita uno nuevo.
            </p>
            <Link
              href="/login/olvide-password"
              className="block text-center text-sm text-gray-700 underline hover:text-gray-900"
            >
              Solicitar nuevo enlace
            </Link>
          </div>
        ) : (
          <form action={updatePassword} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Nueva contraseña
              </label>
              <PasswordInput
                id="password"
                name="password"
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label
                htmlFor="confirm_password"
                className="block text-sm font-medium text-gray-700"
              >
                Confirmar contraseña
              </label>
              <PasswordInput
                id="confirm_password"
                name="confirm_password"
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Actualizar contraseña
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
