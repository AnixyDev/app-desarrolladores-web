-- FIX: GoCardless Bank Account Data dejó de aceptar altas nuevas en julio
-- de 2025 de forma permanente — no es un fallo temporal. Se cambia el
-- proveedor a Enable Banking, que sigue permitiendo altas nuevas y tiene
-- capa gratuita para lectura de cuentas/transacciones.
--
-- Enable Banking se autentica con una clave privada RSA (JWT firmado por
-- petición), no con un secret_id/secret_key simple como GoCardless — se
-- guarda cifrada con el mismo mecanismo que ya usamos para el certificado
-- Veri*Factu.
alter table public.user_secrets
  add column if not exists enablebanking_app_id text,
  add column if not exists enablebanking_private_key_encrypted text,
  add column if not exists enablebanking_configured_at timestamptz;

-- Las columnas de GoCardless se quedan (por si alguien las llegó a usar),
-- pero ya no se usan en el código nuevo.
comment on column public.user_secrets.gocardless_secret_id_encrypted is
  'OBSOLETO: GoCardless cerró altas nuevas en julio 2025. Usar enablebanking_* en su lugar.';

-- bank_connections necesita guardar el "session id" de Enable Banking
-- (equivalente a la requisition de GoCardless) y el ASPSP elegido.
alter table public.bank_connections
  add column if not exists enablebanking_session_id text,
  add column if not exists aspsp_country text;

alter table public.bank_transactions
  add column if not exists enablebanking_transaction_id text;;
