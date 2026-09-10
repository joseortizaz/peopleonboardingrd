-- =========================================================
-- Versionado del motor de nomina por ano fiscal.
--
-- Hasta ahora las tasas y topes de SFS/AFP/SRL/INFOTEP y la escala de
-- ISR estaban hardcodeadas dentro de generate_payroll_period (ver
-- 0012_payroll.sql). Esto es un problema real de cara a 2027: la Ley
-- 30-26 cambia la escala del ISR (nuevo umbral exento de RD$480,000 y
-- un tramo del 27% sobre RD$4,800,000), y un periodo de nomina ya
-- generado y cerrado en 2026 debe conservar para siempre las reglas
-- de 2026, incluso despues de que se agreguen las reglas de 2027.
--
-- Esta migracion mueve esas tasas a una tabla versionada por ano
-- fiscal (payroll_fiscal_rules), siembra el ano 2026 con exactamente
-- los mismos valores que ya estaban hardcodeados (no cambia ningun
-- calculo de un periodo ya generado), agrega una columna fiscal_year
-- a payroll_periods para dejar registrado con que reglas se genero
-- cada periodo, y reescribe generate_payroll_period para leer las
-- reglas de la tabla en vez de constantes fijas.
-- =========================================================

create table public.payroll_fiscal_rules (
  id uuid primary key default gen_random_uuid(),
  fiscal_year integer not null unique,
  sfs_employee_rate numeric not null,
  sfs_employer_rate numeric not null,
  sfs_cap numeric not null,
  afp_employee_rate numeric not null,
  afp_employer_rate numeric not null,
  afp_cap numeric not null,
  srl_employer_rate numeric not null,
  srl_cap numeric not null,
  infotep_employer_rate numeric not null,
  minimum_wage_reference numeric,
  isr_brackets jsonb not null,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

comment on column public.payroll_fiscal_rules.isr_brackets is
  'Array ascendente de tramos de ISR: [{"from": 0, "upto": 416220, "rate": 0, "base": 0}, ...]. '
  'upto = null significa "sin limite" (ultimo tramo). Formula por tramo: '
  'isr_anual = base + (ingreso_anual_cotizable - from) * rate, usando el primer tramo cuyo '
  'upto cubra el ingreso anual cotizable (o el ultimo, con upto null, si supera a todos).';

-- Siembra el ano fiscal 2026 con exactamente las mismas tasas, topes y
-- escala de ISR que ya estaban hardcodeadas en 0012_payroll.sql -- no
-- cambia ningun calculo de un periodo ya generado con esas reglas.
insert into public.payroll_fiscal_rules (
  fiscal_year, sfs_employee_rate, sfs_employer_rate, sfs_cap,
  afp_employee_rate, afp_employer_rate, afp_cap,
  srl_employer_rate, srl_cap, infotep_employer_rate,
  minimum_wage_reference, isr_brackets, notes
) values (
  2026, 0.0304, 0.0709, 232230,
  0.0287, 0.0710, 464460,
  0.0120, 92892, 0.0100,
  23223,
  '[
    {"from": 0,      "upto": 416220, "rate": 0.00, "base": 0},
    {"from": 416220, "upto": 624329, "rate": 0.15, "base": 0},
    {"from": 624329, "upto": 867123, "rate": 0.20, "base": 31216},
    {"from": 867123, "upto": null,   "rate": 0.25, "base": 79776}
  ]'::jsonb,
  'Escala DGII vigente sin cambios desde 2018 hasta 2026 (Resolucion DDG-AR1-2026-00001). '
  'Tasa de riesgo laboral (SRL) fija en 1.20%, dentro del rango legal 1.10-1.30%, en vez de la '
  'clasificacion por sector de riesgo de la empresa (simplificacion deliberada de v1).'
);

