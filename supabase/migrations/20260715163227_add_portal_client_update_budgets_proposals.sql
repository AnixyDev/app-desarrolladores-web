-- contracts_update ya permite al cliente del portal actualizar (firmar) su
-- propio contrato (client_id IN clients con portal_user_id = auth.uid()).
-- budgets y proposals solo tenían el UPDATE del dueño ("_own"), por lo que
-- aceptar/rechazar desde PortalBudgetViewPage.tsx / PortalProposalViewPage.tsx
-- fallaría siempre por RLS. Se añade el mismo patrón ya usado en contracts.
create policy "budgets_update_portal_client"
on public.budgets
for update
to authenticated
using (
  client_id in (select id from public.clients where portal_user_id = auth.uid())
)
with check (
  client_id in (select id from public.clients where portal_user_id = auth.uid())
);

create policy "proposals_update_portal_client"
on public.proposals
for update
to authenticated
using (
  client_id in (select id from public.clients where portal_user_id = auth.uid())
)
with check (
  client_id in (select id from public.clients where portal_user_id = auth.uid())
);;
