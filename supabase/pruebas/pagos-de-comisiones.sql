-- Comprobación del panel de pagos de comisiones: solo Admin puede ver y
-- marcar pagos, el importe tiene que cuadrar con lo que se vio, no se paga
-- dos veces, y el afiliado ve sus pagos pero no puede inventarlos.
--
-- CÓMO SE LANZA: pégalo entero en el editor SQL de Supabase, o
--   supabase db query --file supabase/pruebas/pagos-de-comisiones.sql
--
-- ES SEGURO EN PRODUCCIÓN: crea usuarios de prueba y termina siempre con una
-- excepción a propósito que deshace la transacción entera. El resultado
-- aparece como un mensaje de error: eso es lo normal. Lee el texto.

do $$
declare
  v_admin  uuid;
  v_afil   uuid := gen_random_uuid();
  v_ref    uuid := gen_random_uuid();
  v_codigo text;
  v_n      int;
  v_big    bigint;
  v_pago   public.pagos_afiliado;
  v_res    text := '';
  v_f      int := 0;
begin
  select id into v_admin from public.profiles where lower(role) = 'admin' limit 1;
  if v_admin is null then
    raise exception 'No hay ningún perfil Admin con el que probar.';
  end if;

  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at)
  values (v_afil, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'afil-' || v_afil || '@ejemplo.com', '{"full_name":"Afiliada Prueba"}', now());
  select affiliate_code into v_codigo from public.profiles where id = v_afil;
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at)
  values (v_ref, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'ref-' || v_ref || '@ejemplo.com', json_build_object('full_name', 'Lucía', 'ref', v_codigo)::jsonb, now());

  execute 'set local role service_role';
  perform public.registrar_comision_afiliado(v_ref, 'in_pago_1', 995);
  perform public.registrar_comision_afiliado(v_ref, 'in_pago_2', 995);
  execute 'reset role';

  -- 1. Un usuario normal (la propia afiliada) no puede usar el panel.
  perform set_config('request.jwt.claims', json_build_object('sub', v_afil, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform * from public.admin_resumen_afiliados();
    v_res := v_res || E'\n  FALLA 1) un usuario normal ve el resumen'; v_f := v_f + 1;
  exception when insufficient_privilege then
    v_res := v_res || E'\n  OK    1) resumen: solo Admin';
  end;
  begin
    perform public.admin_marcar_comisiones_pagadas(v_afil, 398, null);
    v_res := v_res || E'\n  FALLA 2) un usuario normal marca pagos'; v_f := v_f + 1;
  exception when insufficient_privilege then
    v_res := v_res || E'\n  OK    2) marcar pagado: solo Admin';
  end;
  begin
    insert into public.pagos_afiliado (referrer_id, importe_cents, num_comisiones) values (v_afil, 999999, 1);
    v_res := v_res || E'\n  FALLA 3) el afiliado se inventa un pago'; v_f := v_f + 1;
  exception when insufficient_privilege then
    v_res := v_res || E'\n  OK    3) inventarse pagos: rechazado';
  end;
  execute 'reset role';

  -- 4. Admin ve lo pendiente.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select pendiente_cents into v_big from public.admin_resumen_afiliados() where referrer_id = v_afil;
  select count(*) into v_n from public.admin_comisiones_pendientes(v_afil);
  if v_big = 398 and v_n = 2 then
    v_res := v_res || E'\n  OK    4) Admin ve 3,98 € pendientes en 2 comisiones';
  else
    v_res := v_res || format(E'\n  FALLA 4) pendiente %s en %s comisiones', v_big, v_n); v_f := v_f + 1;
  end if;

  -- 5. Si el importe no cuadra con lo que se vio, no se marca nada.
  begin
    perform public.admin_marcar_comisiones_pagadas(v_afil, 199, 'prueba');
    v_res := v_res || E'\n  FALLA 5) se marca un importe que no cuadra'; v_f := v_f + 1;
  exception when serialization_failure then
    v_res := v_res || E'\n  OK    5) importe distinto del visto: rechazado';
  end;

  -- 6. Pago correcto.
  select * into v_pago from public.admin_marcar_comisiones_pagadas(v_afil, 398, 'Bizum de prueba');
  select pendiente_cents into v_big from public.admin_resumen_afiliados() where referrer_id = v_afil;
  if v_pago.importe_cents = 398 and v_pago.num_comisiones = 2 and v_big = 0 then
    v_res := v_res || E'\n  OK    6) pago registrado y nada pendiente';
  else
    v_res := v_res || format(E'\n  FALLA 6) pago %s, pendiente %s', v_pago.importe_cents, v_big); v_f := v_f + 1;
  end if;

  -- 7. Doble clic: no se paga dos veces.
  begin
    perform public.admin_marcar_comisiones_pagadas(v_afil, 398, null);
    v_res := v_res || E'\n  FALLA 7) se paga dos veces'; v_f := v_f + 1;
  exception when no_data_found then
    v_res := v_res || E'\n  OK    7) segundo pago: rechazado';
  end;
  execute 'reset role';

  -- 8. La afiliada ve su pago y sus comisiones ya cobradas.
  perform set_config('request.jwt.claims', json_build_object('sub', v_afil, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.pagos_afiliado;
  select count(*) into v_big from public.comisiones_afiliado where pago_id is not null;
  execute 'reset role';
  if v_n = 1 and v_big = 2 then
    v_res := v_res || E'\n  OK    8) la afiliada ve su pago y sus comisiones cobradas';
  else
    v_res := v_res || format(E'\n  FALLA 8) ve %s pagos y %s cobradas', v_n, v_big); v_f := v_f + 1;
  end if;

  raise exception E'PAGOS DE COMISIONES — % fallo(s)\n%\n\n(la transaccion se ha deshecho: no queda nada de esta prueba)',
    v_f, v_res;
end $$;
