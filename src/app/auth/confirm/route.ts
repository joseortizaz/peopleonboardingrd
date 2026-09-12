import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Punto de entrada único para los enlaces de correo de Supabase Auth que
 * requieren verificar un token_hash (hoy: recuperación de contraseña).
 * Requiere que la plantilla de correo "Reset Password" en Supabase se
 * edite para apuntar aquí en vez de usar {{ .ConfirmationURL }} por
 * defecto (ver instrucciones entregadas al usuario).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      redirect(next);
    }
  }

  redirect(
    "/login?error=" +
      encodeURIComponent(
        "El enlace no es válido o ya expiró. Solicita uno nuevo."
      )
  );
}
