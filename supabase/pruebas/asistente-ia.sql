-- Comprobación del asistente de IA con memoria (28/09/2026).
--
-- CÓMO SE LANZA: pégalo entero en el editor SQL de Supabase, o
--   supabase db query --file supabase/pruebas/asistente-ia.sql
--
-- ES SEGURO EN PRODUCCIÓN: usa dos perfiles existentes, crea una conversación
-- de prueba y termina siempre con una excepción a propósito, que deshace la
-- transacción entera (también los créditos devueltos). El resultado aparece
-- como un mensaje de error: eso es lo normal.

do $$
declare
  v_a uuid; v_b uuid; v_conv uuid; v_n int; v_antes int; v_despues int;
  v_res text := ''; v_fallos int := 0;
begin
  select id into v_a from public.profiles order by id limit 1;
  select id into v_b from public.profiles where id <> v_a order by id limit 1;
  if v_b is null then raise exception 'Hacen falta dos perfiles para probar.'; end if;

  -- A crea una conversación con un mensaje (como authenticated, con su JWT).
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.ai_conversaciones (titulo) values ('Prueba') returning id into v_conv;
  insert into public.ai_mensajes (conversacion_id, rol, texto) values (v_conv, 'user', 'Hola');

  -- 1) B no ve los mensajes de A.
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.ai_mensajes where conversacion_id = v_conv;
  if v_n = 0 then v_res := v_res || E'\nOK  1 B no ve los mensajes de A';
  else v_res := v_res || E'\nMAL 1 B ve mensajes de A'; v_fallos := v_fallos + 1; end if;

  -- 2) B no puede escribir en la conversación de A.
  begin
    insert into public.ai_mensajes (conversacion_id, rol, texto) values (v_conv, 'user', 'intruso');
    v_res := v_res || E'\nMAL 2 B escribió en la conversación de A'; v_fallos := v_fallos + 1;
  exception when insufficient_privilege then
    v_res := v_res || E'\nOK  2 B no puede escribir en la conversación de A';
  end;

  -- 3) authenticated no puede devolverse créditos.
  begin
    perform public.devolver_creditos_ia(v_b, 5);
    v_res := v_res || E'\nMAL 3 authenticated se sumó créditos'; v_fallos := v_fallos + 1;
  exception when insufficient_privilege then
    v_res := v_res || E'\nOK  3 authenticated no puede devolverse créditos';
  end;

  reset role;

  -- 4) El servidor sí devuelve créditos a la cuenta que pagó.
  select ai_credits into v_antes from public.profiles where id = public.cuenta_de_creditos_ia(v_a);
  perform public.devolver_creditos_ia(v_a, 2);
  select ai_credits into v_despues from public.profiles where id = public.cuenta_de_creditos_ia(v_a);
  if v_despues = v_antes + 2 then v_res := v_res || E'\nOK  4 devolución de 2 créditos';
  else v_res := v_res || format(E'\nMAL 4 créditos %s -> %s', v_antes, v_despues); v_fallos := v_fallos + 1; end if;

  -- 5) Borrar la conversación borra sus mensajes.
  delete from public.ai_conversaciones where id = v_conv;
  select count(*) into v_n from public.ai_mensajes where conversacion_id = v_conv;
  if v_n = 0 then v_res := v_res || E'\nOK  5 borrado en cascada';
  else v_res := v_res || E'\nMAL 5 quedaron mensajes huérfanos'; v_fallos := v_fallos + 1; end if;

  raise exception E'RESULTADO (se deshace todo): % fallos%', v_fallos, v_res;
end $$;
