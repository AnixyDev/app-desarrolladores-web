-- Comprobación: el plan, los créditos y el resto de columnas de pago del
-- perfil no se pueden cambiar desde el navegador.
--
-- CÓMO SE LANZA: pégalo entero en el editor SQL de Supabase, o
--   supabase db query --file supabase/pruebas/columnas-de-pago-del-perfil.sql
--
-- ES SEGURO EN PRODUCCIÓN: simula la sesión de un usuario sobre un perfil que
-- ya existe y termina siempre con una excepción a propósito, que deshace la
-- transacción entera. El resultado aparece como un mensaje de error: eso es lo
-- normal. Lee el texto.

do $$
declare
  v_id  uuid;
  v_res text := '';
  v_f   int := 0;
  v_ok  boolean;
  v_c   int;
  v_c2  int;
  v_nuevo uuid := gen_random_uuid();
  v_alta text;
begin
  select id, ai_credits into v_id, v_c from public.profiles where ai_credits > 0 limit 1;
  if v_id is null then
    raise exception 'No hay perfiles con créditos con los que probar.';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    update public.profiles set plan = 'Teams', ai_credits = 1000000 where id = v_id;
    v_res := v_res || E'\n  FALLA 1) el navegador puede darse plan y créditos'; v_f := v_f + 1;
  exception when insufficient_privilege then
    v_res := v_res || E'\n  OK    1) plan y créditos: rechazado';
  end;

  begin
    update public.profiles set signature_credits = 999 where id = v_id;
    v_res := v_res || E'\n  FALLA 2) créditos de firma editables'; v_f := v_f + 1;
  exception when insufficient_privilege then
    v_res := v_res || E'\n  OK    2) créditos de firma: rechazado';
  end;

  begin
    update public.profiles set subscription_status = 'active', stripe_subscription_id = 'sub_falsa' where id = v_id;
    v_res := v_res || E'\n  FALLA 3) suscripción editable'; v_f := v_f + 1;
  exception when insufficient_privilege then
    v_res := v_res || E'\n  OK    3) suscripción: rechazado';
  end;

  begin
    update public.profiles set email = 'otra@ejemplo.com' where id = v_id;
    v_res := v_res || E'\n  FALLA 4) correo editable'; v_f := v_f + 1;
  exception when insufficient_privilege then
    v_res := v_res || E'\n  OK    4) correo: rechazado';
  end;

  begin
    update public.profiles set business_name = coalesce(business_name, '') || '', pdf_color = pdf_color where id = v_id;
    v_res := v_res || E'\n  OK    5) datos del negocio: se pueden editar';
  exception when others then
    v_res := v_res || E'\n  FALLA 5) datos del negocio bloqueados: ' || sqlerrm; v_f := v_f + 1;
  end;

  select public.consume_credits_atomic(v_id, 1) into v_ok;
  execute 'reset role';
  select ai_credits into v_c2 from public.profiles where id = v_id;
  if v_ok and v_c2 = v_c - 1 then
    v_res := v_res || E'\n  OK    6) el cobro de IA del servidor sigue funcionando';
  else
    v_res := v_res || format(E'\n  FALLA 6) cobro %s: %s -> %s', v_ok, v_c, v_c2); v_f := v_f + 1;
  end if;

  -- Un perfil creado desde el navegador (borrar el propio y volver a
  -- crearlo) nace como una cuenta nueva, pida lo que pida.
  insert into auth.users (id, instance_id, aud, role, email)
  values (v_nuevo, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'prueba-' || v_nuevo || '@ejemplo.com');
  delete from public.profiles where id = v_nuevo;
  perform set_config('request.jwt.claims', json_build_object('sub', v_nuevo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.profiles (id, plan, ai_credits, role) values (v_nuevo, 'Teams', 1000000, 'Admin');
  execute 'reset role';
  select plan || '/' || ai_credits || '/' || role into v_alta from public.profiles where id = v_nuevo;
  if v_alta = 'Free/10/Developer' then
    v_res := v_res || E'\n  OK    7) alta desde el navegador: nace Free, 10 créditos, Developer';
  else
    v_res := v_res || E'\n  FALLA 7) alta desde el navegador: ' || coalesce(v_alta, 'sin fila'); v_f := v_f + 1;
  end if;

  raise exception E'COLUMNAS DE PAGO DEL PERFIL — % fallo(s)\n%\n\n(la transaccion se ha deshecho: no queda nada de esta prueba)',
    v_f, v_res;
end $$;
