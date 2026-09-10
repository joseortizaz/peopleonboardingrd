import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, isManagerRole } from "@/lib/supabase/tenant";

type IsrBracket = {
  from: number;
  upto: number | null;
  rate: number;
  base: number;
};

type FiscalRule = {
  id: string;
  fiscal_year: number;
  sfs_employee_rate: number;
  sfs_employer_rate: number;
  sfs_cap: number;
  afp_employee_rate: number;
  afp_employer_rate: number;
  afp_cap: number;
  srl_employer_rate: number;
  srl_cap: number;
  infotep_employer_rate: number;
  minimum_wage_reference: number | null;
  isr_brackets: IsrBracket[];
  notes: string | null;
};

const currency = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "DOP",
});

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

export default async function ReglasFiscalesPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/onboarding");
  if (!isManagerRole(tenant.myRole)) redirect("/app/mi-espacio");

  const supabase = await createClient();

  const { data: rules } = await supabase
    .from("payroll_fiscal_rules")
    .select(
      "id, fiscal_year, sfs_employee_rate, sfs_employer_rate, sfs_cap, afp_employee_rate, afp_employer_rate, afp_cap, srl_employer_rate, srl_cap, infotep_employer_rate, minimum_wage_reference, isr_brackets, notes"
    )
    .order("fiscal_year", { ascending: false });

  const typedRules = (rules ?? []) as unknown as FiscalRule[];

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/app/nomina" className="text-sm text-gray-500 hover:underline">
        ← Nómina
      </Link>

      <h1 className="mt-2 text-xl font-semibold text-gray-900">
        Reglas fiscales del motor de nómina
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Tasas, topes y escala de ISR versionadas por año fiscal. Cada periodo
        de nómina generado queda vinculado permanentemente a las reglas del
        año en que se generó — agregar un nuevo año fiscal aquí nunca
        reinterpreta un periodo ya creado. Solo un Super Admin de la
        plataforma puede agregar o modificar un año fiscal (tasas de ley,
        iguales para todos los tenants); si necesitas registrar uno nuevo
        (por ejemplo, la escala de la Ley 30-26 vigente desde 2027) y no
        tienes ese rol, puede hacerse directamente con una sentencia SQL en
        Supabase.
      </p>

      {typedRules.length === 0 && (
        <p className="mt-6 text-sm text-gray-500">
          Aún no hay reglas fiscales configuradas.
        </p>
      )}

      <div className="mt-6 space-y-6">
        {typedRules.map((r) => (
          <div key={r.id} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900">
              Año fiscal {r.fiscal_year}
            </h2>
            {r.notes && <p className="mt-1 text-xs text-gray-500">{r.notes}</p>}

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500">SFS (salud)</p>
                <p className="mt-1 text-sm text-gray-900">
                  {pct(r.sfs_employer_rate)} empleador · {pct(r.sfs_employee_rate)} empleado
                </p>
                <p className="text-xs text-gray-400">Tope {currency.format(r.sfs_cap)}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500">AFP (pensión)</p>
                <p className="mt-1 text-sm text-gray-900">
                  {pct(r.afp_employer_rate)} empleador · {pct(r.afp_employee_rate)} empleado
                </p>
                <p className="text-xs text-gray-400">Tope {currency.format(r.afp_cap)}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500">SRL (riesgo laboral)</p>
                <p className="mt-1 text-sm text-gray-900">{pct(r.srl_employer_rate)} empleador</p>
                <p className="text-xs text-gray-400">Tope {currency.format(r.srl_cap)}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500">INFOTEP</p>
                <p className="mt-1 text-sm text-gray-900">{pct(r.infotep_employer_rate)} empleador</p>
                <p className="text-xs text-gray-400">Sin tope</p>
              </div>
            </div>

            {r.minimum_wage_reference && (
              <p className="mt-3 text-xs text-gray-400">
                Salario mínimo de referencia: {currency.format(r.minimum_wage_reference)}
              </p>
            )}

            <h3 className="mt-4 text-xs font-medium uppercase text-gray-500">
              Escala de ISR (ingreso anual cotizable)
            </h3>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="py-1 pr-3">Desde</th>
                    <th className="py-1 pr-3">Hasta</th>
                    <th className="py-1 pr-3">Tasa</th>
                    <th className="py-1">Monto base</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {r.isr_brackets.map((b, i) => (
                    <tr key={i}>
                      <td className="py-1 pr-3 text-gray-600">{currency.format(b.from)}</td>
                      <td className="py-1 pr-3 text-gray-600">
                        {b.upto === null ? "En adelante" : currency.format(b.upto)}
                      </td>
                      <td className="py-1 pr-3 text-gray-600">{pct(b.rate)}</td>
                      <td className="py-1 text-gray-600">{currency.format(b.base)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
