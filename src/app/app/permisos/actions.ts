"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function decideLeaveRequestAction(
  requestId: string,
  decision: "aprobada" | "rechazada",
  formData: FormData
) {
  const supabase = await createClient();

  const notes = (formData.get("notes") as string) || "";

  const { error } = await supabase.rpc("decide_leave_request", {
    p_request_id: requestId,
    p_decision: decision,
    p_notes: notes || null,
  });

  if (error) {
    redirect(
      "/app/permisos?error=" + encodeURIComponent("No se pudo procesar la solicitud: " + error.message)
    );
  }

  revalidatePath("/app/permisos");
}

export async function deleteLeaveRequestAction(requestId: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("leave_requests").delete().eq("id", requestId);

  if (error) {
    console.error("deleteLeaveRequestAction error:", error.message);
  }

  revalidatePath("/app/permisos");
}
