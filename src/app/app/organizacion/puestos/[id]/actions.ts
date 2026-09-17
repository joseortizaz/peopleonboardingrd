"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Nunca actualiza una banda existente -- cada llamada inserta una version
// nueva. Ver claude/plan-robustecer-estructura-puestos.md, seccion 2, y el
// comentario de cabecera de la migracion 0039.
export async function createSalaryBand(
  tenantId: string,
  jobPositionId: string,
  formData: FormData
) {
  const supabase = await createClient();

  const errorRedirect = (message: string) => {
    redirect(
      `/app/organizacion/puestos/${jobPositionId}?error=${encodeURIComponent(
        message
      )}`
    );
  };

  const min_salary_raw = (formData.get("min_salary") as string)?.trim();
  const max_salary_raw = (formData.get("max_salary") as string)?.trim();
  const effective_from = (formData.get("effective_from") as string)?.trim();
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!min_salary_raw || !max_salary_raw || !effective_from) {
    errorRedirect("El mínimo, el máximo y la fecha de vigencia son obligatorios.");
    return;
  }

  const min_salary = Number(min_salary_raw);
  const max_salary = Number(max_salary_raw);

  if (Number.isNaN(min_salary) || Number.isNaN(max_salary)) {
    errorRedirect("El salario mínimo y máximo deben ser números válidos.");
    return;
  }

  if (max_salary < min_salary) {
    errorRedirect("El salario máximo no puede ser menor que el mínimo.");
    return;
  }

  // No se permite insertar una version con fecha anterior a la ultima ya
  // registrada -- el historial de bandas nunca contradice lo ya vigente.
  // Si hace falta corregir un error de captura, se corrige esa fila
  // directamente en la base de datos, no se inserta una version falsa.
  const { data: latest } = await supabase
    .from("job_position_salary_bands")
    .select("effective_from")
    .eq("job_position_id", jobPositionId)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest && effective_from < latest.effective_from) {
    errorRedirect(
      `La fecha de vigencia no puede ser anterior a la última versión registrada (${latest.effective_from}).`
    );
    return;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("job_position_salary_bands").insert({
    tenant_id: tenantId,
    job_position_id: jobPositionId,
    min_salary,
    max_salary,
    effective_from,
    notes,
    created_by: user?.id ?? null,
  });

  if (error) {
    console.error("createSalaryBand error:", error.message);
    errorRedirect("No se pudo guardar la banda salarial.");
    return;
  }

  revalidatePath(`/app/organizacion/puestos/${jobPositionId}`);
  redirect(`/app/organizacion/puestos/${jobPositionId}`);
}
