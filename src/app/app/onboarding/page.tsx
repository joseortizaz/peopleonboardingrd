import { getCurrentTenant } from "@/lib/supabase/tenant";
import { redirect } from "next/navigation";
import { createCompany } from "./actions";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const tenant = await getCurrentTenant();

  if (tenant) {
    redirect("/app");
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Crea tu empresa
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Antes de continuar, cuéntanos para quién es esta cuenta.
          </p>
        </div>

        {params.error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {params.error}
          </p>
        )}

        <form action={createCompany} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Nombre de la empresa
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="rnc" className="block text-sm font-medium text-gray-700">
              RNC (opcional)
            </label>
            <input
              id="rnc"
              name="rnc"
              type="text"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="kind" className="block text-sm font-medium text-gray-700">
              Tipo de cuenta
            </label>
            <select
              id="kind"
              name="kind"
              defaultValue="company"
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="company">Empresa con RR.HH. propio</option>
              <option value="outsourcing_agency">
                Firma de outsourcing / gestor independiente
              </option>
            </select>
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Crear
          </button>
        </form>
      </div>
    </div>
  );
}
