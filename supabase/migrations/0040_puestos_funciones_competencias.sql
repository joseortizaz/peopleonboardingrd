-- =========================================================
-- Estructura y puestos: funciones y competencias del puesto.
-- Ver claude/plan-robustecer-estructura-puestos.md, seccion 3.
--
-- Ultimos campos del "JobDescription" original de Base44 que quedaban
-- pendientes (mision ya se agrego en la migracion 0038). Se agregan
-- como columnas de texto libre en job_positions -- mismo criterio ya
-- usado para vacancies.description / vacancies.requirements (migracion
-- 0004): contenido narrativo simple, no una lista estructurada, para
-- no introducir una decision de modelado (items con orden, categorias,
-- etc.) que nadie ha pedido todavia.
-- =========================================================

alter table public.job_positions
  add column if not exists functions text,
  add column if not exists technical_competencies text,
  add column if not exists soft_competencies text;

comment on column public.job_positions.functions is
  'Funciones principales del puesto, texto libre (opcional).';

comment on column public.job_positions.technical_competencies is
  'Competencias tecnicas requeridas para el puesto, texto libre (opcional).';

comment on column public.job_positions.soft_competencies is
  'Competencias blandas requeridas para el puesto, texto libre (opcional).';
