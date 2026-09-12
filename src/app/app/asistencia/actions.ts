"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function setEmployeeShiftDay(tenantId: string, formData: FormData) {
  const supabase = await createClient();

  const employee_id = (formData.get("employee_id") as string) || "";
  const day_of_week = (formData.get("day_of_week") as string) ?? "";
  const start_time = (formData.get("start_time") as string) || "";
  const end_time = (formData.get("end_time") as string) || "";
  const crosses_midnight = formData.get("crosses_midnight") === "on";

  if (!employee_id || day_of_week === "" || !start_time || !end_time) {
    redirect(
      "/app/asistencia?error=" +
        encodeURIComponent(
          "Empleado, día, hora de inicio y hora de fin son obligatorios."
        )
    );
  }

  const { error } = await supabase.rpc("upsert_employee_shift_day", {
    p_employee_id: employee_id,
    p_day_of_week: Number(day_of_week),
    p_start_time: start_time,
    p_end_time: end_time,
    p_crosses_midnight: crosses_midnight,
  });

  if (error) {
    redirect(
      "/app/asistencia?error=" +
        encodeURIComponent("No se pudo guardar el horario: " + error.message)
    );
  }

  revalidatePath("/app/asistencia");
}

export async function deleteEmployeeShiftDay(
  employeeId: string,
  dayOfWeek: number
) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("delete_employee_shift_day", {
    p_employee_id: employeeId,
    p_day_of_week: dayOfWeek,
  });

  if (error) {
    console.error("deleteEmployeeShiftDay error:", error.message);
  }

  revalidatePath("/app/asistencia");
}

export async function deleteTimeClockEntry(entryId: string) {
  const supabase = await createClient();

  // Se leen las rutas de las fotos antes de borrar la fila, para poder
  // limpiarlas del bucket time-clock-photos y no dejar archivos huérfanos
  // (brecha menor documentada desde la migración 0027).
  const { data: entry } = await supabase
    .from("time_clock_entries")
    .select("clock_in_photo_path, clock_out_photo_path")
    .eq("id", entryId)
    .maybeSingle();

  const { error } = await supabase.from("time_clock_entries").delete().eq("id", entryId);

  if (error) {
    console.error("deleteTimeClockEntry error:", error.message);
  } else {
    const paths = [entry?.clock_in_photo_path, entry?.clock_out_photo_path].filter(
      (p): p is string => !!p
    );
    if (paths.length > 0) {
      const { error: storageError } = await supabase.storage
        .from("time-clock-photos")
        .remove(paths);
      if (storageError) {
        console.error("deleteTimeClockEntry storage cleanup error:", storageError.message);
      }
    }
  }

  revalidatePath("/app/asistencia");
}

// Sube la foto (obligatoria) al bucket privado time-clock-photos y solo
// entonces llama al RPC, que rechaza el marcaje si no recibe una ruta de
// foto. La geolocalizacion es de referencia -- si el navegador no la
// entrega (denegada, sin soporte, timeout) los campos llegan vacios y el
// marcaje se registra igual, nunca se bloquea por eso.
export async function clockInAction(
  tenantId: string,
  employeeId: string,
  revalidateTo: string,
  formData: FormData
) {
  const supabase = await createClient();

  const file = formData.get("photo") as File | null;
  if (!file || file.size === 0) {
    redirect(
      `${revalidateTo}?error=` +
        encodeURIComponent("Debes tomar una foto para marcar la entrada.")
    );
  }

  const latRaw = (formData.get("lat") as string) || "";
  const lngRaw = (formData.get("lng") as string) || "";
  const lat = latRaw ? Number(latRaw) : null;
  const lng = lngRaw ? Number(lngRaw) : null;

  const safeName = (file.name || "foto.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${tenantId}/${employeeId}/${randomUUID()}-in-${safeName}`;
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from("time-clock-photos")
    .upload(storagePath, arrayBuffer, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });

  if (uploadError) {
    redirect(
      `${revalidateTo}?error=` +
        encodeURIComponent("No se pudo subir la foto: " + uploadError.message)
    );
  }

  const { error } = await supabase.rpc("clock_in", {
    p_tenant_id: tenantId,
    p_lat: lat,
    p_lng: lng,
    p_photo_path: storagePath,
  });

  if (error) {
    await supabase.storage.from("time-clock-photos").remove([storagePath]);
    redirect(
      `${revalidateTo}?error=` +
        encodeURIComponent("No se pudo marcar la entrada: " + error.message)
    );
  }

  revalidatePath(revalidateTo);
}

export async function clockOutAction(
  tenantId: string,
  employeeId: string,
  revalidateTo: string,
  formData: FormData
) {
  const supabase = await createClient();

  const file = formData.get("photo") as File | null;
  if (!file || file.size === 0) {
    redirect(
      `${revalidateTo}?error=` +
        encodeURIComponent("Debes tomar una foto para marcar la salida.")
    );
  }

  const latRaw = (formData.get("lat") as string) || "";
  const lngRaw = (formData.get("lng") as string) || "";
  const lat = latRaw ? Number(latRaw) : null;
  const lng = lngRaw ? Number(lngRaw) : null;

  const safeName = (file.name || "foto.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${tenantId}/${employeeId}/${randomUUID()}-out-${safeName}`;
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from("time-clock-photos")
    .upload(storagePath, arrayBuffer, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });

  if (uploadError) {
    redirect(
      `${revalidateTo}?error=` +
        encodeURIComponent("No se pudo subir la foto: " + uploadError.message)
    );
  }

  const { error } = await supabase.rpc("clock_out", {
    p_tenant_id: tenantId,
    p_lat: lat,
    p_lng: lng,
    p_photo_path: storagePath,
  });

  if (error) {
    await supabase.storage.from("time-clock-photos").remove([storagePath]);
    redirect(
      `${revalidateTo}?error=` +
        encodeURIComponent("No se pudo marcar la salida: " + error.message)
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
