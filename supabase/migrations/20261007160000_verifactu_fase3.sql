-- ============================================================================
-- Verifactu, fase 3 (07/10/2026): lo que enseñó la batería contra la AEAT de
-- pruebas (verifactu-bateria, 16 registros en 3 envíos).
--
-- 1. Subsanación. La AEAT RECHAZA el registro si el NIF del cliente no está en
--    su censo (error 1239). La factura ya está emitida y bloqueada: lo que se
--    corrige es la ficha del cliente (o tu perfil) y se envía un registro de
--    alta NUEVO de la misma factura con Subsanacion=S, y RechazoPrevio=X si la
--    AEAT no llegó a aceptar ninguno. Probado: «Correcto». También sirve para
--    corregir un registro «aceptado con errores» (solo Subsanacion=S, probado).
--    Cada registro se subsana como mucho una vez (subsana_registro_id).
-- 2. Anulación de una factura que la AEAT no tiene (su alta fue rechazada):
--    sin la marca SinRegistroPrevio=S la AEAT responde 3002; con ella, «Correcto».
-- 3. NIF español con su letra o dígito de control comprobados antes de
--    registrar: un NIF mal tecleado acababa en rechazo de la AEAT.
-- 4. Seguridad: nadie puede vaciar (TRUNCATE) ni borrar registros fiscales.
--    Solo la baja de cuenta los borra, después de archivarlos 4 años.
--
-- El duplicado (3000, reenvío tras perder la respuesta) se resuelve en la
-- función verifactu-enviar: la AEAT ya lo tiene y dice en qué estado.
-- ============================================================================

-- 1. NIF español válido (DNI, NIE, NIF de persona física K/L/M y de entidad) ─
create or replace function public.verifactu_nif_valido(p_nif text)
returns boolean
language plpgsql immutable
set search_path to 'public', 'pg_temp'
as $$
declare
  v text := upper(coalesce(p_nif, ''));
  v_letras constant text := 'TRWAGMYFPDXBNJZSQVHLCKE';
  v_num text;
  v_suma int := 0;
  v_d int;
  v_control int;
  i int;
begin
  -- DNI y NIF K/L/M: 8 cifras (o letra + 7) y letra de control.
  if v ~ '^[0-9]{8}[A-Z]$' then
    return substr(v_letras, (substr(v, 1, 8)::bigint % 23)::int + 1, 1) = substr(v, 9, 1);
  end if;
  if v ~ '^[XYZ][0-9]{7}[A-Z]$' then
    v_num := translate(substr(v, 1, 1), 'XYZ', '012') || substr(v, 2, 7);
    return substr(v_letras, (v_num::bigint % 23)::int + 1, 1) = substr(v, 9, 1);
  end if;
  if v ~ '^[KLM][0-9]{7}[A-Z]$' then
    return substr(v_letras, (substr(v, 2, 7)::bigint % 23)::int + 1, 1) = substr(v, 9, 1);
  end if;
  -- Entidades (sociedades, asociaciones, organismos): letra + 7 cifras + control.
  if v ~ '^[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]$' then
    for i in 1..7 loop
      v_d := substr(v, i + 1, 1)::int;
      if i % 2 = 1 then
        v_d := v_d * 2;
        v_d := v_d / 10 + v_d % 10;
      end if;
      v_suma := v_suma + v_d;
    end loop;
    v_control := (10 - v_suma % 10) % 10;
    if substr(v, 1, 1) in ('P', 'Q', 'R', 'S', 'W', 'N') then
      return substr(v, 9, 1) = substr('JABCDEFGHI', v_control + 1, 1);
    elsif substr(v, 1, 1) in ('A', 'B', 'E', 'H') then
      return substr(v, 9, 1) = v_control::text;
    else
      return substr(v, 9, 1) in (v_control::text, substr('JABCDEFGHI', v_control + 1, 1));
    end if;
  end if;
  return false;
end;
$$;

-- El destinatario español también se comprueba con su control.
create or replace function public.verifactu_destinatario(p_client public.clients)
returns jsonb language plpgsql stable
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_nombre text := left(btrim(coalesce(nullif(btrim(p_client.company), ''), p_client.name)), 120);
  v_doc text := public.verifactu_normalizar_nif(p_client.tax_id);
  v_pais text := coalesce(p_client.pais, case when p_client.tipo_fiscal = 'nacional' then 'ES' end);
