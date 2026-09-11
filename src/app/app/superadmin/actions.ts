"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createPlan(formData: FormData) {
  const supabase = await createClient();

  const name = (formData.get("name") as string)?.trim();
  const priceRaw = (formData.get("price_reference") as string)?.trim();
  const billing_period = (formData.get("billing_period") as string) || "mensual";
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!name) return;

  const { error } = await supabase.from("subscription_plans").insert({
    name,
    price_reference: priceRaw ? Number(priceRaw) : null,
    billing_period,
    notes,
  });

  if (error) {
    console.error("createPlan error:", error.message);
    redirect(`/app/superadmin?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/app/superadmin");
}

export async function upsertSubscription(accountId: string, formData: FormData) {
  const supabase = await createClient();

  const planIdRaw = (formData.get("plan_id") as string)?.trim();
  const status = formData.get("status") as string;
  const start_date = formData.get("start_date") as string;
  const end_dateRaw = (formData.get("end_date") as string)?.trim();
  const note = (formData.get("note") as string)?.trim() || null;

  if (!status || !start_date) return;

  const { error } = await supabase.rpc("superadmin_upsert_subscription", {
    p_account_id: accountId,
    p_plan_id: planIdRaw || null,
    p_status: status,
    p_start_date: start_date,
    p_end_date: end_dateRaw || null,
    p_note: note,
  });

  if (error) {
    console.error("upsertSubscription error:", error.message);
    redirect(`/app/superadmin?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/app/superadmin");
}
