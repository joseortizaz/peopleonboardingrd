-- =========================================================
-- Recargos legales de nomina que aun no se calculaban: trabajo
-- nocturno y trabajo en dia feriado o de descanso semanal (domingo).
--
-- Hasta ahora (0026_horas_extra_regalia_liquidacion.sql):
--  - Solo se calculaban los dos recargos de horas extra basados en el
--    total de horas trabajadas por semana calendario (Art. 203-204:
--    35% en horas 45-68, 100% mas alla de 68). Un empleado que
--    trabajaba de noche o en un feriado, sin exceder esas 44 horas
--    semanales, no recibia ningun recargo adicional.
--
-- Esta migracion agrega dos recargos mas, calculados tambien a partir
-- del marcaje real (time_clock_entries), como recargos ADICIONALES
-- sobre lo que ya esta incluido en el bruto (igual filosofia que
-- overtime_hours_35/100: nunca intentan determinar si esas horas ya
-- estaban "cubiertas" por el salario mensual fijo, es un calculo de
-- referencia derivado del marcaje, no un sustituto de asesoria
-- laboral):
--
--  1) public_holidays: catalogo de dias feriados nacionales (iguales
--     para todos los tenants, igual que payroll_fiscal_rules). Lectura
--     abierta a cualquier usuario autenticado, escritura restringida a
--     super_admin -- agregar el feriado de un ano nuevo es un evento
--     raro y regulatorio (el Ministerio de Trabajo anuncia cada ano
--     cuales feriados moviles se trasladan a lunes segun la Ley
--     139-97), no una operacion de un tenant individual. Sembrada con
--     los 12 feriados oficiales de 2026 (confirmados via Presidencia
--     de la Republica y Diario Libre, noviembre 2025). Igual que
--     payroll_fiscal_rules, agregar el ano siguiente se hace con una
--     sentencia SQL directa en Supabase si no se tiene rol de
--     super_admin -- ver /app/nomina/reglas-fiscales.
--
--  2) calculate_night_and_holiday_hours(): recorre el marcaje del
--     empleado en el rango pedido y calcula:
--     - Horas nocturnas: solapamiento de cada marcaje con la ventana
--       9:00pm-7:00am, anclada en el dia calendario del clock_in
--       (simplificacion de referencia: un turno que cruza mas de una
--       noche no se maneja en v1, igual que el resto del marcaje). La
--       ventana horaria exacta (9pm-7am) es la referencia mas comun
--       usada en RD -- VALIDAR con un contador o abogado laboral antes
--       de un pago real.
--     - Horas en feriado o domingo: si el dia del clock_in es un
--       public_holidays.date O cae en domingo (se asume domingo como
--       dia de descanso semanal por defecto para todos los empleados
--       -- no se deriva todavia de employee_shift_schedules, queda
--       como extension futura para negocios con turnos rotativos cuyo
--       descanso no cae en domingo), se cuenta el marcaje completo de
--       ese dia como horas en feriado/descanso.
--     Ambos recargos son ADITIVOS e independientes entre si y de las
--     horas extra por semana -- un caso donde coinciden (ej. horas
--     nocturnas que ademas caen en el tramo de 100% semanal) no se
--     resuelve aqui de forma especial; validar concurrencia de
--     recargos con un contador antes de un pago real.
--
--  3) payroll_entries gana night_hours/night_pay/holiday_hours/
--     holiday_pay. generate_payroll_period se reescribe para sumarlos
--     al bruto, igual tratamiento fiscal que overtime_pay (cotiza TSS,
--     gravable ISR).
--
-- Recargos aplicados (referencia comun, no verificada linea por linea
-- contra el Codigo de Trabajo para esta pasada -- VALIDAR antes de un
-- pago real):
--   - Nocturno: +15% sobre la tarifa por hora, solo por las horas que
--     caen en la ventana nocturna.
--   - Feriado/descanso semanal: +100% sobre la tarifa por hora, sobre
--     las horas trabajadas ese dia (recargo adicional, no un pago
--     doble completo -- igual filosofia que el +35%/+100% de horas
--     extra semanales).
-- =========================================================

-- ---------- Catalogo de dias feriados ----------
create table public.public_holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

comment on table public.public_holidays is
  'Feriados nacionales de Republica Dominicana, iguales para todos los tenants. '
  'Los feriados moviles (Ley 139-97) cambian de fecha cada ano segun anuncio del '
  'Ministerio de Trabajo -- agregar el ano siguiente requiere sembrar sus fechas.';

alter table public.public_holidays enable row level security;

create policy public_holidays_select on public.public_holidays
  for select using (auth.uid() is not null);

create policy public_holidays_insert on public.public_holidays
  for insert with check (public.is_super_admin());

create policy public_holidays_update on public.public_holidays
  for update using (public.is_super_admin());

create policy public_holidays_delete on public.public_holidays
  for delete using (public.is_super_admin());

-- Feriados oficiales 2026 (Ley 139-97 aplicada) -- confirmados via
-- Presidencia de la Republica Dominicana y Diario Libre, noviembre 2025.
insert into public.public_holidays (date, name) values
  ('2026-01-01', 'Año Nuevo'),
  ('2026-01-05', 'Día de los Santos Reyes (trasladado del 6 de enero)'),
  ('2026-01-21', 'Día de la Altagracia'),
  ('2026-01-26', 'Día de Duarte'),
  ('2026-02-27', 'Día de la Independencia'),
  ('2026-04-03', 'Viernes Santo'),
  ('2026-05-04', 'Día del Trabajo (trasladado del 1 de mayo)'),
  ('2026-06-04', 'Corpus Christi'),
  ('2026-08-16', 'Día de la Restauración'),
  ('2026-09-24', 'Día de las Mercedes'),
  ('2026-11-09', 'Día de la Constitución (trasladado del 6 de noviembre)'),
  ('2026-12-25', 'Navidad')
