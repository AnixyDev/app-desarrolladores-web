alter table public.invoices
  add column if not exists budget_id uuid references public.budgets(id) on delete set null,
  add column if not exists contract_id uuid references public.contracts(id) on delete set null;;
