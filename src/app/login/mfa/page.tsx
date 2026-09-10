import { logout } from "../actions";
import { verifyLoginMfa } from "./actions";

export default async function LoginMfaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Verificación en dos pasos
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Ingresa el código de 6 dígitos de tu app de autenticación.
          </p>
        </div>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <form action={verifyLoginMfa} className="space-y-4">
          <div>
            <label htmlFor="code" className="block text-sm font-medium text-gray-700">
              Código
            </label>
            <input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              autoFocus
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-center text-lg tracking-widest"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Verificar
          </button>
        </form>

        <form action={logout}>
          <button
            type="submit"
            className="w-full text-center text-xs text-gray-500 hover:underline"
          >
            ¿No tienes acceso a tu app de autenticación? Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}
