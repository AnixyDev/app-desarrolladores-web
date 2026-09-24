-- Todas estas exigen sesion para hacer algo: sin ella auth.uid() es NULL y o
-- abortan o devuelven vacio. Publicarlas a anon solo amplia la superficie de
-- la API sin aportar nada. Se revoca de PUBLIC (que incluye a anon; revocar
-- solo de anon no basta) y se concede a quien si las usa.
--
-- service_role se mantiene en los generadores de numeracion: los llama la
-- Edge Function process-recurring-invoices en nombre de otros usuarios.

revoke execute on function public.consume_credits_atomic(integer)          from public, anon;
revoke execute on function public.consume_credits_atomic(uuid, integer)    from public, anon;
revoke execute on function public.generate_invoice_number(uuid)            from public, anon;
revoke execute on function public.generate_receipt_number(uuid)            from public, anon;
revoke execute on function public.link_portal_client()                     from public, anon;
revoke execute on function public.link_team_membership()                   from public, anon;

grant execute on function public.consume_credits_atomic(integer)           to authenticated, service_role;
grant execute on function public.consume_credits_atomic(uuid, integer)     to authenticated, service_role;
grant execute on function public.generate_invoice_number(uuid)             to authenticated, service_role;
grant execute on function public.generate_receipt_number(uuid)             to authenticated, service_role;
grant execute on function public.link_portal_client()                      to authenticated;
grant execute on function public.link_team_membership()                    to authenticated;

-- is_active_team_member NO se toca a proposito. La usan por dentro las
-- politicas RLS de knowledge_articles, projects, tasks y time_entries, y
-- varias de esas politicas estan declaradas para el rol public. Si se le
-- quitara el permiso a anon, una consulta anonima contra esas tablas pasaria
-- de devolver 0 filas limpiamente a fallar con "permission denied" — peor
-- comportamiento y mas informativo para quien sondee. Sin sesion la funcion
-- ya devuelve false (comprobado), asi que no expone nada.;
