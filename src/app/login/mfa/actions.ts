"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function verifyLoginMfa(formData: FormData) {
  const supabase = await createClient();
  const code = (formData.get("code") as string)?.trim();

  if (!code) {
    redirect("/login/mfa?error=" + encodeURIComponent("Ingresa el código de 6 dígitos."));
  }

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp?.find((f) => f.status === "verified");

  if (!factor) {
    // No debería pasar (el middleware solo manda aquí a quien tiene un
    // factor verificado), pero por si el factor fue borrado entretanto.
    redirect(
      "/login?error=" +
        encodeURIComponent("No se encontró un factor de verificación activo.")
    );
  }

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId: factor.id,
  });

  if (challengeError || !challenge) {
    redirect(
      "/login/mfa?error=" +
        encodeURIComponent("No se pudo iniciar la verificación. Intenta de nuevo.")
    );
  }

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.id,
    code,
  });

  if (verifyError) {
    redirect(
      "/login/mfa?error=" +
        encodeURIComponent("Código incorrecto o expirado. Intenta de nuevo.")
    );
  }

  redirect("/app");
}
