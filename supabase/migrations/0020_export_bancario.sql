-- =========================================================
-- Export bancario para dispersion de nomina.
--
-- Agrega los datos bancarios del empleado (necesarios para generar el
-- archivo de dispersion que se sube al portal de banca empresarial) y
-- deja el numero de cedula/RNC, tambien requerido por casi todos los
-- formatos de plantilla de nomina de los bancos dominicanos.
--
-- No se modela un formato especifico de un banco (Banreservas, Popular
-- y BHD Leon tienen cada uno su propia plantilla exacta): se expone un
-- CSV de referencia con las columnas universales que piden todos --
-- cedula/RNC, nombre, banco, tipo de cuenta, numero de cuenta y monto
-- -- y se deja documentado que el orden/formato exacto de columnas
-- debe ajustarse a la plantilla real del banco antes de subirlo.
-- =========================================================

alter table public.employees
  add column national_id text,
  add column bank_name text,
  add column bank_account_type text check (bank_account_type is null or bank_account_type in ('ahorro', 'corriente')),
  add column bank_account_number text;
