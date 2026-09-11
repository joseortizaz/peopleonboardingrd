"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requestPlan(formData: FormData) {
  const supabase = await createClient();

  const plan_id = (formData.get("plan_id") as string)?.trim();
  const note = (formData.get("note") as string)?.trim() || null;

  if (!plan_id) {
    redirect("/app/facturacion?error=Selecciona+un+plan");
  }

  const { error } = await supabase.rpc("request_subscription_plan", {
    p_plan_id: plan_id,
    p_note: note,
  });

  if (error) {
    redirect(`/app/facturacion?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/app/facturacion");
  redirect("/app/facturacion?message=Solicitud+enviada.+Sigue+las+instrucciones+de+pago+abajo.");
}
