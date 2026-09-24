-- Rendimiento RLS: auth.uid() sin envolver se evalua UNA VEZ POR FILA.
-- Envuelto en (select auth.uid()) Postgres lo trata como InitPlan: lo calcula
-- una sola vez por consulta. El predicado NO cambia en nada mas: mismos roles,
-- mismas tablas, misma logica. Las otras politicas del proyecto ya estaban asi;
-- estas tres se quedaron atras.

-- 1) budgets: cliente del portal puede actualizar su presupuesto
drop policy if exists budgets_update_portal_client on public.budgets;
create policy budgets_update_portal_client on public.budgets
  for update to authenticated
  using (client_id in (select clients.id from public.clients
                       where clients.portal_user_id = (select auth.uid())))
  with check (client_id in (select clients.id from public.clients
                            where clients.portal_user_id = (select auth.uid())));

-- 2) job_applications: el dueno de la oferta cambia el estado de la candidatura
drop policy if exists job_applications_owner_update_status on public.job_applications;
create policy job_applications_owner_update_status on public.job_applications
  for update to authenticated
  using (exists (select 1 from public.jobs
                 where jobs.id = job_applications.job_id
                   and jobs.user_id = (select auth.uid())))
  with check (exists (select 1 from public.jobs
                      where jobs.id = job_applications.job_id
                        and jobs.user_id = (select auth.uid())));

-- 3) template_purchases: comprador y vendedor ven su compra
--    Se conserva el rol public tal cual estaba: sin sesion auth.uid() es NULL
--    y no casa con ninguna fila, asi que no expone nada (comprobado).
drop policy if exists select_own_purchases on public.template_purchases;
create policy select_own_purchases on public.template_purchases
  for select to public
  using ((select auth.uid()) = buyer_id or (select auth.uid()) = seller_id);;
