"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function setEmployeeShift(tenantId: string, formData: FormData) {
  const supabase = await createClient();

  const employee_id = (formData.get("employee_id") as string) || "";
  const start_time = (formData.get("start_time") as string) || "";
  const end_time = (formData.get("end_time") as string) || "";

  if (!employee_id || !start_time || !end_time) {
    redirect(
      "/app/asistencia?error=" +
        encodeURIComponent("Empleado, hora de inicio y hora de fin son obligatorios.")
    );
  }

  const { error } = await supabase.rpc("upsert_employee_shift", {
    p_employee_id: employee_id,
    p_start_time: start_time,
    p_end_time: end_time,
  });

  if (error) {
    redirect(
      "/app/asistencia?error=" +
        encodeURIComponent("No se pudo guardar el horario: " + error.message)
    );
  }

  revalidatePath("/app/asistencia");
}

export async function deleteTimeClockEntry(entryId: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("time_clock_entries").delete().eq("id", entryId);

  if (error) {
    console.error("deleteTimeClockEntry error:", error.message);
  }

  revalidatePath("/app/asistencia");
}

export async function clockInAction(tenantId: string, revalidateTo: string) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("clock_in", { p_tenant_id: tenantId });

  if (error) {
    redirect(
      `${revalidateTo}?error=` + encodeURIComponent("No se pudo marcar la entrada: " + error.message)
    );
  }

  revalidatePath(revalidateTo);
}

export async function clockOutAction(tenantId: string, revalidateTo: string) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("clock_out", { p_tenant_id: tenantId });

  if (error) {
    redirect(
      `${revalidateTo}?error=` + encodeURIComponent("No se pudo marcar la salida: " + error.message)
    );
  }

  revalidatePath(revalidateTo);
}

export async function requestLeaveAction(tenantId: string, formData: FormData) {
  const supabase = await createClient();

  const type = (formData.get("type") as string) || "";
  const start_date = (formData.get("start_date") as string) || "";
  const end_date = (formData.get("end_date") as string) || "";
  const reason = (formData.get("reason") as string) || "";

  if (!type || !start_date || !end_date) {
    redirect(
      "/app/mi-espacio?error=" +
        encodeURIComponent("Tipo, fecha de inicio y fecha de fin son obligatorios.")
    );
  }

  const { error } = await supabase.rpc("request_leave", {
    p_tenant_id: tenantId,
    p_type: type,
    p_start_date: start_date,
    p_end_date: end_date,
    p_reason: reason || null,
  });

  if (error) {
    redirect(
      "/app/mi-espacio?error=" + encodeURIComponent("No se pudo enviar la solicitud: " + error.message)
    );
  }

  revalidatePath("/app/mi-espacio");
}

export async function cancelLeaveRequestAction(requestId: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("leave_requests").delete().eq("id", requestId);

  if (error) {
    console.error("cancelLeaveRequestAction error:", error.message);
  }

  revalidatePath("/app/mi-espacio");
}
