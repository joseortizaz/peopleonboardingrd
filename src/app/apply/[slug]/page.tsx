import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { applyToVacancy } from "./actions";

export default async function ApplyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;

  const supabase = await createClient();
  const { data: vacancy } = await supabase
    .from("vacancies")
    .select("id, title, description, requirements, status, slug")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (!vacancy) notFound();

  const { data: questions } = await supabase
    .from("vacancy_questions")
    .select("id, question_text, question_type, options, required")
    .eq("vacancy_id", vacancy.id)
    .order("order_index", { ascending: true });

  const submit = applyToVacancy.bind(null, vacancy.id, vacancy.slug);

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold text-gray-900">{vacancy.title}</h1>

      {vacancy.description && (
        <p className="mt-4 whitespace-pre-line text-gray-700">
          {vacancy.description}
        </p>
      )}

      {vacancy.requirements && (
        <div className="mt-4">
          <h2 className="text-sm font-medium text-gray-900">Requisitos</h2>
          <p className="mt-1 whitespace-pre-line text-sm text-gray-700">
            {vacancy.requirements}
          </p>
        </div>
      )}

      <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        {query.ok ? (
          <p className="rounded-md bg-green-50 px-3 py-3 text-sm text-green-700">
            ¡Gracias por tu interés! Recibimos tu aplicación y te
            contactaremos si tu perfil avanza en el proceso.
          </p>
        ) : (
          <>
            <h2 className="text-sm font-medium text-gray-900">Aplicar a esta vacante</h2>
            {query.error && (
              <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {query.error}
              </p>
            )}
            <form action={submit} className="mt-4 space-y-3">
              <input
                name="full_name"
                type="text"
                placeholder="Nombre completo"
                required
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                name="email"
                type="email"
                placeholder="Correo"
                required
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                name="phone"
                type="tel"
                placeholder="Teléfono (809-000-0000)"
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <div>
                <label className="block text-xs font-medium text-gray-500">
                  Currículum (CV) en PDF -- opcional, máx. 5 MB
                </label>
                <input
                  name="resume"
                  type="file"
                  accept="application/pdf"
                  className="mt-1 block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
                />
              </div>
              {(questions ?? []).length > 0 && (
                <div className="space-y-3 border-t border-gray-200 pt-3">
                  <p className="text-xs font-medium text-gray-500">
                    Preguntas adicionales
                  </p>
                  {(questions ?? []).map((q) => (
                    <div key={q.id}>
                      <label className="block text-sm text-gray-700">
                        {q.question_text}{" "}
                        {q.required && (
                          <span className="text-red-500">*</span>
                        )}
                      </label>
                      {q.question_type === "texto" && (
                        <input
                          name={`answer_${q.id}`}
                          type="text"
                          required={q.required}
                          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                        />
                      )}
                      {q.question_type === "si_no" && (
                        <select
                          name={`answer_${q.id}`}
                          required={q.required}
                          defaultValue=""
                          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                        >
                          <option value="" disabled>
                            Selecciona una opción
                          </option>
                          <option value="Sí">Sí</option>
                          <option value="No">No</option>
                        </select>
                      )}
                      {q.question_type === "opcion_multiple" && (
                        <select
                          name={`answer_${q.id}`}
                          required={q.required}
                          defaultValue=""
                          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                        >
                          <option value="" disabled>
                            Selecciona una opción
                          </option>
                          {(Array.isArray(q.options)
                            ? (q.options as string[])
                            : []
                          ).map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <button
                type="submit"
                className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
              >
                Enviar aplicación
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
