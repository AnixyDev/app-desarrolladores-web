-- Facturas sin IVA a clientes extranjeros: tipo fiscal del cliente, NIF-IVA,
-- motivo obligatorio con IVA 0 % e inmutable tras el registro fiscal.
--
-- CÓMO SE LANZA: pégalo entero en el editor SQL de Supabase, o
--   supabase db query --file supabase/pruebas/facturas-sin-iva.sql
--
-- ES SEGURO EN PRODUCCIÓN: crea un usuario de prueba y termina siempre con una
-- excepción a propósito que deshace la transacción entera. Lee el texto.

do $$
declare
  v_yo   uuid := gen_random_uuid();
  v_ue   uuid;
  v_ue2  uuid;
  v_usa  uuid;
  v_fac  uuid;
  v_res  text := '';
  v_f    int := 0;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at) values
    (v_yo, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'yo-' || v_yo || '@ejemplo.com', '{"full_name":"Yo"}', now());
  update public.profiles set tax_id = '12345678Z', plan = 'Pro' where id = v_yo;

  perform set_config('request.jwt.claims', json_build_object('sub', v_yo, 'role', 'authenticated', 'email', 'yo-' || v_yo || '@ejemplo.com')::text, true);
  execute 'set local role authenticated';

  insert into public.clients (user_id, name, email, tipo_fiscal, nif_iva)
    values (v_yo, 'GmbH', 'de@ejemplo.com', 'empresa_ue', 'DE123456789') returning id into v_ue;
  insert into public.clients (user_id, name, email, tipo_fiscal)
    values (v_yo, 'SAS sin NIF', 'fr@ejemplo.com', 'empresa_ue') returning id into v_ue2;
  insert into public.clients (user_id, name, email, tipo_fiscal)
    values (v_yo, 'Inc', 'us@ejemplo.com', 'fuera_ue') returning id into v_usa;

  -- 1) Los tipos fiscales se guardan.
  if (select tipo_fiscal from public.clients where id = v_usa) = 'fuera_ue'
     and exists (select 1 from public.clients where user_id = v_yo and name = 'GmbH' and tipo_fiscal = 'empresa_ue') then
    v_res := v_res || E'\n  OK    1) tipos fiscales guardados';
  else v_res := v_res || E'\n  FALLA 1) tipos fiscales'; v_f := v_f + 1; end if;

  -- 2) Tipo fiscal inventado: rechazado.
  begin
    update public.clients set tipo_fiscal = 'marte' where id = v_usa;
    v_res := v_res || E'\n  FALLA 2) aceptó un tipo fiscal inventado'; v_f := v_f + 1;
  exception when check_violation then
    v_res := v_res || E'\n  OK    2) tipo fiscal inventado rechazado';
  end;

  -- 3) NIF-IVA mal formado: rechazado.
  begin
    update public.clients set nif_iva = 'de 123' where id = v_ue2;
    v_res := v_res || E'\n  FALLA 3) aceptó un NIF-IVA mal formado'; v_f := v_f + 1;
  exception when check_violation then
    v_res := v_res || E'\n  OK    3) NIF-IVA mal formado rechazado';
  end;

  -- 4) Motivo con IVA distinto de 0 %: rechazado.
  begin
    insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, total_cents, motivo_sin_iva)
    values (v_yo, v_usa, 'PRUEBA-1', current_date, current_date + 15, '[{"description":"Web","quantity":1,"price_cents":10000}]', 10000, 21, 12100, 'no_sujeta_fuera_ue');
    v_res := v_res || E'\n  FALLA 4) aceptó motivo con 21 % de IVA'; v_f := v_f + 1;
  exception when check_violation then
    v_res := v_res || E'\n  OK    4) motivo exige IVA 0 %';
  end;

  -- 5) Empresa de la UE sin NIF-IVA: rechazada.
  begin
    insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, total_cents, motivo_sin_iva)
    values (v_yo, v_ue2, 'PRUEBA-2', current_date, current_date + 15, '[{"description":"Web","quantity":1,"price_cents":10000}]', 10000, 0, 10000, 'inversion_sujeto_pasivo_ue');
    v_res := v_res || E'\n  FALLA 5) facturó a empresa UE sin NIF-IVA'; v_f := v_f + 1;
  exception when raise_exception then
    v_res := v_res || E'\n  OK    5) empresa UE sin NIF-IVA rechazada';
  end;

  -- 6) Empresa de la UE con NIF-IVA y fuera de la UE: aceptadas.
  insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, total_cents, motivo_sin_iva)
  values (v_yo, v_ue, public.generate_invoice_number(v_yo), current_date, current_date + 15, '[{"description":"Web","quantity":1,"price_cents":10000}]', 10000, 0, 10000, 'inversion_sujeto_pasivo_ue')
  returning id into v_fac;
  insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, total_cents, motivo_sin_iva)
  values (v_yo, v_usa, public.generate_invoice_number(v_yo), current_date, current_date + 15, '[{"description":"App","quantity":1,"price_cents":20000}]', 20000, 0, 20000, 'no_sujeta_fuera_ue');
  v_res := v_res || E'\n  OK    6) facturas UE con NIF-IVA y fuera de la UE creadas';

  -- 7) Tras el registro fiscal, el motivo no se puede cambiar.
  perform public.generate_fiscal_record(v_fac);
  begin
    update public.invoices set motivo_sin_iva = 'no_sujeta_fuera_ue' where id = v_fac;
    v_res := v_res || E'\n  FALLA 7) cambió el motivo de una factura registrada'; v_f := v_f + 1;
  exception when raise_exception then
    v_res := v_res || E'\n  OK    7) motivo inmutable tras el registro fiscal';
  end;

  -- 8) Las facturas de siempre (sin motivo, 21 %) siguen funcionando.
  insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, total_cents)
  values (v_yo, v_usa, public.generate_invoice_number(v_yo), current_date, current_date + 15, '[{"description":"Soporte","quantity":1,"price_cents":10000}]', 10000, 21, 12100);
  v_res := v_res || E'\n  OK    8) factura nacional sin motivo sigue funcionando';

  -- 9) Sin motivo explícito, IVA 0 % y cliente de fuera de la UE: se deduce.
  insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, total_cents)
  values (v_yo, v_usa, public.generate_invoice_number(v_yo), current_date, current_date + 15, '[{"description":"API","quantity":1,"price_cents":5000}]', 5000, 0, 5000)
  returning id into v_fac;
  if (select motivo_sin_iva from public.invoices where id = v_fac) = 'no_sujeta_fuera_ue' then
    v_res := v_res || E'\n  OK    9) motivo deducido del cliente de fuera de la UE';
  else v_res := v_res || E'\n  FALLA 9) no dedujo el motivo'; v_f := v_f + 1; end if;

  -- 10) Un borrador que pasa a 21 % pierde el motivo deducido.
  update public.invoices set tax_percent = 21, total_cents = 6050 where id = v_fac;
  if (select motivo_sin_iva from public.invoices where id = v_fac) is null then
    v_res := v_res || E'\n  OK   10) al pasar a 21 % el motivo se quita';
  else v_res := v_res || E'\n  FALLA 10) el motivo se quedó con 21 %'; v_f := v_f + 1; end if;

  -- 11) Cliente nacional con IVA 0 %: sin motivo deducido.
  update public.clients set tipo_fiscal = 'nacional' where id = v_usa;
  insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, total_cents)
  values (v_yo, v_usa, public.generate_invoice_number(v_yo), current_date, current_date + 15, '[{"description":"Curso","quantity":1,"price_cents":5000}]', 5000, 0, 5000)
  returning id into v_fac;
  if (select motivo_sin_iva from public.invoices where id = v_fac) is null then
    v_res := v_res || E'\n  OK   11) cliente nacional al 0 % no recibe motivo';
  else v_res := v_res || E'\n  FALLA 11) cliente nacional recibió motivo'; v_f := v_f + 1; end if;

  raise exception E'RESULTADO (se deshace todo): % fallos%', v_f, v_res;
end $$;
