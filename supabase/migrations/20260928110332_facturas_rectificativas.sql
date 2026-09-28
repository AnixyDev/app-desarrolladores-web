-- Facturas rectificativas.
--
-- Una factura con registro fiscal (fiscal_locked) no se puede modificar: la
-- ley obliga a corregirla con una factura rectificativa. Hasta hoy la app no
-- tenía forma de hacerla (las columnas rectifies_invoice_id e is_rectified
-- existían desde julio, sin usar).
--
-- Se hace "por diferencias": la rectificativa lleva las líneas de la original
-- en negativo ("Anula: …") y las líneas correctas en positivo, así que su
-- total es exactamente la diferencia. Sumando facturas (informes, IVA,
-- previsiones) todo cuadra sin tocar nada más. Sin líneas nuevas, anula la
-- factura entera (abono total).
--
-- Numeración propia R-AAAA-NNNN (serie distinta, como exige el reglamento de
-- facturación), y en el registro fiscal tipo R1 en vez de F1.

alter table public.invoices add column if not exists motivo_rectificacion text;

-- Numeración: misma función, con serie opcional. Se borra y se crea porque
-- cambia la firma; las llamadas de siempre (solo p_user_id) siguen igual.
drop function if exists public.generate_invoice_number(uuid);

create function public.generate_invoice_number(p_user_id uuid, p_serie text default 'INV')
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_year text := to_char(now(), 'YYYY');
  v_next int;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and p_user_id is distinct from auth.uid() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_serie not in ('INV', 'R') then
    raise exception 'Serie de facturación no válida' using errcode = '22023';
  end if;

  select coalesce(max(
    case when invoice_number ~ ('^' || p_serie || '-' || v_year || '-[0-9]+$')
      then substring(invoice_number from '[0-9]+$')::int
      else 0
    end
  ), 0) + 1
  into v_next
  from public.invoices
  where user_id = p_user_id;

  return p_serie || '-' || v_year || '-' || lpad(v_next::text, 4, '0');
end;
$function$;

revoke all on function public.generate_invoice_number(uuid, text) from public, anon;
grant execute on function public.generate_invoice_number(uuid, text) to authenticated, service_role;

-- La rectificativa. SECURITY INVOKER: corre con los permisos de quien la
-- pide, así que las políticas RLS y los disparadores de siempre aplican.
create function public.crear_factura_rectificativa(
  p_factura uuid,
  p_items jsonb,
  p_motivo text
)
returns public.invoices
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_original public.invoices%rowtype;
  v_item jsonb;
  v_items jsonb := '[]'::jsonb;
  v_sub_nuevo bigint := 0;
  v_total_nuevo bigint;
  v_numero text;
  v_nueva public.invoices%rowtype;
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if auth.uid() is null then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if v_motivo = '' then
    raise exception 'Indica el motivo de la rectificación.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Líneas no válidas' using errcode = '22023';
  end if;

  select * into v_original
    from public.invoices
   where id = p_factura and user_id = auth.uid()
   for update;
  if not found then
    raise exception 'Esa factura no existe o no es tuya.' using errcode = 'P0002';
  end if;
  if not v_original.fiscal_locked then
    raise exception 'Esta factura aún no tiene registro fiscal: edítala directamente.' using errcode = '22023';
  end if;
  if v_original.is_rectified then
    raise exception 'Esta factura ya está rectificada. Rectifica la rectificativa si hace falta.' using errcode = '22023';
  end if;

  -- Líneas de la original, en negativo.
  for v_item in select * from jsonb_array_elements(v_original.items) loop
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'description', 'Anula: ' || coalesce(v_item->>'description', ''),
      'quantity', (v_item->>'quantity')::numeric,
      'price_cents', -((v_item->>'price_cents')::bigint)
    ));
  end loop;

  -- Líneas correctas.
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if btrim(coalesce(v_item->>'description', '')) = ''
       or (v_item->>'quantity') is null or (v_item->>'quantity')::numeric <= 0
       or (v_item->>'price_cents') is null or (v_item->>'price_cents')::numeric < 0
       or (v_item->>'price_cents')::numeric <> trunc((v_item->>'price_cents')::numeric)
    then
      raise exception 'Cada línea necesita descripción, cantidad mayor que 0 y precio.' using errcode = '22023';
    end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'description', btrim(v_item->>'description'),
      'quantity', (v_item->>'quantity')::numeric,
      'price_cents', (v_item->>'price_cents')::bigint
    ));
    v_sub_nuevo := v_sub_nuevo + round((v_item->>'quantity')::numeric * (v_item->>'price_cents')::bigint);
  end loop;

  -- Mismo cálculo que al crear una factura (financeSlice.addInvoice).
  v_total_nuevo := round(
    v_sub_nuevo
    + v_sub_nuevo * coalesce(v_original.tax_percent, 0) / 100.0
    - v_sub_nuevo * coalesce(v_original.irpf_percent, 0) / 100.0
  );

  if v_sub_nuevo = v_original.subtotal_cents and v_total_nuevo = v_original.total_cents
     and coalesce(p_items, '[]'::jsonb) = v_original.items then
    raise exception 'La rectificativa no cambia nada respecto a la factura original.' using errcode = '22023';
  end if;

  v_numero := public.generate_invoice_number(auth.uid(), 'R');

  insert into public.invoices (
    user_id, invoice_number, client_id, project_id, issue_date, due_date,
    items, subtotal_cents, tax_percent, irpf_percent, total_cents, paid,
    notes, budget_id, contract_id, rectifies_invoice_id, motivo_rectificacion
  ) values (
    auth.uid(), v_numero, v_original.client_id, v_original.project_id,
    current_date, greatest(current_date, v_original.due_date),
    v_items, v_sub_nuevo - v_original.subtotal_cents,
    v_original.tax_percent, v_original.irpf_percent,
    v_total_nuevo - v_original.total_cents, false,
    v_original.notes, v_original.budget_id, v_original.contract_id,
    v_original.id, left(v_motivo, 500)
  )
  returning * into v_nueva;

  update public.invoices set is_rectified = true where id = v_original.id;

  return v_nueva;
