-- =========================================================
-- Horas extra, regalia pascual anual y liquidacion integradas al
-- motor de nomina (payroll_periods / payroll_entries).
--
-- Hasta ahora:
--  - No existia ningun calculo de horas extra: el marcaje
--    (time_clock_entries, 0015) se usaba solo para tardanza, nunca
--    para nomina.
--  - La regalia pascual solo se calculaba de forma proporcional al
--    momento de una baja (0009_offboarding.sql) -- no habia forma de
--    generar la regalia pascual anual completa para los empleados
--    activos.
--  - La liquidacion (preaviso/cesantia/vacaciones/regalia
--    proporcional) se calculaba correctamente en offboarding, pero
--    quedaba aislada en offboarding_processes: nunca aparecia en el
--    historial de nomina ni podia exportarse con el export bancario
--    (0020).
--
-- Esta migracion:
--  1) Agrega columnas de horas extra a payroll_entries y una funcion
--     calculate_overtime_hours() que las deriva del marcaje real
--     dentro del rango del periodo, agrupado por semana calendario
--     (Art. 203-204 del Codigo de Trabajo: 44h ordinarias/semana,
--     horas 45-68 con recargo de 35%, mas alla de 68 con recargo de
--     100%). Reescribe generate_payroll_period para sumar el pago de
--     horas extra al bruto (SI cotiza a TSS y SI es gravable de ISR,
--     a diferencia de "other_bonuses" que es una simplificacion ya
--     aceptada del sistema). Si el empleado no tiene marcaje en el
--     periodo, no se calculan horas extra -- es un calculo de
--     referencia derivado del marcaje registrado, no un sustituto de
--     un control de asistencia validado.
--  2) Agrega generate_regalia_pascual(): un nuevo tipo de periodo
--     'regalia' que paga a cada empleado activo la doceava parte de
--     su salario ordinario acumulado en el ano calendario (Art.
--     219-222), exenta de TSS/ISR (estructuralmente nunca supera el
--     tope exento del Art. 222 porque ES ese tope). Valida el plazo
--     legal (antes del 20 de diciembre, Art. 220) y evita generarla
--     dos veces para el mismo ano. Solo aplica a empleados activos:
--     un empleado que se va a mitad de ano ya recibe su regalia
--     proporcional dentro de su liquidacion (ver punto 3), nunca las
--     dos.
--  3) Reescribe start_offboarding_process() para que, ademas de
--     guardar el desglose en offboarding_processes (sin cambios ahi),
--     registre el total de la liquidacion como un periodo de nomina
--     de tipo 'liquidacion' con una sola entrada -- asi aparece en el
--     historial de Nomina y en el export bancario igual que cualquier
--     otro pago. offboarding_processes gana la columna
--     payroll_period_id para enlazar de vuelta.
--
-- payroll_periods.period_type se amplia de ('mensual', 'quincenal') a
-- incluir 'regalia' y 'liquidacion'.
--
-- Simplificacion deliberada (igual que el resto del motor de nomina):
-- la liquidacion se registra sin retencion de TSS/ISR en ninguno de
-- sus componentes (incluidas vacaciones), igual que ya calculaba
-- offboarding antes de esta migracion -- valida con un contador el
-- tratamiento fiscal exacto de cada componente antes de un pago real.
-- =========================================================

-- ---------- Horas extra: columnas nuevas ----------
alter table public.payroll_entries
  add column overtime_hours_35 numeric(8, 2) not null default 0,
  add column overtime_hours_100 numeric(8, 2) not null default 0,
  add column overtime_pay numeric(12, 2) not null default 0;

comment on column public.payroll_entries.overtime_hours_35 is
  'Horas extra con recargo de 35% (horas 45-68 de la semana), derivadas del marcaje real.';
comment on column public.payroll_entries.overtime_hours_100 is
  'Horas extra con recargo de 100% (a partir de la hora 69 de la semana), derivadas del marcaje real.';
comment on column public.payroll_entries.overtime_pay is
  'Pago total de horas extra, ya incluido dentro de gross_salary (cotiza a TSS y es gravable de ISR).';

-- ---------- payroll_periods: nuevos tipos de periodo ----------
alter table public.payroll_periods
  drop constraint if exists payroll_periods_period_type_check;

alter table public.payroll_periods
  add constraint payroll_periods_period_type_check
  check (period_type in ('mensual', 'quincenal', 'regalia', 'liquidacion'));

-- Evita generar la regalia pascual dos veces para la misma cuenta y ano.
create unique index payroll_periods_one_regalia_per_year
  on public.payroll_periods (tenant_id, fiscal_year)
  where period_type = 'regalia';

