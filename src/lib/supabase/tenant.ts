import { createClient } from "@/lib/supabase/server";

export type CurrentTenant = {
  id: string;
  name: string;
  slug: string;
};

/**
 * Devuelve el primer tenant accesible para el usuario autenticado
 * (gracias a la policy RLS "tenants_select" solo vienen los que puede ver).
 * null si el usuario aun no pertenece a ninguna cuenta/tenant.
 */
export async function getCurrentTenant(): Promise<CurrentTenant | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("tenants")
    .select("id, name, slug")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("getCurrentTenant error:", error.message);
    return null;
  }

  return data;
}
