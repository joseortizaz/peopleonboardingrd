import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/supabase/tenant";
import {
  addQuestion,
  deleteQuestion,
  moveQuestionDown,
  moveQuestionUp,
} from "./actions";

const QUESTION_TYPES: { key: string; label: string }[] = [
  { key: "texto", label: "Respuesta de texto" },
  { key: "si_no", label: "Sí / No" },
  { key: "opcion_multiple", label: "Opción múltiple" },
];

export default async function VacancyQuestionsPage({
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
    .select("id, title")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (!vacancy) notFound();

  const { data: questions } = await supabase
    .from("vacancy_questions")
    .select("id, question_text, question_type, options, required, order_index")
    .eq("vacancy_id", id)
    .order("order_index", { ascending: true });

  const list = questions ?? [];
  const add = addQuestion.bind(null, id, tenant.id);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link
        href={`/app/ats/${id}`}
        className="text-sm text-gray-500 hover:underline"
      >
        ← {vacancy.title}
      </Link>
      <h1 className="mt-2 text-xl font-semibold text-gray-900">
        Preguntas filtro
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Opcional. Si agregas preguntas, se muestran en el formulario público
        justo antes de enviar la aplicación.
      </p>

      <div className="mt-6 space-y-3">
        {list.map((q, idx) => {
          const del = deleteQuestion.bind(null, id, q.id);
          const up = moveQuestionUp.bind(null, id, q.id);
          const down = moveQuestionDown.bind(null, id, q.id);
          return (
            <div
              key={q.id}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {q.question_text}{" "}
                    {q.required && <span className="text-red-500">*</span>}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {QUESTION_TYPES.find((t) => t.key === q.question_type)
                      ?.label}
                    {q.question_type === "opcion_multiple" &&
                      Array.isArray(q.options) && (
                        <> — {(q.options as string[]).join(", ")}</>
                      )}
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <form action={up}>
                    <button
                      type="submit"
                      disabled={idx === 0}
                      className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-30"
                    >
                      ↑
                    </button>
                  </form>
                  <form action={down}>
                    <button
                      type="submit"
                      disabled={idx === list.length - 1}
                      className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-30"
                    >
                      ↓
                    </button>
                  </form>
                  <form action={del}>
                    <button
                      type="submit"
                      className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      Eliminar
                    </button>
                  </form>
                </div>
              </div>
            </div>
          );
        })}
        {list.length === 0 && (
          <p className="text-sm text-gray-500">
            Esta vacante no tiene preguntas filtro todavía.
          </p>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-gray-900">
          Agregar pregunta
        </h2>
        <form action={add} className="mt-3 space-y-3">
          <input
            name="question_text"
            type="text"
            required
            placeholder="Ej. ¿Cuántos años de experiencia tienes en...?"
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <select
            name="question_type"
            defaultValue="texto"
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {QUESTION_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
          <input
            name="options"
            type="text"
            placeholder="Solo para opción múltiple: opciones separadas por coma"
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              name="required"
              type="checkbox"
              className="rounded border-gray-300"
            />
            Obligatoria
          </label>
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Agregar pregunta
          </button>
        </form>
      </div>
    </div>
  );
}
