ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profitability_alerts_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.profitability_alerts_enabled IS
  'Alertas semanales por email cuando un proyecto activo cae por debajo de la tarifa objetivo (hourly_rate_cents). Función Pro/Teams. Item 6 del roadmap de monetización.';;
