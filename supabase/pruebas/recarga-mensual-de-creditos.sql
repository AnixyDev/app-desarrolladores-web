-- Comprobación de la recarga mensual de créditos (Pro 50, Teams 200).
--
-- CÓMO SE LANZA: pégalo entero en el editor SQL de Supabase, o
--   supabase db query --file supabase/pruebas/recarga-mensual-de-creditos.sql
--
-- ES SEGURO EN PRODUCCIÓN: trabaja sobre un perfil que ya existe y termina
-- siempre con una excepción a propósito, que deshace la transacción entera.
-- El resultado aparece como un mensaje de error: eso es lo normal. Lee el texto.

do $$
declare
  v_id        uuid;
  v_antes     int;
  v_despues   int;
  v_proxima   timestamptz;
  v_n         int;
  v_resultado text := '';
  v_fallos    int := 0;

begin
  select id into v_id from public.profiles limit 1;
  if v_id is null then
    raise exception 'No hay perfiles con los que probar.';
  end if;

  -- Punto de partida limpio: nadie más vencido en esta transacción.
  update public.profiles set creditos_mensuales_proxima = now() + interval '1 year'
   where creditos_mensuales_proxima is not null;

  ---------------------------------------------------------------------------
  -- 1) Al pasar a un plan de pago activo, la próxima recarga queda a un mes.
  update public.profiles set plan = 'Free', subscription_status = null where id = v_id;
  update public.profiles set plan = 'Teams', subscription_status = 'active', ai_credits = 10 where id = v_id;
  select creditos_mensuales_proxima into v_proxima from public.profiles where id = v_id;
  if v_proxima between now() + interval '1 month' - interval '1 minute' and now() + interval '1 month' + interval '1 minute' then
    v_resultado := v_resultado || E'\n  OK    1) activar Teams deja la proxima recarga a un mes';
  else
    v_resultado := v_resultado || format(E'\n  FALLA 1) proxima = %s', v_proxima);
    v_fallos := v_fallos + 1;
  end if;

  ---------------------------------------------------------------------------
  -- 2) Si no ha vencido, no recarga.
  v_n := public.recargar_creditos_mensuales();
  select ai_credits into v_despues from public.profiles where id = v_id;
  if v_n = 0 and v_despues = 10 then
    v_resultado := v_resultado || E'\n  OK    2) antes de tiempo no recarga';
  else
    v_resultado := v_resultado || format(E'\n  FALLA 2) recargadas %s, creditos %s', v_n, v_despues);
    v_fallos := v_fallos + 1;
  end if;

  ---------------------------------------------------------------------------
  -- 3) Vencida: Teams suma 200 y adelanta el ancla exactamente un mes.
  update public.profiles set creditos_mensuales_proxima = now() - interval '1 day' where id = v_id;
  select creditos_mensuales_proxima into v_proxima from public.profiles where id = v_id;
  v_n := public.recargar_creditos_mensuales();
  select ai_credits into v_despues from public.profiles where id = v_id;
  if v_n = 1 and v_despues = 210
     and (select creditos_mensuales_proxima from public.profiles where id = v_id) = v_proxima + interval '1 month' then
    v_resultado := v_resultado || E'\n  OK    3) Teams vencido: +200 y ancla un mes adelante';
  else
    v_resultado := v_resultado || format(E'\n  FALLA 3) recargadas %s, creditos %s (esperado 210)', v_n, v_despues);
    v_fallos := v_fallos + 1;
  end if;

  ---------------------------------------------------------------------------
  -- 4) Ejecutarla otra vez el mismo día no da un segundo mes.
  v_n := public.recargar_creditos_mensuales();
  select ai_credits into v_despues from public.profiles where id = v_id;
  if v_n = 0 and v_despues = 210 then
    v_resultado := v_resultado || E'\n  OK    4) dos ejecuciones el mismo dia no recargan dos veces';
  else
    v_resultado := v_resultado || format(E'\n  FALLA 4) segunda pasada: recargadas %s, creditos %s', v_n, v_despues);
    v_fallos := v_fallos + 1;
  end if;

  ---------------------------------------------------------------------------
  -- 5) Pro activo vencido: +50, y SUMA sobre creditos comprados (no los pisa).
  update public.profiles set plan = 'Pro', ai_credits = 999 where id = v_id;
  update public.profiles set creditos_mensuales_proxima = now() - interval '1 hour' where id = v_id;
  v_n := public.recargar_creditos_mensuales();
  select ai_credits into v_despues from public.profiles where id = v_id;
  if v_n = 1 and v_despues = 1049 then
    v_resultado := v_resultado || E'\n  OK    5) Pro: +50 sumados a los 999 comprados';
  else
    v_resultado := v_resultado || format(E'\n  FALLA 5) recargadas %s, creditos %s (esperado 1049)', v_n, v_despues);
    v_fallos := v_fallos + 1;
  end if;

  ---------------------------------------------------------------------------
  -- 6) Plan Pro con la suscripcion caducada sin pagar: nada.
  update public.profiles set subscription_status = 'incomplete_expired', ai_credits = 5 where id = v_id;
  select creditos_mensuales_proxima into v_proxima from public.profiles where id = v_id;
  update public.profiles set creditos_mensuales_proxima = now() - interval '1 day' where id = v_id;
  v_n := public.recargar_creditos_mensuales();
  select ai_credits into v_despues from public.profiles where id = v_id;
  if v_proxima is null and v_n = 0 and v_despues = 5 then
    v_resultado := v_resultado || E'\n  OK    6) suscripcion impagada: sin ancla y sin recarga';
  else
    v_resultado := v_resultado || format(E'\n  FALLA 6) ancla %s, recargadas %s, creditos %s', v_proxima, v_n, v_despues);
    v_fallos := v_fallos + 1;
  end if;

  ---------------------------------------------------------------------------
  -- 7) Free: nada.
  update public.profiles set plan = 'Free', subscription_status = 'canceled', ai_credits = 5 where id = v_id;
  select creditos_mensuales_proxima into v_proxima from public.profiles where id = v_id;
  if v_proxima is null then
    v_resultado := v_resultado || E'\n  OK    7) al volver a Free se borra el ancla';
  else
    v_resultado := v_resultado || format(E'\n  FALLA 7) ancla %s en Free', v_proxima);
    v_fallos := v_fallos + 1;
  end if;

  ---------------------------------------------------------------------------
  -- 8) Nadie desde el navegador puede lanzar la recarga.
  if not has_function_privilege('anon', 'public.recargar_creditos_mensuales()', 'execute')
     and not has_function_privilege('authenticated', 'public.recargar_creditos_mensuales()', 'execute') then
    v_resultado := v_resultado || E'\n  OK    8) anon y authenticated no pueden ejecutarla';
  else
    v_resultado := v_resultado || E'\n  FALLA 8) la recarga se puede lanzar desde el navegador';
    v_fallos := v_fallos + 1;
  end if;

  ---------------------------------------------------------------------------
  -- 9) La tarea diaria existe.
  if exists (select 1 from cron.job where jobname = 'recarga-mensual-creditos' and active) then
    v_resultado := v_resultado || E'\n  OK    9) tarea diaria recarga-mensual-creditos activa';
  else
    v_resultado := v_resultado || E'\n  FALLA 9) no hay tarea diaria';
    v_fallos := v_fallos + 1;
  end if;

  ---------------------------------------------------------------------------
  raise exception E'RECARGA MENSUAL DE CREDITOS — % fallo(s)\n%\n\n(la transaccion se ha deshecho: no queda nada de esta prueba)',
    v_fallos, v_resultado;
end $$;