on conflict (date) do nothing;

-- ---------- payroll_entries: columnas nuevas ----------
alter table public.payroll_entries
  add column night_hours numeric(8, 2) not null default 0,
  add column night_pay numeric(12, 2) not null default 0,
  add column holiday_hours numeric(8, 2) not null default 0,
  add column holiday_pay numeric(12, 2) not null default 0;

comment on column public.payroll_entries.night_hours is
  'Horas trabajadas dentro de la ventana nocturna (9pm-7am), derivadas del marcaje real.';
comment on column public.payroll_entries.night_pay is
  'Recargo nocturno (+15% por hora), ya incluido dentro de gross_salary.';
comment on column public.payroll_entries.holiday_hours is
  'Horas trabajadas en un dia feriado o domingo, derivadas del marcaje real.';
comment on column public.payroll_entries.holiday_pay is
  'Recargo por feriado/descanso semanal (+100% por hora), ya incluido dentro de gross_salary.';

-- ---------- calculate_night_and_holiday_hours ----------
create or replace function public.calculate_night_and_holiday_hours(
  p_employee_id uuid,
  p_start_date date,
  p_end_date date
)
returns table (night_hours numeric, holiday_hours numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_entry record;
  v_in_local timestamp;
  v_out_local timestamp;
  v_night_start timestamp;
  v_night_end timestamp;
  v_night_hours numeric := 0;
  v_holiday_hours numeric := 0;
  v_day date;
begin
  select tenant_id into v_tenant_id from public.employees where id = p_employee_id;

  if v_tenant_id is null then
    raise exception 'Empleado invalido';
  end if;

  if v_tenant_id not in (select public.my_manager_tenant_ids())
     and p_employee_id not in (select public.my_employee_ids()) then
    raise exception 'No autorizado';
  end if;

  for v_entry in
    select tce.clock_in, tce.clock_out
    from public.time_clock_entries tce
    where tce.employee_id = p_employee_id
      and tce.clock_out is not null
      and tce.clock_in::date between p_start_date and p_end_date
  loop
    v_in_local := v_entry.clock_in at time zone 'America/Santo_Domingo';
    v_out_local := v_entry.clock_out at time zone 'America/Santo_Domingo';

    -- Horas nocturnas: solapamiento con 9:00pm-7:00am, ventana anclada
    -- en el dia calendario del clock_in.
    v_night_start := date_trunc('day', v_in_local) + interval '21 hours';
    v_night_end := date_trunc('day', v_in_local) + interval '1 day 7 hours';

    v_night_hours := v_night_hours + greatest(
      0,
      extract(epoch from (
        least(v_out_local, v_night_end) - greatest(v_in_local, v_night_start)
      )) / 3600.0
    );

    -- Horas en feriado o domingo (descanso semanal por defecto): se
    -- atribuye el marcaje completo al dia de clock_in.
    v_day := v_in_local::date;
    if extract(dow from v_day) = 0
       or exists (select 1 from public.public_holidays where date = v_day)
    then
      v_holiday_hours := v_holiday_hours
        + extract(epoch from (v_out_local - v_in_local)) / 3600.0;
    end if;
  end loop;

  return query select round(v_night_hours, 2), round(v_holiday_hours, 2);
end;
$$;

grant execute on function public.calculate_night_and_holiday_hours(uuid, date, date) to authenticated;

-- ---------- generate_payroll_period: sumar los nuevos recargos ----------
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
  v_night_hours numeric(8, 2);
  v_holiday_hours numeric(8, 2);
  v_night_pay numeric(12, 2);
  v_holiday_pay numeric(12, 2);
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

    v_hourly_rate := round(v_employee.monthly_salary / 23.83 / 8.0, 4);

    -- Horas extra (Art. 203-204): derivadas del marcaje real.
    select ot.hours_35, ot.hours_100
    into v_overtime_hours_35, v_overtime_hours_100
    from public.calculate_overtime_hours(v_employee.id, p_start_date, p_end_date) ot;

    v_overtime_pay := round(
      coalesce(v_overtime_hours_35, 0) * v_hourly_rate * 1.35
      + coalesce(v_overtime_hours_100, 0) * v_hourly_rate * 2.0,
      2
    );

    -- Recargo nocturno y de feriado/descanso semanal: recargos
    -- adicionales, independientes de las horas extra semanales.
    select nh.night_hours, nh.holiday_hours
    into v_night_hours, v_holiday_hours
    from public.calculate_night_and_holiday_hours(v_employee.id, p_start_date, p_end_date) nh;

    v_night_pay := round(coalesce(v_night_hours, 0) * v_hourly_rate * 0.15, 2);
    v_holiday_pay := round(coalesce(v_holiday_hours, 0) * v_hourly_rate * 1.00, 2);

    v_gross := v_gross + v_overtime_pay + v_night_pay + v_holiday_pay;

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
      overtime_pay, night_hours, night_pay, holiday_hours, holiday_pay,
      net_pay
    )
    values (
      p_tenant_id, v_period_id, v_employee.id, v_gross,
      v_sfs_employee, v_sfs_employer, v_afp_employee, v_afp_employer,
      v_srl_employer, v_infotep_employer, v_isr,
      v_benefits_deduction, coalesce(v_overtime_hours_35, 0), coalesce(v_overtime_hours_100, 0),
      v_overtime_pay, coalesce(v_night_hours, 0), v_night_pay, coalesce(v_holiday_hours, 0), v_holiday_pay,
      v_net
    );
  end loop;

  return v_period_id;
end;
$$;

grant execute on function public.generate_payroll_period(uuid, text, date, date, date) to authenticated;
