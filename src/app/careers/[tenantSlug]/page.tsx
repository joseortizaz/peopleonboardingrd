import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type PublicTenant = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
};

type PublicVacancy = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
};

export default async function CareersPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const supabase = await createClient();

  const { data: tenantRows } = await supabase.rpc("get_public_tenant_by_slug", {
    p_slug: tenantSlug,
  });
  const tenant = (tenantRows as PublicTenant[] | null)?.[0] ?? null;

  if (!tenant) notFound();

  const { data: vacancies } = await supabase
    .from("vacancies")
    .select("id, title, slug, description")
    .eq("tenant_id", tenant.id)
    .eq("status", "published")
    .order("created_at", { ascending: false });

  const typedVacancies = (vacancies ?? []) as PublicVacancy[];

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-6 py-16">
      <div className="flex items-center gap-3">
        {tenant.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tenant.logo_url}
            alt={tenant.name}
            className="h-10 w-10 rounded-md object-contain"
          />
        )}
        <h1 className="text-2xl font-semibold text-gray-900">
          Vacantes en {tenant.name}
        </h1>
      </div>
      <p className="mt-2 text-sm text-gray-500">
        Estas son las posiciones abiertas actualmente. Haz clic en una
        vacante para ver los detalles y aplicar.
      </p>

      <div className="mt-8 space-y-4">
        {typedVacancies.length === 0 && (
          <p className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
            No hay vacantes abiertas en este momento. Vuelve a revisar más
            adelante.
          </p>
        )}
        {typedVacancies.map((v) => (
          <Link
            key={v.id}
            href={`/apply/${v.slug}`}
            className="block rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-gray-300 hover:shadow-md"
          >
            <h2 className="font-medium text-gray-900">{v.title}</h2>
            {v.description && (
              <p className="mt-1 line-clamp-2 text-sm text-gray-600">
                {v.description}
              </p>
            )}
            <span className="mt-2 inline-block text-xs font-medium text-blue-700">
              Ver vacante y aplicar →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
