-- Facturas sin IVA a clientes extranjeros.
-- El tipo fiscal del cliente decide si la factura lleva IVA español; la factura
-- guarda el motivo, que el PDF imprime como mención obligatoria
-- (RD 1619/2012, art. 6.1.j y 6.1.m).

alter table public.clients
  add column if not exists tipo_fiscal text not null default 'nacional',
  add column if not exists nif_iva text;

alter table public.clients
  add constraint clients_tipo_fiscal_valido
    check (tipo_fiscal in ('nacional', 'empresa_ue', 'fuera_ue')),
  add constraint clients_nif_iva_formato
    check (nif_iva is null or nif_iva ~ '^[A-Z]{2}[A-Z0-9+*]{2,13}$');

comment on column public.clients.tipo_fiscal is
  'nacional | empresa_ue (inversión del sujeto pasivo, modelo 349) | fuera_ue (no sujeta, art. 69 LIVA)';
comment on column public.clients.nif_iva is
  'NIF-IVA europeo del cliente (prefijo de país + número). Obligatorio para empresa_ue.';

alter table public.invoices
  add column if not exists motivo_sin_iva text;

alter table public.invoices
  add constraint invoices_motivo_sin_iva_valido
    check (motivo_sin_iva in ('inversion_sujeto_pasivo_ue', 'no_sujeta_fuera_ue')),
  add constraint invoices_motivo_sin_iva_iva_cero
    check (motivo_sin_iva is null or tax_percent = 0);

comment on column public.invoices.motivo_sin_iva is
  'Por qué la factura no lleva IVA español; el PDF imprime la mención legal correspondiente.';

-- Una factura a empresa de la UE exige que el cliente tenga NIF-IVA.
-- Sin SECURITY DEFINER: lee el cliente con los permisos de quien factura.
create or replace function public.invoices_validar_motivo_sin_iva()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.motivo_sin_iva = 'inversion_sujeto_pasivo_ue' then
    if not exists (
      select 1 from public.clients
      where id = new.client_id and nif_iva is not null
    ) then
      raise exception 'Para facturar sin IVA a una empresa de la UE, el cliente necesita su NIF-IVA.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists c_invoices_motivo_sin_iva on public.invoices;
create trigger c_invoices_motivo_sin_iva
  before insert or update of motivo_sin_iva, client_id on public.invoices
  for each row execute function public.invoices_validar_motivo_sin_iva();

-- El motivo forma parte de la factura emitida: no se puede cambiar después.
create or replace function public.enforce_invoice_fiscal_lock()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_has_cancellation boolean;
begin
  if TG_OP = 'DELETE' then
    if OLD.fiscal_locked then
      if current_setting('app.eliminar_cuenta', true) = OLD.user_id::text then
        return OLD;  -- baja de la cuenta: la factura ya está en el archivo fiscal
      end if;

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
      or NEW.motivo_sin_iva is distinct from OLD.motivo_sin_iva
    then
      raise exception 'No se puede modificar una factura con registro fiscal Veri*Factu generado. Usa una factura rectificativa.';
    end if;
  end if;

  return NEW;
end;
$function$;