end;
$function$;

revoke all on function public.crear_factura_rectificativa(uuid, jsonb, text) from public, anon;
grant execute on function public.crear_factura_rectificativa(uuid, jsonb, text) to authenticated;

-- Registro fiscal: tipo R1 para las rectificativas (antes siempre F1).
create or replace function public.generate_fiscal_record(p_invoice_id uuid)
returns public.fiscal_records
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
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
  v_tipo text;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id and user_id = auth.uid();
  if not found then
    raise exception 'Factura no encontrada o no pertenece al usuario actual.';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();

  -- NIF obligatorio. Aborta antes de sellar nada.
  v_nif := public.exigir_nif_emisor(auth.uid());

  select hash into v_last_hash
  from public.fiscal_records
  where user_id = auth.uid()
  order by created_at desc
  limit 1;

  v_modalidad := coalesce(v_profile.veri_factu_modality, 'no_verifactu');
  v_tipo := case when v_invoice.rectifies_invoice_id is not null then 'R1' else 'F1' end;

  v_hash_input :=
    v_nif || '|' ||
    v_invoice.invoice_number || '|' ||
    to_char(v_invoice.issue_date, 'DD-MM-YYYY') || '|' ||
    v_tipo || '|' ||
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
    v_invoice.invoice_number, v_invoice.issue_date, v_tipo, v_invoice.total_cents,
    v_last_hash, v_hash, v_hash_input, v_modalidad,
    case when v_modalidad = 'verifactu' then 'pendiente' else 'no_aplica' end
  )
  returning * into v_record;

  update public.invoices set fiscal_locked = true where id = p_invoice_id;

  return v_record;
end;
$function$;

-- Si se borra (anula) una rectificativa, la original vuelve a poder
-- rectificarse.
create or replace function public.invoices_liberar_original()
returns trigger
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $function$
begin
  if old.rectifies_invoice_id is not null
     and not exists (select 1 from public.invoices where rectifies_invoice_id = old.rectifies_invoice_id and id <> old.id)
  then
    update public.invoices set is_rectified = false where id = old.rectifies_invoice_id;
  end if;
  return old;
end;
$function$;

drop trigger if exists invoices_liberar_original on public.invoices;
create trigger invoices_liberar_original
  after delete on public.invoices
  for each row execute function public.invoices_liberar_original();

-- Borrar una factura conciliada con un movimiento del banco fallaba por la
-- clave foránea. El movimiento se queda sin conciliar.
alter table public.bank_transactions drop constraint if exists bank_transactions_matched_invoice_id_fkey;
alter table public.bank_transactions
  add constraint bank_transactions_matched_invoice_id_fkey
  foreign key (matched_invoice_id) references public.invoices(id) on delete set null;
