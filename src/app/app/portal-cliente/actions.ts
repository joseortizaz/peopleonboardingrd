"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createClientInvite(tenantId: string, formData: FormData) {
  const supabase = await createClient();

  const email = (formData.get("email") as string)?.trim().toLowerCase();
  if (!email) return;

  const { error } = await supabase
    .from("client_invites")
    .insert({ tenant_id: tenantId, email });

  if (error) {
    console.error("createClientInvite error:", error.message);
    redirect(`/app/portal-cliente/gestionar?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/app/portal-cliente/gestionar");
}

export async function deleteClientInvite(
  inviteId: string,
  tenantId: string,
  consumedBy: string | null
) {
  const supabase = await createClient();

  if (consumedBy) {
    const { data: deletedRows, error: membershipError } = await supabase
      .from("memberships")
      .delete()
      .eq("profile_id", consumedBy)
      .eq("tenant_id", tenantId)
      .eq("role", "client")
      .select("id");

    if (membershipError) {
      console.error("deleteClientInvite membership error:", membershipError.message);
      redirect(`/app/portal-cliente/gestionar?error=${encodeURIComponent(membershipError.message)}`);
    }

    if (!deletedRows || deletedRows.length === 0) {
      redirect(
        `/app/portal-cliente/gestionar?error=${encodeURIComponent(
          "No se pudo revocar el acceso: no se encontro la membresia correspondiente."
        )}`
      );
    }
  }

  const { error } = await supabase
    .from("client_invites")
    .delete()
    .eq("id", inviteId);

  if (error) {
    console.error("deleteClientInvite error:", error.message);
  }

  revalidatePath("/app/portal-cliente/gestionar");
}
