-- =========================================================
-- Motor de nomina (TSS/ISR) v1.
--
-- Calculo de referencia de nomina dominicana con las tasas y topes
-- vigentes en 2026 (ver plan de desarrollo, seccion 7 -- fuentes TSS/DGII):
--   SFS (salud):    empleado 3.04%, empleador 7.09%, tope RD$232,230
--   AFP (pension):  empleado 2.87%, empleador 7.10%, tope RD$464,460
--   SRL (riesgo):   empleador 1.20%, tope RD$92,892 (solo empleador)
--   INFOTEP:        empleador 1.00%, sin tope
-- Topes derivados del salario de referencia TSS (RD$23,223/mes desde
-- feb. 2026): SFS = 10x, AFP = 20x, SRL = 4x.
--
-- ISR: se anualiza el salario cotizable del periodo (bruto menos SFS y
-- AFP del empleado), se aplica la escala progresiva de la DGII vigente
-- sin cambios desde 2018 hasta 2026 (Resolucion DDG-AR1-2026-00001) y
-- el resultado anual se divide entre los periodos del ano -- es el
-- metodo estandar de retencion mensual y NO contempla deducciones
-- adicionales del contribuyente (educacion, salud, etc.) que
-- reducirian el ISR real de cada persona en su declaracion anual.
--
-- Igual que offboarding (0009), es un calculo de referencia: debe
-- validarse con un contador o gestor laboral antes de usarse para
-- pagos reales. Las tasas quedan hardcodeadas en la funcion (mismo
-- patron que las tablas del Codigo de Trabajo en 0009) en vez de un
-- motor de reglas versionado por ano fiscal -- pendiente como mejora
-- futura (la Ley 30-26 ya anuncia una nueva escala de ISR desde 2027,
-- lo que va a requerir esa version).
-- =========================================================

alter table public.employees
  add column monthly_salary numeric(12, 2) check (monthly_salary is null or monthly_salary >= 0);

create table public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  period_type text not null check (period_type in ('mensual', 'quincenal')),
  start_date date not null,
  end_date date not null,
  pay_date date not null,
  status text not null default 'abierto' check (status in ('abierto', 'cerrado')),
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index payroll_periods_tenant_id_idx on public.payroll_periods(tenant_id);

create table public.payroll_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  period_id uuid not null references public.payroll_periods(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  gross_salary numeric(12, 2) not null default 0,
  sfs_employee numeric(12, 2) not null default 0,
  sfs_employer numeric(12, 2) not null default 0,
  afp_employee numeric(12, 2) not null default 0,
  afp_employer numeric(12, 2) not null default 0,
  srl_employer numeric(12, 2) not null default 0,
  infotep_employer numeric(12, 2) not null default 0,
  isr_withholding numeric(12, 2) not null default 0,
  other_bonuses numeric(12, 2) not null default 0,
  other_deductions numeric(12, 2) not null default 0,
  net_pay numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  unique (period_id, employee_id)
);

create index payroll_entries_tenant_id_idx on public.payroll_entries(tenant_id);
create index payroll_entries_period_id_idx on public.payroll_entries(period_id);

