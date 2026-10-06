-- Un cliente con facturas no se puede borrar desde la app (06/10/2026).
--
-- CÓMO SE LANZA: pégalo entero en el editor SQL de Supabase, o
--   supabase db query --file supabase/pruebas/clientes-con-facturas.sql
--
-- ES SEGURO EN PRODUCCIÓN: crea una cuenta desechable y termina siempre con
-- una excepción a propósito, que deshace la transacción entera.

do $$
declare
  v_yo uuid := gen_random_uuid();
  v_con uuid; v_sin uuid; v_fac uuid;
  v_res text := ''; v_f int := 0; v_n int;
begin
  insert into auth.users (id, email, created_at, updated_at, aud, role, raw_user_meta_data)
  values (v_yo, 'clientes-prueba@example.com', now(), now(), 'authenticated', 'authenticated', '{"full_name":"Prueba"}');
  update public.profiles set plan = 'Pro' where id = v_yo;  -- Free solo permite 1 cliente

  insert into public.clients (user_id, name, email) values (v_yo, 'Con factura', 'con@example.com') returning id into v_con;
  insert into public.clients (user_id, name, email) values (v_yo, 'Sin factura', 'sin@example.com') returning id into v_sin;
  insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, total_cents, paid)
  values (v_yo, v_con, 'INV-2026-0001', '2026-10-01', '2026-10-31', '[]', 10000, 21, 12100, false) returning id into v_fac;

  perform set_config('request.jwt.claims', json_build_object('sub', v_yo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- 1) Con facturas: no se borra, y el error se reconoce por su código.
  begin
    delete from public.clients where id = v_con;
    v_res := v_res || E'\n  FALLA 1) se ha borrado un cliente con facturas'; v_f := v_f + 1;
  exception when sqlstate 'DF001' then
    v_res := v_res || E'\n  OK    1) con facturas: rechazado (DF001)';
  end;

  -- 2) La factura sigue ahí.
  select count(*) into v_n from public.invoices where id = v_fac;
  if v_n = 1 then v_res := v_res || E'\n  OK    2) la factura se conserva';
  else v_res := v_res || E'\n  FALLA 2) la factura ha desaparecido'; v_f := v_f + 1; end if;

  -- 3) Sin facturas: se borra como siempre.
  delete from public.clients where id = v_sin;
  select count(*) into v_n from public.clients where id = v_sin;
  if v_n = 0 then v_res := v_res || E'\n  OK    3) sin facturas: se borra';
  else v_res := v_res || E'\n  FALLA 3) no se ha borrado el cliente sin facturas'; v_f := v_f + 1; end if;

  execute 'reset role';

  -- 4) El servidor (baja de cuenta) no queda bloqueado.
  begin
    delete from public.clients where id = v_con;
    v_res := v_res || E'\n  OK    4) el servidor sí puede borrarlo (baja de cuenta)';
  exception when others then
    v_res := v_res || E'\n  FALLA 4) el servidor no puede borrar: ' || sqlerrm; v_f := v_f + 1;
  end;

  raise exception E'CLIENTES CON FACTURAS — % fallo(s)\n%\n\n(la transaccion se ha deshecho: no queda nada de esta prueba)', v_f, v_res;
end $$;
