"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requestPasswordReset(formData: FormData) {
  const supabase = await createClient();
  const email = formData.get("email") as string;

  const host = (await headers()).get("host");
  const protocol = host?.startsWith("localhost") ? "http" : "https";
  const origin = `${protocol}://${host}`;

  // El "type=recovery" y el "token_hash" los agrega la propia plantilla de
  // correo (ver instrucciones entregadas al usuario) usando {{ .RedirectTo }},
  // que refleja exactamente esta URL — así el enlace apunta a localhost en
  // pruebas locales y al dominio real en producción, sin configurar nada
  // aparte por ambiente.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(
      "/restablecer-password"
    )}`,
  });

  // Se muestra siempre el mismo mensaje exista o no una cuenta con ese
  // correo, y también si el envío del correo falla internamente, para no
  // filtrar qué correos están registrados en el sistema ni exponer detalles
  // internos (p. ej. errores de SMTP) al usuario final.
  redirect(
    "/login/olvide-password?message=" +
      encodeURIComponent(
        "Si ese correo tiene una cuenta, te enviamos un enlace para restablecer la contraseña."
      )
  );
}
