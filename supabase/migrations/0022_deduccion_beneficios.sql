-- =========================================================
-- Deduccion automatica de beneficios en el motor de nomina.
--
-- Hasta ahora el aporte del empleado a sus beneficios activos
-- (employee_benefits.employee_cost, via benefit_types) solo se
-- mostraba como referencia en el dashboard de costo total de
-- compensacion (0017_beneficios.sql) -- nunca se restaba del neto de
-- nomina, así que el empleado veía su aporte pero la nómina nunca se
-- lo cobraba. Esta migracion agrega la columna benefits_deduction a
-- payroll_entries y hace que generate_payroll_period sume el
-- employee_cost de todos los beneficios del empleado que se traslapan
-- con el periodo (mismo criterio de fechas que el resto del sistema:
-- start_date <= fin del periodo y end_date nulo o >= inicio del
-- periodo), prorrateando a la mitad en periodo quincenal, igual que
-- el salario bruto y los topes de TSS. adjust_payroll_entry se
-- actualiza para conservar esa deduccion ya calculada al recalcular
-- el neto con bono/deduccion manual.
-- =========================================================

alter table public.payroll_entries
  add column benefits_deduction numeric(12, 2) not null default 0;

-- ---------- generate_payroll_period: sumar deduccion de beneficios ----------
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
  v_benefits_deduction numeric(12, 2);
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

    -- Suma el aporte del empleado (employee_cost) de todos los
    -- beneficios que se traslapan con el rango del periodo -- no solo
    -- los "activos hoy" como en el dashboard de costo de
    -- compensacion, para que un periodo generado a posteriori siga
    -- reflejando lo que aplicaba en esas fechas.
    select coalesce(sum(bt.employee_cost), 0)
    into v_benefits_deduction
    from public.employee_benefits eb
    join public.benefit_types bt on bt.id = eb.benefit_type_id
    where eb.employee_id = v_employee.id
      and eb.start_date <= p_end_date
      and (eb.end_date is null or eb.end_date >= p_start_date);

    v_benefits_deduction := case when p_period_type = 'quincenal'
      then round(v_benefits_deduction / 2.0, 2)
      else v_benefits_deduction
    end;

    v_net := v_gross - v_sfs_employee - v_afp_employee - v_isr - v_benefits_deduction;

    insert into public.payroll_entries (
      tenant_id, period_id, employee_id, gross_salary,
      sfs_employee, sfs_employer, afp_employee, afp_employer,
      srl_employer, infotep_employer, isr_withholding,
      benefits_deduction, net_pay
    )
    values (
      p_tenant_id, v_period_id, v_employee.id, v_gross,
      v_sfs_employee, v_sfs_employer, v_afp_employee, v_afp_employer,
      v_srl_employer, v_infotep_employer, v_isr,
      v_benefits_deduction, v_net
    );
  end loop;

  return v_period_id;
end;
$$;

grant execute on function public.generate_payroll_period(uuid, text, date, date, date) to authenticated;

-- ---------- adjust_payroll_entry: conservar la deduccion de beneficios ----------
create or replace function public.adjust_payroll_entry(
  p_entry_id uuid,
  p_other_bonuses numeric,
  p_other_deductions numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_period_status text;
  v_gross numeric(12, 2);
  v_sfs_employee numeric(12, 2);
  v_afp_employee numeric(12, 2);
  v_isr numeric(12, 2);
  v_benefits_deduction numeric(12, 2);
begin
  select e.tenant_id, p.status, e.gross_salary, e.sfs_employee, e.afp_employee, e.isr_withholding, e.benefits_deduction
  into v_tenant_id, v_period_status, v_gross, v_sfs_employee, v_afp_employee, v_isr, v_benefits_deduction
  from public.payroll_entries e
  join public.payroll_periods p on p.id = e.period_id
  where e.id = p_entry_id;

  if v_tenant_id is null then
    raise exception 'Entrada de nomina invalida';
  end if;

  if v_tenant_id not in (select public.my_manager_tenant_ids()) then
    raise exception 'No autorizado';
  end if;

  if v_period_status = 'cerrado' then
    raise exception 'El periodo ya esta cerrado';
  end if;

  update public.payroll_entries
  set other_bonuses = coalesce(p_other_bonuses, 0),
      other_deductions = coalesce(p_other_deductions, 0),
      net_pay = v_gross - v_sfs_employee - v_afp_employee - v_isr - v_benefits_deduction
        + coalesce(p_other_bonuses, 0) - coalesce(p_other_deductions, 0)
  where id = p_entry_id;
end;
$$;

grant execute on function public.adjust_payroll_entry(uuid, numeric, numeric) to authenticated;
