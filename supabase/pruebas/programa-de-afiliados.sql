-- Comprobación del programa de afiliados: alta con código, alta con Google
-- (vincular_referido), comisiones por factura pagada, idempotencia ante los
-- reintentos de Stripe, y que el navegador solo pueda leer lo suyo.
--
-- CÓMO SE LANZA: pégalo entero en el editor SQL de Supabase, o
--   supabase db query --file supabase/pruebas/programa-de-afiliados.sql
--
-- ES SEGURO EN PRODUCCIÓN: crea usuarios de prueba y termina siempre con una
-- excepción a propósito que deshace la transacción entera. El resultado
-- aparece como un mensaje de error: eso es lo normal. Lee el texto.

do $$
declare
  v_afil    uuid := gen_random_uuid();   -- el afiliado
  v_ref     uuid := gen_random_uuid();   -- se registra con su enlace
  v_google  uuid := gen_random_uuid();   -- se registra con Google (sin metadatos)
  v_viejo   uuid;                        -- una cuenta con más de 7 días
  v_codigo  text;
  v_n       int;
  v_txt     text;
  v_c       int;
  v_b       boolean;
  v_res     text := '';
  v_f       int := 0;
begin
  -- Afiliado y referido, creados como los crea Supabase Auth (que rellena
  -- created_at: vincular_referido lo usa para el plazo de 7 días).
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at)
  values (v_afil, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'afil-' || v_afil || '@ejemplo.com', '{"full_name":"Afiliada Prueba"}', now());
  select affiliate_code into v_codigo from public.profiles where id = v_afil;

  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at)
  values (v_ref, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'ref-' || v_ref || '@ejemplo.com',
          json_build_object('full_name', 'Lucía Referida Pérez', 'ref', upper(v_codigo))::jsonb, now());

  select count(*), max(referred_user_name) into v_n, v_txt
    from public.referrals where referrer_id = v_afil and referred_user_id = v_ref and status = 'Registered';
  if v_n = 1 and v_txt = 'Lucía' then
    v_res := v_res || E'\n  OK    1) alta con enlace: referido creado, solo con el nombre de pila';
  else
    v_res := v_res || format(E'\n  FALLA 1) alta con enlace: %s filas, nombre %s', v_n, v_txt); v_f := v_f + 1;
  end if;

  -- Un código que no existe no rompe el alta ni crea nada.
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at)
  values (v_google, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'google-' || v_google || '@ejemplo.com', '{"full_name":"Google Prueba","ref":"noexiste"}', now());
  select count(*) into v_n from public.referrals where referred_user_id = v_google;
  if v_n = 0 and exists (select 1 from public.profiles where id = v_google) then
    v_res := v_res || E'\n  OK    2) código desconocido: alta normal, sin referido';
  else
    v_res := v_res || E'\n  FALLA 2) código desconocido'; v_f := v_f + 1;
  end if;

  -- Desde el navegador del referido.
  perform set_config('request.jwt.claims', json_build_object('sub', v_ref, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    insert into public.referrals (referrer_id, referred_user_id, commission_cents, user_id)
    values (v_ref, v_afil, 999999, v_ref);
    v_res := v_res || E'\n  FALLA 3) el navegador puede inventarse referidos'; v_f := v_f + 1;
  exception when insufficient_privilege then
    v_res := v_res || E'\n  OK    3) inventarse referidos: rechazado';
  end;

  begin
    perform public.registrar_comision_afiliado(v_ref, 'in_falsa', 100000);
    v_res := v_res || E'\n  FALLA 4) el navegador puede registrar comisiones'; v_f := v_f + 1;
  exception when insufficient_privilege then
    v_res := v_res || E'\n  OK    4) registrar comisiones desde el navegador: rechazado';
  end;

  select count(*) into v_n from public.referrals;
  if v_n = 0 then
    v_res := v_res || E'\n  OK    5) el referido no ve la fila de su afiliado';
  else
    v_res := v_res || E'\n  FALLA 5) el referido ve filas de referrals'; v_f := v_f + 1;
  end if;

  execute 'reset role';

  -- Lo que hace stripe-webhook con cada factura pagada (clave de servicio).
  execute 'set local role service_role';
  select public.registrar_comision_afiliado(v_ref, 'in_prueba_1', 995) into v_c;
  select public.registrar_comision_afiliado(v_ref, 'in_prueba_1', 995) into v_n;   -- reintento de Stripe
  perform public.registrar_comision_afiliado(v_ref, 'in_prueba_2', 995);           -- renovación
  execute 'reset role';

  select commission_cents, status into v_n, v_txt from public.referrals where referred_user_id = v_ref;
  if v_c = 199 and v_n = 398 and v_txt = 'Subscribed'
     and (select count(*) from public.comisiones_afiliado where referrer_id = v_afil) = 2 then
    v_res := v_res || E'\n  OK    6) 20% por factura, renovaciones incluidas, sin duplicar reintentos';
  else
    v_res := v_res || format(E'\n  FALLA 6) comisión %s, acumulado %s, estado %s', v_c, v_n, v_txt); v_f := v_f + 1;
  end if;

  -- El afiliado ve su referido y sus comisiones.
  perform set_config('request.jwt.claims', json_build_object('sub', v_afil, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.referrals;
  select count(*) into v_c from public.comisiones_afiliado;
  execute 'reset role';
  if v_n = 1 and v_c = 2 then
    v_res := v_res || E'\n  OK    7) el afiliado ve su referido y sus 2 comisiones';
  else
    v_res := v_res || format(E'\n  FALLA 7) el afiliado ve %s referidos y %s comisiones', v_n, v_c); v_f := v_f + 1;
  end if;

  -- Alta con Google: la app llama a vincular_referido después.
  perform set_config('request.jwt.claims', json_build_object('sub', v_google, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.vincular_referido(v_codigo) into v_b;
  execute 'reset role';
  if v_b and exists (select 1 from public.referrals where referred_user_id = v_google and referrer_id = v_afil) then
    v_res := v_res || E'\n  OK    8) alta con Google: vinculado después';
  else
    v_res := v_res || E'\n  FALLA 8) vincular_referido no vincula'; v_f := v_f + 1;
  end if;

  execute 'set local role authenticated';
  select public.vincular_referido(v_codigo) into v_b;
  execute 'reset role';
  if not v_b then
    v_res := v_res || E'\n  OK    9) no se puede cambiar de afiliado una vez vinculado';
  else
    v_res := v_res || E'\n  FALLA 9) se vincula dos veces'; v_f := v_f + 1;
  end if;

  -- Autorreferencia y cuentas antiguas.
  perform set_config('request.jwt.claims', json_build_object('sub', v_afil, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.vincular_referido(v_codigo) into v_b;
  execute 'reset role';
  if not v_b then
    v_res := v_res || E'\n  OK   10) autorreferencia: rechazada';
  else
    v_res := v_res || E'\n  FALLA 10) uno puede ser su propio afiliado'; v_f := v_f + 1;
  end if;

  select u.id into v_viejo from auth.users u
   where u.created_at < now() - interval '7 days'
     and not exists (select 1 from public.referrals r where r.referred_user_id = u.id)
   limit 1;
  if v_viejo is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_viejo, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select public.vincular_referido(v_codigo) into v_b;
    execute 'reset role';
    if not v_b then
      v_res := v_res || E'\n  OK   11) cuentas de más de 7 días no se pueden vincular';
    else
      v_res := v_res || E'\n  FALLA 11) una cuenta antigua se vincula'; v_f := v_f + 1;
    end if;
  end if;

  raise exception E'PROGRAMA DE AFILIADOS — % fallo(s)\n%\n\n(la transaccion se ha deshecho: no queda nada de esta prueba)',
    v_f, v_res;
end $$;
