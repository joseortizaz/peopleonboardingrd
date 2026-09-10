-- =========================================================
-- Firma electronica simple de documentos v1.
--
-- Sin acceso todavia a la API de un proveedor certificado de firma
-- digital (DocuSign, HelloSign/Dropbox Sign, etc. -- en tramite de
-- contratacion), se implementa una "firma electronica simple" propia,
-- valida bajo la Ley 126-02 sobre Comercio Electronico, Documentos y
-- Firmas Digitales de la Republica Dominicana (que reconoce la firma
-- electronica simple junto a la firma digital certificada, sin exigir
-- esta ultima para todo documento). El propio empleado dueno del
-- documento escribe su nombre completo como firma junto con una
-- declaracion de consentimiento explicita; el sistema guarda fecha y
-- hora, IP y un hash SHA-256 del archivo firmado como evidencia de
-- integridad. El diseno deja el camino abierto para, mas adelante,
-- sustituir el paso de "firmar" por una llamada real al proveedor
-- certificado sin perder el historial de auditoria ya acumulado.
--
-- Reutiliza employee_documents (gestion documental, migracion 0013) en
-- vez de crear un flujo separado -- cubre tanto "firma de documentos"
-- en general como "firma electronica de contrato" (basta con subir el
-- contrato marcando requires_signature).
-- =========================================================

alter table public.employee_documents
  add column requires_signature boolean not null default false,
  add column signed_at timestamptz,
  add column signed_full_name text,
  add column signed_ip text,
  add column signed_document_hash text,
  add column signature_statement text;

comment on column public.employee_documents.signed_document_hash is
  'SHA-256 (hex) del archivo en Storage calculado en el momento de la firma, como evidencia de auditoria de que el archivo firmado es el mismo que se muestra hoy -- no es una firma digital certificada.';

-- El propio empleado firma su documento pendiente a traves de esta
-- funcion (nunca con un update directo a la tabla: la policy de update
-- de employee_documents sigue siendo solo de gestion). El hash del
-- archivo y la IP los calcula/obtiene la app (Server Action) y se
-- pasan ya resueltos, porque Postgres no tiene acceso directo a los
-- bytes del archivo en Storage ni a la IP de la peticion HTTP original.
create or replace function public.sign_employee_document(
  p_document_id uuid,
  p_full_name text,
  p_document_hash text,
  p_signer_ip text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc record;
  v_clean_name text := trim(coalesce(p_full_name, ''));
begin
  select * into v_doc from public.employee_documents where id = p_document_id;

  if v_doc.id is null then
    raise exception 'Documento no encontrado';
  end if;

  if v_doc.employee_id not in (select public.my_employee_ids()) then
    raise exception 'No tienes permiso para firmar este documento';
  end if;

  if not v_doc.requires_signature then
    raise exception 'Este documento no requiere firma';
  end if;

  if v_doc.signed_at is not null then
    raise exception 'Este documento ya fue firmado el %', to_char(v_doc.signed_at, 'DD/MM/YYYY');
  end if;

  if length(v_clean_name) < 3 then
    raise exception 'Escribe tu nombre completo para firmar';
  end if;

  update public.employee_documents
  set
    signed_at = now(),
    signed_full_name = v_clean_name,
    signed_ip = p_signer_ip,
    signed_document_hash = p_document_hash,
    signature_statement =
      'Declaro que he leido y acepto el contenido de este documento ("' || v_doc.file_name ||
      '"), y que el nombre completo escrito arriba constituye mi firma electronica, conforme ' ||
      'a la Ley 126-02 sobre Comercio Electronico, Documentos y Firmas Digitales de la ' ||
      'Republica Dominicana.'
  where id = p_document_id;
end;
$$;
