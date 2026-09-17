"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createEmployee(
  tenantId: string,
  accountId: string,
  formData: FormData
) {
  const supabase = await createClient();

  const full_name = (formData.get("full_name") as string)?.trim();
  const department_id = (formData.get("department_id") as string) || null;
  const position = (formData.get("position") as string)?.trim() || null;
  const hire_date = (formData.get("hire_date") as string) || null;
  const email = (formData.get("email") as string)?.trim().toLowerCase() || null;
  const monthly_salary_raw = (formData.get("monthly_salary") as string)?.trim();
  const monthly_salary = monthly_salary_raw ? Number(monthly_salary_raw) : null;

  if (!full_name) return;

  // Limite de colaboradores del plan de la cuenta (ver migracion 0036).
  // Sin suscripcion o sin limite definido para esa clave = ilimitado.
  const { data: limits } = await supabase.rpc("get_account_plan_limits", {
    p_account_id: accountId,
  });
  const maxEmployees = (limits as { max_employees?: number | null } | null)
    ?.max_employees;

  if (maxEmployees != null) {
    const { data: accountTenants } = await supabase
      .from("tenants")
      .select("id")
      .eq("account_id", accountId);
    const tenantIds = (accountTenants ?? []).map((t) => t.id);

    const { count } = await supabase
      .from("employees")
      .select("id", { count: "exact", head: true })
      .in("tenant_id", tenantIds.length > 0 ? tenantIds : [tenantId]);

    if ((count ?? 0) >= maxEmployees) {
      redirect(
        `/app/empleados?error=${encodeURIComponent(
          `Alcanzaste el límite de ${maxEmployees} colaboradores de tu plan actual. Contacta a soporte para ampliar tu plan.`
        )}`
      );
    }
  }

  const { error } = await supabase.from("employees").insert({
    tenant_id: tenantId,
    full_name,
    department_id,
    position,
    hire_date,
    email,
    monthly_salary,
  });

  if (error) {
    console.error("createEmployee error:", error.message);
    redirect(`/app/empleados?error=${encodeURIComponent(error.message)}`);
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

export async function updateEmployeeSalary(employeeId: string, formData: FormData) {
  const supabase = await createClient();

  const raw = (formData.get("monthly_salary") as string)?.trim();
  const monthly_salary = raw ? Number(raw) : null;

  const { error } = await supabase
    .from("employees")
    .update({ monthly_salary })
    .eq("id", employeeId);

  if (error) {
    console.error("updateEmployeeSalary error:", error.message);
  }

  revalidatePath("/app/empleados");
}

export async function updateEmployeeBankInfo(employeeId: string, formData: FormData) {
  const supabase = await createClient();

  const national_id = (formData.get("national_id") as string)?.trim() || null;
  const bank_name = (formData.get("bank_name") as string)?.trim() || null;
  const bank_account_type = (formData.get("bank_account_type") as string) || null;
  const bank_account_number = (formData.get("bank_account_number") as string)?.trim() || null;

  const { error } = await supabase
    .from("employees")
    .update({ national_id, bank_name, bank_account_type, bank_account_number })
    .eq("id", employeeId);

  if (error) {
    console.error("updateEmployeeBankInfo error:", error.message);
  }

  revalidatePath("/app/empleados");
}
