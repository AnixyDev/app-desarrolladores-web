-- Distingue si el ultimo email_draft guardado es una propuesta inicial
-- o un recordatorio de seguimiento, y permite registrar interacciones
-- con el tipo correcto en vez del generico EMAIL_ENVIADO.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS last_email_kind TEXT
    CHECK (last_email_kind IN ('PROPUESTA', 'RECORDATORIO') OR last_email_kind IS NULL);

COMMENT ON COLUMN public.businesses.last_email_kind IS
  'Tipo del ultimo texto generado en email_draft: PROPUESTA (generateProposalEmail) o RECORDATORIO (generateFollowUpEmail, aunque este no persiste el texto en email_draft, se usa como senal de intencion al enviar desde el modal).';;
