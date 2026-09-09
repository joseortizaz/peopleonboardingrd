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
