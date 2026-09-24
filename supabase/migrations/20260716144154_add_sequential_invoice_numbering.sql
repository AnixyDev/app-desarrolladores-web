-- FIX: invoice_number se generaba con Date.now().toString().slice(-6), sin
-- ninguna restricción de unicidad. Riesgo real de colisión (sobre todo en
-- process-recurring-invoices, que genera varias facturas en un bucle
-- ajustado) y, más importante: la numeración correlativa de facturas es
-- un requisito legal en España (AEAT) que este esquema no garantizaba.
--
-- generate_invoice_number(): calcula el siguiente número correlativo por
-- usuario y año (INV-2026-0001, INV-2026-0002...), a partir del máximo ya
-- usado ese año. Se usa tanto en la creación manual como en las facturas
-- recurrentes automáticas.
create or replace function public.generate_invoice_number(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_year text := to_char(now(), 'YYYY');
  v_next int;
begin
  select coalesce(max(
    case when invoice_number ~ ('^INV-' || v_year || '-[0-9]+$')
      then substring(invoice_number from '[0-9]+$')::int
      else 0
    end
  ), 0) + 1
  into v_next
  from public.invoices
  where user_id = p_user_id;

  return 'INV-' || v_year || '-' || lpad(v_next::text, 4, '0');
end;
$$;

grant execute on function public.generate_invoice_number(uuid) to authenticated, service_role;

-- Red de seguridad: si a pesar de todo dos inserts coinciden (condición de
-- carrera improbable pero no imposible), que la base de datos lo rechace
-- en vez de guardar dos facturas con el mismo número para el mismo usuario.
alter table public.invoices
  add constraint invoices_user_invoice_number_unique unique (user_id, invoice_number);;
