-- Tabla de pagos parciales, vinculada a una factura
create table if not exists public.payments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null default auth.uid() references auth.users(id),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  paid_at date not null default current_date,
  method text,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.payments enable row level security;

create policy "payments_select_own" on public.payments
  for select using (auth.uid() = user_id);
create policy "payments_insert_own" on public.payments
  for insert with check (auth.uid() = user_id);
create policy "payments_update_own" on public.payments
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "payments_delete_own" on public.payments
  for delete using (auth.uid() = user_id);

-- Función que recalcula el estado de la factura según la suma de sus pagos
create or replace function public.sync_invoice_paid_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invoice_id uuid;
  v_total_cents integer;
  v_paid_cents integer;
  v_last_payment_date date;
begin
  v_invoice_id := coalesce(new.invoice_id, old.invoice_id);

  select total_cents into v_total_cents from public.invoices where id = v_invoice_id;

  select coalesce(sum(amount_cents), 0), max(paid_at)
    into v_paid_cents, v_last_payment_date
    from public.payments where invoice_id = v_invoice_id;

  update public.invoices
    set paid = (v_paid_cents >= v_total_cents and v_total_cents > 0),
        payment_date = case when v_paid_cents >= v_total_cents then v_last_payment_date else null end
    where id = v_invoice_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_invoice_paid_status on public.payments;
create trigger trg_sync_invoice_paid_status
after insert or update or delete on public.payments
for each row execute function public.sync_invoice_paid_status();
;
