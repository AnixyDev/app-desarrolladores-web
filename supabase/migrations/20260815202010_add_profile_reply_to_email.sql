-- Permite a cada usuario configurar una dirección de "responder a" distinta
-- de su email de cuenta, usada al enviar facturas/propuestas/presupuestos.
-- Si queda NULL, el backend usa profiles.email como fallback.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS invoice_reply_to_email text;

COMMENT ON COLUMN public.profiles.invoice_reply_to_email IS
  'Email de "responder a" para documentos enviados (facturas/propuestas/presupuestos). Si es NULL, se usa profiles.email.';
;
