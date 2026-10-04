-- El motivo de una factura sin IVA sigue al cliente mientras la factura no
-- tenga registro fiscal. Antes, si se cambiaba el tipo fiscal del cliente
-- después de crear la factura (p. ej. de «fuera de la UE» a «empresa de la
-- UE»), el borrador conservaba la mención antigua.
--   · Factura sin registro fiscal con IVA 0 %: el motivo se recalcula siempre
--     desde el cliente (null si el cliente es nacional).
--   · Al cambiar el tipo fiscal o el NIF-IVA de un cliente, se recalculan sus
--     borradores al 0 %.
--   · Las facturas con registro fiscal no cambian nunca.

create or replace function public.invoices_validar_motivo_sin_iva()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tipo text;
begin
  if tg_op = 'UPDATE' and old.fiscal_locked then
    return new;  -- el disparador de bloqueo fiscal decide
  end if;

  if new.tax_percent = 0 then
    select tipo_fiscal into v_tipo from public.clients where id = new.client_id;
    new.motivo_sin_iva := case v_tipo
      when 'empresa_ue' then 'inversion_sujeto_pasivo_ue'
      when 'fuera_ue'   then 'no_sujeta_fuera_ue'
    end;
  elsif tg_op = 'UPDATE' and old.tax_percent = 0
        and new.motivo_sin_iva is not distinct from old.motivo_sin_iva then
    new.motivo_sin_iva := null;
  end if;

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

create or replace function public.clients_recalcular_motivo_sin_iva()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  update public.invoices
     set tax_percent = tax_percent
   where client_id = new.id
     and tax_percent = 0
     and not coalesce(fiscal_locked, false);
  return new;
end;
$$;

drop trigger if exists clients_recalcular_motivo_sin_iva on public.clients;
create trigger clients_recalcular_motivo_sin_iva
  after update of tipo_fiscal, nif_iva on public.clients
  for each row
  when (old.tipo_fiscal is distinct from new.tipo_fiscal or old.nif_iva is distinct from new.nif_iva)
  execute function public.clients_recalcular_motivo_sin_iva();

-- Pone al día los borradores que ya existan.
update public.invoices
   set tax_percent = tax_percent
 where tax_percent = 0
   and not coalesce(fiscal_locked, false)
   and (motivo_sin_iva is not null
        or client_id in (select id from public.clients where tipo_fiscal <> 'nacional'));
