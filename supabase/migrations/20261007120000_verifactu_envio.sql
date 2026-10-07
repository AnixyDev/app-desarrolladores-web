-- ============================================================================
-- Verifactu, fase 2 (07/10/2026): envío de los registros a la AEAT.
--
-- 1. Nombre del emisor: para una persona física (NIF que empieza por número o
--    por K, L, M, X, Y, Z) va su nombre y apellidos, no el nombre comercial.
--    La AEAT comprueba el par NIF-nombre del censo.
-- 2. Respuesta de la AEAT guardada en cada registro (estado, código y texto
--    del error, CSV, intentos) y control de flujo por usuario: la AEAT fija
--    cuántos segundos esperar entre envíos (TiempoEsperaEnvio).
-- 3. Inmutabilidad: de un registro fiscal solo pueden cambiar los datos del
--    envío. Ni el servidor puede tocar la huella ni el contenido.
-- 4. verifactu_registros_de_prueba(): genera registros reales de la cuenta de
--    administración, los devuelve y DESHACE todo, para probar el envío contra
--    el entorno de pruebas de la AEAT sin dejar nada en la base de datos.
-- 5. Envío automático cada minuto, solo si hay registros pendientes.
--
-- Solo se envían los registros en modalidad 'verifactu'. Hasta la fase 4
-- ninguna cuenta la tiene (en Ajustes aparece «próximamente») y la función
-- verifactu-enviar apunta al entorno de PRUEBAS de la AEAT.
-- ============================================================================

-- 1. Nombre del emisor ──────────────────────────────────────────────────────
create or replace function public.verifactu_nombre_emisor(p_nif text, p_nombre_completo text, p_nombre_comercial text)
returns text language sql immutable
as $$
  select left(btrim(case
    when p_nif ~ '^[0-9KLMXYZ]' then coalesce(nullif(btrim(p_nombre_completo), ''), nullif(btrim(p_nombre_comercial), ''), '')
    else coalesce(nullif(btrim(p_nombre_comercial), ''), nullif(btrim(p_nombre_completo), ''), '')
  end), 120)
$$;

-- La función de alta, con el nombre del emisor nuevo (resto igual que en la fase 1).
create or replace function public.registrar_factura_fiscal(p_invoice_id uuid, p_user uuid)
returns public.fiscal_records
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_invoice public.invoices%rowtype;
  v_profile public.profiles%rowtype;
  v_client public.clients%rowtype;
  v_original public.invoices%rowtype;
  v_reg_original public.fiscal_records%rowtype;
  v_anterior public.fiscal_records%rowtype;
  v_record public.fiscal_records;
  v_nif text;
  v_nombre_emisor text;
  v_modalidad text;
  v_tipo text;
  v_base bigint;
  v_cuota bigint := 0;
  v_importe bigint;
  v_detalle jsonb;
  v_destinatario jsonb;
  v_descripcion text;
  v_fhh text;
  v_fecha text;
  v_hash_input text;
  v_hash text;
  v_registro jsonb;
