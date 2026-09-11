import { logout } from "../login/actions";

export default function CuentaSuspendidaPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-8">
        <h1 className="text-lg font-semibold text-gray-900">
          Suscripción inactiva
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          El acceso a esta cuenta está temporalmente suspendido. Si crees que
          esto es un error, comunícate con quien administra tu suscripción.
        </p>
      </div>
      <form action={logout} className="mt-6">
        <button
          type="submit"
          className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
        >
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}
