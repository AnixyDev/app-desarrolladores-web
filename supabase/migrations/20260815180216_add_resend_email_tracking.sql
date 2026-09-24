-- Tracking de aperturas/clics de email vía Resend (Punto 2)

-- 1. Interactions: registrar el message_id de Resend en cada envío para poder
--    correlacionar los eventos del webhook (opened/clicked/bounced) con el lead correcto.
ALTER TABLE public.interactions
  ADD COLUMN IF NOT EXISTS resend_message_id text,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_interactions_resend_message_id
  ON public.interactions (resend_message_id)
  WHERE resend_message_id IS NOT NULL;

-- 2. Businesses: contadores rápidos para pintar en LeadCard/Dashboard sin JOIN pesado
--    (también alimenta el futuro punto 5, priorización automática).
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS email_opens_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_clicks_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_last_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_last_clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_bounced boolean DEFAULT false;

-- 3. Idempotencia de eventos del webhook (mismo patrón que processed_stripe_events)
CREATE TABLE IF NOT EXISTS public.processed_resend_events (
  event_id text PRIMARY KEY,
  type text,
  business_id uuid REFERENCES public.businesses(id),
  processed_at timestamptz DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.processed_resend_events ENABLE ROW LEVEL SECURITY;

-- Solo el backend (service_role) toca esta tabla — sin policies de usuario final.
;
