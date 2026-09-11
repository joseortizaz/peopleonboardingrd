"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createPayrollPeriod(tenantId: string, formData: FormData) {
  const supabase = await createClient();

  const period_type = formData.get("period_type") as string;
  const start_date = formData.get("start_date") as string;
  const end_date = formData.get("end_date") as string;
  const pay_date = formData.get("pay_date") as string;

  if (!period_type || !start_date || !end_date || !pay_date) return;

  const { data, error } = await supabase.rpc("generate_payroll_period", {
    p_tenant_id: tenantId,
    p_period_type: period_type,
    p_start_date: start_date,
    p_end_date: end_date,
    p_pay_date: pay_date,
  });

  if (error) {
    console.error("createPayrollPeriod error:", error.message);
    redirect(`/app/nomina?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/app/nomina");
  redirect(`/app/nomina/${data}`);
}

export async function generateRegaliaPascual(tenantId: string, formData: FormData) {
  const supabase = await createClient();

  const yearRaw = formData.get("year") as string;
  const pay_date = formData.get("pay_date") as string;

  if (!yearRaw || !pay_date) return;

  const { data, error } = await supabase.rpc("generate_regalia_pascual", {
    p_tenant_id: tenantId,
    p_year: Number(yearRaw),
    p_pay_date: pay_date,
  });

  if (error) {
    console.error("generateRegaliaPascual error:", error.message);
    redirect(`/app/nomina?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/app/nomina");
  redirect(`/app/nomina/${data}`);
}

export async function closePayrollPeriod(periodId: string) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("close_payroll_period", {
    p_period_id: periodId,
  });

  if (error) {
    console.error("closePayrollPeriod error:", error.message);
    redirect(`/app/nomina/${periodId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/app/nomina/${periodId}`);
}

export async function deletePayrollPeriod(periodId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("payroll_periods")
    .delete()
    .eq("id", periodId);

  if (error) {
    console.error("deletePayrollPeriod error:", error.message);
  }

  revalidatePath("/app/nomina");
  redirect("/app/nomina");
}

export async function adjustPayrollEntry(
  entryId: string,
  periodId: string,
  formData: FormData
) {
  const supabase = await createClient();

  const bonusesRaw = (formData.get("other_bonuses") as string)?.trim();
  const deductionsRaw = (formData.get("other_deductions") as string)?.trim();

  const { error } = await supabase.rpc("adjust_payroll_entry", {
    p_entry_id: entryId,
    p_other_bonuses: bonusesRaw ? Number(bonusesRaw) : 0,
    p_other_deductions: deductionsRaw ? Number(deductionsRaw) : 0,
  });

  if (error) {
    console.error("adjustPayrollEntry error:", error.message);
    redirect(`/app/nomina/${periodId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/app/nomina/${periodId}`);
}
