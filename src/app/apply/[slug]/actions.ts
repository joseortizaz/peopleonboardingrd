"use server";

import { randomUUID, createHash } from "crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const MAX_RESUME_SIZE = 5 * 1024 * 1024; // 5 MB

export async function applyToVacancy(
  vacancyId: string,
  slug: string,
  formData: FormData
) {
  const supabase = await createClient();

  // --- Anti-spam capa 1: honeypot. Un campo oculto que ningun humano
  // llena (nunca lo ve), pero que un bot que autocompleta formularios
  // si suele llenar. No se revela que fue detectado -- se responde
  // igual que un envio exitoso para no darle retroalimentacion al bot.
  const honeypot = (formData.get("website") as string)?.trim();
  if (honeypot) {
    redirect(`/apply/${slug}?ok=1`);
  }

  // --- Anti-spam capa 2: time-trap. Un formulario real toma al menos
  // unos segundos en llenarse; un envio automatizado normalmente ocurre
  // casi instantaneo tras cargar la pagina. Mismo trato silencioso.
  const renderedAtRaw = formData.get("form_rendered_at") as string;
  const renderedAt = renderedAtRaw ? Number(renderedAtRaw) : 0;
  const elapsedMs = renderedAt ? Date.now() - renderedAt : Number.POSITIVE_INFINITY;
  if (elapsedMs < 3000) {
    redirect(`/apply/${slug}?ok=1`);
  }

  // --- Anti-spam capa 3: limite de intentos por IP. Este si se le
  // informa al usuario (a diferencia de las capas de arriba) porque
  // puede ser un humano real enviando varias aplicaciones legitimas.
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headersList.get("x-real-ip") ||
    "unknown";
  const ipHash = createHash("sha256").update(ip).digest("hex");

  const { data: allowed } = await supabase.rpc("check_public_form_rate_limit", {
    p_route: "apply",
    p_ip_hash: ipHash,
    p_window_minutes: 10,
    p_max_attempts: 5,
  });

  if (allowed === false) {
    redirect(
      `/apply/${slug}?error=${encodeURIComponent(
        "Demasiadas solicitudes desde tu conexión. Intenta de nuevo más tarde."
      )}`
    );
  }

  const full_name = (formData.get("full_name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim() || null;
  const resumeFile = formData.get("resume") as File | null;

  if (!full_name || !email) {
    redirect(`/apply/${slug}?error=Nombre+y+correo+son+obligatorios`);
  }

  if (!formData.get("data_consent")) {
    redirect(
      `/apply/${slug}?error=${encodeURIComponent(
        "Debes aceptar el tratamiento de tus datos personales para continuar."
      )}`
    );
  }

  const { data: alreadyApplied } = await supabase.rpc(
    "candidate_already_applied",
    { p_vacancy_id: vacancyId, p_email: email }
  );

  if (alreadyApplied) {
    redirect(
      `/apply/${slug}?error=${encodeURIComponent(
        "Ya recibimos una aplicación con este correo para esta vacante."
      )}`
    );
  }

  let resume_url: string | null = null;
  let resume_file_name: string | null = null;
  let resume_size: number | null = null;

  if (resumeFile && resumeFile.size > 0) {
    if (resumeFile.type !== "application/pdf") {
      redirect(
        `/apply/${slug}?error=${encodeURIComponent(
          "El CV debe ser un archivo PDF."
        )}`
      );
    }

    if (resumeFile.size > MAX_RESUME_SIZE) {
      redirect(
        `/apply/${slug}?error=${encodeURIComponent(
          "El CV no puede superar 5 MB."
        )}`
      );
    }

    // Se relee la vacante (en vez de confiar en datos del formulario) para
    // obtener su tenant_id real y construir la ruta de Storage -- el mismo
    // enfoque de no confiar en el cliente que ya usa el trigger
    // set_candidate_tenant() para la fila del candidato.
    const { data: vacancy } = await supabase
      .from("vacancies")
      .select("id, tenant_id")
      .eq("id", vacancyId)
      .eq("status", "published")
      .maybeSingle();

    if (!vacancy) {
      redirect(
        `/apply/${slug}?error=${encodeURIComponent("Vacante no disponible.")}`
      );
    }

    const safeName = resumeFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${vacancy!.tenant_id}/${vacancyId}/${randomUUID()}-${safeName}`;
    const arrayBuffer = await resumeFile.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from("candidate-resumes")
      .upload(storagePath, arrayBuffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      redirect(
        `/apply/${slug}?error=${encodeURIComponent(
          "No se pudo subir el CV: " + uploadError.message
        )}`
      );
    }

    resume_url = storagePath;
    resume_file_name = resumeFile.name;
    resume_size = resumeFile.size;
  }

  // Preguntas filtro: se releen desde la base (no se confia en el
  // formulario) para validar las obligatorias y para tener el texto de
  // la pregunta a mano si hace falta reportar un error.
  const { data: questions } = await supabase
    .from("vacancy_questions")
    .select("id, question_text, required")
    .eq("vacancy_id", vacancyId);

  const answers: { question_id: string; answer_text: string }[] = [];
  for (const q of questions ?? []) {
    const value = (formData.get(`answer_${q.id}`) as string)?.trim() || "";
    if (q.required && !value) {
      if (resume_url) {
        await supabase.storage.from("candidate-resumes").remove([resume_url]);
      }
      redirect(
        `/apply/${slug}?error=${encodeURIComponent(
          `Falta responder: ${q.question_text}`
        )}`
      );
    }
    if (value) {
      answers.push({ question_id: q.id, answer_text: value });
    }
  }

  const { data: candidate, error } = await supabase
    .from("candidates")
    .insert({
      vacancy_id: vacancyId,
      full_name,
      email,
      phone,
      resume_url,
      resume_file_name,
      resume_size,
      data_consent_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !candidate) {
    console.error("applyToVacancy error:", error?.message);
    if (resume_url) {
      await supabase.storage.from("candidate-resumes").remove([resume_url]);
    }
    redirect(
      `/apply/${slug}?error=${encodeURIComponent(
        error?.message ?? "No se pudo registrar la aplicación."
      )}`
    );
  }

  if (answers.length > 0) {
    const { error: answersError } = await supabase
      .from("candidate_answers")
      .insert(
        answers.map((a) => ({
          candidate_id: candidate.id,
          question_id: a.question_id,
          answer_text: a.answer_text,
        }))
      );

    if (answersError) {
      // No revertimos al candidato ya creado: es preferible conservar la
      // aplicacion aunque una respuesta puntual falle a perder todo el
      // registro del candidato.
      console.error("applyToVacancy answers error:", answersError.message);
    }
  }

  redirect(`/apply/${slug}?ok=1`);
}
