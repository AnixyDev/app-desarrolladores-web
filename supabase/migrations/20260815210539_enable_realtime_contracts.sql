-- Habilita eventos de Realtime para la tabla contracts, necesario para que
-- el freelancer vea al instante cuando el cliente firma desde el portal
-- (sin esto, postgres_changes nunca emite nada aunque el código JS esté bien).
ALTER PUBLICATION supabase_realtime ADD TABLE public.contracts;
;
