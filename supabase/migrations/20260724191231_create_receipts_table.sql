-- Recibos: pagos/cobros sueltos que NO forman parte de la facturación formal
-- (trabajos informales, arreglos puntuales...), distintos de `payments`
-- (que solo registra cobros parciales contra una factura ya existente,
-- invoice_id NOT NULL). Un recibo puede opcionalmente enlazar a un cliente
-- y/o proyecto, pero no depende de que exista una factura.
create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  receipt_number text not null,
  concept text not null,
  amount_cents integer not null check (amount_cents > 0),
  paid_at date not null default current_date,
  method text,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.receipts enable row level security;

create policy "receipts_owner_all"
on public.receipts
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Numeración correlativa propia para recibos (REC-2026-0001...), separada
-- de generate_invoice_number() para no mezclarla con la numeración legal
-- de facturas — un recibo no es un documento fiscal.
create or replace function public.generate_receipt_number(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_year text := to_char(now(), 'YYYY');
  v_next int;
begin
  select coalesce(max(
    case when receipt_number ~ ('^REC-' || v_year || '-[0-9]+$')
      then substring(receipt_number from '[0-9]+$')::int
      else 0
    end
  ), 0) + 1
  into v_next
  from public.receipts
  where user_id = p_user_id;

  return 'REC-' || v_year || '-' || lpad(v_next::text, 4, '0');
end;
$$;

grant execute on function public.generate_receipt_number(uuid) to authenticated, service_role;;
