-- recurring_invoices: ya tiene política correcta con auth.uid(), quitamos la rota
drop policy if exists "insert_own" on public.recurring_invoices;

-- recurring_expenses: mismo caso
drop policy if exists "insert_own" on public.recurring_expenses;

-- platform_payments: quitamos las 4 políticas rotas.
-- SELECT e INSERT ya tienen alternativas correctas con auth.uid()/rol admin.
-- UPDATE y DELETE quedan sin política para usuarios normales a propósito:
-- un libro de pagos no debe ser editable/borrable por el usuario, solo por service_role o un admin.
drop policy if exists "select_own" on public.platform_payments;
drop policy if exists "insert_own" on public.platform_payments;
drop policy if exists "update_own" on public.platform_payments;
drop policy if exists "delete_own" on public.platform_payments;
;
