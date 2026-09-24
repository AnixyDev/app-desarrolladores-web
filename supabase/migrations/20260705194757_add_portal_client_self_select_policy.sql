-- Permite que un cliente del portal lea su propia fila en `clients`
-- (necesario para que PortalDashboardPage y el resto de páginas del portal
-- puedan mostrar el nombre del cliente y validar el vínculo)
create policy "portal_client_select_own_row" on public.clients for select
  using (portal_user_id = auth.uid());
;
