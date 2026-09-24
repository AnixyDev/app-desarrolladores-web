-- Vulnerabilidad crítica: estas dos funciones aceptaban un user_id arbitrario
-- sin comprobar auth.uid(), permitiendo a cualquier usuario manipular créditos ajenos.
-- Las dejamos solo accesibles para service_role (uso interno server-side).
revoke execute on function public.consume_ai_credits(uuid, integer) from public, anon, authenticated;
revoke execute on function public.increment_credits(uuid, integer) from public, anon, authenticated;

-- Higiene: handle_new_user y rls_auto_enable son funciones de trigger/event trigger,
-- no invocables directamente por clientes, pero les quitamos el grant expuesto igualmente.
revoke execute on function public.handle_new_user() from public, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
;