begin
  if p_user is null then
    raise exception 'Falta el usuario para el registro fiscal.';
  end if;

  -- Un registro a la vez por usuario: dos facturas simultáneas no pueden
  -- encadenar con la misma huella anterior.
  perform pg_advisory_xact_lock(hashtextextended('registro_fiscal:' || p_user::text, 0));

  select * into v_invoice from public.invoices where id = p_invoice_id and user_id = p_user;
  if not found then
    raise exception 'Factura no encontrada o no pertenece al usuario actual.';
  end if;
  if exists (select 1 from public.fiscal_records where invoice_id = p_invoice_id and record_type = 'alta') then
    raise exception 'Esta factura ya tiene su registro fiscal.';
  end if;

  perform public.verifactu_comprobar_factura(v_invoice);

  select * into v_profile from public.profiles where id = p_user;
  v_nif := public.verifactu_normalizar_nif(public.exigir_nif_emisor(p_user));
  if v_nif !~ '^[0-9A-Z]{9}$' then
    raise exception 'Tu NIF («%») no es válido: debe tener 9 caracteres. Corrígelo en Ajustes → Perfil.', v_profile.tax_id
      using errcode = 'P0001';
  end if;
  v_nombre_emisor := public.verifactu_nombre_emisor(v_nif, v_profile.full_name, v_profile.business_name);
  if v_nombre_emisor = '' then
    raise exception 'Falta tu nombre o razón social en Ajustes → Perfil: es obligatorio en el registro fiscal.'
      using errcode = 'P0001';
  end if;

  select * into v_client from public.clients where id = v_invoice.client_id;

  -- Desglose: un tipo de IVA por factura.
  v_base := v_invoice.subtotal_cents;
  if v_invoice.motivo_sin_iva is not null then
    -- Empresa de la UE o cliente de fuera de la UE: no sujeta por reglas de localización.
    v_detalle := jsonb_build_object('ClaveRegimen', '01', 'CalificacionOperacion', 'N2',
      'BaseImponibleOimporteNoSujeto', public.verifactu_importe(v_base));
  elsif coalesce(v_invoice.tax_percent, 0) > 0 then
    if v_invoice.tax_percent not in (2, 4, 5, 7.5, 10, 21) then
      raise exception 'El IVA del % %% no es un tipo válido para Hacienda (4, 10 o 21 %%).', v_invoice.tax_percent
        using errcode = 'P0001';
    end if;
    v_cuota := round(v_base * v_invoice.tax_percent / 100.0);
    v_detalle := jsonb_build_object('ClaveRegimen', '01', 'CalificacionOperacion', 'S1',
      'TipoImpositivo', to_char(v_invoice.tax_percent, 'FM990.00'),
      'BaseImponibleOimporteNoSujeto', public.verifactu_importe(v_base),
      'CuotaRepercutida', public.verifactu_importe(v_cuota));
  else
    raise exception 'La factura % no lleva IVA y su cliente es de España. Solo se factura sin IVA a empresas de la UE o a clientes de fuera de la UE (cámbialo en la ficha del cliente).', v_invoice.invoice_number
      using errcode = 'P0001';
  end if;
  v_importe := v_base + v_cuota;

  v_destinatario := public.verifactu_destinatario(v_client);

  -- Tipo de factura.
  if v_invoice.rectifies_invoice_id is not null then
    select * into v_original from public.invoices where id = v_invoice.rectifies_invoice_id;
    select * into v_reg_original from public.fiscal_records
     where invoice_id = v_invoice.rectifies_invoice_id and record_type = 'alta';
    v_tipo := case when v_reg_original.tipo_factura in ('F2', 'R5') then 'R5' else 'R1' end;
  elsif v_destinatario is not null then
    v_tipo := 'F1';
  elsif v_importe <= 40000 then
    v_tipo := 'F2';
  else
    raise exception 'Para una factura de más de 400 € el cliente tiene que estar identificado: añade su NIF (o su documento y país, si es extranjero) en su ficha.'
      using errcode = 'P0001';
  end if;
  if v_tipo = 'R1' and v_destinatario is null then
    raise exception 'Para rectificar la factura hace falta identificar al cliente: añade su NIF (o su documento y país) en su ficha.'
      using errcode = 'P0001';
  end if;
  if v_tipo in ('F2', 'R5') then
    v_destinatario := null;  -- la simplificada no lleva destinatario
  end if;

  select left(nullif(string_agg(btrim(i->>'description'), '; '), ''), 500) into v_descripcion
    from jsonb_array_elements(coalesce(v_invoice.items, '[]'::jsonb)) i
   where btrim(coalesce(i->>'description', '')) <> '';
  v_descripcion := coalesce(v_descripcion, 'Prestación de servicios');

  v_anterior := public.verifactu_ultimo_registro(p_user);
  v_fhh := public.verifactu_fecha_hora_huso();
  v_fecha := public.verifactu_fecha(v_invoice.issue_date);

  v_hash_input :=
    'IDEmisorFactura=' || v_nif ||
    '&NumSerieFactura=' || btrim(v_invoice.invoice_number) ||
    '&FechaExpedicionFactura=' || v_fecha ||
    '&TipoFactura=' || v_tipo ||
    '&CuotaTotal=' || public.verifactu_importe(v_cuota) ||
    '&ImporteTotal=' || public.verifactu_importe(v_importe) ||
    '&Huella=' || coalesce(v_anterior.hash, '') ||
    '&FechaHoraHusoGenRegistro=' || v_fhh;
  v_hash := public.verifactu_huella_alta(v_nif, v_invoice.invoice_number, v_fecha, v_tipo,
    public.verifactu_importe(v_cuota), public.verifactu_importe(v_importe), v_anterior.hash, v_fhh);

  v_registro := jsonb_strip_nulls(jsonb_build_object(
    'IDVersion', '1.0',
    'IDFactura', jsonb_build_object(
      'IDEmisorFactura', v_nif,
      'NumSerieFactura', btrim(v_invoice.invoice_number),
      'FechaExpedicionFactura', v_fecha),
    'NombreRazonEmisor', v_nombre_emisor,
    'TipoFactura', v_tipo,
    'TipoRectificativa', case when v_tipo in ('R1', 'R5') then 'I' end,
    'FacturasRectificadas', case when v_tipo in ('R1', 'R5') then jsonb_build_array(jsonb_build_object(
      'IDEmisorFactura', coalesce(v_reg_original.nif_emisor, v_nif),
      'NumSerieFactura', btrim(v_original.invoice_number),
      'FechaExpedicionFactura', public.verifactu_fecha(v_original.issue_date))) end,
    'DescripcionOperacion', v_descripcion,
    'Destinatarios', case when v_destinatario is not null then jsonb_build_array(v_destinatario) end,
    'Desglose', jsonb_build_array(v_detalle),
    'CuotaTotal', public.verifactu_importe(v_cuota),
    'ImporteTotal', public.verifactu_importe(v_importe),
    'Encadenamiento', public.verifactu_encadenamiento(v_anterior),
    'SistemaInformatico', public.verifactu_sistema_informatico(p_user),
    'FechaHoraHusoGenRegistro', v_fhh,
    'TipoHuella', '01',
    'Huella', v_hash
  ));

  v_modalidad := coalesce(v_profile.veri_factu_modality, 'no_verifactu');

  insert into public.fiscal_records (
    user_id, invoice_id, record_type, nif_emisor, nombre_emisor,
    numero_factura, fecha_expedicion, tipo_factura, importe_total_cents, cuota_total_cents,
    hash_anterior, hash, hash_input, modalidad, estado_envio, fecha_hora_huso, registro
  ) values (
    p_user, p_invoice_id, 'alta', v_nif, v_nombre_emisor,
    btrim(v_invoice.invoice_number), v_invoice.issue_date, v_tipo, v_importe, v_cuota,
    v_anterior.hash, v_hash, v_hash_input, v_modalidad,
    case when v_modalidad = 'verifactu' then 'pendiente' else 'no_aplica' end,
    v_fhh, v_registro
  )
  returning * into v_record;

  update public.invoices set fiscal_locked = true where id = p_invoice_id;

  return v_record;
