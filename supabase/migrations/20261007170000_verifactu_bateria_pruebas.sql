-- ============================================================================
-- Verifactu, fase 3 (07/10/2026): batería de casos para el entorno de PRUEBAS
-- de la AEAT.
--
-- verifactu_bateria_de_prueba(usuario, sufijo) crea en la cuenta indicada un
-- cliente y una factura por cada caso real de un desarrollador autónomo, genera
-- sus registros oficiales con las MISMAS funciones que usa la app
-- (registrar_factura_fiscal, crear_factura_rectificativa_causa,
-- generate_fiscal_cancellation, subsanar_registro_fiscal), los devuelve y DESHACE
-- todo. No queda nada en la base de datos. La función verifactu-bateria los
-- envía a la AEAT de pruebas.
--
-- Con el mismo sufijo, los números de factura salen iguales en cada llamada:
-- así la batería puede enviarse en varios pasos (duplicados, subsanaciones…).
-- ============================================================================

create or replace function public.verifactu_bateria_de_prueba(p_user uuid, p_sufijo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_res jsonb := '[]'::jsonb;
  v_hoy date := (now() at time zone 'Europe/Madrid')::date;
  v_pre text := 'PRUEBA-' || p_sufijo || '-';
  c_es uuid; c_ue uuid; c_us uuid; c_usp uuid; c_part uuid; c_nocenso uuid;
  f uuid;
  v_casos jsonb := '{}'::jsonb;   -- número de factura → caso
  v_rect public.invoices;
begin
  if p_sufijo !~ '^[0-9A-Z]{4,14}$' then
    raise exception 'Sufijo no válido';
  end if;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
    -- Como una cuenta con el envío a la AEAT activado (todo se deshace al final).
    update public.profiles set veri_factu_modality = 'verifactu' where id = p_user;

    -- Clientes de cada tipo. Nacional: la propia AEAT (Q2826000H, está en el censo).
    insert into public.clients (user_id, name, email, tax_id)
      values (p_user, 'AGENCIA ESTATAL DE ADMINISTRACION TRIBUTARIA', 'b-es@example.com', 'Q2826000H') returning id into c_es;
    insert into public.clients (user_id, name, email, tipo_fiscal, pais, nif_iva, tax_id)
      values (p_user, 'Google Ireland Limited', 'b-ue@example.com', 'empresa_ue', 'IE', 'IE6388047V', 'IE6388047V') returning id into c_ue;
    insert into public.clients (user_id, name, email, tipo_fiscal, pais, tax_id)
      values (p_user, 'Prueba Inc', 'b-us@example.com', 'fuera_ue', 'US', '123456789') returning id into c_us;
    insert into public.clients (user_id, name, email, tipo_fiscal, pais, tax_id, es_particular)
      values (p_user, 'John Prueba', 'b-usp@example.com', 'fuera_ue', 'US', 'X1234567', true) returning id into c_usp;
    insert into public.clients (user_id, name, email)
      values (p_user, 'Particular de prueba', 'b-p@example.com') returning id into c_part;
    -- NIF con formato y letra correctos que no está en el censo.
    insert into public.clients (user_id, name, email, tax_id)
      values (p_user, 'Empresa Inexistente SL', 'b-nc@example.com', '12345678Z') returning id into c_nocenso;

    -- Altas, en el orden en que entran en la cadena.
    -- 1. Nacional, 21 % de IVA.
    insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, irpf_percent, total_cents, paid)
      values (p_user, c_es, v_pre || '01', v_hoy, v_hoy, '[{"description":"Desarrollo web (prueba)","quantity":1,"price_cents":100000}]', 100000, 21, 0, 121000, false) returning id into f;
    perform public.registrar_factura_fiscal(f, p_user);
    v_casos := v_casos || jsonb_build_object(v_pre || '01', 'nacional_21');

    -- 2. Nacional, 21 % de IVA y 15 % de IRPF (ImporteTotal = base + IVA; el IRPF no cuenta).
    insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, irpf_percent, total_cents, paid)
      values (p_user, c_es, v_pre || '02', v_hoy, v_hoy, '[{"description":"Mantenimiento (prueba)","quantity":2,"price_cents":50000}]', 100000, 21, 15, 106000, false) returning id into f;
    perform public.registrar_factura_fiscal(f, p_user);
    v_casos := v_casos || jsonb_build_object(v_pre || '02', 'nacional_21_irpf');

    -- 3. Empresa de la UE con NIF-IVA: sin IVA (inversión del sujeto pasivo).
    insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, irpf_percent, total_cents, paid)
      values (p_user, c_ue, v_pre || '03', v_hoy, v_hoy, '[{"description":"Consultoría (prueba)","quantity":1,"price_cents":50000}]', 50000, 0, 0, 50000, false) returning id into f;
    perform public.registrar_factura_fiscal(f, p_user);
    v_casos := v_casos || jsonb_build_object(v_pre || '03', 'empresa_ue_sin_iva');

    -- 4. Empresa de fuera de la UE: no sujeta.
    insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, irpf_percent, total_cents, paid)
      values (p_user, c_us, v_pre || '04', v_hoy, v_hoy, '[{"description":"App móvil (prueba)","quantity":1,"price_cents":80000}]', 80000, 0, 0, 80000, false) returning id into f;
    perform public.registrar_factura_fiscal(f, p_user);
    v_casos := v_casos || jsonb_build_object(v_pre || '04', 'fuera_ue_empresa');

    -- 5. Particular de fuera de la UE: no sujeta (art. 69.Dos).
    insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, irpf_percent, total_cents, paid)
      values (p_user, c_usp, v_pre || '05', v_hoy, v_hoy, '[{"description":"Web personal (prueba)","quantity":1,"price_cents":30000}]', 30000, 0, 0, 30000, false) returning id into f;
    perform public.registrar_factura_fiscal(f, p_user);
    v_casos := v_casos || jsonb_build_object(v_pre || '05', 'fuera_ue_particular');

    -- 6. Simplificada (cliente sin identificar, hasta 400 €).
    insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, irpf_percent, total_cents, paid)
      values (p_user, c_part, v_pre || '06', v_hoy, v_hoy, '[{"description":"Arreglo (prueba)","quantity":1,"price_cents":10000}]', 10000, 21, 0, 12100, false) returning id into f;
    perform public.registrar_factura_fiscal(f, p_user);
    v_casos := v_casos || jsonb_build_object(v_pre || '06', 'simplificada');

    -- 7. Cliente con NIF que no está en el censo.
    insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, irpf_percent, total_cents, paid)
      values (p_user, c_nocenso, v_pre || '07', v_hoy, v_hoy, '[{"description":"Desarrollo (prueba)","quantity":1,"price_cents":20000}]', 20000, 21, 0, 24200, false) returning id into f;
    perform public.registrar_factura_fiscal(f, p_user);
    v_casos := v_casos || jsonb_build_object(v_pre || '07', 'nif_fuera_de_censo');

    -- 8. Rectificativa (abono total) de la 1: R1 por diferencias, importes negativos.
    select * into v_rect from public.crear_factura_rectificativa_causa(
      (select id from public.invoices where user_id = p_user and invoice_number = v_pre || '01'), '[]'::jsonb, 'Prueba: abono total', 'cancelacion');
    update public.invoices set invoice_number = v_pre || '08' where id = v_rect.id;
    perform public.registrar_factura_fiscal(v_rect.id, p_user);
    v_casos := v_casos || jsonb_build_object(v_pre || '08', 'rectificativa_r1_abono_total');

    -- 9. Rectificativa parcial de la simplificada: R5 (de 100 € a 80 €).
    select * into v_rect from public.crear_factura_rectificativa_causa(
      (select id from public.invoices where user_id = p_user and invoice_number = v_pre || '06'),
      '[{"description":"Arreglo (prueba, precio corregido)","quantity":1,"price_cents":8000}]'::jsonb, 'Prueba: precio corregido', 'otro');
    update public.invoices set invoice_number = v_pre || '09' where id = v_rect.id;
    perform public.registrar_factura_fiscal(v_rect.id, p_user);
    v_casos := v_casos || jsonb_build_object(v_pre || '09', 'rectificativa_r5');

    -- 12. Rectificativa por «otro motivo» de la de fuera de la UE: R4 (gestoría), N2 negativo.
    select * into v_rect from public.crear_factura_rectificativa_causa(
      (select id from public.invoices where user_id = p_user and invoice_number = v_pre || '04'),
      '[{"description":"App móvil (prueba, horas corregidas)","quantity":1,"price_cents":60000}]'::jsonb, 'Prueba: horas mal contadas', 'otro');
    update public.invoices set invoice_number = v_pre || '12' where id = v_rect.id;
    perform public.registrar_factura_fiscal(v_rect.id, p_user);
    v_casos := v_casos || jsonb_build_object(v_pre || '12', 'rectificativa_r4');

    -- 10. Factura que la batería estropea a propósito (cuota mal calculada) para
    --     comprobar el rechazo y la subsanación.
    insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, irpf_percent, total_cents, paid)
      values (p_user, c_es, v_pre || '10', v_hoy, v_hoy, '[{"description":"Soporte (prueba)","quantity":1,"price_cents":10000}]', 10000, 21, 0, 12100, false) returning id into f;
    perform public.registrar_factura_fiscal(f, p_user);
    v_casos := v_casos || jsonb_build_object(v_pre || '10', 'para_rechazo');

    -- 11. Factura que no se envía nunca: sirve para anular algo que la AEAT no tiene.
    insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, irpf_percent, total_cents, paid)
      values (p_user, c_es, v_pre || '11', v_hoy, v_hoy, '[{"description":"Sin enviar (prueba)","quantity":1,"price_cents":10000}]', 10000, 21, 0, 12100, false) returning id into f;
    perform public.registrar_factura_fiscal(f, p_user);
    v_casos := v_casos || jsonb_build_object(v_pre || '11', 'nunca_enviada');

    -- Anulación de la 2 (enviada).
    perform public.generate_fiscal_cancellation((select id from public.invoices where user_id = p_user and invoice_number = v_pre || '02'));

    -- Lo que pasa DESPUÉS de que responda la AEAT, simulado aquí para generar
    -- los registros con las funciones reales de la app (verifactu_fase3):
    -- (a) la 7 se rechaza por el NIF (1239); se corrige el cliente y se subsana.
    update public.fiscal_records set estado_envio = 'rechazado', envio_error_codigo = '1239'
     where user_id = p_user and numero_factura = v_pre || '07' and record_type = 'alta';
    update public.clients set tax_id = 'Q2826000H', name = 'AGENCIA ESTATAL DE ADMINISTRACION TRIBUTARIA' where id = c_nocenso;
    -- (b) la 10 se acepta con errores y se subsana.
    update public.fiscal_records set estado_envio = 'aceptado_con_errores'
     where user_id = p_user and numero_factura = v_pre || '10' and record_type = 'alta';
    -- (c) la 11 se rechaza y después se anula: la AEAT no la tiene.
    update public.fiscal_records set estado_envio = 'rechazado'
     where user_id = p_user and numero_factura = v_pre || '11' and record_type = 'alta';
    perform public.subsanar_registro_fiscal(
      (select id from public.fiscal_records where user_id = p_user and numero_factura = v_pre || '07' and record_type = 'alta'));
    perform public.subsanar_registro_fiscal(
      (select id from public.fiscal_records where user_id = p_user and numero_factura = v_pre || '10' and record_type = 'alta'));
    perform public.generate_fiscal_cancellation((select id from public.invoices where user_id = p_user and invoice_number = v_pre || '11'));

    select coalesce(jsonb_agg(jsonb_build_object(
             'caso', case when fr.record_type = 'anulacion' then 'anulacion_'
                          when fr.subsana_registro_id is not null then 'subsanacion_' else '' end || (v_casos->>fr.numero_factura),
             'record_type', fr.record_type, 'numero_factura', fr.numero_factura,
             'nif_emisor', fr.nif_emisor, 'nombre_emisor', fr.nombre_emisor, 'registro', fr.registro) order by fr.orden), '[]'::jsonb)
      into v_res
      from public.fiscal_records fr
     where fr.user_id = p_user and fr.numero_factura like v_pre || '%';

    raise exception using errcode = 'VF999', message = 'deshacer la prueba';
  exception when sqlstate 'VF999' then
    null;  -- todo lo de arriba se deshace; v_res se conserva
  end;
  return v_res;
end;
$$;

revoke all on function public.verifactu_bateria_de_prueba(uuid, text) from public, anon, authenticated;
grant execute on function public.verifactu_bateria_de_prueba(uuid, text) to service_role;
