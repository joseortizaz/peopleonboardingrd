"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createJobPosition(tenantId: string, formData: FormData) {
  const supabase = await createClient();

  const title = (formData.get("title") as string)?.trim();
  const department_id = (formData.get("department_id") as string) || null;

  if (!title) return;

  const { error } = await supabase.from("job_positions").insert({
    tenant_id: tenantId,
    title,
    department_id,
  });

  if (error) {
    console.error("createJobPosition error:", error.message);
    redirect(
      `/app/organizacion/puestos?error=${encodeURIComponent(
        "No se pudo crear el puesto."
      )}`
    );
  }

  revalidatePath("/app/organizacion/puestos");
}

export async function updateJobPosition(
  tenantId: string,
  positionId: string,
  formData: FormData
) {
  const supabase = await createClient();

  const title = (formData.get("title") as string)?.trim();
  const department_id = (formData.get("department_id") as string) || null;
  const mission = (formData.get("mission") as string)?.trim() || null;

  if (!title) {
    redirect(
      `/app/organizacion/puestos?error=${encodeURIComponent(
        "El título del puesto es obligatorio."
      )}`
    );
  }

  const { error } = await supabase
    .from("job_positions")
    .update({ title, department_id, mission })
    .eq("id", positionId)
    .eq("tenant_id", tenantId);

  if (error) {
    console.error("updateJobPosition error:", error.message);
    redirect(
      `/app/organizacion/puestos?error=${encodeURIComponent(
        "No se pudo actualizar el puesto."
      )}`
    );
  }

  revalidatePath("/app/organizacion/puestos");
}

// Bloquea el borrado si el puesto todavia tiene empleados asignados --
// aunque la FK employees.job_position_id es "on delete set null" (no
// fallaria a nivel de base de datos), dejar huerfano a un empleado sin
// puesto por accidente es una mala experiencia; es mejor pedir
// explicitamente que se reasignen primero.
export async function deleteJobPosition(positionId: string) {
  const supabase = await createClient();

  const { count } = await supabase
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("job_position_id", positionId);

  if ((count ?? 0) > 0) {
    redirect(
      `/app/organizacion/puestos?error=${encodeURIComponent(
        "No puedes eliminar un puesto con empleados asignados. Reasígnalos primero desde Empleados."
      )}`
    );
  }

  const { error } = await supabase
    .from("job_positions")
    .delete()
    .eq("id", positionId);

  if (error) {
    console.error("deleteJobPosition error:", error.message);
  }

  revalidatePath("/app/organizacion/puestos");
}
