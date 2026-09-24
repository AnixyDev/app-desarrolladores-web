-- 1) BUG LATENTE: las tres funciones fiscales llaman a digest() (pgcrypto),
--    que vive en el esquema "extensions", pero fijaban search_path solo a
--    'public','pg_temp'. Resultado: "function digest(text, unknown) does not
--    exist" en cuanto se usen. Nadie lo detecto porque la funcionalidad
--    Veri*Factu no se ha estrenado (0 registros fiscales, 0 facturas
--    bloqueadas, 0 perfiles con modalidad verifactu).
--    ALTER FUNCTION ... SET search_path no toca el cuerpo: solo el entorno.
alter function public.generate_fiscal_record(uuid)       set search_path to 'public','extensions','pg_temp';
alter function public.generate_fiscal_cancellation(uuid) set search_path to 'public','extensions','pg_temp';
alter function public.verify_fiscal_chain(uuid)          set search_path to 'public','extensions','pg_temp';

-- 2) AGUJERO: verify_fiscal_chain comprobaba "if p_user_id <> auth.uid()".
--    Sin sesion auth.uid() es NULL, y "algo <> NULL" da NULL, no TRUE:
--    el IF no entra, no se lanza la excepcion y la funcion sigue adelante
--    consultando la cadena fiscal del user_id que le pasen. Comprobado:
--    llamandola como rol anon, la ejecucion llegaba hasta el RETURN QUERY.
--    "is distinct from" si trata NULL como valor, y ademas se exige sesion.
create or replace function public.verify_fiscal_chain(p_user_id uuid)
returns table(record_id uuid, numero_factura text, created_at timestamptz,
              is_valid boolean, expected_hash text, stored_hash text)
language plpgsql
security definer
set search_path to 'public','extensions','pg_temp'
as $function$
begin
  if auth.uid() is null then
    raise exception 'No autorizado: hace falta sesion.' using errcode = '42501';
  end if;

  if p_user_id is distinct from auth.uid() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  return query
  select
    fr.id,
    fr.numero_factura,
    fr.created_at,
    (encode(digest(fr.hash_input, 'sha256'), 'hex') = fr.hash) as is_valid,
    encode(digest(fr.hash_input, 'sha256'), 'hex') as expected_hash,
    fr.hash as stored_hash
  from public.fiscal_records fr
  where fr.user_id = p_user_id
  order by fr.created_at asc;
end;
$function$;

-- 3) enforce_invoice_fiscal_lock() es una funcion de DISPARADOR (returns
--    trigger), pero estaba publicada como RPC en /rest/v1/rpc/. No es
--    explotable (Postgres rechaza llamar un trigger a mano), pero no pinta
--    nada en la superficie publica de la API. Revocar EXECUTE no afecta al
--    disparador: los triggers se ejecutan al margen de esos permisos.
revoke execute on function public.enforce_invoice_fiscal_lock() from anon, authenticated, public;

-- 4) Las funciones fiscales no tienen ningun sentido sin sesion iniciada.
revoke execute on function public.generate_fiscal_record(uuid)       from anon;
revoke execute on function public.generate_fiscal_cancellation(uuid) from anon;
revoke execute on function public.verify_fiscal_chain(uuid)          from anon;;