-- ---------- offboarding_processes: enlace de vuelta a nomina ----------
alter table public.offboarding_processes
  add column payroll_period_id uuid references public.payroll_periods(id) on delete set null;

-- ---------- calculate_overtime_hours ----------
create or replace function public.calculate_overtime_hours(
  p_employee_id uuid,
  p_start_date date,
  p_end_date date
)
returns table (hours_35 numeric, hours_100 numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_week record;
  v_week_hours numeric;
  v_hours_35 numeric := 0;
  v_hours_100 numeric := 0;
begin
  select tenant_id into v_tenant_id from public.employees where id = p_employee_id;

  if v_tenant_id is null then
    raise exception 'Empleado invalido';
  end if;

  if v_tenant_id not in (select public.my_manager_tenant_ids())
     and p_employee_id not in (select public.my_employee_ids()) then
    raise exception 'No autorizado';
  end if;

  -- Agrupa las horas trabajadas (marcaje con salida registrada) por
  -- semana calendario (lunes-domingo). Una semana que cruza el borde
  -- del periodo se cuenta solo por los dias de marcaje dentro del
  -- rango pedido -- simplificacion de referencia, igual que el resto
  -- del sistema (ver get_vacation_balance, start_offboarding_process).
  for v_week in
    select sum(extract(epoch from (tce.clock_out - tce.clock_in)) / 3600.0) as hours
    from public.time_clock_entries tce
    where tce.employee_id = p_employee_id
      and tce.clock_out is not null
      and tce.clock_in::date between p_start_date and p_end_date
    group by date_trunc('week', tce.clock_in)
  loop
    v_week_hours := coalesce(v_week.hours, 0);
    if v_week_hours > 68 then
      v_hours_35 := v_hours_35 + 24; -- horas 45-68
      v_hours_100 := v_hours_100 + (v_week_hours - 68);
    elsif v_week_hours > 44 then
      v_hours_35 := v_hours_35 + (v_week_hours - 44);
    end if;
  end loop;

  return query select round(v_hours_35, 2), round(v_hours_100, 2);
end;
$$;

grant execute on function public.calculate_overtime_hours(uuid, date, date) to authenticated;

-- ---------- generate_payroll_period: sumar horas extra al bruto ----------
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
  v_hourly_rate numeric(12, 4);
  v_overtime_hours_35 numeric(8, 2);
  v_overtime_hours_100 numeric(8, 2);
  v_overtime_pay numeric(12, 2);
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

    -- Horas extra (Art. 203-204): derivadas del marcaje real dentro del
    -- rango del periodo. Se suman al bruto porque SI cotizan a TSS y SI
    -- son gravables de ISR (a diferencia de "other_bonuses").
    select ot.hours_35, ot.hours_100
    into v_overtime_hours_35, v_overtime_hours_100
    from public.calculate_overtime_hours(v_employee.id, p_start_date, p_end_date) ot;

    v_hourly_rate := round(v_employee.monthly_salary / 23.83 / 8.0, 4);
    v_overtime_pay := round(
      coalesce(v_overtime_hours_35, 0) * v_hourly_rate * 1.35
      + coalesce(v_overtime_hours_100, 0) * v_hourly_rate * 2.0,
      2
    );

    v_gross := v_gross + v_overtime_pay;

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
      benefits_deduction, overtime_hours_35, overtime_hours_100,
      overtime_pay, net_pay
    )
    values (
      p_tenant_id, v_period_id, v_employee.id, v_gross,
      v_sfs_employee, v_sfs_employer, v_afp_employee, v_afp_employer,
      v_srl_employer, v_infotep_employer, v_isr,
      v_benefits_deduction, coalesce(v_overtime_hours_35, 0), coalesce(v_overtime_hours_100, 0),
      v_overtime_pay, v_net
    );
  end loop;

  return v_period_id;
end;
$$;

grant execute on function public.generate_payroll_period(uuid, text, date, date, date) to authenticated;

