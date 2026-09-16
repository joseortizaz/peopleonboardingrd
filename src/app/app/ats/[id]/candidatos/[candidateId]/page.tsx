import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/supabase/tenant";
import { StageSelect } from "../../StageSelect";
import { moveCandidateStage } from "../../actions";
import { updateCandidateNotes, updateCandidateRejectionReason } from "./actions";
import DownloadResumeButton from "./DownloadResumeButton";

const STAGES: { key: string; label: string }[] = [
  { key: "recibido", label: "Recibido" },
  { key: "en_revision", label: "En revisión" },
  { key: "entrevista_rh", label: "Entrevista RH" },
  { key: "entrevista_gerencia", label: "Entrevista gerencia" },
  { key: "prueba", label: "Prueba" },
  { key: "oferta", label: "Oferta" },
  { key: "contratado", label: "Contratado" },
  { key: "rechazado", label: "Rechazado" },
];

export default async function CandidateDetailPage({
  params,
}: {
  params: Promise<{ id: string; candidateId: string }>;
}) {
  const { id, candidateId } = await params;
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/onboarding");

  const supabase = await createClient();

  const { data: vacancy } = await supabase
    .from("vacancies")
    .select("id, title")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (!vacancy) notFound();

  const { data: candidate } = await supabase
    .from("candidates")
    .select(
      "id, full_name, email, phone, stage, notes, rejection_reason, resume_url, resume_file_name, resume_size, created_at"
    )
    .eq("id", candidateId)
    .eq("vacancy_id", id)
    .maybeSingle();

  if (!candidate) notFound();

  const { data: answers } = await supabase
    .from("candidate_answers")
    .select("id, answer_text, vacancy_questions(question_text)")
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: true });

  const move = moveCandidateStage.bind(null, id, candidateId);
  const saveNotes = updateCandidateNotes.bind(null, id, candidateId);
  const saveRejectionReason = updateCandidateRejectionReason.bind(
    null,
    id,
    candidateId
  );

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link
        href={`/app/ats/${id}`}
        className="text-sm text-gray-500 hover:underline"
      >
        ← {vacancy.title}
      </Link>

      <h1 className="mt-2 text-xl font-semibold text-gray-900">
        {candidate.full_name}
      </h1>

      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-gray-500">Correo</dt>
            <dd className="text-sm text-gray-900">{candidate.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">Teléfono</dt>
            <dd className="text-sm text-gray-900">
              {candidate.phone || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">Aplicó el</dt>
            <dd className="text-sm text-gray-900">
              {new Date(candidate.created_at).toLocaleString("es-DO")}
            </dd>
          </div>
        </dl>

        <div className="mt-4 max-w-xs">
          <p className="text-xs font-medium text-gray-500">Etapa</p>
          <div className="mt-1">
            <StageSelect action={move} stage={candidate.stage} stages={STAGES} />
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">Currículum (CV)</h2>
        {candidate.resume_url ? (
          <div className="mt-2 flex items-center gap-3">
            <span className="text-sm text-gray-700">
              {candidate.resume_file_name ?? "cv.pdf"}
              {typeof candidate.resume_size === "number" && (
                <span className="text-xs text-gray-400">
                  {" "}
                  ({Math.round(candidate.resume_size / 1024)} KB)
                </span>
              )}
            </span>
            <DownloadResumeButton candidateId={candidate.id} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-gray-500">
            El candidato no adjuntó un CV.
          </p>
        )}
      </div>

      {answers && answers.length > 0 && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-medium text-gray-700">
            Respuestas a preguntas filtro
          </h2>
          <dl className="mt-2 space-y-3">
            {answers.map((a) => (
              <div key={a.id}>
                <dt className="text-xs font-medium text-gray-500">
                  {(a.vacancy_questions as unknown as { question_text: string } | null)
                    ?.question_text ?? "Pregunta eliminada"}
                </dt>
                <dd className="text-sm text-gray-900">{a.answer_text}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {candidate.stage === "rechazado" && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-medium text-gray-700">
            Motivo de rechazo
          </h2>
          <form action={saveRejectionReason} className="mt-2 flex gap-2">
            <input
              name="rejection_reason"
              type="text"
              defaultValue={candidate.rejection_reason ?? ""}
              placeholder="Ej. no cumple con la experiencia requerida"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Guardar
            </button>
          </form>
          <p className="mt-2 text-xs text-gray-400">
            Solo visible para gestión — nunca se muestra al candidato ni en
            el portal del cliente.
          </p>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700">Notas internas</h2>
        <form action={saveNotes} className="mt-2 space-y-2">
          <textarea
            name="notes"
            defaultValue={candidate.notes ?? ""}
            rows={4}
            placeholder="Notas del reclutador sobre este candidato..."
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Guardar notas
          </button>
        </form>
        <p className="mt-2 text-xs text-gray-400">
          Solo visible para gestión — nunca se muestra al candidato ni en el
          portal del cliente.
        </p>
      </div>
    </div>
  );
}
