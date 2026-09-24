-- exigir_nif_emisor era SECURITY DEFINER y no comprobaba la propiedad:
-- cualquier usuario con sesion podia leer el NIF de otro llamando a
-- /rest/v1/rpc/exigir_nif_emisor con el UUID ajeno. Se anade la misma guarda
-- que ya tenian generate_invoice_number y generate_receipt_number, y ademas
-- se retira de la API publica: solo la usan generate_fiscal_record y
-- generate_fiscal_cancellation, que al ser SECURITY DEFINER la siguen
-- pudiendo llamar (la comprobacion de permiso se hace como el propietario).

create or replace function public.exigir_nif_emisor(p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_nif text;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and p_user_id is distinct from auth.uid() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  select nullif(btrim(tax_id), '') into v_nif
  from public.profiles where id = p_user_id;

  if v_nif is null then
    raise exception 'Falta el NIF del emisor. Rellenalo en Configuracion > Perfil antes de emitir facturas con cumplimiento fiscal: es obligatorio en el registro y forma parte de la huella, asi que no se puede anadir despues.'
      using errcode = 'P0001';
  end if;

  return v_nif;
end;
$function$;

revoke execute on function public.exigir_nif_emisor(uuid) from public, anon, authenticated;;
