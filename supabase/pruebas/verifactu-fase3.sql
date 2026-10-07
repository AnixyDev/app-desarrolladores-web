-- Verifactu, fase 3: subsanación, anulación sin registro previo, NIF con
-- control y protección del registro fiscal (07/10/2026).
--
-- CÓMO SE LANZA: pégalo entero en el editor SQL de Supabase, o
--   supabase db query --file supabase/pruebas/verifactu-fase3.sql
--
-- ES SEGURO EN PRODUCCIÓN: crea una cuenta desechable y termina siempre con
-- una excepción a propósito, que deshace la transacción entera.

do $$
declare
  v_yo uuid := gen_random_uuid();
  v_otro uuid := gen_random_uuid();
  c_mal uuid; c_bien uuid;
  f1 uuid; f2 uuid; f3 uuid;
  r1 public.fiscal_records; r2 public.fiscal_records; r3 public.fiscal_records; ra public.fiscal_records;
  v_res text := ''; v_f int := 0; v_n int; v_ok boolean;
  hoy date := (now() at time zone 'Europe/Madrid')::date;
begin
  -- 1) NIF con control (mismos casos que src/test/verifactu-nif.test.ts).
  select bool_and(public.verifactu_nif_valido(n)) into v_ok
    from unnest(array['74870299D','12345678Z','X1234567L','Y1234567X','Z1234567R','K1234567L','Q2826000H','B12345674','A58818501','S2800568D','G12345674','G1234567D']) n;
  select count(*) into v_n
    from unnest(array['74870299A','12345678A','X1234567A','Q2826000A','Q28260008','B12345678','B1234567D','A5881850A','1234567Z','','ABCDEFGHI','I12345674']) n
   where public.verifactu_nif_valido(n);
  if v_ok and v_n = 0 then v_res := v_res || E'\n  OK    1) NIF español con su letra o dígito de control';
  else v_res := v_res || E'\n  FALLA 1) control del NIF (válidos ok: ' || v_ok || ', inválidos aceptados: ' || v_n || ')'; v_f := v_f + 1; end if;

  insert into auth.users (id, email, created_at, updated_at, aud, role, raw_user_meta_data) values
    (v_yo, 'verifactu-f3@example.com', now(), now(), 'authenticated', 'authenticated', '{"full_name":"Prueba Fase Tres"}'),
    (v_otro, 'verifactu-f3-otro@example.com', now(), now(), 'authenticated', 'authenticated', '{"full_name":"Otra Cuenta"}');
  update public.profiles set plan = 'Pro', tax_id = '12345678Z', business_name = 'Estudio', veri_factu_modality = 'verifactu' where id = v_yo;

  -- Un cliente con la letra del NIF mal y otro bien.
  insert into public.clients (user_id, name, email, tax_id) values (v_yo, 'Cliente Mal', 'mal@example.com', 'B12345678') returning id into c_mal;
  insert into public.clients (user_id, name, email, tax_id) values (v_yo, 'Cliente Bien', 'bien@example.com', 'B12345674') returning id into c_bien;
  insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, total_cents, paid)
  values (v_yo, c_mal, 'F3-0001', hoy, hoy, '[{"description":"Web","quantity":1,"price_cents":10000}]', 10000, 21, 12100, false) returning id into f1;
  insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, total_cents, paid)
  values (v_yo, c_bien, 'F3-0002', hoy, hoy, '[{"description":"Web","quantity":1,"price_cents":10000}]', 10000, 21, 12100, false) returning id into f2;
  insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, total_cents, paid)
  values (v_yo, c_bien, 'F3-0003', hoy, hoy, '[{"description":"Web","quantity":1,"price_cents":10000}]', 10000, 21, 12100, false) returning id into f3;

  perform set_config('request.jwt.claims', json_build_object('sub', v_yo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- 2) Un NIF de cliente con la letra mal no se registra (la AEAT lo rechazaría).
  begin
    perform public.generate_fiscal_record(f1);
    v_res := v_res || E'\n  FALLA 2) se ha registrado un NIF de cliente inválido'; v_f := v_f + 1;
  exception when others then
    if sqlerrm like '%revisa que esté bien escrito%' then v_res := v_res || E'\n  OK    2) NIF de cliente con la letra mal: no se registra y se explica';
    else v_res := v_res || E'\n  FALLA 2) error inesperado: ' || sqlerrm; v_f := v_f + 1; end if;
  end;

  r1 := public.generate_fiscal_record(f2);
  r3 := public.generate_fiscal_record(f3);

  -- 3) No se corrige lo que no está rechazado.
  begin
    perform public.subsanar_registro_fiscal(r1.id);
    v_res := v_res || E'\n  FALLA 3) se ha subsanado un registro pendiente'; v_f := v_f + 1;
  exception when others then
    v_res := v_res || E'\n  OK    3) un registro pendiente no se puede «corregir y reenviar»';
  end;

  -- La AEAT lo rechaza (lo escribe el servidor).
  execute 'reset role';
  update public.fiscal_records set estado_envio = 'rechazado', envio_error_codigo = '1239',
         envio_error_descripcion = 'El NIF no está identificado en el censo de la AEAT.' where id = r1.id;
  update public.fiscal_records set estado_envio = 'rechazado', envio_error_codigo = '1239' where id = r3.id;
  execute 'set local role authenticated';

  -- 4) Otra cuenta no puede subsanar mis registros.
  perform set_config('request.jwt.claims', json_build_object('sub', v_otro, 'role', 'authenticated')::text, true);
  begin
    perform public.subsanar_registro_fiscal(r1.id);
    v_res := v_res || E'\n  FALLA 4) otra cuenta ha subsanado mi registro'; v_f := v_f + 1;
  exception when others then
    v_res := v_res || E'\n  OK    4) otra cuenta no puede corregir mis registros';
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_yo, 'role', 'authenticated')::text, true);

  -- 5) Subsanación tras rechazo: Subsanacion=S, RechazoPrevio=X, misma factura, encadenada y pendiente.
  r2 := public.subsanar_registro_fiscal(r1.id);
  if r2.subsana_registro_id = r1.id and r2.invoice_id = f2 and r2.record_type = 'alta'
     and r2.registro->>'Subsanacion' = 'S' and r2.registro->>'RechazoPrevio' = 'X'
     and r2.numero_factura = r1.numero_factura and r2.hash_anterior = r3.hash
     and r2.registro->'Encadenamiento'->'RegistroAnterior'->>'Huella' = r3.hash
     and r2.estado_envio = 'pendiente' and r2.hash <> r1.hash then
    v_res := v_res || E'\n  OK    5) subsanación tras rechazo: S + X, misma factura, encadenada y pendiente';
  else v_res := v_res || E'\n  FALLA 5) subsanación mal formada: ' || r2.registro::text; v_f := v_f + 1; end if;

  -- 6) Cada registro se subsana una vez.
  begin
    perform public.subsanar_registro_fiscal(r1.id);
    v_res := v_res || E'\n  FALLA 6) se ha subsanado dos veces el mismo registro'; v_f := v_f + 1;
  exception when others then
    v_res := v_res || E'\n  OK    6) un registro se corrige una sola vez';
  end;

  -- 7) Aceptado con errores: subsanación sin RechazoPrevio (la AEAT ya lo tiene).
  execute 'reset role';
  update public.fiscal_records set estado_envio = 'aceptado_con_errores' where id = r2.id;
  execute 'set local role authenticated';
  ra := public.subsanar_registro_fiscal(r2.id);
  if ra.registro->>'Subsanacion' = 'S' and not (ra.registro ? 'RechazoPrevio') and ra.subsana_registro_id = r2.id then
    v_res := v_res || E'\n  OK    7) aceptado con errores: subsanación sin RechazoPrevio';
  else v_res := v_res || E'\n  FALLA 7) ' || ra.registro::text; v_f := v_f + 1; end if;

  -- 8) Anular una factura que la AEAT no tiene: SinRegistroPrevio=S (si no, 3002).
  ra := public.generate_fiscal_cancellation(f3);
  if ra.registro->>'SinRegistroPrevio' = 'S' then
    v_res := v_res || E'\n  OK    8) anulación de una factura rechazada: SinRegistroPrevio=S';
  else v_res := v_res || E'\n  FALLA 8) ' || ra.registro::text; v_f := v_f + 1; end if;

  -- 9) Anulación de una factura que la AEAT sí tiene: sin marca.
  ra := public.generate_fiscal_cancellation(f2);
  if not (ra.registro ? 'SinRegistroPrevio') then
    v_res := v_res || E'\n  OK    9) anulación de una factura aceptada: sin marca';
  else v_res := v_res || E'\n  FALLA 9) ' || ra.registro::text; v_f := v_f + 1; end if;

  -- 10) Una factura anulada ya no se reenvía.
  begin
    perform public.subsanar_registro_fiscal(r3.id);
    v_res := v_res || E'\n  FALLA 10) se ha reenviado una factura anulada'; v_f := v_f + 1;
  exception when others then
    v_res := v_res || E'\n  OK    10) una factura anulada no se reenvía';
  end;

  -- 11) La cadena sigue íntegra con subsanaciones y anulaciones.
  select count(*) into v_n from public.verify_fiscal_chain(v_yo) where not is_valid;
  if v_n = 0 then v_res := v_res || E'\n  OK    11) la cadena sigue íntegra (6 registros)';
  else v_res := v_res || E'\n  FALLA 11) cadena rota en ' || v_n || ' registro(s)'; v_f := v_f + 1; end if;

  -- 12) El usuario no puede borrar ni vaciar el registro fiscal.
  begin
    delete from public.fiscal_records where user_id = v_yo;
    get diagnostics v_n = row_count;
    if v_n = 0 then v_res := v_res || E'\n  OK    12) el usuario no puede borrar registros fiscales';
    else v_res := v_res || E'\n  FALLA 12) el usuario ha borrado ' || v_n || ' registros'; v_f := v_f + 1; end if;
  exception when others then
    v_res := v_res || E'\n  OK    12) el usuario no puede borrar registros fiscales';
  end;
  begin
    execute 'truncate public.fiscal_records';
    v_res := v_res || E'\n  FALLA 13) el usuario ha vaciado el registro fiscal'; v_f := v_f + 1;
  exception when others then
    v_res := v_res || E'\n  OK    13) el usuario no puede vaciar el registro fiscal';
  end;

  execute 'reset role';

  -- 14) Ni el servidor borra un registro fiscal (solo la baja de cuenta)…
  begin
    delete from public.fiscal_records where id = r1.id;
    v_res := v_res || E'\n  FALLA 14) el servidor ha borrado un registro fiscal'; v_f := v_f + 1;
  exception when insufficient_privilege then
    v_res := v_res || E'\n  OK    14) ni el servidor borra un registro fiscal';
  end;
  begin
    execute 'truncate public.fiscal_records';
    v_res := v_res || E'\n  FALLA 15) el servidor ha vaciado el registro fiscal'; v_f := v_f + 1;
  exception when insufficient_privilege then
    v_res := v_res || E'\n  OK    15) ni el servidor vacía el registro fiscal';
  end;

  -- 16) …ni cambia a qué registro subsana otro.
  begin
    update public.fiscal_records set subsana_registro_id = null where id = r2.id;
    v_res := v_res || E'\n  FALLA 16) se ha cambiado subsana_registro_id'; v_f := v_f + 1;
  exception when insufficient_privilege then
    v_res := v_res || E'\n  OK    16) la relación de subsanación es inmutable';
  end;

  -- 17) La baja de cuenta sí los borra (después de archivarlos).
  perform public.eliminar_datos_de_cuenta(v_yo);
  select count(*) into v_n from public.fiscal_records where user_id = v_yo;
  if v_n = 0 and exists (select 1 from public.archivo_fiscal_cuentas_eliminadas where user_id = v_yo and jsonb_array_length(registros_fiscales) = 6) then
    v_res := v_res || E'\n  OK    17) la baja de cuenta archiva y borra los 6 registros';
  else v_res := v_res || E'\n  FALLA 17) baja de cuenta: quedan ' || v_n || ' registros'; v_f := v_f + 1; end if;

  raise exception E'VERIFACTU FASE 3 — % fallo(s)\n%\n\n(la transaccion se ha deshecho: no queda nada de esta prueba)', v_f, v_res;
end $$;
