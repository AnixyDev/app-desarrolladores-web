-- El webhook de Stripe sumaba creditos leyendo y despues escribiendo:
--   select ai_credits -> update ai_credits = leido + n
-- Entre la lectura y la escritura cabe otra operacion, y una de las dos sumas
-- se pierde. Esto lo hace en UNA sola sentencia, donde Postgres bloquea la
-- fila: el resultado es correcto aunque lleguen varios eventos a la vez.
--
-- SEGURIDAD: esto regala creditos, asi que NO puede estar al alcance de un
-- usuario con sesion. Solo service_role, que es quien ejecuta el webhook.
-- Si estuviera abierta a 'authenticated', cualquiera podria darse creditos
-- llamando a /rest/v1/rpc/sumar_creditos desde la consola del navegador.
create or replace function public.sumar_creditos(
  p_user_id uuid,
  p_ai integer default 0,
  p_firma integer default 0
)
returns table(ai_credits integer, signature_credits integer)
language sql
security definer
set search_path to 'public','pg_temp'
as $function$
  update public.profiles p
  set ai_credits        = p.ai_credits + p_ai,
      signature_credits = p.signature_credits + p_firma
  where p.id = p_user_id
  returning p.ai_credits, p.signature_credits;
$function$;

revoke execute on function public.sumar_creditos(uuid, integer, integer) from public, anon, authenticated;
grant  execute on function public.sumar_creditos(uuid, integer, integer) to service_role;;
