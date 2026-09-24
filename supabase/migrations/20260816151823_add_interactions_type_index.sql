-- Índice compuesto que cubre exactamente el patrón de consulta de
-- priorityService.js: filtrar por business_id Y por type a la vez.
CREATE INDEX IF NOT EXISTS idx_interactions_business_id_type
  ON public.interactions (business_id, type);
;
