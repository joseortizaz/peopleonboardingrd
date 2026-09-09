"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createCompany(formData: FormData) {
  const supabase = await createClient();

  const name = (formData.get("name") as string)?.trim();
  const rnc = (formData.get("rnc") as string)?.trim() || null;
  const kind = formData.get("kind") as "company" | "outsourcing_agency";

  if (!name) {
    redirect("/app/onboarding?error=El+nombre+es+obligatorio");
  }

  const { error } = await supabase.rpc("create_account_with_tenant", {
    p_account_name: name,
    p_kind: kind,
    p_rnc: rnc,
  });

  if (error) {
    redirect(`/app/onboarding?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/app");
}
