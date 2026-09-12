"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function updatePassword(formData: FormData) {
  const supabase = await createClient();

  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirm_password") as string;

  if (password !== confirmPassword) {
    redirect(
      "/restablecer-password?error=" +
        encodeURIComponent("Las contraseñas no coinciden")
    );
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(`/restablecer-password?error=${encodeURIComponent(error.message)}`);
  }

  // Se cierra la sesión de recuperación y se exige iniciar sesión de nuevo
  // con la contraseña ya actualizada, en vez de dejar al usuario dentro.
  await supabase.auth.signOut();
  redirect(
    "/login?message=" +
      encodeURIComponent(
        "Tu contraseña fue actualizada. Ya puedes iniciar sesión."
      )
  );
}
