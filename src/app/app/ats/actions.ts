"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function slugify(text: string) {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") +
    "-" +
    Math.random().toString(36).slice(2, 8)
  );
}

export async function createVacancy(tenantId: string, formData: FormData) {
  const supabase = await createClient();

  const title = (formData.get("title") as string)?.trim();
  const departmentId = (formData.get("department_id") as string) || null;
  const description = (formData.get("description") as string) || null;
  const requirements = (formData.get("requirements") as string) || null;

  if (!title) return;

  const { error } = await supabase.from("vacancies").insert({
    tenant_id: tenantId,
    department_id: departmentId,
    title,
    slug: slugify(title),
    description,
    requirements,
    status: "draft",
  });

  if (error) {
    console.error("createVacancy error:", error.message);
  }

  revalidatePath("/app/ats");
}

export async function updateVacancyStatus(
  vacancyId: string,
  status: "draft" | "published" | "closed"
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("vacancies")
    .update({ status })
    .eq("id", vacancyId);

  if (error) {
    console.error("updateVacancyStatus error:", error.message);
  }

  revalidatePath("/app/ats");
}

export async function deleteVacancy(vacancyId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("vacancies")
    .delete()
    .eq("id", vacancyId);

  if (error) {
    console.error("deleteVacancy error:", error.message);
  }

  revalidatePath("/app/ats");
  redirect("/app/ats");
}

// Clona una vacante como borrador nuevo (titulo, departamento,
// descripcion, requisitos y sus preguntas filtro), para vacantes
// recurrentes que se vuelven a abrir con los mismos requisitos. La
// vacante original no se toca -- nunca copia candidatos ni el estado
// (siempre nace en 'draft', el gestor decide cuando publicarla).
export async function duplicateVacancy(vacancyId: string) {
  const supabase = await createClient();

  const { data: original, error: fetchError } = await supabase
    .from("vacancies")
    .select("tenant_id, department_id, title, description, requirements")
    .eq("id", vacancyId)
    .maybeSingle();

  if (fetchError || !original) {
    console.error("duplicateVacancy fetch error:", fetchError?.message);
    revalidatePath("/app/ats");
    return;
  }

  const { data: newVacancy, error: insertError } = await supabase
    .from("vacancies")
    .insert({
      tenant_id: original.tenant_id,
      department_id: original.department_id,
      title: `${original.title} (copia)`,
      slug: slugify(original.title),
      description: original.description,
      requirements: original.requirements,
      status: "draft",
    })
    .select("id")
    .single();

  if (insertError || !newVacancy) {
    console.error("duplicateVacancy insert error:", insertError?.message);
    revalidatePath("/app/ats");
    return;
  }

  const { data: questions } = await supabase
    .from("vacancy_questions")
    .select("question_text, question_type, options, required, order_index")
    .eq("vacancy_id", vacancyId);

  if (questions && questions.length > 0) {
    const { error: questionsError } = await supabase
      .from("vacancy_questions")
      .insert(
        questions.map((q) => ({
          tenant_id: original.tenant_id,
          vacancy_id: newVacancy.id,
          question_text: q.question_text,
          question_type: q.question_type,
          options: q.options,
          required: q.required,
          order_index: q.order_index,
        }))
      );

    if (questionsError) {
      console.error("duplicateVacancy questions error:", questionsError.message);
    }
  }

  revalidatePath("/app/ats");
  redirect(`/app/ats/${newVacancy.id}`);
}