begin
  if p_client.tipo_fiscal = 'empresa_ue' then
    if p_client.nif_iva is null then
      raise exception 'El cliente «%» es una empresa de la UE y necesita su NIF-IVA.', v_nombre using errcode = 'P0001';
    end if;
    return jsonb_build_object('NombreRazon', v_nombre,
      'IDOtro', jsonb_build_object('IDType', '02', 'ID', p_client.nif_iva));
  end if;

  if v_doc is null then
    return null;
  end if;

  if v_pais is null then
    raise exception 'Indica el país del cliente «%» en su ficha: hace falta para identificarlo en el registro fiscal.', v_nombre
      using errcode = 'P0001';
  end if;

  if v_pais = 'ES' then
    if not public.verifactu_nif_valido(v_doc) then
      raise exception 'El NIF del cliente «%» («%») no es válido: revisa que esté bien escrito, con su letra. Corrígelo en su ficha.', v_nombre, p_client.tax_id
        using errcode = 'P0001';
    end if;
    return jsonb_build_object('NombreRazon', v_nombre, 'NIF', v_doc);
  end if;

  return jsonb_build_object('NombreRazon', v_nombre,
    'IDOtro', jsonb_build_object(
      'CodigoPais', v_pais,
      'IDType', case when p_client.es_particular then '03' else '04' end,
      'ID', left(v_doc, 20)));
end;
$$;
revoke all on function public.verifactu_destinatario(public.clients) from public, anon, authenticated;

-- 2. Subsanación: columna, índices e inmutabilidad ──────────────────────────
alter table public.fiscal_records
  add column if not exists subsana_registro_id uuid references public.fiscal_records(id);

comment on column public.fiscal_records.subsana_registro_id is
  'Registro de alta que este registro subsana (mismo número de factura, enviado de nuevo con Subsanacion=S tras corregir los datos).';

drop index if exists public.fiscal_records_un_alta_por_factura;
create unique index if not exists fiscal_records_un_alta_original_por_factura
  on public.fiscal_records (invoice_id) where record_type = 'alta' and subsana_registro_id is null;
create unique index if not exists fiscal_records_una_subsanacion_por_registro
  on public.fiscal_records (subsana_registro_id) where subsana_registro_id is not null;

create or replace function public.fiscal_records_inmutable()
returns trigger language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if (new.user_id, new.invoice_id, new.record_type, new.nif_emisor, new.nombre_emisor, new.numero_factura,
      new.fecha_expedicion, new.tipo_factura, new.importe_total_cents, new.cuota_total_cents,
      new.hash_anterior, new.hash, new.hash_input, new.modalidad, new.fecha_hora_huso, new.registro,
      new.orden, new.created_at, new.subsana_registro_id)
     is distinct from
     (old.user_id, old.invoice_id, old.record_type, old.nif_emisor, old.nombre_emisor, old.numero_factura,
      old.fecha_expedicion, old.tipo_factura, old.importe_total_cents, old.cuota_total_cents,
      old.hash_anterior, old.hash, old.hash_input, old.modalidad, old.fecha_hora_huso, old.registro,
      old.orden, old.created_at, old.subsana_registro_id)
  then
    raise exception 'Un registro fiscal no se puede modificar: solo cambian los datos de su envío a la AEAT.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- 3. Alta: la construcción, común al registro normal y a la subsanación ─────
-- p_subsana: el registro de alta que se subsana (null en un alta normal).
create or replace function public.verifactu_insertar_alta(p_invoice_id uuid, p_user uuid, p_subsana uuid)
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
  v_rechazo_previo text;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id and user_id = p_user;
  if not found then
    raise exception 'Factura no encontrada o no pertenece al usuario actual.';
  end if;

  perform public.verifactu_comprobar_factura(v_invoice);

  select * into v_profile from public.profiles where id = p_user;
  v_nif := public.verifactu_normalizar_nif(public.exigir_nif_emisor(p_user));
  if v_nif !~ '^[0-9A-Z]{9}$' or not public.verifactu_nif_valido(v_nif) then
    raise exception 'Tu NIF («%») no es válido: revisa que esté bien escrito, con su letra. Corrígelo en Ajustes → Perfil.', v_profile.tax_id
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
     where invoice_id = v_invoice.rectifies_invoice_id and record_type = 'alta'
     order by orden limit 1;
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

  -- Subsanación: «X» si la AEAT no ha aceptado todavía ningún alta de esta factura.
  if p_subsana is not null then
    v_rechazo_previo := case when exists (
      select 1 from public.fiscal_records
       where invoice_id = p_invoice_id and record_type = 'alta'
         and estado_envio in ('aceptado', 'aceptado_con_errores')
    ) then null else 'X' end;
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
    'Subsanacion', case when p_subsana is not null then 'S' end,
    'RechazoPrevio', v_rechazo_previo,
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
    hash_anterior, hash, hash_input, modalidad, estado_envio, fecha_hora_huso, registro, subsana_registro_id
  ) values (
    p_user, p_invoice_id, 'alta', v_nif, v_nombre_emisor,
    btrim(v_invoice.invoice_number), v_invoice.issue_date, v_tipo, v_importe, v_cuota,
    v_anterior.hash, v_hash, v_hash_input, v_modalidad,
    case when v_modalidad = 'verifactu' then 'pendiente' else 'no_aplica' end,
    v_fhh, v_registro, p_subsana
  )
  returning * into v_record;

  update public.invoices set fiscal_locked = true where id = p_invoice_id and not fiscal_locked;

  return v_record;
