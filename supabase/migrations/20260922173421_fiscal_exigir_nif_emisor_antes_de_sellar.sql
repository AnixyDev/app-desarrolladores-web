-- El NIF del emisor es obligatorio en el registro Veri*Factu (RD 1007/2023) y
-- ademas entra en el hash, asi que no se puede corregir despues: cambiarlo
-- produce otra huella. Hasta ahora coalesce(tax_id,'') lo dejaba pasar vacio y
-- sellaba la factura igualmente (fiscal_locked = true), dejando un registro
-- invalido e inmutable. Comprobado en produccion: INV-2026-0001 se genero con
-- hash_input "|INV-2026-0001|22-09-2026|F1|1452.00|" — el hueco del NIF vacio.
-- Ahora se rechaza antes de tocar nada.

create or replace function public.exigir_nif_emisor(p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_nif text;
begin
  select nullif(btrim(tax_id), '') into v_nif
  from public.profiles where id = p_user_id;

  if v_nif is null then
    raise exception 'Falta el NIF del emisor. Rellenalo en Configuracion > Perfil antes de emitir facturas con cumplimiento fiscal: es obligatorio en el registro y forma parte de la huella, asi que no se puede anadir despues.'
      using errcode = 'P0001';
  end if;

  return v_nif;
end;
$function$;

revoke execute on function public.exigir_nif_emisor(uuid) from public, anon;
grant execute on function public.exigir_nif_emisor(uuid) to authenticated, service_role;;