end;
$function$;

revoke all on function public.registrar_factura_fiscal(uuid, uuid) from public, anon, authenticated;
grant execute on function public.registrar_factura_fiscal(uuid, uuid) to service_role;

-- 2. Respuesta de la AEAT y control de flujo ────────────────────────────────
alter table public.fiscal_records
  add column if not exists envio_intentos int not null default 0,
  add column if not exists envio_ultimo_intento timestamptz,
  add column if not exists envio_error_codigo text,
  add column if not exists envio_error_descripcion text,
  add column if not exists envio_aceptado_en timestamptz;

comment on column public.fiscal_records.envio_error_descripcion is
  'Último error del envío a la AEAT (de la propia AEAT o de la conexión). Vacío si se aceptó sin errores.';

create index if not exists fiscal_records_pendientes_de_envio
  on public.fiscal_records (user_id, orden) where estado_envio = 'pendiente';

create table if not exists public.verifactu_control_envio (
  user_id uuid primary key references auth.users(id) on delete cascade,
  siguiente_envio_en timestamptz not null default now(),
  ultimo_error text,
  actualizado_en timestamptz not null default now()
);
alter table public.verifactu_control_envio enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'verifactu_control_envio' and policyname = 'verifactu_control_envio_leer') then
    create policy verifactu_control_envio_leer on public.verifactu_control_envio
      for select to authenticated using ((select auth.uid()) = user_id);
  end if;
end $$;
revoke insert, update, delete on public.verifactu_control_envio from anon, authenticated;

-- 3. Inmutabilidad ──────────────────────────────────────────────────────────
create or replace function public.fiscal_records_inmutable()
returns trigger language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if (new.user_id, new.invoice_id, new.record_type, new.nif_emisor, new.nombre_emisor, new.numero_factura,
      new.fecha_expedicion, new.tipo_factura, new.importe_total_cents, new.cuota_total_cents,
      new.hash_anterior, new.hash, new.hash_input, new.modalidad, new.fecha_hora_huso, new.registro,
      new.orden, new.created_at)
     is distinct from
     (old.user_id, old.invoice_id, old.record_type, old.nif_emisor, old.nombre_emisor, old.numero_factura,
      old.fecha_expedicion, old.tipo_factura, old.importe_total_cents, old.cuota_total_cents,
      old.hash_anterior, old.hash, old.hash_input, old.modalidad, old.fecha_hora_huso, old.registro,
      old.orden, old.created_at)
  then
    raise exception 'Un registro fiscal no se puede modificar: solo cambian los datos de su envío a la AEAT.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace trigger fiscal_records_inmutable
  before update on public.fiscal_records
  for each row execute function public.fiscal_records_inmutable();

