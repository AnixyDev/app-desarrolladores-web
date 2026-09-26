-- Comprobación de los créditos de IA compartidos en el plan Teams.
--
-- CÓMO SE LANZA: pégalo entero en el editor SQL de Supabase, o
--   supabase db query --file supabase/pruebas/creditos-compartidos-del-equipo.sql
--
-- ES SEGURO EN PRODUCCIÓN: crea dos cuentas y un miembro de equipo de prueba,
-- y termina siempre con una excepción a propósito, que deshace la transacción
-- entera. El resultado aparece como un mensaje de error: eso es lo normal.

do $$
declare
  v_dueno   uuid;
  v_miembro uuid := gen_random_uuid();
  v_ajeno   uuid := gen_random_uuid();
  v_res text := ''; v_f int := 0; v_ok boolean;
  v_d0 int; v_d1 int; v_m0 int; v_m1 int; v_s int; v_c boolean;
begin
  -- Un dueño Teams con la suscripción viva (se fuerza dentro de la transacción).
  select id into v_dueno from public.profiles order by ai_credits desc limit 1;
  update public.profiles set plan = 'Teams', subscription_status = 'active', ai_credits = 200 where id = v_dueno;

  insert into auth.users (id, instance_id, aud, role, email) values
    (v_miembro, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'miembro-' || v_miembro || '@ejemplo.com'),
    (v_ajeno,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ajeno-'   || v_ajeno   || '@ejemplo.com');
  insert into public.team_members (user_id, name, email, role, status, accepted_user_id)
  values (v_dueno, 'Miembro de prueba', 'miembro-' || v_miembro || '@ejemplo.com', 'Developer', 'Activo', v_miembro);

  select ai_credits into v_d0 from public.profiles where id = v_dueno;
  select ai_credits into v_m0 from public.profiles where id = v_miembro;

  -- 1-2) El miembro gasta del dueño y ve ese saldo.
  perform set_config('request.jwt.claims', json_build_object('sub', v_miembro, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.consume_credits_atomic(v_miembro, 3) into v_ok;
  select saldo, compartido into v_s, v_c from public.saldo_creditos_ia();
  execute 'reset role';
  select ai_credits into v_d1 from public.profiles where id = v_dueno;
  select ai_credits into v_m1 from public.profiles where id = v_miembro;
  if v_ok and v_d1 = v_d0 - 3 and v_m1 = v_m0 then
    v_res := v_res || format(E'\n  OK    1) el miembro gasta del saldo del equipo (%s -> %s) y el suyo no se toca', v_d0, v_d1);
  else
    v_res := v_res || format(E'\n  FALLA 1) ok=%s dueño %s->%s miembro %s->%s', v_ok, v_d0, v_d1, v_m0, v_m1); v_f := v_f + 1;
  end if;
  if v_s = v_d1 and v_c then
    v_res := v_res || E'\n  OK    2) el miembro ve el saldo del equipo, marcado como compartido';
  else
    v_res := v_res || format(E'\n  FALLA 2) saldo %s compartido %s', v_s, v_c); v_f := v_f + 1;
  end if;

  -- 3) Alguien de fuera gasta de lo suyo.
  perform set_config('request.jwt.claims', json_build_object('sub', v_ajeno, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.consume_credits_atomic(v_ajeno, 1) into v_ok;
  select saldo, compartido into v_s, v_c from public.saldo_creditos_ia();
  execute 'reset role';
  if v_ok and v_s = 9 and not v_c and (select ai_credits from public.profiles where id = v_dueno) = v_d1 then
    v_res := v_res || E'\n  OK    3) una cuenta ajena gasta de lo suyo (10 -> 9)';
  else
    v_res := v_res || format(E'\n  FALLA 3) ok=%s saldo=%s compartido=%s', v_ok, v_s, v_c); v_f := v_f + 1;
  end if;

  -- 4) Miembro inactivo: vuelve a su saldo.
  update public.team_members set status = 'Inactivo' where accepted_user_id = v_miembro;
  perform set_config('request.jwt.claims', json_build_object('sub', v_miembro, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select saldo, compartido into v_s, v_c from public.saldo_creditos_ia();
  execute 'reset role';
  if not v_c and v_s = v_m0 then
    v_res := v_res || E'\n  OK    4) miembro inactivo: vuelve a su propio saldo';
  else
    v_res := v_res || format(E'\n  FALLA 4) saldo %s compartido %s', v_s, v_c); v_f := v_f + 1;
  end if;

  -- 5-6) Dueño sin Teams activo: no se comparte; y nadie cobra a nombre de otro.
  update public.team_members set status = 'Activo' where accepted_user_id = v_miembro;
  update public.profiles set subscription_status = 'canceled', plan = 'Free' where id = v_dueno;
  perform set_config('request.jwt.claims', json_build_object('sub', v_miembro, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select saldo, compartido into v_s, v_c from public.saldo_creditos_ia();
  begin
    perform public.consume_credits_atomic(v_dueno, 1);
    v_res := v_res || E'\n  FALLA 6) se pudo cobrar a nombre de otra cuenta'; v_f := v_f + 1;
  exception when others then
    v_res := v_res || E'\n  OK    6) no se puede cobrar a nombre de otra cuenta';
  end;
  execute 'reset role';
  if not v_c then
    v_res := v_res || E'\n  OK    5) dueño sin Teams activo: el equipo deja de compartir';
  else
    v_res := v_res || E'\n  FALLA 5) sigue compartiendo sin Teams activo'; v_f := v_f + 1;
  end if;

  -- 7) Permisos.
  if not has_function_privilege('authenticated', 'public.cuenta_de_creditos_ia(uuid)', 'execute')
     and has_function_privilege('authenticated', 'public.saldo_creditos_ia()', 'execute')
     and not has_function_privilege('anon', 'public.saldo_creditos_ia()', 'execute') then
    v_res := v_res || E'\n  OK    7) permisos: el navegador solo puede leer su saldo';
  else
    v_res := v_res || E'\n  FALLA 7) permisos'; v_f := v_f + 1;
  end if;

  raise exception E'CREDITOS COMPARTIDOS DEL EQUIPO — % fallo(s)\n%\n\n(la transaccion se ha deshecho: no queda nada de esta prueba)',
    v_f, v_res;
end $$;
