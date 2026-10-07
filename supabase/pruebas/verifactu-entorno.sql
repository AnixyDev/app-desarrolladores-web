-- Verifactu, fase 4 (preparación): envío encendido cuenta por cuenta y
-- «empezar de cero» al encenderlo.
--
-- CÓMO SE LANZA: pégalo entero en el editor SQL de Supabase, o
--   supabase db query --file supabase/pruebas/verifactu-entorno.sql
--
-- ES SEGURO EN PRODUCCIÓN: crea una cuenta desechable y termina siempre con
-- una excepción a propósito, que deshace la transacción entera.

do $$
declare
  v_yo uuid := gen_random_uuid();
  c_es uuid;
  f1 uuid; f2 uuid; f3 uuid;
  r1 public.fiscal_records; r2 public.fiscal_records; r3 public.fiscal_records;
  v_txt text; v_n int; v_b boolean;
  v_res text := ''; v_f int := 0;
  hoy date := (now() at time zone 'Europe/Madrid')::date;
begin
  insert into auth.users (id, email, created_at, updated_at, aud, role, raw_user_meta_data)
  values (v_yo, 'verifactu-entorno@example.com', now(), now(), 'authenticated', 'authenticated', '{"full_name":"Prueba Entorno"}');
  update public.profiles set plan = 'Pro', tax_id = '12345678Z', business_name = 'Estudio', veri_factu_enabled = true where id = v_yo;

  insert into public.clients (user_id, name, email, tax_id) values (v_yo, 'Cliente', 'c@example.com', 'B12345674') returning id into c_es;
  insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, total_cents, paid) values
    (v_yo, c_es, 'E-1', hoy, hoy, '[{"description":"Web","quantity":1,"price_cents":10000}]', 10000, 21, 12100, false),
    (v_yo, c_es, 'E-2', hoy, hoy, '[{"description":"Web","quantity":1,"price_cents":10000}]', 10000, 21, 12100, false),
    (v_yo, c_es, 'E-3', hoy, hoy, '[{"description":"Web","quantity":1,"price_cents":10000}]', 10000, 21, 12100, false);
  select id into f1 from public.invoices where user_id = v_yo and invoice_number = 'E-1';
  select id into f2 from public.invoices where user_id = v_yo and invoice_number = 'E-2';
  select id into f3 from public.invoices where user_id = v_yo and invoice_number = 'E-3';

  -- 1) Cuenta nueva: VERI*FACTU y sin envío.
  select verifactu_entorno || '/' || veri_factu_modality into v_txt from public.profiles where id = v_yo;
  if v_txt = 'sin_envio/verifactu' then v_res := v_res || E'\n  OK    1) cuenta nueva: VERI*FACTU, sin envío';
  else v_res := v_res || E'\n  FALLA 1) ' || coalesce(v_txt, 'null'); v_f := v_f + 1; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_yo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- 2) El usuario no puede encenderse el envío ni volver a «No Veri*Factu».
  begin
    update public.profiles set verifactu_entorno = 'produccion' where id = v_yo;
    v_res := v_res || E'\n  FALLA 2) el usuario se ha encendido el envío'; v_f := v_f + 1;
  exception when others then
    begin
      update public.profiles set veri_factu_modality = 'no_verifactu' where id = v_yo;
      v_res := v_res || E'\n  FALLA 2) ha vuelto a No Veri*Factu'; v_f := v_f + 1;
    exception when others then
      v_res := v_res || E'\n  OK    2) el usuario no enciende el envío ni elige No Veri*Factu';
    end;
  end;

  -- 3) Ni puede llamar a la función que lo enciende.
  begin
    perform public.verifactu_cambiar_entorno(v_yo, 'pruebas');
    v_res := v_res || E'\n  FALLA 3) el usuario ha llamado a verifactu_cambiar_entorno'; v_f := v_f + 1;
  exception when others then
    v_res := v_res || E'\n  OK    3) verifactu_cambiar_entorno solo para el servidor';
  end;

  -- 4) Sin envío: registro interno, no va a la AEAT.
  r1 := public.generate_fiscal_record(f1);
  if r1.entorno is null and r1.estado_envio = 'no_aplica' and r1.modalidad = 'verifactu' then
    v_res := v_res || E'\n  OK    4) sin envío: registro interno (no_aplica)';
  else v_res := v_res || E'\n  FALLA 4) ' || coalesce(r1.entorno, 'null') || ' ' || r1.estado_envio; v_f := v_f + 1; end if;
  execute 'reset role';

  -- 5) Sin certificado no se enciende.
  begin
    perform public.verifactu_cambiar_entorno(v_yo, 'produccion');
    v_res := v_res || E'\n  FALLA 5) encendido sin certificado'; v_f := v_f + 1;
  exception when others then
    v_res := v_res || E'\n  OK    5) sin certificado digital no se enciende';
  end;

  -- 6) Con certificado se enciende, y la cadena oficial empieza de cero.
  insert into public.user_secrets (user_id, veri_factu_cert_storage_path, veri_factu_cert_password_encrypted)
  values (v_yo, v_yo || '/cert.p12', 'x')
  on conflict (user_id) do update set veri_factu_cert_storage_path = excluded.veri_factu_cert_storage_path,
                                      veri_factu_cert_password_encrypted = excluded.veri_factu_cert_password_encrypted;
  perform public.verifactu_cambiar_entorno(v_yo, 'produccion');

  perform set_config('request.jwt.claims', json_build_object('sub', v_yo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r2 := public.generate_fiscal_record(f2);
  r3 := public.generate_fiscal_record(f3);
  if r2.entorno = 'produccion' and r2.estado_envio = 'pendiente' and r2.registro->'Encadenamiento'->>'PrimerRegistro' = 'S'
     and r2.hash_anterior is null then
    v_res := v_res || E'\n  OK    6) al encender: pendiente de envío y PrimerRegistro=S (empieza de cero)';
  else v_res := v_res || E'\n  FALLA 6) ' || coalesce(r2.registro->>'Encadenamiento', 'null'); v_f := v_f + 1; end if;

  -- 7) El siguiente se encadena con el oficial, no con el interno.
  if r3.hash_anterior = r2.hash and r3.registro->'Encadenamiento'->'RegistroAnterior'->>'NumSerieFactura' = 'E-2' then
    v_res := v_res || E'\n  OK    7) la cadena oficial sigue sola';
  else v_res := v_res || E'\n  FALLA 7) encadena con ' || coalesce(r3.registro->>'Encadenamiento', 'null'); v_f := v_f + 1; end if;

  -- 8) La comprobación de la cadena da todo bien (una cadena por entorno).
  select bool_and(is_valid), count(*) into v_b, v_n from public.verify_fiscal_chain(v_yo);
  if v_b and v_n = 3 then v_res := v_res || E'\n  OK    8) comprobar la cadena: los 3 registros, bien';
  else v_res := v_res || E'\n  FALLA 8) ' || v_n || ' registros, válidos: ' || coalesce(v_b::text, 'null'); v_f := v_f + 1; end if;

  -- 9) El entorno de un registro no se cambia.
  begin
    update public.fiscal_records set entorno = 'pruebas' where id = r2.id;
    get diagnostics v_n = row_count;
    if v_n = 0 then v_res := v_res || E'\n  OK    9) el entorno de un registro no se cambia';
    else v_res := v_res || E'\n  FALLA 9) se ha cambiado el entorno'; v_f := v_f + 1; end if;
  exception when others then
    v_res := v_res || E'\n  OK    9) el entorno de un registro no se cambia';
  end;
  execute 'reset role';

  raise exception E'VERIFACTU ENTORNO — % fallo(s)\n%\n\n(la transaccion se ha deshecho: no queda nada de esta prueba)', v_f, v_res;
end $$;
