CREATE OR REPLACE FUNCTION public.check_and_increment_rate_limit(p_user_id uuid, p_action text, p_max_calls integer, p_window_seconds integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_window_start timestamptz;
  v_count integer;
BEGIN
  -- CAMBIO: el margen de limpieza era '1 hour', fijo para TODAS las
  -- acciones sin distinguir su ventana real. Eso borraba el bucket de
  -- 'ai_daily' (ventana de 86400s = 24h) pasada la primera hora del
  -- día, reiniciándolo a count=1 en la siguiente llamada -- el límite
  -- diario por plan (Free 15 / Pro 100 / Teams 400) nunca llegaba a
  -- aplicarse de verdad. Se sube a '2 days', margen seguro por encima
  -- de la ventana más larga usada hoy (24h), para que el bucket diario
  -- sobreviva su día completo antes de limpiarse.
  DELETE FROM public.rate_limit_buckets WHERE window_start < now() - interval '2 days';

  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  INSERT INTO public.rate_limit_buckets (user_id, action, window_start, count)
  VALUES (p_user_id, p_action, v_window_start, 1)
  ON CONFLICT (user_id, action, window_start)
  DO UPDATE SET count = rate_limit_buckets.count + 1
  RETURNING count INTO v_count;

  RETURN v_count <= p_max_calls;
END;
$function$;;