-- Plantilla de referencia para cuando entre en vigor la Ley 30-26
-- (ano fiscal 2027 en adelante) -- NO se ejecuta, queda como comentario
-- documentado para cuando se confirmen las cifras exactas con un
-- contador o gestor laboral:
--
-- insert into public.payroll_fiscal_rules (
--   fiscal_year, sfs_employee_rate, sfs_employer_rate, sfs_cap,
--   afp_employee_rate, afp_employer_rate, afp_cap,
--   srl_employer_rate, srl_cap, infotep_employer_rate,
--   minimum_wage_reference, isr_brackets, notes
-- ) values (
--   2027, 0.0304, 0.0709, <tope_sfs_2027>,
--   0.0287, 0.0710, <tope_afp_2027>,
--   0.0120, <tope_srl_2027>, 0.0100,
--   <salario_minimo_2027>,
--   '[
--     {"from": 0,      "upto": 480000, "rate": 0.00, "base": 0},
--     {"from": 480000, "upto": <tramo2>, "rate": 0.15, "base": 0},
--     {"from": <tramo2>, "upto": <tramo3>, "rate": 0.20, "base": <base3>},
--     {"from": <tramo3>, "upto": 4800000, "rate": 0.25, "base": <base4>},
--     {"from": 4800000, "upto": null,   "rate": 0.27, "base": <base5>}
--   ]'::jsonb,
--   'Escala Ley 30-26, vigente desde 2027.'
-- );

-- ---------- fiscal_year en payroll_periods ----------
-- Deja registrado con que reglas se genero cada periodo, para que un
-- cambio futuro de reglas no reinterprete periodos ya cerrados.
alter table public.payroll_periods
  add column fiscal_year integer;

update public.payroll_periods
  set fiscal_year = extract(year from start_date)::integer
  where fiscal_year is null;

alter table public.payroll_periods
  alter column fiscal_year set not null;

-- ---------- RLS de payroll_fiscal_rules ----------
-- Son tasas de ley (TSS/DGII), iguales para todos los tenants: lectura
-- abierta a cualquier usuario autenticado (transparencia/auditoria),
-- escritura restringida a super_admin de la plataforma (agregar un
-- nuevo ano fiscal es un evento regulatorio raro, no una operacion de
-- un tenant individual -- dejarlo en manos de un account_admin
-- permitiria que el admin de un cliente cambiara las tasas de todos
-- los demas tenants).
alter table public.payroll_fiscal_rules enable row level security;

create policy payroll_fiscal_rules_select on public.payroll_fiscal_rules
  for select using (auth.uid() is not null);

create policy payroll_fiscal_rules_insert on public.payroll_fiscal_rules
  for insert with check (public.is_super_admin());

create policy payroll_fiscal_rules_update on public.payroll_fiscal_rules
  for update using (public.is_super_admin());

create policy payroll_fiscal_rules_delete on public.payroll_fiscal_rules
  for delete using (public.is_super_admin());

