-- Cierra una fuga de informacion: generate_invoice_number y generate_receipt_number
-- son SECURITY DEFINER (leen saltandose RLS), aceptaban cualquier p_user_id y no
-- comprobaban quien llamaba. Estaban expuestas en la API REST, asi que el rol anon
-- podia obtener el volumen de facturacion anual de cualquier usuario cuyo id conociera.
--
-- La guarda permite tres casos y bloquea el cuarto:
--   * rol de servicio  -> permitido (la Edge Function process-recurring-invoices
--                         genera numeros para otros usuarios con SUPABASE_SERVICE_ROLE_KEY,
--                         y ahi auth.uid() es NULL)
--   * usuario pidiendo lo suyo   -> permitido
--   * usuario pidiendo de otro   -> bloqueado
--   * anon                       -> bloqueado
--
-- El cuerpo de ambas funciones queda igual; solo se antepone la comprobacion.

create or replace function public.generate_invoice_number(p_user_id uuid)
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
$function$;

create or replace function public.generate_receipt_number(p_user_id uuid)
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

  select coalesce(max(
    case when receipt_number ~ ('^REC-' || v_year || '-[0-9]+$')
      then substring(receipt_number from '[0-9]+$')::int
      else 0
    end
  ), 0) + 1
  into v_next
  from public.receipts
  where user_id = p_user_id;

  return 'REC-' || v_year || '-' || lpad(v_next::text, 4, '0');
end;
$function$;;
