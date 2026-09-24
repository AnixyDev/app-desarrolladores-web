-- La app solo llama a consume_credits_atomic(user_id uuid, amount_to_consume int)
-- desde hooks/store/authSlice.ts. Las otras dos no aparecen en ningun sitio del
-- codigo (ni front ni Edge Functions).
--
-- Ademas, tener DOS sobrecargas con el mismo nombre publicadas en PostgREST es
-- una trampa: la resolucion depende de los nombres de los parametros del JSON,
-- y una llamada mal formada puede acabar en la sobrecarga equivocada.
--
-- NO se hace DROP a proposito: pg_stat_user_functions esta vacio (el
-- seguimiento de llamadas esta desactivado), asi que no tengo prueba en
-- ejecucion de que nadie las use — solo ausencia de referencias en el codigo.
-- Quitarles el permiso las deja fuera de la API y es reversible al instante.
--
-- PARA DESHACER, si algo dejara de funcionar:
--   grant execute on function public.consume_credits_atomic(integer) to authenticated;
--   grant execute on function public.consume_ai_credits_rpc(integer) to authenticated;
--
-- Si dentro de unas semanas nada se ha roto, entonces si: DROP FUNCTION.

revoke execute on function public.consume_credits_atomic(integer) from public, anon, authenticated;
revoke execute on function public.consume_ai_credits_rpc(integer) from public, anon, authenticated;;
