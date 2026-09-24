-- Registro de anulación: se genera al "eliminar" una factura que ya tenía
-- registro fiscal. No borra el fiscal_record original (nunca se borra
-- nada), añade un nuevo registro tipo 'anulacion' encadenado igual que
-- los de alta.
create or replace function public.generate_fiscal_cancellation(p_invoice_id uuid)
returns public.fiscal_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invoice public.invoices%rowtype;
  v_profile public.profiles%rowtype;
  v_last_hash text;
  v_hash_input text;
  v_hash text;
  v_record public.fiscal_records;
  v_modalidad text;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id and user_id = auth.uid();
  if not found then
    raise exception 'Factura no encontrada o no pertenece al usuario actual.';
  end if;

  if not v_invoice.fiscal_locked then
    raise exception 'Esta factura no tiene registro fiscal — no hace falta anularla, se puede borrar normalmente.';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();

  select hash into v_last_hash
  from public.fiscal_records
  where user_id = auth.uid()
  order by created_at desc
  limit 1;

  v_modalidad := coalesce(v_profile.veri_factu_modality, 'no_verifactu');

  -- Registro de anulación: NIF emisor + nº factura + fecha expedición +
  -- tipo de registro ('anulacion') + hash del registro anterior.
  v_hash_input :=
    coalesce(v_profile.tax_id, '') || '|' ||
    v_invoice.invoice_number || '|' ||
    to_char(v_invoice.issue_date, 'DD-MM-YYYY') || '|' ||
    'anulacion' || '|' ||
    coalesce(v_last_hash, '');

  v_hash := encode(digest(v_hash_input, 'sha256'), 'hex');

  insert into public.fiscal_records (
    user_id, invoice_id, record_type, nif_emisor, nombre_emisor,
    numero_factura, fecha_expedicion, tipo_factura, importe_total_cents,
    hash_anterior, hash, hash_input, modalidad, estado_envio
  ) values (
    auth.uid(), p_invoice_id, 'anulacion', coalesce(v_profile.tax_id, ''),
    coalesce(v_profile.business_name, v_profile.full_name, ''),
    v_invoice.invoice_number, v_invoice.issue_date, 'F1', v_invoice.total_cents,
    v_last_hash, v_hash, v_hash_input, v_modalidad,
    case when v_modalidad = 'verifactu' then 'pendiente' else 'no_aplica' end
  )
  returning * into v_record;

  return v_record;
end;
$$;

grant execute on function public.generate_fiscal_cancellation(uuid) to authenticated;

-- Permite anular incluso con el trigger de bloqueo activo: al anular
-- queremos poder borrar la factura de verdad (el rastro fiscal ya queda a
-- salvo en fiscal_records, que es inmutable e independiente). Se relaja el
-- trigger para DELETE cuando ya existe un registro 'anulacion' para esa
-- factura.
create or replace function public.enforce_invoice_fiscal_lock()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_has_cancellation boolean;
begin
  if TG_OP = 'DELETE' then
    if OLD.fiscal_locked then
      select exists(
        select 1 from public.fiscal_records
        where invoice_id = OLD.id and record_type = 'anulacion'
      ) into v_has_cancellation;

      if not v_has_cancellation then
        raise exception 'No se puede eliminar una factura con registro fiscal Veri*Factu sin anularla antes.';
      end if;
    end if;
    return OLD;
  end if;

  if OLD.fiscal_locked then
    if NEW.items is distinct from OLD.items
      or NEW.subtotal_cents is distinct from OLD.subtotal_cents
      or NEW.tax_percent is distinct from OLD.tax_percent
      or NEW.total_cents is distinct from OLD.total_cents
      or NEW.irpf_percent is distinct from OLD.irpf_percent
      or NEW.issue_date is distinct from OLD.issue_date
      or NEW.client_id is distinct from OLD.client_id
      or NEW.invoice_number is distinct from OLD.invoice_number
    then
      raise exception 'No se puede modificar una factura con registro fiscal Veri*Factu generado. Usa una factura rectificativa.';
    end if;
  end if;

  return NEW;
end;
$$;

-- Verificación de la cadena de huellas — OBLIGATORIA en modalidad
-- No-Verifactu según la propia FAQ de la AEAT ("un sistema de emisión de
-- facturas no verificables también debe ofrecer la posibilidad de
-- comprobar las huellas de los registros generados"). Recalcula cada hash
-- y compara con el guardado; si algo no coincide, la cadena está rota
-- (manipulación o bug).
create or replace function public.verify_fiscal_chain(p_user_id uuid)
returns table (
  record_id uuid,
  numero_factura text,
  created_at timestamptz,
  is_valid boolean,
  expected_hash text,
  stored_hash text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user_id <> auth.uid() then
    raise exception 'No autorizado.';
  end if;

  return query
  select
    fr.id,
    fr.numero_factura,
    fr.created_at,
    (encode(digest(fr.hash_input, 'sha256'), 'hex') = fr.hash) as is_valid,
    encode(digest(fr.hash_input, 'sha256'), 'hex') as expected_hash,
    fr.hash as stored_hash
  from public.fiscal_records fr
  where fr.user_id = p_user_id
  order by fr.created_at asc;
end;
$$;

grant execute on function public.verify_fiscal_chain(uuid) to authenticated;;
