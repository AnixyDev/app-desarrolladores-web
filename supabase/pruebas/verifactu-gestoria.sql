-- Verifactu: cambios pedidos por la gestoría (07/10/2026).
-- Causa de la rectificativa (R1/R4/R5), envíos completos a la AEAT y
-- conservación de 6 años tras la baja.
--
-- CÓMO SE LANZA: pégalo entero en el editor SQL de Supabase, o
--   supabase db query --file supabase/pruebas/verifactu-gestoria.sql
--
-- ES SEGURO EN PRODUCCIÓN: crea una cuenta desechable y termina siempre con
-- una excepción a propósito, que deshace la transacción entera.

do $$
declare
  v_yo uuid := gen_random_uuid();
  c_es uuid; c_p uuid;
  f1 uuid; f2 uuid; f3 uuid; f4 uuid; fs uuid;
  r public.invoices;
  v_tipo text; v_n int; v_id uuid;
  v_res text := ''; v_f int := 0;
  hoy date := (now() at time zone 'Europe/Madrid')::date;
  arch public.archivo_fiscal_cuentas_eliminadas;
begin
  insert into auth.users (id, email, created_at, updated_at, aud, role, raw_user_meta_data)
  values (v_yo, 'verifactu-gestoria@example.com', now(), now(), 'authenticated', 'authenticated', '{"full_name":"Prueba Gestoria"}');
  update public.profiles set plan = 'Pro', tax_id = '12345678Z', business_name = 'Estudio' where id = v_yo;

  insert into public.clients (user_id, name, email, tax_id) values (v_yo, 'Cliente', 'c@example.com', 'B12345674') returning id into c_es;
  insert into public.clients (user_id, name, email) values (v_yo, 'Particular', 'p@example.com') returning id into c_p;
  insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, total_cents, paid) values
    (v_yo, c_es, 'G-1', hoy, hoy, '[{"description":"Web","quantity":1,"price_cents":10000}]', 10000, 21, 12100, false),
    (v_yo, c_es, 'G-2', hoy, hoy, '[{"description":"Web","quantity":1,"price_cents":10000}]', 10000, 21, 12100, false),
    (v_yo, c_es, 'G-3', hoy, hoy, '[{"description":"Web","quantity":1,"price_cents":10000}]', 10000, 21, 12100, false),
    (v_yo, c_es, 'G-4', hoy, hoy, '[{"description":"Web","quantity":1,"price_cents":10000}]', 10000, 21, 12100, false),
    (v_yo, c_p,  'G-S', hoy, hoy, '[{"description":"Arreglo","quantity":1,"price_cents":10000}]', 10000, 21, 12100, false);
  select id into f1 from public.invoices where user_id = v_yo and invoice_number = 'G-1';
  select id into f2 from public.invoices where user_id = v_yo and invoice_number = 'G-2';
  select id into f3 from public.invoices where user_id = v_yo and invoice_number = 'G-3';
  select id into f4 from public.invoices where user_id = v_yo and invoice_number = 'G-4';
  select id into fs from public.invoices where user_id = v_yo and invoice_number = 'G-S';

  perform set_config('request.jwt.claims', json_build_object('sub', v_yo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.generate_fiscal_record(f1);
  perform public.generate_fiscal_record(f2);
  perform public.generate_fiscal_record(f3);
  perform public.generate_fiscal_record(f4);
  perform public.generate_fiscal_record(fs);

  -- 1) Sin causa no se crea la rectificativa.
  begin
    perform public.crear_factura_rectificativa_causa(f1, '[]', 'x', null);
    v_res := v_res || E'\n  FALLA 1) rectificativa sin causa'; v_f := v_f + 1;
  exception when others then
    v_res := v_res || E'\n  OK    1) sin causa no se crea la rectificativa';
  end;

  -- 2-5) Causa → tipo.
  r := public.crear_factura_rectificativa_causa(f1, '[]', 'Descuento por pronto pago', 'descuento');
  select tipo_factura into v_tipo from public.generate_fiscal_record(r.id);
  if v_tipo = 'R1' and r.causa_rectificacion = 'descuento' then v_res := v_res || E'\n  OK    2) descuento → R1';
  else v_res := v_res || E'\n  FALLA 2) descuento → ' || coalesce(v_tipo, 'null'); v_f := v_f + 1; end if;

  r := public.crear_factura_rectificativa_causa(f2, '[]', 'Encargo cancelado', 'cancelacion');
  select tipo_factura into v_tipo from public.generate_fiscal_record(r.id);
  if v_tipo = 'R1' then v_res := v_res || E'\n  OK    3) cancelación → R1';
  else v_res := v_res || E'\n  FALLA 3) cancelación → ' || coalesce(v_tipo, 'null'); v_f := v_f + 1; end if;

  r := public.crear_factura_rectificativa_causa(f3, '[{"description":"Web","quantity":1,"price_cents":8000}]', 'Horas mal contadas', 'otro');
  select tipo_factura into v_tipo from public.generate_fiscal_record(r.id);
  if v_tipo = 'R4' then v_res := v_res || E'\n  OK    4) otro motivo → R4';
  else v_res := v_res || E'\n  FALLA 4) otro → ' || coalesce(v_tipo, 'null'); v_f := v_f + 1; end if;

  r := public.crear_factura_rectificativa_causa(fs, '[]', 'Anulada', 'error_iva');
  select tipo_factura into v_tipo from public.generate_fiscal_record(r.id);
  if v_tipo = 'R5' then v_res := v_res || E'\n  OK    5) de una simplificada → R5 (sea cual sea la causa)';
  else v_res := v_res || E'\n  FALLA 5) simplificada → ' || coalesce(v_tipo, 'null'); v_f := v_f + 1; end if;

  -- 6) La causa queda bloqueada con el registro.
  begin
    update public.invoices set causa_rectificacion = 'descuento' where id = r.id;
    get diagnostics v_n = row_count;
    if v_n = 0 then v_res := v_res || E'\n  OK    6) la causa no se cambia tras registrar';
    else v_res := v_res || E'\n  FALLA 6) se ha cambiado la causa'; v_f := v_f + 1; end if;
  exception when others then
    v_res := v_res || E'\n  OK    6) la causa no se cambia tras registrar';
  end;

  -- 7) El usuario no puede escribir envíos a la AEAT.
  begin
    insert into public.verifactu_envios (user_id, nif_emisor, entorno, num_registros, peticion_xml)
    values (v_yo, '12345678Z', 'pruebas', 1, '<x/>');
    v_res := v_res || E'\n  FALLA 7) el usuario ha escrito un envío'; v_f := v_f + 1;
  exception when others then
    v_res := v_res || E'\n  OK    7) el usuario no puede inventarse envíos';
  end;

  execute 'reset role';

  -- 8) El servidor guarda el envío completo y lo enlaza; luego no se modifica ni se borra.
  insert into public.verifactu_envios (user_id, nif_emisor, entorno, num_registros, http_status, estado_envio, csv, peticion_xml, respuesta_xml)
  values (v_yo, '12345678Z', 'pruebas', 1, 200, 'Correcto', 'A-PRUEBA', '<peticion/>', '<respuesta/>') returning id into v_id;
  update public.fiscal_records set envio_id = v_id where invoice_id = f4;
  begin
    update public.verifactu_envios set respuesta_xml = 'cambiado' where id = v_id;
    v_res := v_res || E'\n  FALLA 8) se ha modificado un envío'; v_f := v_f + 1;
  exception when insufficient_privilege then
    begin
      delete from public.verifactu_envios where id = v_id;
      v_res := v_res || E'\n  FALLA 8) se ha borrado un envío'; v_f := v_f + 1;
    exception when insufficient_privilege then
      v_res := v_res || E'\n  OK    8) envío guardado y enlazado; no se modifica ni se borra';
    end;
  end;

  -- 9) El dueño ve su envío.
  perform set_config('request.jwt.claims', json_build_object('sub', v_yo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.verifactu_envios where id = v_id;
  execute 'reset role';
  if v_n = 1 then v_res := v_res || E'\n  OK    9) el usuario ve sus envíos';
  else v_res := v_res || E'\n  FALLA 9) no ve su envío'; v_f := v_f + 1; end if;

  -- 10) Baja de cuenta: se archiva 6 años, con los envíos, y se borra todo.
  perform public.eliminar_datos_de_cuenta(v_yo);
  select * into arch from public.archivo_fiscal_cuentas_eliminadas where user_id = v_yo;
  if arch.conservar_hasta = make_date(extract(year from hoy)::int + 6, 12, 31)
     and jsonb_array_length(arch.envios_aeat) = 1
     and not exists (select 1 from public.verifactu_envios where user_id = v_yo)
     and not exists (select 1 from public.fiscal_records where user_id = v_yo) then
    v_res := v_res || E'\n  OK    10) baja: archivo de 6 años con los envíos a la AEAT';
  else v_res := v_res || E'\n  FALLA 10) archivo hasta ' || coalesce(arch.conservar_hasta::text, 'null'); v_f := v_f + 1; end if;

  raise exception E'VERIFACTU GESTORIA — % fallo(s)\n%\n\n(la transaccion se ha deshecho: no queda nada de esta prueba)', v_f, v_res;
end $$;
