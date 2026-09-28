-- Facturas rectificativas: numeración R, importes por diferencias, la
-- original queda marcada, registro fiscal R1 y nadie rectifica facturas ajenas.
--
-- CÓMO SE LANZA: pégalo entero en el editor SQL de Supabase, o
--   supabase db query --file supabase/pruebas/facturas-rectificativas.sql
--
-- ES SEGURO EN PRODUCCIÓN: crea usuarios de prueba y termina siempre con una
-- excepción a propósito que deshace la transacción entera. Lee el texto.

do $$
declare
  v_yo    uuid := gen_random_uuid();
  v_otra  uuid := gen_random_uuid();
  v_cli   uuid;
  v_fac   uuid;
  v_libre uuid;
  v_r     public.invoices%rowtype;
  v_r2    public.invoices%rowtype;
  v_txt   text;
  v_b     boolean;
  v_res   text := '';
  v_f     int := 0;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at) values
    (v_yo,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'yo-'   || v_yo   || '@ejemplo.com', '{"full_name":"Yo"}',   now()),
    (v_otra, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'otra-' || v_otra || '@ejemplo.com', '{"full_name":"Otra"}', now());
  update public.profiles set tax_id = '12345678Z', plan = 'Pro' where id = v_yo;

  perform set_config('request.jwt.claims', json_build_object('sub', v_yo, 'role', 'authenticated', 'email', 'yo-' || v_yo || '@ejemplo.com')::text, true);
  execute 'set local role authenticated';

  insert into public.clients (user_id, name, email) values (v_yo, 'Cliente', 'c@ejemplo.com') returning id into v_cli;
  -- 2 x 100 € + 21 % IVA = 242 €
  insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, total_cents)
  values (v_yo, v_cli, public.generate_invoice_number(v_yo), current_date, current_date + 15,
          '[{"description":"Web","quantity":2,"price_cents":10000}]', 20000, 21, 24200)
  returning id into v_fac;
  insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, total_cents)
  values (v_yo, v_cli, public.generate_invoice_number(v_yo), current_date, current_date + 15,
          '[{"description":"Libre","quantity":1,"price_cents":5000}]', 5000, 21, 6050)
  returning id into v_libre;
  perform public.generate_fiscal_record(v_fac);

  -- 1) Rectificar una factura sin registro fiscal: se edita, no se rectifica.
  begin
    perform public.crear_factura_rectificativa(v_libre, '[]', 'x');
    v_res := v_res || E'\n  FALLA 1) se rectifica una factura sin registro fiscal'; v_f := v_f + 1;
  exception when others then
    v_res := v_res || E'\n  OK    1) sin registro fiscal: se edita, no se rectifica';
  end;

  -- 2) Sin motivo: rechazada.
  begin
    perform public.crear_factura_rectificativa(v_fac, '[{"description":"Web","quantity":1,"price_cents":10000}]', '  ');
    v_res := v_res || E'\n  FALLA 2) rectificativa sin motivo'; v_f := v_f + 1;
  exception when others then
    v_res := v_res || E'\n  OK    2) sin motivo: rechazada';
  end;

  -- 3) Sin cambios: rechazada.
  begin
    perform public.crear_factura_rectificativa(v_fac, '[{"description":"Web","quantity":2,"price_cents":10000}]', 'nada');
    v_res := v_res || E'\n  FALLA 3) rectificativa idéntica a la original'; v_f := v_f + 1;
  exception when others then
    v_res := v_res || E'\n  OK    3) sin cambios: rechazada';
  end;

  -- 4) Rectificativa: 1 x 100 € en vez de 2 → diferencia -100 € (-121 € con IVA).
  select * into v_r from public.crear_factura_rectificativa(v_fac, '[{"description":"Web","quantity":1,"price_cents":10000}]', 'Solo se hizo una página');
  if v_r.invoice_number ~ '^R-[0-9]{4}-0001$' and v_r.subtotal_cents = -10000 and v_r.total_cents = -12100
     and v_r.rectifies_invoice_id = v_fac and jsonb_array_length(v_r.items) = 2 then
    v_res := v_res || E'\n  OK    4) rectificativa ' || v_r.invoice_number || ': -100 € de base, -121 € en total';
  else
    v_res := v_res || format(E'\n  FALLA 4) %s base %s total %s', v_r.invoice_number, v_r.subtotal_cents, v_r.total_cents); v_f := v_f + 1;
  end if;

  select is_rectified into v_b from public.invoices where id = v_fac;
  if v_b then v_res := v_res || E'\n  OK    5) la original queda marcada como rectificada';
  else v_res := v_res || E'\n  FALLA 5) la original no queda marcada'; v_f := v_f + 1; end if;

  -- 6) Dos rectificativas de la misma: no.
  begin
    perform public.crear_factura_rectificativa(v_fac, '[]', 'otra vez');
    v_res := v_res || E'\n  FALLA 6) se rectifica dos veces'; v_f := v_f + 1;
  exception when others then
    v_res := v_res || E'\n  OK    6) la misma factura no se rectifica dos veces';
  end;

  -- 7) Registro fiscal de la rectificativa: tipo R1.
  perform public.generate_fiscal_record(v_r.id);
  select tipo_factura into v_txt from public.fiscal_records where invoice_id = v_r.id and record_type = 'alta';
  if v_txt = 'R1' then v_res := v_res || E'\n  OK    7) registro fiscal de tipo R1';
  else v_res := v_res || E'\n  FALLA 7) tipo ' || coalesce(v_txt, 'null'); v_f := v_f + 1; end if;

  -- 8) Rectificar la rectificativa sin líneas = abono total de ella.
  select * into v_r2 from public.crear_factura_rectificativa(v_r.id, '[]', 'Anulada');
  if v_r2.total_cents = 12100 and v_r2.invoice_number ~ '-0002$' then
    v_res := v_res || E'\n  OK    8) sin líneas: abono total (' || v_r2.invoice_number || ', +121 €)';
  else
    v_res := v_res || format(E'\n  FALLA 8) %s total %s', v_r2.invoice_number, v_r2.total_cents); v_f := v_f + 1;
  end if;

  -- 9) Las facturas normales siguen con su numeración INV.
  select public.generate_invoice_number(v_yo) into v_txt;
  if v_txt ~ '^INV-[0-9]{4}-0003$' then v_res := v_res || E'\n  OK    9) la serie INV sigue a lo suyo (' || v_txt || ')';
  else v_res := v_res || E'\n  FALLA 9) siguiente INV: ' || v_txt; v_f := v_f + 1; end if;

  -- 10) Borrar la segunda rectificativa (sin registro fiscal) libera la primera.
  delete from public.invoices where id = v_r2.id;
  select is_rectified into v_b from public.invoices where id = v_r.id;
  if not v_b then v_res := v_res || E'\n  OK   10) borrar una rectificativa libera la factura que rectificaba';
  else v_res := v_res || E'\n  FALLA 10) sigue marcada como rectificada'; v_f := v_f + 1; end if;
  execute 'reset role';

  -- 11) Otra usuaria no puede rectificar mis facturas.
  perform set_config('request.jwt.claims', json_build_object('sub', v_otra, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.crear_factura_rectificativa(v_r.id, '[]', 'ajena');
    v_res := v_res || E'\n  FALLA 11) rectifica una factura ajena'; v_f := v_f + 1;
  exception when others then
    v_res := v_res || E'\n  OK   11) factura ajena: no se puede rectificar';
  end;
  execute 'reset role';

  raise exception E'FACTURAS RECTIFICATIVAS — % fallo(s)\n%\n\n(la transaccion se ha deshecho: no queda nada de esta prueba)',
    v_f, v_res;
end $$;
