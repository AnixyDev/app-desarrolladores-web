-- Rate limiting para las acciones de IA de /api/actions (Análisis, Email IA,
-- Recordatorio, Briefing, Mockup) — conecta con el punto AI1 de la auditoría
-- original: evitar costes inesperados por abuso o bucles descontrolados.

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  user_id uuid NOT NULL,
  action text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, action, window_start)
);

-- Sin RLS de usuario final: solo se usa vía la función SECURITY DEFINER
-- de abajo, llamada desde el backend con el usuario ya autenticado.
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

-- Limpieza automática: sin esto, la tabla crecería indefinidamente.
-- Se borra cualquier bucket de más de 1 hora en cada llamada (barato,
-- ya que solo pasan unos pocos registros por usuario/minuto).
CREATE OR REPLACE FUNCTION public.check_and_increment_rate_limit(
  p_user_id uuid,
  p_action text,
  p_max_calls integer,
  p_window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_window_start timestamptz;
  v_count integer;
BEGIN
  DELETE FROM public.rate_limit_buckets WHERE window_start < now() - interval '1 hour';

  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  INSERT INTO public.rate_limit_buckets (user_id, action, window_start, count)
  VALUES (p_user_id, p_action, v_window_start, 1)
  ON CONFLICT (user_id, action, window_start)
  DO UPDATE SET count = rate_limit_buckets.count + 1
  RETURNING count INTO v_count;

  RETURN v_count <= p_max_calls;
END;
$$;
;
