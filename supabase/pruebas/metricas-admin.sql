-- Comprobación: las cifras del panel de administración solo las ve Admin, y
-- un cobro apuntado dos veces (reintento de Stripe) cuenta una sola vez.
--
-- CÓMO SE LANZA: pégalo entero en el editor SQL de Supabase, o
--   supabase db query --file supabase/pruebas/metricas-admin.sql
--
-- ES SEGURO EN PRODUCCIÓN: termina siempre con una excepción a propósito que
-- deshace la transacción entera. Lee el texto del mensaje.

do $$
declare
  v_admin uuid;
  v_otro  uuid;
  v_antes bigint;
  r       record;
  v_res   text := '';
  v_f     int := 0;
begin
  select id into v_admin from public.profiles where lower(role) = 'admin' limit 1;
  select id into v_otro from public.profiles where lower(coalesce(role, '')) <> 'admin' limit 1;
  if v_admin is null or v_otro is null then
    raise exception 'Hace falta un perfil Admin y otro que no lo sea.';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_otro, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform * from public.admin_metricas();
    v_res := v_res || E'\n  FALLA 1) un usuario normal ve las métricas'; v_f := v_f + 1;
  exception when insufficient_privilege then
    v_res := v_res || E'\n  OK    1) métricas: solo Admin';
  end;
  execute 'reset role';

  select coalesce(sum(amount_cents), 0) into v_antes from public.platform_payments;

  -- Lo que hace stripe-webhook con un cobro, y el reintento del mismo evento.
  execute 'set local role service_role';
  insert into public.platform_payments (user_id, user_email, plan_name, amount_cents, stripe_session_id)
  values (v_otro, 'x@ejemplo.com', 'Freelancer Pro', 995, 'in_prueba_metricas');
  insert into public.platform_payments (user_id, user_email, plan_name, amount_cents, stripe_session_id)
  values (v_otro, 'x@ejemplo.com', 'Freelancer Pro', 995, 'in_prueba_metricas')
  on conflict (stripe_session_id) do nothing;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select * into r from public.admin_metricas();
  execute 'reset role';

  if r.ingresos_total_cents = v_antes + 995 and r.usuarios_total > 0 then
    v_res := v_res || format(E'\n  OK    2) Admin ve %s usuarios y el cobro contado una vez', r.usuarios_total);
  else
    v_res := v_res || format(E'\n  FALLA 2) métricas: %s', row_to_json(r)); v_f := v_f + 1;
  end if;

  raise exception E'MÉTRICAS DEL PANEL — % fallo(s)\n%\n\n(la transaccion se ha deshecho: no queda nada de esta prueba)',
    v_f, v_res;
end $$;
