import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, isManagerRole } from "@/lib/supabase/tenant";
import {
  postAnnouncement,
  deleteAnnouncement,
  sendRecognitionAction,
  deleteRecognitionAction,
} from "./actions";

const dateFmt = (d: string) =>
  new Date(d).toLocaleDateString("es-DO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

export default async function ComunicacionPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/onboarding");
  if (tenant.myRole === "client") redirect("/app/portal-cliente");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isManager = isManagerRole(tenant.myRole);

  const { data: myEmployee } = user
    ? await supabase
        .from("employees")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("profile_id", user.id)
        .maybeSingle()
    : { data: null };

  const [{ data: announcements }, { data: recognitions }, { data: employees }] =
    await Promise.all([
      supabase
        .from("announcements")
        .select("id, title, body, created_at")
        .eq("tenant_id", tenant.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("recognitions")
        .select(
          "id, message, created_at, from_employee_id, from_employee:employees!recognitions_from_employee_id_fkey(full_name), to_employee:employees!recognitions_to_employee_id_fkey(full_name)"
        )
        .eq("tenant_id", tenant.id)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("employees")
        .select("id, full_name")
        .eq("tenant_id", tenant.id)
        .eq("status", "active")
        .order("full_name", { ascending: true }),
    ]);

  const postForTenant = postAnnouncement.bind(null, tenant.id);
  const recipients = (employees ?? []).filter((e) => e.id !== myEmployee?.id);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-xl font-semibold text-gray-900">
        Comunicación interna — {tenant.name}
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Tablón de anuncios y reconocimientos entre compañeros.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {isManager && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-medium text-gray-700">Publicar anuncio</h2>
          <form action={postForTenant} className="mt-3 space-y-3">
            <input
              name="title"
              type="text"
              required
              placeholder="Título"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <textarea
              name="body"
              required
              rows={3}
              placeholder="Contenido del anuncio"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Publicar
            </button>
          </form>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-sm font-medium text-gray-700">Anuncios</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {(announcements ?? []).length === 0 && (
            <p className="px-6 py-6 text-center text-sm text-gray-500">
              Aún no hay anuncios publicados.
            </p>
          )}
          {(announcements ?? []).map((a) => (
            <div key={a.id} className="px-6 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{a.title}</p>
                  <p className="mt-1 text-sm text-gray-600 whitespace-pre-wrap">
                    {a.body}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    {dateFmt(a.created_at)}
                  </p>
                </div>
                {isManager && (
                  <form action={deleteAnnouncement.bind(null, a.id)}>
                    <button className="shrink-0 text-xs text-red-600 hover:underline">
                      Eliminar
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-sm font-medium text-gray-700">Reconocimientos</h2>
        </div>

        {myEmployee ? (
          <form
            action={sendRecognitionAction}
            className="flex flex-wrap items-end gap-3 border-b border-gray-100 px-6 py-4"
          >
            <div>
              <label className="block text-xs text-gray-500">Para</label>
              <select
                name="to_employee_id"
                required
                defaultValue=""
                className="mt-1 min-w-[180px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  Seleccionar compañero...
                </option>
                {recipients.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name}
                  </option>
                ))}
              </select>
            </div>
            <input
              name="message"
              type="text"
              required
              placeholder="Mensaje de reconocimiento"
              className="min-w-[220px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Enviar
            </button>
          </form>
        ) : (
          <p className="border-b border-gray-100 px-6 py-4 text-xs text-gray-400">
            Solo los usuarios con un registro de empleado en este tenant pueden
            enviar reconocimientos.
          </p>
        )}

        <div className="divide-y divide-gray-100">
          {(recognitions ?? []).length === 0 && (
            <p className="px-6 py-6 text-center text-sm text-gray-500">
              Aún no hay reconocimientos.
            </p>
          )}
          {(recognitions ?? []).map((r) => {
            const fromName =
              (r.from_employee as unknown as { full_name: string } | null)
                ?.full_name ?? "—";
            const toName =
              (r.to_employee as unknown as { full_name: string } | null)
                ?.full_name ?? "—";
            const canDelete = isManager || r.from_employee_id === myEmployee?.id;
            return (
              <div key={r.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-gray-900">
                      <span className="font-medium">{fromName}</span>
                      {" → "}
                      <span className="font-medium">{toName}</span>
                    </p>
                    <p className="mt-1 text-sm text-gray-600">{r.message}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      {dateFmt(r.created_at)}
                    </p>
                  </div>
                  {canDelete && (
                    <form action={deleteRecognitionAction.bind(null, r.id)}>
                      <button className="shrink-0 text-xs text-red-600 hover:underline">
                        Eliminar
                      </button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
