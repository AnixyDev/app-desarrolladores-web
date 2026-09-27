-- Resto de un ensayo de webhooks del 15/08 (una fila de prueba de Ana hacia
-- webhook.site). Nada la lee: ni el código, ni funciones, vistas, cron o
-- Edge Functions. Los webhooks de verdad viven en public.integrations.
-- La función set_updated_at la comparten otras tablas: no se toca.
drop table if exists public.webhook_configs;