-- 4. Registros de prueba (no se guarda nada) ────────────────────────────────
-- Crea en la cuenta indicada tres facturas de prueba y la anulación de una,
-- con sus registros oficiales, los devuelve y deshace todo. Destinatario
-- nacional: la propia AEAT (NIF Q2826000H), que existe en el censo.
create or replace function public.verifactu_registros_de_prueba(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_res jsonb := '[]'::jsonb;
  v_sufijo text := to_char(clock_timestamp() at time zone 'Europe/Madrid', 'YYMMDDHH24MISS');
  v_hoy date := (now() at time zone 'Europe/Madrid')::date;
  c1 uuid; c2 uuid; c3 uuid; f1 uuid; f2 uuid; f3 uuid;
begin
  begin
    -- Como si fuera la propia usuaria: exigir_nif_emisor y la anulación lo piden.
    perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
    insert into public.clients (user_id, name, email, tax_id)
      values (p_user, 'AGENCIA ESTATAL DE ADMINISTRACION TRIBUTARIA', 'prueba-aeat@example.com', 'Q2826000H') returning id into c1;
    insert into public.clients (user_id, name, email, tipo_fiscal, pais, tax_id)
      values (p_user, 'Prueba Inc', 'prueba-us@example.com', 'fuera_ue', 'US', '123456789') returning id into c2;
    insert into public.clients (user_id, name, email)
      values (p_user, 'Particular de prueba', 'prueba-p@example.com') returning id into c3;

    insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, total_cents, paid)
      values (p_user, c1, 'PRUEBA-' || v_sufijo || '-1', v_hoy, v_hoy, '[{"description":"Desarrollo de software (prueba)","quantity":1,"price_cents":100000}]', 100000, 21, 121000, false) returning id into f1;
    insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, total_cents, paid)
      values (p_user, c2, 'PRUEBA-' || v_sufijo || '-2', v_hoy, v_hoy, '[{"description":"Desarrollo de software (prueba)","quantity":1,"price_cents":50000}]', 50000, 0, 50000, false) returning id into f2;
    insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, total_cents, paid)
      values (p_user, c3, 'PRUEBA-' || v_sufijo || '-3', v_hoy, v_hoy, '[{"description":"Arreglo (prueba)","quantity":1,"price_cents":10000}]', 10000, 21, 12100, false) returning id into f3;

    perform public.registrar_factura_fiscal(f1, p_user);
    perform public.registrar_factura_fiscal(f2, p_user);
    perform public.registrar_factura_fiscal(f3, p_user);
    perform public.generate_fiscal_cancellation(f3);

    select coalesce(jsonb_agg(jsonb_build_object(
             'record_type', record_type, 'numero_factura', numero_factura,
             'nif_emisor', nif_emisor, 'nombre_emisor', nombre_emisor, 'registro', registro) order by orden), '[]'::jsonb)
      into v_res
      from public.fiscal_records
     where user_id = p_user and numero_factura like 'PRUEBA-' || v_sufijo || '-%';

    raise exception using errcode = 'VF999', message = 'deshacer la prueba';
  exception when sqlstate 'VF999' then
    null;  -- todo lo de arriba se deshace; v_res se conserva
  end;
  return v_res;
end;
$$;

revoke all on function public.verifactu_registros_de_prueba(uuid) from public, anon, authenticated;
grant execute on function public.verifactu_registros_de_prueba(uuid) to service_role;

-- 5. Envío automático ───────────────────────────────────────────────────────
-- Cada minuto, pero solo llama a la función si hay algo pendiente
-- (cron.schedule con el mismo nombre sustituye la tarea si ya existía).

select cron.schedule(
  'verifactu-enviar',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://umqsjycqypxvhbhmidma.supabase.co/functions/v1/verifactu-enviar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'cron_service_role_key'
      )
    ),
    body := '{"modo":"pendientes"}'::jsonb,
    timeout_milliseconds := 55000
  ) as request_id
  where exists (select 1 from public.fiscal_records where estado_envio = 'pendiente');
  $$
);
