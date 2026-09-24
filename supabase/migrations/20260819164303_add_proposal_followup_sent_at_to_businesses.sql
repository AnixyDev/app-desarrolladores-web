-- Marca el momento REAL de envio (no de generacion) de la ultima
-- propuesta/recordatorio enviados a cada lead. Se usan directamente en
-- el tablero Kanban (badge en LeadCard) sin necesitar una consulta
-- aparte a interactions -- se leen del mismo fetch de businesses que
-- ya carga el tablero.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS proposal_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS followup_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.businesses.proposal_sent_at IS
  'Fecha/hora del ultimo envio real de PROPUESTA_ENVIADA (via sendEmailWithMockup o bulkSendGeneratedEmails). NULL si nunca se envio.';
COMMENT ON COLUMN public.businesses.followup_sent_at IS
  'Fecha/hora del ultimo envio real de RECORDATORIO_ENVIADO (via sendEmailWithMockup). NULL si nunca se envio.';;
