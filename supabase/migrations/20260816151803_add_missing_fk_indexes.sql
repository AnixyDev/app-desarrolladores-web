-- Índices en columnas de clave foránea que no tenían ninguno — encontrados
-- en auditoría de rendimiento. Postgres no crea estos automáticamente,
-- solo en claves primarias/únicas.

CREATE INDEX IF NOT EXISTS idx_bank_accounts_connection_id
  ON public.bank_accounts (connection_id);

CREATE INDEX IF NOT EXISTS idx_invoices_rectifies_invoice_id
  ON public.invoices (rectifies_invoice_id)
  WHERE rectifies_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_processed_resend_events_business_id
  ON public.processed_resend_events (business_id);

CREATE INDEX IF NOT EXISTS idx_receipts_client_id
  ON public.receipts (client_id)
  WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_receipts_project_id
  ON public.receipts (project_id)
  WHERE project_id IS NOT NULL;
;