end;
$function$;

revoke all on function public.verifactu_insertar_alta(uuid, uuid, uuid) from public, anon, authenticated;

-- Alta normal (la llama generate_fiscal_record al emitir la factura).
create or replace function public.registrar_factura_fiscal(p_invoice_id uuid, p_user uuid)
returns public.fiscal_records
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
begin
  if p_user is null then
    raise exception 'Falta el usuario para el registro fiscal.';
  end if;
  -- Un registro a la vez por usuario: dos facturas simultáneas no pueden
  -- encadenar con la misma huella anterior.
  perform pg_advisory_xact_lock(hashtextextended('registro_fiscal:' || p_user::text, 0));

  if exists (select 1 from public.fiscal_records where invoice_id = p_invoice_id and record_type = 'alta') then
    raise exception 'Esta factura ya tiene su registro fiscal.';
  end if;
  return public.verifactu_insertar_alta(p_invoice_id, p_user, null);
end;
$function$;

revoke all on function public.registrar_factura_fiscal(uuid, uuid) from public, anon, authenticated;
grant execute on function public.registrar_factura_fiscal(uuid, uuid) to service_role;

-- Subsanación, desde Registro fiscal → «Corregir y reenviar».
create or replace function public.subsanar_registro_fiscal(p_registro_id uuid)
returns public.fiscal_records
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_reg public.fiscal_records%rowtype;
begin
  if v_user is null then
    raise exception 'Hace falta iniciar sesión.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('registro_fiscal:' || v_user::text, 0));

  select * into v_reg from public.fiscal_records where id = p_registro_id and user_id = v_user;
  if not found then
    raise exception 'Registro fiscal no encontrado.' using errcode = 'P0002';
  end if;
  if v_reg.record_type <> 'alta' then
    raise exception 'Solo se puede corregir y reenviar el registro de alta de una factura.' using errcode = 'P0001';
  end if;
  if v_reg.modalidad <> 'verifactu' then
    raise exception 'Este registro no se envía a la AEAT.' using errcode = 'P0001';
  end if;
  if v_reg.estado_envio not in ('rechazado', 'aceptado_con_errores') then
    raise exception 'Solo se corrigen los registros rechazados o aceptados con errores por la AEAT.' using errcode = 'P0001';
  end if;
  if v_reg.envio_error_codigo = 'HUELLA' then
    raise exception 'Este registro no se envió porque su huella no cuadra. Escribe a soporte@devfreelancer.app.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.fiscal_records where subsana_registro_id = p_registro_id) then
    raise exception 'Este registro ya se corrigió y se volvió a enviar.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.fiscal_records
              where invoice_id = v_reg.invoice_id and record_type = 'anulacion') then
    raise exception 'Esta factura está anulada: no se puede volver a enviar.' using errcode = 'P0001';
  end if;

  return public.verifactu_insertar_alta(v_reg.invoice_id, v_user, v_reg.id);
end;
$function$;

revoke all on function public.subsanar_registro_fiscal(uuid) from public, anon;
grant execute on function public.subsanar_registro_fiscal(uuid) to authenticated, service_role;

-- 4. Anulación: «sin registro previo» si la AEAT no tiene la factura ────────
create or replace function public.generate_fiscal_cancellation(p_invoice_id uuid)
returns public.fiscal_records
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_alta public.fiscal_records%rowtype;
  v_anterior public.fiscal_records%rowtype;
  v_record public.fiscal_records;
  v_fhh text;
  v_fecha text;
  v_hash_input text;
  v_hash text;
  v_modalidad text;
  v_sin_registro text;
