-- El motivo de una factura sin IVA se deduce del cliente en la base de datos,
-- así lo reciben también las facturas recurrentes, las de horas y las
-- rectificativas, sin tocar cada flujo.
--   · IVA 0 % y cliente empresa_ue -> inversion_sujeto_pasivo_ue (exige NIF-IVA)
--   · IVA 0 % y cliente fuera_ue   -> no_sujeta_fuera_ue
--   · Un borrador que pasa de 0 % a otro IVA pierde el motivo deducido.

create or replace function public.invoices_validar_motivo_sin_iva()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tipo text;
begin
  if tg_op = 'UPDATE'
     and new.tax_percent <> 0 and old.tax_percent = 0
     and new.motivo_sin_iva is not distinct from old.motivo_sin_iva then
    new.motivo_sin_iva := null;
  end if;

  if new.motivo_sin_iva is null and new.tax_percent = 0 then
    select tipo_fiscal into v_tipo from public.clients where id = new.client_id;
    new.motivo_sin_iva := case v_tipo
      when 'empresa_ue' then 'inversion_sujeto_pasivo_ue'
      when 'fuera_ue'   then 'no_sujeta_fuera_ue'
    end;
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

drop trigger if exists c_invoices_motivo_sin_iva on public.invoices;
create trigger c_invoices_motivo_sin_iva
  before insert or update of motivo_sin_iva, client_id, tax_percent on public.invoices
  for each row execute function public.invoices_validar_motivo_sin_iva();
