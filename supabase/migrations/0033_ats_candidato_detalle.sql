-- =========================================================
-- ATS: robustecer la ficha de candidato -- motivo de rechazo.
--
-- Las notas internas del reclutador ya existian sin usar (columna
-- `notes`, migracion 0004_ats.sql) -- esta migracion solo agrega el
-- motivo de rechazo, de texto libre. Es relevante unicamente cuando
-- stage = 'rechazado'; se deja sin constraint en base de datos para no
-- acoplar el esquema a un flujo de UI que puede cambiar (misma logica
-- que el resto del proyecto: la UI condiciona, la base de datos no
-- fuerza). No hace falta ninguna policy de RLS nueva: ambas columnas
-- viven en `candidates`, ya cubierto por candidates_select_team /
-- candidates_update_team.
-- =========================================================

alter table public.candidates
  add column if not exists rejection_reason text;