begin
  if v_user is null then
    raise exception 'Hace falta iniciar sesión para anular una factura.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('registro_fiscal:' || v_user::text, 0));

  if not exists (select 1 from public.invoices where id = p_invoice_id and user_id = v_user) then
    raise exception 'Factura no encontrada o no pertenece al usuario actual.';
  end if;

  -- El alta vigente: la última (una subsanación sustituye a la anterior).
  select * into v_alta from public.fiscal_records
   where invoice_id = p_invoice_id and user_id = v_user and record_type = 'alta'
   order by orden desc limit 1;
  if not found then
    raise exception 'Esta factura no tiene registro fiscal — no hace falta anularla, se puede borrar normalmente.';
  end if;
  if exists (select 1 from public.fiscal_records where invoice_id = p_invoice_id and record_type = 'anulacion') then
    raise exception 'Esta factura ya está anulada.';
  end if;

  -- La AEAT no tiene la factura si ninguna de sus altas se aceptó y la última
  -- fue rechazada. Sin la marca respondería 3002 («No existe el registro»).
  if v_alta.estado_envio = 'rechazado' and not exists (
    select 1 from public.fiscal_records
     where invoice_id = p_invoice_id and record_type = 'alta'
       and estado_envio in ('aceptado', 'aceptado_con_errores')
  ) then
    v_sin_registro := 'S';
  end if;

  v_anterior := public.verifactu_ultimo_registro(v_user);
  v_fhh := public.verifactu_fecha_hora_huso();
  v_fecha := public.verifactu_fecha(v_alta.fecha_expedicion);

  v_hash_input :=
    'IDEmisorFacturaAnulada=' || v_alta.nif_emisor ||
    '&NumSerieFacturaAnulada=' || v_alta.numero_factura ||
    '&FechaExpedicionFacturaAnulada=' || v_fecha ||
    '&Huella=' || coalesce(v_anterior.hash, '') ||
    '&FechaHoraHusoGenRegistro=' || v_fhh;
  v_hash := public.verifactu_huella_anulacion(v_alta.nif_emisor, v_alta.numero_factura, v_fecha, v_anterior.hash, v_fhh);

  select coalesce(veri_factu_modality, 'no_verifactu') into v_modalidad from public.profiles where id = v_user;

  insert into public.fiscal_records (
    user_id, invoice_id, record_type, nif_emisor, nombre_emisor,
    numero_factura, fecha_expedicion, tipo_factura, importe_total_cents, cuota_total_cents,
    hash_anterior, hash, hash_input, modalidad, estado_envio, fecha_hora_huso, registro
  ) values (
    v_user, p_invoice_id, 'anulacion', v_alta.nif_emisor, v_alta.nombre_emisor,
    v_alta.numero_factura, v_alta.fecha_expedicion, v_alta.tipo_factura, v_alta.importe_total_cents, v_alta.cuota_total_cents,
    v_anterior.hash, v_hash, v_hash_input, v_modalidad,
    case when v_modalidad = 'verifactu' then 'pendiente' else 'no_aplica' end,
    v_fhh,
    jsonb_strip_nulls(jsonb_build_object(
      'IDVersion', '1.0',
      'IDFactura', jsonb_build_object(
        'IDEmisorFacturaAnulada', v_alta.nif_emisor,
        'NumSerieFacturaAnulada', v_alta.numero_factura,
        'FechaExpedicionFacturaAnulada', v_fecha),
      'SinRegistroPrevio', v_sin_registro,
      'Encadenamiento', public.verifactu_encadenamiento(v_anterior),
      'SistemaInformatico', public.verifactu_sistema_informatico(v_user),
      'FechaHoraHusoGenRegistro', v_fhh,
      'TipoHuella', '01',
      'Huella', v_hash))
  )
  returning * into v_record;

  return v_record;
end;
$function$;

revoke all on function public.generate_fiscal_cancellation(uuid) from public, anon;
grant execute on function public.generate_fiscal_cancellation(uuid) to authenticated, service_role;

-- 5. Nadie vacía ni borra el registro fiscal ────────────────────────────────
-- (TRUNCATE se salta RLS y los disparadores de fila; Supabase lo concede por
-- defecto a anon y authenticated.)
revoke truncate, references, trigger on public.fiscal_records from anon, authenticated;
revoke truncate, references, trigger on public.verifactu_control_envio from anon, authenticated;

create or replace function public.fiscal_records_no_borrar()
returns trigger language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'El registro fiscal no se puede vaciar.' using errcode = '42501';
  end if;
  -- Solo la baja de la cuenta (eliminar_datos_de_cuenta), que antes los archiva 4 años.
  if current_setting('app.eliminar_cuenta', true) is distinct from old.user_id::text then
    raise exception 'Un registro fiscal no se puede borrar.' using errcode = '42501';
  end if;
  return old;
end;
$$;

create or replace trigger fiscal_records_no_borrar
  before delete on public.fiscal_records
  for each row execute function public.fiscal_records_no_borrar();
create or replace trigger fiscal_records_no_vaciar
  before truncate on public.fiscal_records
  for each statement execute function public.fiscal_records_no_borrar();

-- 6. Avisos al usuario (no repetir el mismo aviso) ──────────────────────────
alter table public.verifactu_control_envio
  add column if not exists ultimo_aviso text,
  add column if not exists ultimo_aviso_en timestamptz;

comment on column public.verifactu_control_envio.ultimo_aviso is
  'Motivo del último correo enviado al usuario (certificado, rechazo…), para no repetirlo cada minuto.';
