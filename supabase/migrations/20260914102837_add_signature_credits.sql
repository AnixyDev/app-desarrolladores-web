ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signature_credits integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.profiles.signature_credits IS
  'Créditos de firma electrónica eIDAS comprados aparte de la suscripción (mismo patrón que ai_credits). Ítem 5 del roadmap de monetización.';;