-- ---------- generate_regalia_pascual ----------
create or replace function public.generate_regalia_pascual(
  p_tenant_id uuid,
  p_year integer,
  p_pay_date date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year_start date;
  v_year_end date;
  v_deadline date;
  v_period_id uuid;
  v_employee record;
  v_effective_start date;
  v_reference_end date;
  v_age interval;
  v_months numeric;
  v_regalia numeric(12, 2);
begin
  if p_tenant_id not in (select public.my_manager_tenant_ids()) then
    raise exception 'No autorizado';
  end if;

  v_year_start := make_date(p_year, 1, 1);
  v_year_end := make_date(p_year, 12, 31);
  v_deadline := make_date(p_year, 12, 20);

  if p_pay_date > v_deadline then
    raise exception 'La regalia pascual debe pagarse antes del 20 de diciembre (Art. 220 del Codigo de Trabajo)';
  end if;

  if p_pay_date < v_year_start then
    raise exception 'La fecha de pago no puede ser anterior al ano de la regalia';
  end if;

  if exists (
    select 1 from public.payroll_periods
    where tenant_id = p_tenant_id and period_type = 'regalia' and fiscal_year = p_year
  ) then
    raise exception 'Ya se genero la regalia pascual % para esta cuenta', p_year;
  end if;

  insert into public.payroll_periods (tenant_id, period_type, start_date, end_date, pay_date, fiscal_year)
  values (p_tenant_id, 'regalia', v_year_start, v_year_end, p_pay_date, p_year)
  returning id into v_period_id;

  v_reference_end := least(v_year_end, p_pay_date);

  -- Solo empleados activos: quien se va a mitad de ano ya recibe su
  -- regalia proporcional dentro de su liquidacion (start_offboarding_process),
  -- nunca las dos.
  for v_employee in
    select id, monthly_salary, hire_date
    from public.employees
    where tenant_id = p_tenant_id
      and status = 'active'
      and monthly_salary is not null
      and monthly_salary > 0
  loop
    v_effective_start := greatest(v_year_start, coalesce(v_employee.hire_date, v_year_start));

    if v_effective_start > v_reference_end then
      continue;
    end if;

    v_age := age(v_reference_end, v_effective_start);
    v_months := least(
      extract(year from v_age)::numeric * 12
        + extract(month from v_age)::numeric
        + extract(day from v_age)::numeric / 30.0,
      12
    );

    v_regalia := round(v_employee.monthly_salary * v_months / 12.0, 2);

    if v_regalia > 0 then
      insert into public.payroll_entries (tenant_id, period_id, employee_id, gross_salary, net_pay)
      values (p_tenant_id, v_period_id, v_employee.id, v_regalia, v_regalia);
    end if;
  end loop;

  return v_period_id;
end;
$$;

grant execute on function public.generate_regalia_pascual(uuid, integer, date) to authenticated;

-- ---------- start_offboarding_process: registrar la liquidacion en nomina ----------
create or replace function public.start_offboarding_process(
  p_employee_id uuid,
  p_reason text,
  p_last_working_day date,
  p_monthly_salary numeric,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_hire_date date;
  v_age interval;
  v_whole_months int;
  v_whole_years int;
  v_months_since_anniv int;
  v_cesantia_rate int;
  v_vacation_rate numeric;
  v_daily_salary numeric(12, 2);
  v_preaviso_days int := 0;
  v_preaviso_amount numeric(12, 2) := 0;
  v_cesantia_days numeric(8, 2) := 0;
  v_cesantia_amount numeric(12, 2) := 0;
  v_vacation_days numeric(8, 2) := 0;
  v_vacation_amount numeric(12, 2) := 0;
  v_year_start date;
  v_year_age interval;
  v_months_this_year numeric;
  v_christmas_bonus numeric(12, 2) := 0;
  v_total numeric(12, 2) := 0;
  v_process_id uuid;
  v_payroll_period_id uuid;
begin
  if p_reason not in ('renuncia', 'despido_justificado', 'despido_injustificado', 'mutuo_acuerdo', 'fin_contrato') then
    raise exception 'Motivo de baja invalido';
  end if;

  select tenant_id, hire_date into v_tenant_id, v_hire_date
  from public.employees
  where id = p_employee_id;

  if v_tenant_id is null then
    raise exception 'Empleado invalido';
  end if;

  if v_tenant_id not in (select public.my_manager_tenant_ids()) then
    raise exception 'No autorizado';
  end if;

  if v_hire_date is null then
    raise exception 'El empleado no tiene fecha de ingreso registrada; agregala en Empleados antes de iniciar la baja';
  end if;

  if p_last_working_day < v_hire_date then
    raise exception 'La fecha de ultimo dia no puede ser anterior a la fecha de ingreso';
  end if;

  v_daily_salary := round(p_monthly_salary / 23.83, 2);

  -- Meses completos de servicio (age() ya da el desglose calendario correcto)
  v_age := age(p_last_working_day, v_hire_date);
  v_whole_months := extract(year from v_age)::int * 12 + extract(month from v_age)::int;
  v_whole_years := v_whole_months / 12; -- division entera
  v_months_since_anniv := v_whole_months % 12;

  -- Preaviso y cesantia (Art. 76 y 80 del Codigo de Trabajo): solo aplican
  -- cuando el empleador despide sin causa justificada.
  if p_reason = 'despido_injustificado' then
    if v_whole_months < 3 then
      v_preaviso_days := 0;
      v_cesantia_days := 0;
    elsif v_whole_months < 6 then
      v_preaviso_days := 7;
      v_cesantia_days := 6;
    elsif v_whole_months < 12 then
      v_preaviso_days := 14;
      v_cesantia_days := 13;
    else
      v_preaviso_days := 28;
      v_cesantia_rate := case when v_whole_years >= 5 then 23 else 21 end;
      v_cesantia_days := v_whole_years * v_cesantia_rate
        + (v_months_since_anniv / 12.0) * v_cesantia_rate;
    end if;

    v_preaviso_amount := round(v_preaviso_days * v_daily_salary, 2);
    v_cesantia_amount := round(v_cesantia_days * v_daily_salary, 2);
  end if;

  -- Vacaciones no disfrutadas (Art. 177): derecho ganado, se paga sin
  -- importar el motivo de la baja. 14 dias/ano (18 desde el 6to ano),
  -- prorateado por los meses corridos desde el ultimo aniversario.
  v_vacation_rate := case when v_whole_years >= 5 then 18 else 14 end;
  v_vacation_days := round(v_vacation_rate * (v_months_since_anniv / 12.0), 2);
  v_vacation_amount := round(v_vacation_days * v_daily_salary, 2);

  -- Regalia pascual proporcional (Art. 219): tambien es un derecho ganado,
  -- se paga sin importar el motivo. Proporcional a los meses trabajados
  -- en el ano calendario en curso.
  v_year_start := greatest(date_trunc('year', p_last_working_day)::date, v_hire_date);
  v_year_age := age(p_last_working_day, v_year_start);
  v_months_this_year := extract(year from v_year_age)::numeric * 12
    + extract(month from v_year_age)::numeric
    + (extract(day from v_year_age)::numeric / 30.0);
  v_christmas_bonus := round(p_monthly_salary * (v_months_this_year / 12.0), 2);

  v_total := v_preaviso_amount + v_cesantia_amount + v_vacation_amount + v_christmas_bonus;

  -- Registra la liquidacion como un periodo de nomina de una sola
  -- entrada, para que aparezca en el historial de Nomina y en el
  -- export bancario igual que cualquier otro pago. Sin retencion de
  -- TSS/ISR en v1 (misma simplificacion que ya tenia este calculo
  -- antes de integrarse a nomina) -- valida el tratamiento fiscal
  -- exacto de cada componente con un contador antes de un pago real.
  if v_total > 0 then
    insert into public.payroll_periods (tenant_id, period_type, start_date, end_date, pay_date, fiscal_year)
    values (
      v_tenant_id, 'liquidacion', p_last_working_day, p_last_working_day, p_last_working_day,
      extract(year from p_last_working_day)::integer
    )
    returning id into v_payroll_period_id;

    insert into public.payroll_entries (tenant_id, period_id, employee_id, gross_salary, net_pay)
    values (v_tenant_id, v_payroll_period_id, p_employee_id, v_total, v_total);
  end if;

  insert into public.offboarding_processes (
    tenant_id, employee_id, reason, last_working_day, monthly_salary,
    years_of_service, preaviso_days, preaviso_amount, cesantia_days, cesantia_amount,
    vacation_days_pending, vacation_amount, christmas_bonus_amount, total_liquidation, notes,
    payroll_period_id
  )
  values (
    v_tenant_id, p_employee_id, p_reason, p_last_working_day, p_monthly_salary,
    round(v_whole_months / 12.0, 2), v_preaviso_days, v_preaviso_amount, v_cesantia_days, v_cesantia_amount,
    v_vacation_days, v_vacation_amount, v_christmas_bonus, v_total, p_notes,
    v_payroll_period_id
  )
  returning id into v_process_id;

  insert into public.offboarding_tasks (process_id, title, description, order_index)
  values
    (v_process_id, 'Notificar la salida a supervisor y equipo', null, 0),
    (v_process_id, 'Desactivar accesos y cuentas (correo, sistemas internos)', null, 1),
    (v_process_id, 'Recuperar equipos y materiales de la empresa', null, 2),
    (v_process_id, 'Realizar entrevista de salida', null, 3),
    (v_process_id, 'Preparar y firmar carta de trabajo / certificacion laboral', null, 4),
    (v_process_id, 'Entregar liquidacion final y firmar recibo de descargo', null, 5);

  update public.employees
  set status = 'terminated'
  where id = p_employee_id;

  return v_process_id;
end;
$$;

grant execute on function public.start_offboarding_process(uuid, text, date, numeric, text) to authenticated;
