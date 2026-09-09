"use server";

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
