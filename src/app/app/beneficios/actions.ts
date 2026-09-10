"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const REVALIDATE_PATH = "/app/beneficios";

function toNumber(v: FormDataEntryValue | null): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function createBenefitType(tenantId: string, formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase.from("benefit_types").insert({
    tenant_id: tenantId,
    name: String(formData.get("name") ?? "").trim(),
    category: String(formData.get("category") ?? "otro"),
    provider: (String(formData.get("provider") ?? "").trim() || null) as string | null,
    employer_cost: toNumber(formData.get("employer_cost")),
    employee_cost: toNumber(formData.get("employee_cost")),
    notes: (String(formData.get("notes") ?? "").trim() || null) as string | null,
  });

  if (error) {
    redirect(
      `${REVALIDATE_PATH}?error=${encodeURIComponent(
        "No se pudo crear el beneficio: " + error.message
      )}`
    );
  }

  revalidatePath(REVALIDATE_PATH);
  redirect(REVALIDATE_PATH);
}

export async function deleteBenefitType(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("benefit_types").delete().eq("id", id);

  if (error) {
    redirect(
      `${REVALIDATE_PATH}?error=${encodeURIComponent(
        "No se pudo eliminar el beneficio: " + error.message
      )}`
    );
  }

  revalidatePath(REVALIDATE_PATH);
  redirect(REVALIDATE_PATH);
}

export async function assignBenefit(tenantId: string, formData: FormData) {
  const supabase = await createClient();

  const endDateRaw = String(formData.get("end_date") ?? "").trim();

  const { error } = await supabase.from("employee_benefits").insert({
    tenant_id: tenantId,
    employee_id: String(formData.get("employee_id") ?? ""),
    benefit_type_id: String(formData.get("benefit_type_id") ?? ""),
    start_date: String(formData.get("start_date") ?? "") || new Date().toISOString().slice(0, 10),
    end_date: endDateRaw || null,
    notes: (String(formData.get("notes") ?? "").trim() || null) as string | null,
  });

  if (error) {
    redirect(
      `${REVALIDATE_PATH}?error=${encodeURIComponent(
        "No se pudo asignar el beneficio: " + error.message
      )}`
    );
  }

  revalidatePath(REVALIDATE_PATH);
  redirect(REVALIDATE_PATH);
}

export async function endAssignment(id: string) {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { error } = await supabase
    .from("employee_benefits")
    .update({ end_date: today })
    .eq("id", id);

  if (error) {
    redirect(
      `${REVALIDATE_PATH}?error=${encodeURIComponent(
        "No se pudo finalizar la asignacion: " + error.message
      )}`
    );
  }

  revalidatePath(REVALIDATE_PATH);
  revalidatePath(`${REVALIDATE_PATH}/${id}`);
  redirect(REVALIDATE_PATH);
}

export async function deleteAssignment(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("employee_benefits").delete().eq("id", id);

  if (error) {
    redirect(
      `${REVALIDATE_PATH}?error=${encodeURIComponent(
        "No se pudo eliminar la asignacion: " + error.message
      )}`
    );
  }

  revalidatePath(REVALIDATE_PATH);
  redirect(REVALIDATE_PATH);
}

export async function addDependent(employeeBenefitId: string, formData: FormData) {
  const supabase = await createClient();
  const revalidateTo = `${REVALIDATE_PATH}/${employeeBenefitId}`;

  const fullName = String(formData.get("full_name") ?? "").trim();
  if (!fullName) {
    redirect(`${revalidateTo}?error=${encodeURIComponent("El nombre del dependiente es obligatorio")}`);
  }

  const birthDateRaw = String(formData.get("birth_date") ?? "").trim();

  const { error } = await supabase.from("benefit_dependents").insert({
    employee_benefit_id: employeeBenefitId,
    full_name: fullName,
    relationship: String(formData.get("relationship") ?? "otro"),
    birth_date: birthDateRaw || null,
  });

  if (error) {
    redirect(
      `${revalidateTo}?error=${encodeURIComponent(
        "No se pudo agregar el dependiente: " + error.message
      )}`
    );
  }

  revalidatePath(revalidateTo);
  redirect(revalidateTo);
}

export async function deleteDependent(employeeBenefitId: string, id: string) {
  const supabase = await createClient();
  const revalidateTo = `${REVALIDATE_PATH}/${employeeBenefitId}`;
  const { error } = await supabase.from("benefit_dependents").delete().eq("id", id);

  if (error) {
    redirect(
      `${revalidateTo}?error=${encodeURIComponent(
        "No se pudo eliminar el dependiente: " + error.message
      )}`
    );
  }

  revalidatePath(revalidateTo);
  redirect(revalidateTo);
}
