"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createEmployee(tenantId: string, formData: FormData) {
  const supabase = await createClient();

  const full_name = (formData.get("full_name") as string)?.trim();
  const department_id = (formData.get("department_id") as string) || null;
  const position = (formData.get("position") as string)?.trim() || null;
  const hire_date = (formData.get("hire_date") as string) || null;

  if (!full_name) return;

  const { error } = await supabase.from("employees").insert({
    tenant_id: tenantId,
    full_name,
    department_id,
    position,
    hire_date,
  });

  if (error) {
    console.error("createEmployee error:", error.message);
  }

  revalidatePath("/app/empleados");
}

export async function deleteEmployee(employeeId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("employees")
    .delete()
    .eq("id", employeeId);

  if (error) {
    console.error("deleteEmployee error:", error.message);
  }

  revalidatePath("/app/empleados");
}
