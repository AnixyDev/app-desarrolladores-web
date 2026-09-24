-- Fix: el frontend llama a rpc "consume_credits_atomic" que nunca existió en la BD
-- (las funciones reales eran consume_ai_credits y consume_ai_credits_rpc, con nombres distintos).
-- Se crean dos overloads para cubrir ambas firmas posibles usadas desde el cliente,
-- ambas 100% atómicas (UPDATE ... WHERE credits >= cost en una sola sentencia,
-- sin SELECT previo) y sin la vulnerabilidad de suplantación de p_user_id.

-- Overload 1: firma (p_user_id uuid, p_cost integer)
CREATE OR REPLACE FUNCTION public.consume_credits_atomic(p_user_id uuid, p_cost integer)
RETURNS TABLE(id uuid, ai_credits integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Blindaje: un usuario autenticado solo puede consumir SUS PROPIOS créditos
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No autorizado: p_user_id no coincide con el usuario autenticado';
  END IF;

  RETURN QUERY
  UPDATE public.profiles p
  SET ai_credits = p.ai_credits - p_cost
  WHERE p.id = p_user_id
    AND p.ai_credits >= p_cost
  RETURNING p.id, p.ai_credits;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Créditos insuficientes' USING ERRCODE = 'P0001';
  END IF;
END;
$function$;

-- Overload 2: firma (p_amount integer), usa auth.uid() internamente
CREATE OR REPLACE FUNCTION public.consume_credits_atomic(p_amount integer)
RETURNS TABLE(id uuid, ai_credits integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  UPDATE public.profiles p
  SET ai_credits = p.ai_credits - p_amount
  WHERE p.id = auth.uid()
    AND p.ai_credits >= p_amount
  RETURNING p.id, p.ai_credits;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Créditos insuficientes' USING ERRCODE = 'P0001';
  END IF;
END;
$function$;

-- Permisos: solo usuarios autenticados pueden ejecutar, nunca anon
REVOKE ALL ON FUNCTION public.consume_credits_atomic(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_credits_atomic(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_credits_atomic(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_credits_atomic(integer) TO authenticated;
;
