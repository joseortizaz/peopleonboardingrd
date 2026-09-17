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

export async function updatePlan(planId: string, formData: FormData) {
  const supabase = await createClient();

  const name = (formData.get("name") as string)?.trim();
  const priceRaw = (formData.get("price_reference") as string)?.trim();
  const billing_period = (formData.get("billing_period") as string) || "mensual";
  const notes = (formData.get("notes") as string)?.trim() || null;
  const is_public = formData.get("is_public") === "on";
  const description = (formData.get("description") as string)?.trim() || null;
  const featuresRaw = (formData.get("features") as string) ?? "";
  const features = featuresRaw
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);
  const maxEmployeesRaw = (formData.get("max_employees") as string)?.trim();
  const maxTenantsRaw = (formData.get("max_tenants") as string)?.trim();
  const plan_limits = {
    max_employees: maxEmployeesRaw ? Number(maxEmployeesRaw) : null,
    max_tenants: maxTenantsRaw ? Number(maxTenantsRaw) : null,
  };

  if (!name) return;

  const { error } = await supabase
    .from("subscription_plans")
    .update({
      name,
      price_reference: priceRaw ? Number(priceRaw) : null,
      billing_period,
      notes,
      is_public,
      description,
      features,
      plan_limits,
    })
    .eq("id", planId);

  if (error) {
    console.error("updatePlan error:", error.message);
    redirect(
      `/app/superadmin/planes/${planId}?error=${encodeURIComponent(error.message)}`
    );
  }

  revalidatePath("/app/superadmin");
  revalidatePath(`/app/superadmin/planes/${planId}`);
  revalidatePath("/precios");
  revalidatePath("/app/facturacion");
}

export async function setPlanArchived(planId: string, archived: boolean) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("subscription_plans")
    .update({ archived })
    .eq("id", planId);

  if (error) {
    console.error("setPlanArchived error:", error.message);
    redirect(`/app/superadmin?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/app/superadmin");
  revalidatePath("/precios");
  revalidatePath("/app/facturacion");
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

export async function resolvePaymentRequest(
  requestId: string,
  action: "confirmar" | "rechazar",
  formData: FormData
) {
  const supabase = await createClient();

  const note = (formData.get("note") as string)?.trim() || null;

  const { error } = await supabase.rpc("superadmin_resolve_payment_request", {
    p_request_id: requestId,
    p_action: action,
    p_note: note,
  });

  if (error) {
    console.error("resolvePaymentRequest error:", error.message);
    redirect(`/app/superadmin?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/app/superadmin");
}
