-- Se sustituye el overload (uuid, integer) para que sus nombres de parámetro
-- coincidan EXACTAMENTE con la llamada real del frontend:
-- supabase.rpc('consume_credits_atomic', { user_id, amount_to_consume })
DROP FUNCTION IF EXISTS public.consume_credits_atomic(uuid, integer);

CREATE OR REPLACE FUNCTION public.consume_credits_atomic(user_id uuid, amount_to_consume integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No autorizado: user_id no coincide con el usuario autenticado';
  END IF;

  UPDATE public.profiles p
  SET ai_credits = p.ai_credits - amount_to_consume
  WHERE p.id = user_id
    AND p.ai_credits >= amount_to_consume;

  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_credits_atomic(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_credits_atomic(uuid, integer) TO authenticated;;
