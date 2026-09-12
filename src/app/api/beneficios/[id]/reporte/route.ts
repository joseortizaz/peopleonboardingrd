import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Reporte exportable de afiliados para un beneficio del catalogo -- pensado
// sobre todo para ARS, pero funciona igual para cualquier categoria --
// resuelve en v1 la brecha "portal/integracion con proveedores de ARS" de
// la seccion 3 sin depender de la API de ningun proveedor externo (el
// usuario todavia no tiene acceso a una): en vez de un portal o una
// integracion real, genera un CSV con los empleados activos en ese
// beneficio y sus dependientes, listo para enviar manualmente al corredor
// o a la aseguradora. Una fila por empleado activo; si tiene dependientes,
// una fila adicional por cada uno (mismo empleado repetido), para que el
// archivo se pueda abrir directo en Excel sin columnas anidadas.

const relationshipLabel: Record<string, string> = {
  conyuge: "Conyuge",
  hijo: "Hijo",
  hija: "Hija",
  padre: "Padre",
  madre: "Madre",
  otro: "Otro",
};

function csvEscape(value: string) {
  if (/["\,\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: benefitType } = await supabase
    .from("benefit_types")
    .select("id, name, provider")
    .eq("id", id)
    .maybeSingle();

  if (!benefitType) {
    return new Response("Beneficio no encontrado", { status: 404 });
  }

  const { data: assignments } = await supabase
    .from("employee_benefits")
    .select("id, start_date, employees(full_name, national_id)")
    .eq("benefit_type_id", id)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order("created_at", { ascending: true });

  const assignmentIds = (assignments ?? []).map((a) => a.id);

  const { data: dependents } = assignmentIds.length
    ? await supabase
        .from("benefit_dependents")
        .select("employee_benefit_id, full_name, relationship, birth_date")
        .in("employee_benefit_id", assignmentIds)
    : { data: [] as { employee_benefit_id: string; full_name: string; relationship: string; birth_date: string | null }[] };

  const dependentsByAssignment = new Map<
    string,
    { full_name: string; relationship: string; birth_date: string | null }[]
  >();
  (dependents ?? []).forEach((d) => {
    const list = dependentsByAssignment.get(d.employee_benefit_id) ?? [];
    list.push(d);
    dependentsByAssignment.set(d.employee_benefit_id, list);
  });

  const rows: string[][] = [
    ["Cedula", "Empleado", "Desde", "Dependiente", "Parentesco", "Fecha de nacimiento"],
  ];

  (assignments ?? []).forEach((a) => {
    const employee = a.employees as unknown as {
      full_name: string;
      national_id: string | null;
    } | null;
    if (!employee) return;
    const deps = dependentsByAssignment.get(a.id) ?? [];
    if (deps.length === 0) {
      rows.push([employee.national_id ?? "", employee.full_name, a.start_date, "", "", ""]);
    } else {
      deps.forEach((d) => {
        rows.push([
          employee.national_id ?? "",
          employee.full_name,
          a.start_date,
          d.full_name,
          relationshipLabel[d.relationship] ?? d.relationship,
          d.birth_date ?? "",
        ]);
      });
    }
  });

  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const safeName = benefitType.name.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="reporte-${safeName}-${today}.csv"`,
    },
  });
}
