COMMENT ON TABLE public.rate_limit_buckets IS 'Solo accesible via service_role (backend). RLS habilitado sin policies para authenticated/anon es intencional -- ver policy explicita de denegacion.';
CREATE POLICY "Sin acceso de cliente -- solo service_role"
  ON public.rate_limit_buckets
  FOR ALL
  TO anon, authenticated
  USING (false);

COMMENT ON TABLE public.processed_resend_events IS 'Solo accesible via service_role (webhook de Resend). RLS habilitado sin policies para authenticated/anon es intencional -- ver policy explicita de denegacion.';
CREATE POLICY "Sin acceso de cliente -- solo service_role"
  ON public.processed_resend_events
  FOR ALL
  TO anon, authenticated
  USING (false);;