-- ---------- Generar un periodo de nomina ----------
-- Crea el periodo y una entrada por cada empleado activo con salario
-- mensual registrado. security definer: valida por su cuenta que quien
-- llama sea gestor del tenant (no puede depender solo de RLS).
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
  v_sfs_employee_rate constant numeric := 0.0304;
  v_sfs_employer_rate constant numeric := 0.0709;
  v_sfs_cap constant numeric := 232230;
  v_afp_employee_rate constant numeric := 0.0287;
  v_afp_employer_rate constant numeric := 0.0710;
  v_afp_cap constant numeric := 464460;
  v_srl_employer_rate constant numeric := 0.0120;
  v_srl_cap constant numeric := 92892;
  v_infotep_employer_rate constant numeric := 0.0100;
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

  insert into public.payroll_periods (tenant_id, period_type, start_date, end_date, pay_date)
  values (p_tenant_id, p_period_type, p_start_date, p_end_date, p_pay_date)
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
    v_sfs_base := least(v_gross, case when p_period_type = 'quincenal' then v_sfs_cap / 2.0 else v_sfs_cap end);
    v_afp_base := least(v_gross, case when p_period_type = 'quincenal' then v_afp_cap / 2.0 else v_afp_cap end);
    v_srl_base := least(v_gross, case when p_period_type = 'quincenal' then v_srl_cap / 2.0 else v_srl_cap end);

    v_sfs_employee := round(v_sfs_base * v_sfs_employee_rate, 2);
    v_sfs_employer := round(v_sfs_base * v_sfs_employer_rate, 2);
    v_afp_employee := round(v_afp_base * v_afp_employee_rate, 2);
    v_afp_employer := round(v_afp_base * v_afp_employer_rate, 2);
    v_srl_employer := round(v_srl_base * v_srl_employer_rate, 2);
    v_infotep_employer := round(v_gross * v_infotep_employer_rate, 2);

    v_taxable_period := greatest(v_gross - v_sfs_employee - v_afp_employee, 0);
    v_annual_taxable := round(v_taxable_period * v_periods_per_year, 2);

    if v_annual_taxable <= 416220 then
      v_annual_isr := 0;
    elsif v_annual_taxable <= 624329 then
      v_annual_isr := (v_annual_taxable - 416220) * 0.15;
    elsif v_annual_taxable <= 867123 then
      v_annual_isr := 31216 + (v_annual_taxable - 624329) * 0.20;
    else
      v_annual_isr := 79776 + (v_annual_taxable - 867123) * 0.25;
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

-- ---------- Cerrar un periodo (lo deja de solo lectura) ----------
create or replace function public.close_payroll_period(p_period_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id from public.payroll_periods where id = p_period_id;

  if v_tenant_id is null then
    raise exception 'Periodo invalido';
  end if;

  if v_tenant_id not in (select public.my_manager_tenant_ids()) then
    raise exception 'No autorizado';
  end if;

  update public.payroll_periods set status = 'cerrado' where id = p_period_id;
end;
$$;

grant execute on function public.close_payroll_period(uuid) to authenticated;

-- ---------- Ajustar bonos/deducciones extra de una entrada ----------
-- Solo permitido mientras el periodo este 'abierto'. Recalcula el neto
-- a partir de los valores ya calculados por generate_payroll_period.
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
begin
  select e.tenant_id, p.status, e.gross_salary, e.sfs_employee, e.afp_employee, e.isr_withholding
  into v_tenant_id, v_period_status, v_gross, v_sfs_employee, v_afp_employee, v_isr
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
      net_pay = v_gross - v_sfs_employee - v_afp_employee - v_isr
        + coalesce(p_other_bonuses, 0) - coalesce(p_other_deductions, 0)
  where id = p_entry_id;
end;
$$;

grant execute on function public.adjust_payroll_entry(uuid, numeric, numeric) to authenticated;

-- ---------- RLS ----------
alter table public.payroll_periods enable row level security;
alter table public.payroll_entries enable row level security;

create policy payroll_periods_select on public.payroll_periods
  for select using (tenant_id in (select public.my_manager_tenant_ids()));

create policy payroll_periods_insert on public.payroll_periods
  for insert with check (tenant_id in (select public.my_manager_tenant_ids()));

create policy payroll_periods_update on public.payroll_periods
  for update using (tenant_id in (select public.my_manager_tenant_ids()));

create policy payroll_periods_delete on public.payroll_periods
  for delete using (
    tenant_id in (select public.my_manager_tenant_ids())
    and status = 'abierto'
  );

create policy payroll_entries_select on public.payroll_entries
  for select using (tenant_id in (select public.my_manager_tenant_ids()));

create policy payroll_entries_insert on public.payroll_entries
  for insert with check (tenant_id in (select public.my_manager_tenant_ids()));

create policy payroll_entries_update on public.payroll_entries
  for update using (tenant_id in (select public.my_manager_tenant_ids()));

create policy payroll_entries_delete on public.payroll_entries
  for delete using (tenant_id in (select public.my_manager_tenant_ids()));
