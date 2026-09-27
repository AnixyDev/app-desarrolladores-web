-- Comprobación: nadie puede sumarse créditos IA "gastando" una cantidad
-- negativa o cero, y el cobro normal sigue funcionando.
--
-- CÓMO SE LANZA: pégalo entero en el editor SQL de Supabase, o
--   supabase db query --file supabase/pruebas/creditos-cantidades-negativas.sql
--
-- ES SEGURO EN PRODUCCIÓN: termina siempre con una excepción a propósito que
-- deshace la transacción entera. El resultado aparece como un mensaje de
-- error: eso es lo normal. Lee el texto.

do $$
declare
  v_id    uuid;
  v_antes int;
  v_desp  int;
  v_ok    boolean;
  v_res   text := '';
  v_f     int := 0;
begin
  select id, ai_credits into v_id, v_antes from public.profiles where ai_credits > 0 limit 1;
  if v_id is null then
    raise exception 'No hay perfiles con créditos con los que probar.';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    perform public.consume_credits_atomic(v_id, -100000);
    v_res := v_res || E'\n  FALLA 1) una cantidad negativa suma créditos'; v_f := v_f + 1;
  exception when invalid_parameter_value then
    v_res := v_res || E'\n  OK    1) cantidad negativa: rechazada';
  end;

  begin
    perform public.consume_credits_atomic(v_id, 0);
    v_res := v_res || E'\n  FALLA 2) cantidad cero aceptada'; v_f := v_f + 1;
  exception when invalid_parameter_value then
    v_res := v_res || E'\n  OK    2) cantidad cero: rechazada';
  end;

  select public.consume_credits_atomic(v_id, 1) into v_ok;
  execute 'reset role';
  select ai_credits into v_desp from public.profiles where id = public.cuenta_de_creditos_ia(v_id);
  if v_ok then
    v_res := v_res || E'\n  OK    3) el cobro normal de 1 crédito funciona';
  else
    v_res := v_res || E'\n  FALLA 3) el cobro normal no se ha hecho'; v_f := v_f + 1;
  end if;

  raise exception E'CRÉDITOS CON CANTIDADES NEGATIVAS — % fallo(s)\n%\n\n(la transaccion se ha deshecho: no queda nada de esta prueba)',
    v_f, v_res;
end $$;
