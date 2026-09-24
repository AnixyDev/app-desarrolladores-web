-- ============================================================
-- FASE 1 de cumplimiento Veri*Factu (RD 1007/2023) — capa local
-- Basado en documentación pública secundaria sobre el algoritmo de huella
-- (NIF emisor + nº factura + serie + fecha expedición + tipo factura +
-- importe total + hash del registro anterior, SHA-256). Esto NO sustituye
-- el documento oficial "Algoritmo de cálculo de la huella" de la sede
-- electrónica de la AEAT — antes de operar en modalidad Veri*Factu real
-- (envío a la AEAT), hay que verificar el formato exacto de concatenación
-- contra ese documento oficial, idealmente con una gestoría.
-- ============================================================

create extension if not exists pgcrypto;

-- 1. Columnas nuevas en invoices: bloqueo fiscal + rectificativas
alter table public.invoices
  add column if not exists fiscal_locked boolean not null default false,
  add column if not exists rectifies_invoice_id uuid references public.invoices(id),
  add column if not exists is_rectified boolean not null default false;

-- 2. Ajustes de cumplimiento por usuario
alter table public.profiles
  add column if not exists veri_factu_enabled boolean not null default false,
  add column if not exists veri_factu_modality text not null default 'no_verifactu'
    check (veri_factu_modality in ('verifactu', 'no_verifactu'));

-- 3. Registro de facturación (registro de alta / anulación), inmutable
create table public.fiscal_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id),
  record_type text not null check (record_type in ('alta', 'anulacion')),
  nif_emisor text not null,
  nombre_emisor text not null,
  numero_factura text not null,
  fecha_expedicion date not null,
  tipo_factura text not null default 'F1',
  importe_total_cents integer not null,
  hash_anterior text,
  hash text not null,
  hash_input text not null,
  modalidad text not null check (modalidad in ('verifactu', 'no_verifactu')),
  estado_envio text not null default 'no_aplica'
    check (estado_envio in ('no_aplica', 'pendiente', 'enviado', 'aceptado', 'aceptado_con_errores', 'rechazado')),
  csv_respuesta_aeat text,
  created_at timestamptz not null default now()
);

alter table public.fiscal_records enable row level security;

create policy "fiscal_records_owner_select"
on public.fiscal_records for select
to authenticated
using ((select auth.uid()) = user_id);

-- Solo se insertan a través de generate_fiscal_record() (SECURITY DEFINER);
-- no hay política de UPDATE ni DELETE — este registro es intencionadamente
-- de solo lectura e inserción una vez creado, ni siquiera para su dueño.
create policy "fiscal_records_owner_insert"
on public.fiscal_records for insert
to authenticated
with check ((select auth.uid()) = user_id);

create index fiscal_records_user_created_idx on public.fiscal_records (user_id, created_at);
create index fiscal_records_invoice_idx on public.fiscal_records (invoice_id);

-- 4. Función que genera el registro de alta con huella encadenada.
-- SECURITY DEFINER: necesita leer el último hash de la cadena del usuario
-- sin depender de que el frontend se lo pase (evita manipulación).
create or replace function public.generate_fiscal_record(p_invoice_id uuid)
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

  select * into v_profile from public.profiles where id = auth.uid();

  -- Último hash de la cadena de ESTE usuario (cada emisor tiene su propia cadena)
  select hash into v_last_hash
  from public.fiscal_records
  where user_id = auth.uid()
  order by created_at desc
  limit 1;

  v_modalidad := coalesce(v_profile.veri_factu_modality, 'no_verifactu');

  -- Concatenación de campos (mejor esfuerzo según documentación pública;
  -- verificar formato exacto contra el documento oficial de la AEAT).
  v_hash_input :=
    coalesce(v_profile.tax_id, '') || '|' ||
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
    auth.uid(), p_invoice_id, 'alta', coalesce(v_profile.tax_id, ''),
    coalesce(v_profile.business_name, v_profile.full_name, ''),
    v_invoice.invoice_number, v_invoice.issue_date, 'F1', v_invoice.total_cents,
    v_last_hash, v_hash, v_hash_input, v_modalidad,
    case when v_modalidad = 'verifactu' then 'pendiente' else 'no_aplica' end
  )
  returning * into v_record;

  update public.invoices set fiscal_locked = true where id = p_invoice_id;

  return v_record;
end;
$$;

grant execute on function public.generate_fiscal_record(uuid) to authenticated;

-- 5. Inmutabilidad: una vez con registro fiscal, no se pueden tocar los
-- datos fiscales de la factura (solo el estado de cobro) ni se puede borrar.
create or replace function public.enforce_invoice_fiscal_lock()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if TG_OP = 'DELETE' then
    if OLD.fiscal_locked then
      raise exception 'No se puede eliminar una factura con registro fiscal Veri*Factu generado. Usa una factura rectificativa.';
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

drop trigger if exists trg_invoice_fiscal_lock on public.invoices;
create trigger trg_invoice_fiscal_lock
before update or delete on public.invoices
for each row execute function public.enforce_invoice_fiscal_lock();;
