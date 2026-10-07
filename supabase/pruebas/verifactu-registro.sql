-- Verifactu, fase 1: registro de facturación con el formato oficial (07/10/2026).
--
-- CÓMO SE LANZA: pégalo entero en el editor SQL de Supabase, o
--   supabase db query --file supabase/pruebas/verifactu-registro.sql
--
-- ES SEGURO EN PRODUCCIÓN: crea una cuenta desechable y termina siempre con
-- una excepción a propósito, que deshace la transacción entera.

do $$
declare
  v_yo uuid := gen_random_uuid();
  c_es uuid; c_sin_nif uuid; c_ue uuid; c_fuera uuid;
  f1 uuid; f2 uuid; f3 uuid; f4 uuid; f5 uuid; f6 uuid; f7 uuid; f8 uuid;
  r public.fiscal_records; r1 public.fiscal_records; r2 public.fiscal_records;
  v_res text := ''; v_f int := 0; v_n int; v_txt text;
  hoy date := (now() at time zone 'Europe/Madrid')::date;
  v_inval int;
begin
  insert into auth.users (id, email, created_at, updated_at, aud, role, raw_user_meta_data)
  values (v_yo, 'verifactu-prueba@example.com', now(), now(), 'authenticated', 'authenticated', '{"full_name":"Prueba Verifactu"}');
  update public.profiles set plan = 'Pro', tax_id = '12345678z', business_name = 'Estudio de Prueba' where id = v_yo;

  insert into public.clients (user_id, name, email, tax_id) values (v_yo, 'Cliente España', 'es@example.com', 'B-1234567-8') returning id into c_es;
  insert into public.clients (user_id, name, email) values (v_yo, 'Particular sin NIF', 'p@example.com') returning id into c_sin_nif;
  insert into public.clients (user_id, name, email, tipo_fiscal, nif_iva) values (v_yo, 'Empresa Francia', 'fr@example.com', 'empresa_ue', 'FR12345678901') returning id into c_ue;
  insert into public.clients (user_id, name, email, tipo_fiscal, pais, es_particular, tax_id) values (v_yo, 'Particular EE. UU.', 'us@example.com', 'fuera_ue', 'US', true, 'X1234567') returning id into c_fuera;

  insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, irpf_percent, total_cents, paid)
  values (v_yo, c_es, 'F-2026-0001', hoy, hoy, '[{"description":"Desarrollo web","quantity":1,"price_cents":100000}]', 100000, 21, 15, 106000, false) returning id into f1;
  insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, total_cents, paid)
  values (v_yo, c_es, 'F-2026-0002', hoy, hoy, '[{"description":"Mantenimiento","quantity":1,"price_cents":5000}]', 5000, 21, 6050, false) returning id into f2;
  insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, total_cents, paid)
  values (v_yo, c_ue, 'F-2026-0003', hoy, hoy, '[{"description":"API","quantity":2,"price_cents":30000}]', 60000, 0, 60000, false) returning id into f3;
  insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, total_cents, paid)
  values (v_yo, c_fuera, 'F-2026-0004', hoy, hoy, '[{"description":"App","quantity":1,"price_cents":80000}]', 80000, 0, 80000, false) returning id into f4;
  insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, total_cents, paid)
  values (v_yo, c_sin_nif, 'F-2026-0005', hoy, hoy, '[{"description":"Arreglo","quantity":1,"price_cents":30000}]', 30000, 21, 36300, false) returning id into f5;
  insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, total_cents, paid)
  values (v_yo, c_sin_nif, 'F-2026-0006', hoy, hoy, '[{"description":"Web","quantity":1,"price_cents":50000}]', 50000, 21, 60500, false) returning id into f6;
  insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, total_cents, paid)
  values (v_yo, c_es, 'F-2026-0007', hoy, hoy, '[{"description":"X","quantity":1,"price_cents":1000}]', 1000, 0, 1000, false) returning id into f7;
  insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, total_cents, paid)
  values (v_yo, c_es, 'F-2026-0008', hoy + 3, hoy + 3, '[{"description":"X","quantity":1,"price_cents":1000}]', 1000, 21, 1210, false) returning id into f8;

  -- 1) Huella: ejemplo oficial de la AEAT.
  v_txt := public.verifactu_huella_alta('89890001K', '12345678/G33', '01-01-2024', 'F1', '12.35', '123.45', null, '2024-01-01T19:20:30+01:00');
  if v_txt = '3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60' then v_res := v_res || E'\n  OK    1) huella del ejemplo oficial de la AEAT';
  else v_res := v_res || E'\n  FALLA 1) huella del ejemplo oficial: ' || v_txt; v_f := v_f + 1; end if;

  -- 2) Fecha, hora y huso.
  v_txt := public.verifactu_fecha_hora_huso('2024-01-01 18:20:30+00');
  if v_txt = '2024-01-01T19:20:30+01:00' and public.verifactu_fecha_hora_huso('2026-07-01 10:00:00+00') = '2026-07-01T12:00:00+02:00' then
    v_res := v_res || E'\n  OK    2) fecha y hora de Madrid con huso (+01:00 en invierno, +02:00 en verano)';
  else v_res := v_res || E'\n  FALLA 2) fecha-hora-huso: ' || v_txt; v_f := v_f + 1; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_yo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- 3) Factura nacional con NIF: F1, importe sin IRPF, primer registro.
  r1 := public.generate_fiscal_record(f1);
  if r1.tipo_factura = 'F1' and r1.importe_total_cents = 121000 and r1.cuota_total_cents = 21000
     and r1.nif_emisor = '12345678Z' and r1.hash ~ '^[0-9A-F]{64}$'
     and r1.registro->'Encadenamiento'->>'PrimerRegistro' = 'S'
     and r1.registro->'Destinatarios'->0->>'NIF' = 'B12345678'
     and r1.registro->'Desglose'->0->>'CalificacionOperacion' = 'S1'
     and r1.registro->'Desglose'->0->>'TipoImpositivo' = '21.00'
     and r1.registro->>'ImporteTotal' = '1210.00'
     and r1.hash = public.verifactu_huella_alta('12345678Z', 'F-2026-0001', to_char(hoy, 'DD-MM-YYYY'), 'F1', '210.00', '1210.00', null, r1.fecha_hora_huso)
  then v_res := v_res || E'\n  OK    3) F1 nacional: NIF normalizado, IRPF fuera del importe, primer registro';
  else v_res := v_res || E'\n  FALLA 3) F1 nacional: ' || row_to_json(r1)::text; v_f := v_f + 1; end if;

  -- 4) La segunda encadena con la primera.
  r2 := public.generate_fiscal_record(f2);
  if r2.hash_anterior = r1.hash
     and r2.registro->'Encadenamiento'->'RegistroAnterior'->>'Huella' = r1.hash
     and r2.registro->'Encadenamiento'->'RegistroAnterior'->>'NumSerieFactura' = 'F-2026-0001'
     and r2.hash_input like '%&Huella=' || r1.hash || '&%'
  then v_res := v_res || E'\n  OK    4) encadenamiento con el registro anterior';
  else v_res := v_res || E'\n  FALLA 4) encadenamiento'; v_f := v_f + 1; end if;

  -- 5) Empresa de la UE: no sujeta (N2), NIF-IVA como IDOtro 02, sin cuota.
  r := public.generate_fiscal_record(f3);
  if r.tipo_factura = 'F1' and r.cuota_total_cents = 0 and r.importe_total_cents = 60000
     and r.registro->'Desglose'->0->>'CalificacionOperacion' = 'N2'
     and r.registro->'Desglose'->0 ? 'TipoImpositivo' = false
     and r.registro->'Destinatarios'->0->'IDOtro'->>'IDType' = '02'
     and r.registro->'Destinatarios'->0->'IDOtro'->>'ID' = 'FR12345678901'
  then v_res := v_res || E'\n  OK    5) empresa de la UE: N2 e IDOtro 02';
  else v_res := v_res || E'\n  FALLA 5) empresa UE: ' || r.registro::text; v_f := v_f + 1; end if;

  -- 6) Particular de fuera de la UE: motivo propio, IDOtro 03 con país.
  select motivo_sin_iva into v_txt from public.invoices where id = f4;
  r := public.generate_fiscal_record(f4);
  if v_txt = 'no_sujeta_fuera_ue_particular'
     and r.registro->'Desglose'->0->>'CalificacionOperacion' = 'N2'
     and r.registro->'Destinatarios'->0->'IDOtro'->>'CodigoPais' = 'US'
     and r.registro->'Destinatarios'->0->'IDOtro'->>'IDType' = '03'
  then v_res := v_res || E'\n  OK    6) particular de fuera de la UE: art. 69.Dos e IDOtro 03';
  else v_res := v_res || E'\n  FALLA 6) particular fuera UE: ' || coalesce(v_txt, 'null') || ' ' || r.registro::text; v_f := v_f + 1; end if;

  -- 7) Sin NIF y hasta 400 €: simplificada (F2) sin destinatario.
  r := public.generate_fiscal_record(f5);
  if r.tipo_factura = 'F2' and not (r.registro ? 'Destinatarios') then v_res := v_res || E'\n  OK    7) sin NIF y 363 €: factura simplificada F2';
  else v_res := v_res || E'\n  FALLA 7) F2: ' || r.registro::text; v_f := v_f + 1; end if;

  -- 8) Sin NIF y más de 400 €: no se registra.
  begin
    perform public.generate_fiscal_record(f6);
    v_res := v_res || E'\n  FALLA 8) se ha registrado una factura de 605 € sin identificar al cliente'; v_f := v_f + 1;
  exception when sqlstate 'P0001' then
    v_res := v_res || E'\n  OK    8) sin NIF y 605 €: pide identificar al cliente';
  end;

  -- 9) Cliente de España sin IVA: no se registra.
  begin
    perform public.generate_fiscal_record(f7);
    v_res := v_res || E'\n  FALLA 9) se ha registrado una factura nacional sin IVA'; v_f := v_f + 1;
  exception when sqlstate 'P0001' then
    v_res := v_res || E'\n  OK    9) cliente de España sin IVA: rechazada';
  end;

  -- 10) Fecha futura: no se registra.
  begin
    perform public.generate_fiscal_record(f8);
    v_res := v_res || E'\n  FALLA 10) se ha registrado una factura con fecha futura'; v_f := v_f + 1;
  exception when sqlstate 'P0001' then
    v_res := v_res || E'\n  OK    10) fecha futura: rechazada';
  end;

  -- 11) Rectificativa: R1 por diferencias, con la factura rectificada.
  select id into f6 from public.crear_factura_rectificativa(f2, '[{"description":"Mantenimiento","quantity":1,"price_cents":4000}]', 'Precio mal puesto');
  r := public.generate_fiscal_record(f6);
  if r.tipo_factura = 'R1' and r.registro->>'TipoRectificativa' = 'I'
     and r.registro->'FacturasRectificadas'->0->>'NumSerieFactura' = 'F-2026-0002'
     and r.cuota_total_cents = -210 and r.registro->>'ImporteTotal' = '-12.10'
  then v_res := v_res || E'\n  OK    11) rectificativa R1 por diferencias (importe negativo)';
  else v_res := v_res || E'\n  FALLA 11) rectificativa: ' || r.registro::text; v_f := v_f + 1; end if;

  -- 12) Anulación: huella propia y encadenada.
  r := public.generate_fiscal_cancellation(f5);
  select hash into v_txt from public.fiscal_records where user_id = v_yo and record_type = 'alta' and invoice_id = f6;
  if r.record_type = 'anulacion' and r.hash_anterior = v_txt
     and r.registro->'IDFactura'->>'NumSerieFacturaAnulada' = 'F-2026-0005'
     and r.hash = public.verifactu_huella_anulacion('12345678Z', 'F-2026-0005', to_char(hoy, 'DD-MM-YYYY'), v_txt, r.fecha_hora_huso)
  then v_res := v_res || E'\n  OK    12) anulación con su huella oficial, encadenada';
  else v_res := v_res || E'\n  FALLA 12) anulación: ' || row_to_json(r)::text; v_f := v_f + 1; end if;

  -- 13) La cadena entera es válida.
  select count(*) filter (where not is_valid), count(*) into v_inval, v_n from public.verify_fiscal_chain(v_yo);
  if v_inval = 0 and v_n = 7 then v_res := v_res || E'\n  OK    13) verify_fiscal_chain: 7 registros válidos';
  else v_res := v_res || E'\n  FALLA 13) verify_fiscal_chain: ' || v_inval || ' inválidos de ' || v_n; v_f := v_f + 1; end if;

  -- 14) El usuario no puede escribir en el registro.
  begin
    update public.fiscal_records set hash = 'X' where user_id = v_yo;
    get diagnostics v_n = row_count;
    if v_n = 0 then v_res := v_res || E'\n  OK    14) el usuario no puede tocar el registro';
    else v_res := v_res || E'\n  FALLA 14) el usuario ha modificado el registro'; v_f := v_f + 1; end if;
  exception when insufficient_privilege then
    v_res := v_res || E'\n  OK    14) el usuario no puede tocar el registro';
  end;

  execute 'reset role';

  -- 15) Si alguien manipula un registro, la cadena lo detecta.
  update public.fiscal_records set hash_input = replace(hash_input, 'Desarrollo', 'X'), importe_total_cents = 1 where invoice_id = f1;
  update public.fiscal_records set hash = 'A' || substr(hash, 2) where invoice_id = f3;
  perform set_config('request.jwt.claims', json_build_object('sub', v_yo, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.verify_fiscal_chain(v_yo) where not is_valid;
  if v_n >= 1 then v_res := v_res || E'\n  OK    15) una huella manipulada se detecta';
  else v_res := v_res || E'\n  FALLA 15) no se detecta la manipulación'; v_f := v_f + 1; end if;

  raise exception E'VERIFACTU REGISTRO — % fallo(s)\n%\n\n(la transaccion se ha deshecho: no queda nada de esta prueba)', v_f, v_res;
end $$;
