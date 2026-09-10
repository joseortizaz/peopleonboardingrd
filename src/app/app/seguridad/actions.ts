"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type EnrollState =
  | { error: string; factorId?: undefined; qrCode?: undefined; secret?: undefined }
  | { error?: undefined; factorId: string; qrCode: string; secret: string }
  | null;

export async function enrollFactor(
  _prevState: EnrollState,
  _formData: FormData
): Promise<EnrollState> {
  const supabase = await createClient();

  // Limpia cualquier factor TOTP sin verificar de un intento anterior (por
  // ejemplo si el usuario cerró la pantalla antes de escanear el QR), para
  // no acumular factores "colgados" cada vez que reintenta.
  const { data: existing } = await supabase.auth.mfa.listFactors();
  const pending = existing?.all?.find(
    (f) => f.factor_type === "totp" && f.status === "unverified"
  );
  if (pending) {
    await supabase.auth.mfa.unenroll({ factorId: pending.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });

  if (error || !data) {
    return { error: error?.message ?? "No se pudo iniciar la activación." };
  }

  return {
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  };
}

type VerifyState = { error?: string } | null;

export async function verifyFactor(
  _prevState: VerifyState,
  formData: FormData
): Promise<VerifyState> {
  const supabase = await createClient();

  const factorId = formData.get("factorId") as string;
  const code = (formData.get("code") as string)?.trim();

  if (!factorId || !code) {
    return { error: "Ingresa el código de 6 dígitos." };
  }

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId,
  });

  if (challengeError || !challenge) {
    return { error: challengeError?.message ?? "No se pudo iniciar la verificación." };
  }

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  });

  if (verifyError) {
    return { error: "Código incorrecto o expirado. Intenta de nuevo." };
  }

  redirect(
    "/app/seguridad?message=" +
      encodeURIComponent("Verificación en dos pasos activada.")
  );
}

export async function unenrollFactor(factorId: string) {
  const supabase = await createClient();
  await supabase.auth.mfa.unenroll({ factorId });
  redirect(
    "/app/seguridad?message=" +
      encodeURIComponent("Verificación en dos pasos desactivada.")
  );
}
