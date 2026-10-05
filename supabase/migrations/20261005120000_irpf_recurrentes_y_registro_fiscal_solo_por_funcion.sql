-- 05/10/2026
-- 1. Facturas recurrentes con IRPF: la plantilla guarda su retención y
--    process-recurring-invoices la aplica (total = base + IVA − IRPF).
-- 2. Registro fiscal: solo se escribe a través de las funciones que calculan la
--    huella. Antes el dueño podía insertar filas directamente en fiscal_records,
--    saltándose el cálculo y debilitando la cadena.
-- 3. registrar_factura_fiscal(): la misma huella para las facturas que emite el
--    servidor (recurrentes), que no tienen auth.uid(). Solo service_role.

-- 1 ───────────────────────────────────────────────────────────────────────
alter table public.recurring_invoices
  add column if not exists irpf_percent numeric(5,2) not null default 0;

alter table public.recurring_invoices drop constraint if exists recurring_invoices_irpf_percent_rango;
alter table public.recurring_invoices add constraint recurring_invoices_irpf_percent_rango
  check (irpf_percent >= 0 and irpf_percent <= 100);

comment on column public.recurring_invoices.irpf_percent is
  'Retención de IRPF que se aplica a cada factura emitida por esta recurrente.';

-- 3 ───────────────────────────────────────────────────────────────────────
-- Misma huella que generate_fiscal_record hasta hoy
-- (NIF|número|DD-MM-AAAA|tipo|importe|huella anterior), parametrizada por
-- usuario. Además:
--  - bloqueo por usuario mientras se calcula, para que dos facturas a la vez no
--    encadenen las dos con la misma huella anterior;
--  - una factura solo recibe un registro de alta.
create or replace function public.registrar_factura_fiscal(p_invoice_id uuid, p_user uuid)
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
  if p_user is null then
    raise exception 'Falta el usuario para el registro fiscal.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('registro_fiscal:' || p_user::text, 0));

  select * into v_invoice from public.invoices where id = p_invoice_id and user_id = p_user;
  if not found then
    raise exception 'Factura no encontrada o no pertenece al usuario actual.';
  end if;

  if exists (select 1 from public.fiscal_records where invoice_id = p_invoice_id and record_type = 'alta') then
    raise exception 'Esta factura ya tiene su registro fiscal.';
  end if;

  select * into v_profile from public.profiles where id = p_user;

  v_nif := public.exigir_nif_emisor(p_user);

  select hash into v_last_hash
  from public.fiscal_records
  where user_id = p_user
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
    p_user, p_invoice_id, 'alta', v_nif,
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

revoke all on function public.registrar_factura_fiscal(uuid, uuid) from public, anon, authenticated;
grant execute on function public.registrar_factura_fiscal(uuid, uuid) to service_role;

-- La que llama la app con sesión: la misma, con el usuario de la sesión.
create or replace function public.generate_fiscal_record(p_invoice_id uuid)
returns public.fiscal_records
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Hace falta iniciar sesión para registrar una factura.';
  end if;
  return public.registrar_factura_fiscal(p_invoice_id, auth.uid());
end;
$function$;

revoke all on function public.generate_fiscal_record(uuid) from public, anon;
grant execute on function public.generate_fiscal_record(uuid) to authenticated, service_role;

-- 2 ───────────────────────────────────────────────────────────────────────
drop policy if exists fiscal_records_owner_insert on public.fiscal_records;
revoke insert, update, delete on public.fiscal_records from anon, authenticated;
