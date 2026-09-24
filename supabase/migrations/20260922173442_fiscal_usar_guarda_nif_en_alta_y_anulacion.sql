-- Se conserva el cuerpo original de ambas funciones. Unico cambio: el NIF se
-- obtiene con exigir_nif_emisor(), que aborta si esta vacio, en vez de
-- coalesce(tax_id,'') que lo colaba en blanco.

create or replace function public.generate_fiscal_record(p_invoice_id uuid)
returns fiscal_records
language plpgsql
security definer
set search_path to 'public','extensions','pg_temp'
as $function$
declare
  v_invoice public.invoices%rowtype;
  v_profile public.profiles%rowtype;
  v_nif text;
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

  select * into v_profile from public.profiles where id = auth.uid();

  -- CAMBIO: NIF obligatorio. Aborta antes de sellar nada.
  v_nif := public.exigir_nif_emisor(auth.uid());

  select hash into v_last_hash
  from public.fiscal_records
  where user_id = auth.uid()
  order by created_at desc
  limit 1;

  v_modalidad := coalesce(v_profile.veri_factu_modality, 'no_verifactu');

  v_hash_input :=
    v_nif || '|' ||
    v_invoice.invoice_number || '|' ||
    to_char(v_invoice.issue_date, 'DD-MM-YYYY') || '|' ||
    'F1' || '|' ||
    to_char(v_invoice.total_cents / 100.0, 'FM999999990.00') || '|' ||
    coalesce(v_last_hash, '');

  v_hash := encode(digest(v_hash_input, 'sha256'), 'hex');

  insert into public.fiscal_records (
    user_id, invoice_id, record_type, nif_emisor, nombre_emisor,
    numero_factura, fecha_expedicion, tipo_factura, importe_total_cents,
    hash_anterior, hash, hash_input, modalidad, estado_envio
  ) values (
    auth.uid(), p_invoice_id, 'alta', v_nif,
    coalesce(v_profile.business_name, v_profile.full_name, ''),
    v_invoice.invoice_number, v_invoice.issue_date, 'F1', v_invoice.total_cents,
    v_last_hash, v_hash, v_hash_input, v_modalidad,
    case when v_modalidad = 'verifactu' then 'pendiente' else 'no_aplica' end
  )
  returning * into v_record;

  update public.invoices set fiscal_locked = true where id = p_invoice_id;

  return v_record;
end;
$function$;

create or replace function public.generate_fiscal_cancellation(p_invoice_id uuid)
returns fiscal_records
language plpgsql
security definer
set search_path to 'public','extensions','pg_temp'
as $function$
declare
  v_invoice public.invoices%rowtype;
  v_profile public.profiles%rowtype;
  v_nif text;
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

  -- CAMBIO: NIF obligatorio, igual que en el alta.
  v_nif := public.exigir_nif_emisor(auth.uid());

  select hash into v_last_hash
  from public.fiscal_records
  where user_id = auth.uid()
  order by created_at desc
  limit 1;

  v_modalidad := coalesce(v_profile.veri_factu_modality, 'no_verifactu');

  v_hash_input :=
    v_nif || '|' ||
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
    auth.uid(), p_invoice_id, 'anulacion', v_nif,
    coalesce(v_profile.business_name, v_profile.full_name, ''),
    v_invoice.invoice_number, v_invoice.issue_date, 'F1', v_invoice.total_cents,
    v_last_hash, v_hash, v_hash_input, v_modalidad,
    case when v_modalidad = 'verifactu' then 'pendiente' else 'no_aplica' end
  )
  returning * into v_record;

  return v_record;
end;
$function$;;
