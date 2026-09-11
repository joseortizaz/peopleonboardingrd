import { createClient } from "@/lib/supabase/server";

export type MemberRole =
  | "super_admin"
  | "account_admin"
  | "hr_manager"
  | "supervisor"
  | "employee"
  | "client"
  | "candidate";

export type CurrentTenant = {
  id: string;
  name: string;
  slug: string;
  accountId: string;
  myRole: MemberRole | null;
};

const ROLE_PRIORITY: MemberRole[] = [
  "super_admin",
  "account_admin",
  "hr_manager",
  "supervisor",
  "employee",
  "client",
  "candidate",
];

export function isManagerRole(role: MemberRole | null) {
  return role === "super_admin" || role === "account_admin" || role === "hr_manager";
}

/**
 * A diferencia de isManagerRole(), esta EXCLUYE super_admin a propósito.
 * super_admin es un rol de plataforma (Facturación SaaS, ver sección 13 del
 * plan de desarrollo) que, por una restricción del esquema, siempre queda
 * atado técnicamente a algún tenant/cuenta -- pero eso no lo convierte en
 * gestor de RR.HH. de ese tenant. Se usa para decidir si mostrar el menú
 * operativo (Nómina, Documentos, etc.) de un tenant específico: solo si el
 * rol es realmente account_admin/hr_manager de ESE tenant.
 */
export function isTenantManagerRole(role: MemberRole | null) {
  return role === "account_admin" || role === "hr_manager";
}

async function fetchFirstTenant(
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const { data: tenant, error } = await supabase
    .from("tenants")
    .select("id, name, slug, account_id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("getCurrentTenant error:", error.message);
    return null;
  }

  return tenant;
}

/**
 * Devuelve el primer tenant accesible para el usuario autenticado
 * (gracias a la policy RLS "tenants_select" solo vienen los que puede ver)
 * junto con su rol en ese tenant. null si el usuario aun no pertenece a
 * ninguna cuenta/tenant.
 *
 * Si no se encuentra ningun tenant, intenta un auto-vinculo retroactivo
 * (por si RR.HH. registro el correo de este usuario como empleado
 * *despues* de que la cuenta ya existiera — el trigger de signup solo
 * vincula en el momento del registro, no despues) antes de rendirse.
 */
export async function getCurrentTenant(): Promise<CurrentTenant | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  let tenant = await fetchFirstTenant(supabase);

  if (!tenant) {
    const { error: linkError } = await supabase.rpc("link_my_employee_record");
    if (linkError) {
      console.error("link_my_employee_record error:", linkError.message);
    } else {
      tenant = await fetchFirstTenant(supabase);
    }
  }

  if (!tenant) return null;

  const { data: memberships } = await supabase
    .from("memberships")
    .select("role, tenant_id, account_id")
    .eq("profile_id", user.id);

  let myRole: MemberRole | null = null;
  for (const role of ROLE_PRIORITY) {
    const match = memberships?.find(
      (m) =>
        m.role === role &&
        (m.tenant_id === tenant.id || m.account_id === tenant.account_id)
    );
    if (match) {
      myRole = role;
      break;
    }
  }

  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    accountId: tenant.account_id,
    myRole,
  };
}
