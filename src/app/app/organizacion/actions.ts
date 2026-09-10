"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createDepartment(tenantId: string, formData: FormData) {
  const supabase = await createClient();

  const name = (formData.get("name") as string)?.trim();
  const parentId = (formData.get("parent_department_id") as string) || null;

  if (!name) return;

  const { error } = await supabase.from("departments").insert({
    tenant_id: tenantId,
    name,
    parent_department_id: parentId,
  });

  if (error) {
    console.error("createDepartment error:", error.message);
  }

  revalidatePath("/app/organizacion");
}

export async function updateDepartment(
  tenantId: string,
  departmentId: string,
  formData: FormData
) {
  const supabase = await createClient();

  const name = (formData.get("name") as string)?.trim();
  const parentId = (formData.get("parent_department_id") as string) || null;

  if (!name) {
    redirect(
      "/app/organizacion?error=" + encodeURIComponent("El nombre es obligatorio.")
    );
  }

  if (parentId) {
    if (parentId === departmentId) {
      redirect(
        "/app/organizacion?error=" +
          encodeURIComponent("Un departamento no puede ser su propio padre.")
      );
    }

    const { data: allDepts, error: fetchError } = await supabase
      .from("departments")
      .select("id, parent_department_id")
      .eq("tenant_id", tenantId);

    if (fetchError) {
      console.error("updateDepartment fetch error:", fetchError.message);
      redirect(
        "/app/organizacion?error=" +
          encodeURIComponent("No se pudo validar el cambio.")
      );
    }

    // Evita ciclos: el nuevo padre no puede ser un descendiente del
    // propio departamento (eso rompería el árbol y buildTree() en la UI).
    const isDescendant = (candidateId: string, ancestorId: string): boolean => {
      const node = (allDepts ?? []).find((d) => d.id === candidateId);
      if (!node || !node.parent_department_id) return false;
      if (node.parent_department_id === ancestorId) return true;
      return isDescendant(node.parent_department_id, ancestorId);
    };

    if (isDescendant(parentId, departmentId)) {
      redirect(
        "/app/organizacion?error=" +
          encodeURIComponent(
            "No puedes asignar un subdepartamento como padre: crearía un ciclo."
          )
      );
    }
  }

  const { error } = await supabase
    .from("departments")
    .update({ name, parent_department_id: parentId })
    .eq("id", departmentId)
    .eq("tenant_id", tenantId);

  if (error) {
    console.error("updateDepartment error:", error.message);
    redirect(
      "/app/organizacion?error=" +
        encodeURIComponent("No se pudo actualizar el departamento.")
    );
  }

  revalidatePath("/app/organizacion");
}

export async function deleteDepartment(departmentId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("departments")
    .delete()
    .eq("id", departmentId);

  if (error) {
    console.error("deleteDepartment error:", error.message);
  }

  revalidatePath("/app/organizacion");
}
