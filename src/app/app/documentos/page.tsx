import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, isManagerRole } from "@/lib/supabase/tenant";
import { uploadDocument, deleteDocument } from "./actions";
import DownloadDocumentButton from "./DownloadDocumentButton";

const DOC_TYPE_SUGGESTIONS = [
  "Cédula de identidad",
  "Pasaporte",
  "Contrato de trabajo",
  "Currículum",
  "Certificado médico",
  "Antecedentes penales (Procuraduría)",
  "Referencias laborales",
  "Título académico / certificación",
];

function expirationBadge(expiresAt: string | null) {
  if (!expiresAt) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expiresAt + "T00:00:00");
  const diffDays = Math.round((exp.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) {
    return { label: "Vencido", className: "bg-red-100 text-red-700" };
  }
  if (diffDays <= 30) {
    return { label: "Por vencer", className: "bg-amber-100 text-amber-700" };
  }
  return { label: "Vigente", className: "bg-emerald-100 text-emerald-700" };
}

const dateFmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("es-DO");
const dateTimeFmt = (d: string) => new Date(d).toLocaleString("es-DO");

export default async function DocumentosPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/onboarding");
  if (!isManagerRole(tenant.myRole)) redirect("/app/mi-espacio");

  const supabase = await createClient();

  const [{ data: employees }, { data: documents }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name")
      .eq("tenant_id", tenant.id)
      .order("full_name", { ascending: true }),
    supabase
      .from("employee_documents")
      .select(
        "id, doc_type, file_name, expires_at, notes, storage_path, created_at, requires_signature, signed_at, signed_full_name, signed_ip, signed_document_hash, employees(full_name)"
      )
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false }),
  ]);

  const uploadForTenant = uploadDocument.bind(null, tenant.id);

  const sorted = [...(documents ?? [])].sort((a, b) => {
    if (!a.expires_at && !b.expires_at) return 0;
    if (!a.expires_at) return 1;
    if (!b.expires_at) return -1;
    return a.expires_at.localeCompare(b.expires_at);
  });

  const expiringCount = (documents ?? []).filter((d) => {
    const badge = expirationBadge(d.expires_at);
    return badge?.label === "Vencido" || badge?.label === "Por vencer";
  }).length;

  const pendingSignatureCount = (documents ?? []).filter(
    (d) => d.requires_signature && !d.signed_at
  ).length;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-xl font-semibold text-gray-900">
        Documentos — {tenant.name}
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Expediente digital por empleado: cédulas, contratos, certificaciones
        y otros documentos, con alerta visual de vencimiento y firma
        electrónica opcional.
        {expiringCount > 0 && (
          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            {expiringCount} documento(s) vencido(s) o por vencer
          </span>
        )}
        {pendingSignatureCount > 0 && (
          <span className="ml-2 rounded-full bg-gray-900 px-2 py-0.5 text-xs font-medium text-white">
            {pendingSignatureCount} pendiente(s) de firma
          </span>
        )}
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">Subir documento</h2>
        <form
          action={uploadForTenant}
          encType="multipart/form-data"
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <div>
            <label className="block text-xs text-gray-500">Empleado</label>
            <select
              name="employee_id"
              required
              defaultValue=""
              className="mt-1 min-w-[180px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Seleccionar...
              </option>
              {(employees ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500">
              Tipo de documento
            </label>
            <input
              name="doc_type"
              list="doc-type-suggestions"
              required
              placeholder="Ej. Cédula de identidad"
              className="mt-1 min-w-[200px] rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <datalist id="doc-type-suggestions">
              {DOC_TYPE_SUGGESTIONS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-xs text-gray-500">Archivo</label>
            <input name="file" type="file" required className="mt-1 block text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500">
              Vence el (opcional)
            </label>
            <input
              name="expires_at"
              type="date"
              className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500">
              Notas (opcional)
            </label>
            <input
              name="notes"
              type="text"
              placeholder="Notas"
              className="mt-1 min-w-[150px] rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <label className="flex items-center gap-1.5 pb-2 text-xs text-gray-600">
            <input name="requires_signature" type="checkbox" className="rounded" />
            Requiere firma electrónica
          </label>
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Subir
          </button>
        </form>
        <p className="mt-2 text-xs text-gray-400">
          El vencimiento es opcional — solo se usa para marcar el documento
          como &quot;Por vencer&quot; (dentro de 30 días) o &quot;Vencido&quot;.
          Si marcas &quot;Requiere firma electrónica&quot;, el empleado verá
          este documento como pendiente de firmar en su autoservicio (Mi
          espacio). Es una firma electrónica simple (nombre completo +
          consentimiento explícito), no una firma digital certificada por un
          proveedor externo — ver aviso en la firma de cada documento.
        </p>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Empleado</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Archivo</th>
              <th className="px-3 py-2">Vencimiento</th>
              <th className="px-3 py-2">Notas</th>
              <th className="px-3 py-2">Firma</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                  Aún no hay documentos cargados.
                </td>
              </tr>
            )}
            {sorted.map((d) => {
              const employeeName =
                (d.employees as unknown as { full_name: string } | null)
                  ?.full_name ?? "—";
              const badge = expirationBadge(d.expires_at);
              const remove = deleteDocument.bind(null, d.id, d.storage_path);
              return (
                <tr key={d.id}>
                  <td className="px-3 py-2 text-gray-900">{employeeName}</td>
                  <td className="px-3 py-2 text-gray-600">{d.doc_type}</td>
                  <td className="px-3 py-2 text-gray-600">{d.file_name}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {d.expires_at ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge?.className}`}
                        >
                          {badge?.label}
                        </span>
                        {dateFmt(d.expires_at)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{d.notes ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {!d.requires_signature ? (
                      "—"
                    ) : d.signed_at ? (
                      <details>
                        <summary className="inline-block cursor-pointer rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          Firmado
                        </summary>
                        <div className="mt-2 w-64 rounded-md border border-gray-200 bg-gray-50 p-2 text-xs text-gray-600">
                          <p>
                            <span className="text-gray-400">Firmado por:</span>{" "}
                            {d.signed_full_name}
                          </p>
                          <p>
                            <span className="text-gray-400">Fecha:</span>{" "}
                            {dateTimeFmt(d.signed_at)}
                          </p>
                          <p>
                            <span className="text-gray-400">IP:</span>{" "}
                            {d.signed_ip}
                          </p>
                          <p className="mt-1 break-all">
                            <span className="text-gray-400">
                              Hash SHA-256 del archivo:
                            </span>{" "}
                            <span className="font-mono">
                              {d.signed_document_hash}
                            </span>
                          </p>
                        </div>
                      </details>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Pendiente de firma
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <DownloadDocumentButton documentId={d.id} />
                      <form action={remove}>
                        <button className="text-xs text-red-600 hover:underline">
                          Eliminar
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
