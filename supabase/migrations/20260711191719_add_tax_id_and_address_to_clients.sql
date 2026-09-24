ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS address text;

COMMENT ON COLUMN public.clients.tax_id IS 'NIF/CIF del cliente';
COMMENT ON COLUMN public.clients.address IS 'Dirección postal del cliente';;
