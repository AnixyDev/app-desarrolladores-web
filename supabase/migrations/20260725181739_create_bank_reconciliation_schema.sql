-- Conciliación bancaria (Open Banking / PSD2 vía GoCardless Bank Account Data)

-- Reutiliza la misma tabla de credenciales cifradas ya construida para
-- Gemini/certificado Veri*Factu.
alter table public.user_secrets
  add column if not exists gocardless_secret_id_encrypted text,
  add column if not exists gocardless_secret_key_encrypted text,
  add column if not exists gocardless_configured_at timestamptz;

-- Una conexión = un consentimiento con un banco concreto (una "requisition"
-- de GoCardless). Puede caducar (normalmente ~90 días) y hay que renovarla.
create table public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gocardless_requisition_id text not null,
  institution_id text not null,
  institution_name text not null,
  status text not null default 'pending' check (status in ('pending', 'linked', 'expired', 'error')),
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

alter table public.bank_connections enable row level security;
create policy "bank_connections_owner_all" on public.bank_connections
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Cuentas concretas dentro de una conexión (un consentimiento puede cubrir
-- más de una cuenta del mismo banco).
create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.bank_connections(id) on delete cascade,
  gocardless_account_id text not null unique,
  iban text,
  account_name text,
  currency text default 'EUR',
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.bank_accounts enable row level security;
create policy "bank_accounts_owner_all" on public.bank_accounts
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Movimientos sincronizados. gocardless_transaction_id evita duplicados al
-- resincronizar (los bancos a veces devuelven el mismo rango de fechas).
create table public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bank_account_id uuid not null references public.bank_accounts(id) on delete cascade,
  gocardless_transaction_id text not null,
  amount_cents integer not null,
  currency text default 'EUR',
  booking_date date not null,
  counterparty_name text,
  description text,
  raw_data jsonb,
  matched_invoice_id uuid references public.invoices(id),
  match_status text not null default 'unmatched' check (match_status in ('unmatched', 'suggested', 'confirmed', 'ignored')),
  match_confidence numeric(3,2),
  created_at timestamptz not null default now(),
  unique (bank_account_id, gocardless_transaction_id)
);

alter table public.bank_transactions enable row level security;
create policy "bank_transactions_owner_all" on public.bank_transactions
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index bank_transactions_user_status_idx on public.bank_transactions (user_id, match_status);
create index bank_transactions_matched_invoice_idx on public.bank_transactions (matched_invoice_id);;
