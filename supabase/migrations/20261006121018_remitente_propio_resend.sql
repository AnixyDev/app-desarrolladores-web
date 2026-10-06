-- Correo desde el dominio propio del usuario (Pro y Teams).
-- La clave va cifrada con APP_ENCRYPTION_KEY (AES-GCM), como la de Gemini.
-- Solo escribe la clave de servicio (manage-secrets y las funciones de envío):
-- user_secrets solo tiene la política de lectura del propietario.
alter table public.user_secrets
  add column if not exists resend_api_key_encrypted text,
  add column if not exists resend_from_email text,
  add column if not exists resend_configurado_en timestamptz,
  add column if not exists resend_ultimo_error text,
  add column if not exists resend_error_en timestamptz;

alter table public.user_secrets
  add constraint user_secrets_resend_completo
  check ((resend_api_key_encrypted is null) = (resend_from_email is null));

comment on column public.user_secrets.resend_api_key_encrypted is 'Clave de Resend propia del usuario, cifrada (AES-GCM). Solo Pro/Teams.';
comment on column public.user_secrets.resend_from_email is 'Dirección de envío en el dominio verificado del usuario.';
comment on column public.user_secrets.resend_ultimo_error is 'Último rechazo de su Resend, para enseñarlo en Ajustes. Null si el último envío fue bien.';