-- ---------- generate_payroll_period: leer reglas por ano fiscal ----------
create or replace function public.generate_payroll_period(
  p_tenant_id uuid,
  p_period_type text,
  p_start_date date,
  p_end_date date,
  p_pay_date date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fiscal_year integer;
  v_rules public.payroll_fiscal_rules%rowtype;
  v_period_id uuid;
  v_employee record;
  v_gross numeric(12, 2);
  v_sfs_base numeric(12, 2);
  v_afp_base numeric(12, 2);
  v_srl_base numeric(12, 2);
  v_sfs_employee numeric(12, 2);
  v_sfs_employer numeric(12, 2);
  v_afp_employee numeric(12, 2);
  v_afp_employer numeric(12, 2);
  v_srl_employer numeric(12, 2);
  v_infotep_employer numeric(12, 2);
  v_periods_per_year numeric;
  v_taxable_period numeric;
  v_annual_taxable numeric(12, 2);
  v_annual_isr numeric(12, 2);
  v_bracket jsonb;
  v_isr numeric(12, 2);
  v_net numeric(12, 2);
begin
  if p_period_type not in ('mensual', 'quincenal') then
    raise exception 'Tipo de periodo invalido';
  end if;

  if p_tenant_id not in (select public.my_manager_tenant_ids()) then
    raise exception 'No autorizado';
  end if;

  if p_end_date < p_start_date then
    raise exception 'La fecha de fin no puede ser anterior a la fecha de inicio';
  end if;

  v_fiscal_year := extract(year from p_start_date)::integer;

  select * into v_rules
  from public.payroll_fiscal_rules
  where fiscal_year <= v_fiscal_year
  order by fiscal_year desc
  limit 1;

  if not found then
    raise exception 'No hay reglas de nomina configuradas para el ano fiscal % ni ninguno anterior', v_fiscal_year;
  end if;

  insert into public.payroll_periods (tenant_id, period_type, start_date, end_date, pay_date, fiscal_year)
  values (p_tenant_id, p_period_type, p_start_date, p_end_date, p_pay_date, v_fiscal_year)
  returning id into v_period_id;

  v_periods_per_year := case when p_period_type = 'quincenal' then 24 else 12 end;

  for v_employee in
    select id, monthly_salary
    from public.employees
    where tenant_id = p_tenant_id
      and status = 'active'
      and monthly_salary is not null
      and monthly_salary > 0
  loop
    v_gross := case when p_period_type = 'quincenal'
      then round(v_employee.monthly_salary / 2.0, 2)
      else v_employee.monthly_salary
    end;

    -- Los topes de TSS son mensuales; en un periodo quincenal se
    -- prorratean a la mitad para no sobre-cotizar en cada pago.
    v_sfs_base := least(v_gross, case when p_period_type = 'quincenal' then v_rules.sfs_cap / 2.0 else v_rules.sfs_cap end);
    v_afp_base := least(v_gross, case when p_period_type = 'quincenal' then v_rules.afp_cap / 2.0 else v_rules.afp_cap end);
    v_srl_base := least(v_gross, case when p_period_type = 'quincenal' then v_rules.srl_cap / 2.0 else v_rules.srl_cap end);

    v_sfs_employee := round(v_sfs_base * v_rules.sfs_employee_rate, 2);
    v_sfs_employer := round(v_sfs_base * v_rules.sfs_employer_rate, 2);
    v_afp_employee := round(v_afp_base * v_rules.afp_employee_rate, 2);
    v_afp_employer := round(v_afp_base * v_rules.afp_employer_rate, 2);
    v_srl_employer := round(v_srl_base * v_rules.srl_employer_rate, 2);
    v_infotep_employer := round(v_gross * v_rules.infotep_employer_rate, 2);

    v_taxable_period := greatest(v_gross - v_sfs_employee - v_afp_employee, 0);
    v_annual_taxable := round(v_taxable_period * v_periods_per_year, 2);

    -- Recorre los tramos de ISR del ano fiscal aplicable en orden y
    -- toma el primero cuyo limite superior (upto) cubra el ingreso
    -- anual cotizable, o el ultimo tramo (upto = null) si lo supera.
    v_annual_isr := null;
    for v_bracket in select * from jsonb_array_elements(v_rules.isr_brackets)
    loop
      if (v_bracket->>'upto') is null or v_annual_taxable <= (v_bracket->>'upto')::numeric then
        v_annual_isr := (v_bracket->>'base')::numeric
          + (v_annual_taxable - (v_bracket->>'from')::numeric) * (v_bracket->>'rate')::numeric;
        exit;
      end if;
    end loop;

    if v_annual_isr is null then
      raise exception 'La escala de ISR del ano fiscal % no cubre un ingreso anual de %', v_fiscal_year, v_annual_taxable;
    end if;

    v_isr := round(v_annual_isr / v_periods_per_year, 2);
    v_net := v_gross - v_sfs_employee - v_afp_employee - v_isr;

    insert into public.payroll_entries (
      tenant_id, period_id, employee_id, gross_salary,
      sfs_employee, sfs_employer, afp_employee, afp_employer,
      srl_employer, infotep_employer, isr_withholding, net_pay
    )
    values (
      p_tenant_id, v_period_id, v_employee.id, v_gross,
      v_sfs_employee, v_sfs_employer, v_afp_employee, v_afp_employer,
      v_srl_employer, v_infotep_employer, v_isr, v_net
    );
  end loop;

  return v_period_id;
end;
$$;

grant execute on function public.generate_payroll_period(uuid, text, date, date, date) to authenticated;
