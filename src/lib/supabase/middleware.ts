import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Refresca la sesión de Supabase en cada request, protege rutas del panel
 * /app y fuerza el segundo factor (MFA) antes de dejar entrar a alguien
 * que ya lo tiene activado pero aún no lo completó en esta sesión.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAppRoute = request.nextUrl.pathname.startsWith("/app");
  const isLoginRoute = request.nextUrl.pathname.startsWith("/login");
  const isMfaChallengeRoute = request.nextUrl.pathname === "/login/mfa";

  if (!user) {
    if (isAppRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // Usuario autenticado (aal1 al menos): si tiene un factor MFA verificado
  // y todavía no completó el segundo paso en esta sesión, se le exige antes
  // de dejarlo entrar a /app o quedarse en /login.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const pendingMfa =
    !!aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2";

  if (pendingMfa) {
    if (!isMfaChallengeRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/login/mfa";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  if (isLoginRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
