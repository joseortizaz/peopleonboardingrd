import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/supabase/tenant";
import { moveCandidateStage } from "./actions";
import { StageSelect } from "./StageSelect";

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

type Candidate = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  stage: string;
};

export default async function VacancyKanbanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/onboarding");

  const supabase = await createClient();

  const { data: vacancy } = await supabase
    .from("vacancies")
    .select("id, title, slug, status")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (!vacancy) notFound();

  const { data: candidates } = await supabase
    .from("candidates")
    .select("id, full_name, email, phone, stage")
    .eq("vacancy_id", id)
    .order("created_at", { ascending: true });

  const byStage = (stage: string): Candidate[] =>
    (candidates ?? []).filter((c) => c.stage === stage);

  return (
    <div className="px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <Link href="/app/ats" className="text-sm text-gray-500 hover:underline">
          ← Vacantes
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-gray-900">
          {vacancy.title}
        </h1>
        <p className="text-sm text-gray-500">
          {(candidates ?? []).length} candidato(s) en el pipeline
        </p>

        <div className="mt-6 flex gap-4 overflow-x-auto pb-4">
          {STAGES.map((stage) => (
            <div
              key={stage.key}
              className="w-64 flex-shrink-0 rounded-xl border border-gray-200 bg-gray-50 p-3"
            >
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {stage.label} ({byStage(stage.key).length})
              </h2>
              <div className="space-y-2">
                {byStage(stage.key).map((candidate) => {
                  const move = moveCandidateStage.bind(
                    null,
                    vacancy.id,
                    candidate.id
                  );
                  return (
                    <div
                      key={candidate.id}
                      className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
                    >
                      <p className="text-sm font-medium text-gray-900">
                        {candidate.full_name}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        {candidate.email}
                      </p>
                      <StageSelect
                        action={move}
                        stage={candidate.stage}
                        stages={STAGES}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
