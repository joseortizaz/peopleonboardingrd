import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Refresca la sesión de Supabase en cada request, protege rutas del panel
 * /app, fuerza el segundo factor (MFA) antes de dejar entrar a alguien
 * que ya lo tiene activado pero aún no lo completó en esta sesión, y
 * bloquea el acceso a /app si la suscripción de la cuenta del usuario
 * está inactiva (Super Admin y Portal del cliente quedan exentos).
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
  const isSuspendedAccountRoute = request.nextUrl.pathname === "/cuenta-suspendida";

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

  // Bloqueo por suscripción inactiva de la cuenta (Facturación SaaS v1):
  // solo se evalúa para rutas /app distintas de /cuenta-suspendida, para
  // no crear un bucle de redirección. El propio Super Admin, y cualquier
  // membresía de rol "client" (Portal del cliente), quedan exentos dentro
  // de la función is_my_access_blocked_by_subscription().
  if (isAppRoute && !isSuspendedAccountRoute) {
    const { data: blocked } = await supabase.rpc(
      "is_my_access_blocked_by_subscription"
    );
    if (blocked) {
      const url = request.nextUrl.clone();
      url.pathname = "/cuenta-suspendida";
      return NextResponse.redirect(url);
    }
  }

  if (isLoginRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
