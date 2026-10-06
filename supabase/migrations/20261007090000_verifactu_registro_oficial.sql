-- ============================================================================
-- Verifactu, fase 1 (07/10/2026): registro de facturación con el formato oficial.
--
-- Hasta hoy la huella era «NIF|número|fecha|tipo|total|anterior» en minúsculas,
-- un formato propio. La AEAT define otro (documento «Algoritmo de cálculo de
-- codificación de la huella o hash», v0.1.2):
--
--   IDEmisorFactura=…&NumSerieFactura=…&FechaExpedicionFactura=DD-MM-AAAA
--   &TipoFactura=…&CuotaTotal=…&ImporteTotal=…&Huella=<anterior>
--   &FechaHoraHusoGenRegistro=AAAA-MM-DDThh:mm:ss+hh:mm
--   → SHA-256, hexadecimal en MAYÚSCULAS.
--
-- Ejemplo oficial (prueba en supabase/pruebas/verifactu-registro.sql):
--   …89890001K…12345678/G33…01-01-2024…F1…12.35…123.45……2024-01-01T19:20:30+01:00
--   → 3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60
--
-- Además cada registro guarda en `registro` (jsonb) TODO su contenido con los
-- nombres de campo del XSD (RegistroAlta / RegistroAnulacion): destinatario,
-- desglose de IVA, encadenamiento, sistema informático… Es una foto inmutable
-- de la factura en el momento de emitirla. El XML que se envía a la AEAT
-- (fase 2) se genera a partir de ella (supabase/functions/_shared/verifactu-xml.ts).
--
-- En producción no hay ningún registro fiscal (comprobado el 06/10/2026): no
-- hay cadena antigua que conservar. Si los hubiera, seguirían verificándose con
-- su formato antiguo (verify_fiscal_chain distingue los dos).
--
-- Decisiones (plan-verifactu.md): solo VERI*FACTU; ImporteTotal = base + cuota
-- de IVA (la retención de IRPF no forma parte del registro); destinatario
-- obligatorio en F1/R1, factura simplificada (F2) solo hasta 400 € con IVA.
-- ============================================================================

-- 1. Clientes: país y si es particular ─────────────────────────────────────
alter table public.clients
  add column if not exists pais text,
  add column if not exists es_particular boolean not null default false;

alter table public.clients drop constraint if exists clients_pais_formato;
alter table public.clients add constraint clients_pais_formato
  check (pais is null or pais ~ '^[A-Z]{2}$');

comment on column public.clients.pais is
  'Código ISO 3166-1 alfa-2 del país del cliente (ES, FR, US…). Obligatorio para clientes de fuera de España con documento extranjero.';
comment on column public.clients.es_particular is
  'Particular (no empresa ni autónomo). Fuera de la UE cambia la mención legal (art. 69.Dos LIVA) y el tipo de documento del registro fiscal.';

-- 2. Motivo sin IVA para particulares de fuera de la UE ─────────────────────
alter table public.invoices drop constraint if exists invoices_motivo_sin_iva_valido;
alter table public.invoices add constraint invoices_motivo_sin_iva_valido
  check (motivo_sin_iva in ('inversion_sujeto_pasivo_ue', 'no_sujeta_fuera_ue', 'no_sujeta_fuera_ue_particular'));

create or replace function public.invoices_validar_motivo_sin_iva()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tipo text;
  v_particular boolean;
begin
  if tg_op = 'UPDATE' and old.fiscal_locked then
    return new;
  end if;

  if new.tax_percent = 0 then
    select tipo_fiscal, es_particular into v_tipo, v_particular from public.clients where id = new.client_id;
    new.motivo_sin_iva := case
      when v_tipo = 'empresa_ue' then 'inversion_sujeto_pasivo_ue'
      when v_tipo = 'fuera_ue' and v_particular then 'no_sujeta_fuera_ue_particular'
      when v_tipo = 'fuera_ue' then 'no_sujeta_fuera_ue'
    end;
  elsif tg_op = 'UPDATE' and old.tax_percent = 0
        and new.motivo_sin_iva is not distinct from old.motivo_sin_iva then
    new.motivo_sin_iva := null;
  end if;

  if new.motivo_sin_iva = 'inversion_sujeto_pasivo_ue' then
    if not exists (
      select 1 from public.clients
      where id = new.client_id and nif_iva is not null
    ) then
      raise exception 'Para facturar sin IVA a una empresa de la UE, el cliente necesita su NIF-IVA.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$function$;

-- 3. Registro fiscal: campos nuevos ─────────────────────────────────────────
alter table public.fiscal_records
  add column if not exists fecha_hora_huso text,
  add column if not exists cuota_total_cents bigint,
  add column if not exists registro jsonb not null default '{}'::jsonb;

comment on column public.fiscal_records.registro is
  'Contenido completo del registro (RegistroAlta o RegistroAnulacion) con los nombres de campo del XSD de la AEAT. Inmutable.';
comment on column public.fiscal_records.fecha_hora_huso is
  'FechaHoraHusoGenRegistro exactamente como entra en la huella (AAAA-MM-DDThh:mm:ss+hh:mm, hora de Madrid).';
comment on column public.fiscal_records.importe_total_cents is
  'ImporteTotal del registro: base + cuota de IVA (sin la retención de IRPF). En registros anteriores a la fase 1 era el total a cobrar.';

-- Orden de la cadena. created_at no sirve: dentro de una misma transacción
-- todas las filas tienen la misma hora (now()), y el registro anterior saldría
-- al azar. Este número crece siempre, en el orden real de inserción.
alter table public.fiscal_records
  add column if not exists orden bigint generated always as identity;
create unique index if not exists fiscal_records_orden_por_usuario
  on public.fiscal_records (user_id, orden);

-- Una factura, un solo registro de alta y como mucho uno de anulación.
create unique index if not exists fiscal_records_un_alta_por_factura
  on public.fiscal_records (invoice_id) where record_type = 'alta';
create unique index if not exists fiscal_records_una_anulacion_por_factura
  on public.fiscal_records (invoice_id) where record_type = 'anulacion';

-- 4. Piezas del formato oficial ─────────────────────────────────────────────

-- Importe con dos decimales y punto: 12345 céntimos → '123.45'; -500 → '-5.00'.
create or replace function public.verifactu_importe(p_cents bigint)
returns text language sql immutable
as $$ select to_char(p_cents / 100.0, 'FM999999999990.00') $$;

-- Fecha DD-MM-AAAA.
create or replace function public.verifactu_fecha(p_fecha date)
returns text language sql immutable
as $$ select to_char(p_fecha, 'DD-MM-YYYY') $$;

-- Fecha, hora y huso de Madrid, con el desfase en formato +hh:mm.
create or replace function public.verifactu_fecha_hora_huso(p_instante timestamptz default clock_timestamp())
returns text language plpgsql stable
as $$
declare
  v_local timestamp := p_instante at time zone 'Europe/Madrid';
  v_min int := round(extract(epoch from (v_local - (p_instante at time zone 'UTC'))) / 60);
begin
  return to_char(v_local, 'YYYY-MM-DD"T"HH24:MI:SS')
      || case when v_min < 0 then '-' else '+' end
      || lpad((abs(v_min) / 60)::text, 2, '0') || ':' || lpad((abs(v_min) % 60)::text, 2, '0');
end;
$$;

-- NIF en mayúsculas, sin espacios, puntos ni guiones, y sin el prefijo ES.
create or replace function public.verifactu_normalizar_nif(p text)
returns text language sql immutable
as $$
  select case
    when v ~ '^ES[0-9A-Z]{9}$' then substr(v, 3)
    else v
  end
  from (select nullif(upper(regexp_replace(coalesce(p, ''), '[\s.\-]', '', 'g')), '') as v) s
$$;

create or replace function public.verifactu_huella_alta(
  p_nif text, p_num_serie text, p_fecha text, p_tipo text,
  p_cuota text, p_importe text, p_huella_anterior text, p_fecha_hora_huso text
) returns text language sql immutable
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  select upper(encode(extensions.digest(
    'IDEmisorFactura=' || btrim(p_nif) ||
    '&NumSerieFactura=' || btrim(p_num_serie) ||
    '&FechaExpedicionFactura=' || btrim(p_fecha) ||
    '&TipoFactura=' || btrim(p_tipo) ||
    '&CuotaTotal=' || btrim(p_cuota) ||
    '&ImporteTotal=' || btrim(p_importe) ||
    '&Huella=' || btrim(coalesce(p_huella_anterior, '')) ||
    '&FechaHoraHusoGenRegistro=' || btrim(p_fecha_hora_huso),
    'sha256'), 'hex'))
$$;

create or replace function public.verifactu_huella_anulacion(
  p_nif text, p_num_serie text, p_fecha text, p_huella_anterior text, p_fecha_hora_huso text
) returns text language sql immutable
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  select upper(encode(extensions.digest(
    'IDEmisorFacturaAnulada=' || btrim(p_nif) ||
    '&NumSerieFacturaAnulada=' || btrim(p_num_serie) ||
    '&FechaExpedicionFacturaAnulada=' || btrim(p_fecha) ||
    '&Huella=' || btrim(coalesce(p_huella_anterior, '')) ||
    '&FechaHoraHusoGenRegistro=' || btrim(p_fecha_hora_huso),
    'sha256'), 'hex'))
$$;

-- Datos del sistema informático (DevFreelancer) que van en cada registro.
-- Productor: la titular de DevFreelancer (lib/datosLegales.ts). Cambiar la
-- versión aquí cuando cambie la declaración responsable.
create or replace function public.verifactu_sistema_informatico(p_user uuid)
returns jsonb language sql immutable
as $$
  select jsonb_build_object(
    'NombreRazon', 'Ana Fernández Rodríguez',
    'NIF', '74870299D',
    'NombreSistemaInformatico', 'DevFreelancer',
    'IdSistemaInformatico', 'DF',
    'Version', '1.0',
    'NumeroInstalacion', p_user::text,
    'TipoUsoPosibleSoloVerifactu', 'S',
    'TipoUsoPosibleMultiOT', 'S',
    'IndicadorMultiplesOT', 'S'
  )
$$;

-- Destinatario del registro a partir del cliente, o null si no está
-- identificado (solo admisible en factura simplificada). Lanza un error claro
-- cuando el dato existe pero no sirve.
create or replace function public.verifactu_destinatario(p_client public.clients)
returns jsonb language plpgsql stable
set search_path to 'public', 'pg_temp'
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
    if v_doc !~ '^[0-9A-Z]{9}$' then
      raise exception 'El NIF del cliente «%» («%») no es válido: debe tener 9 caracteres. Corrígelo en su ficha.', v_nombre, p_client.tax_id
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

-- Comprobaciones de la factura que exige la AEAT antes de registrarla.
create or replace function public.verifactu_comprobar_factura(p_invoice public.invoices)
returns void language plpgsql stable
as $$
begin
  if p_invoice.issue_date > (now() at time zone 'Europe/Madrid')::date then
    raise exception 'La fecha de la factura % es posterior a hoy: no se puede registrar una factura con fecha futura.', p_invoice.invoice_number
      using errcode = 'P0001';
  end if;
  if p_invoice.issue_date < date '2024-10-28' then
    raise exception 'La fecha de la factura % es anterior al 28/10/2024, inicio del sistema Verifactu.', p_invoice.invoice_number
      using errcode = 'P0001';
  end if;
  if length(p_invoice.invoice_number) > 60
     or p_invoice.invoice_number !~ '^[ -~]+$'
     or p_invoice.invoice_number ~ '["''<>=]' then
    raise exception 'El número de factura «%» no es válido para Hacienda: hasta 60 caracteres, sin acentos ni los signos " '' < > =.', p_invoice.invoice_number
      using errcode = 'P0001';
  end if;
end;
$$;

-- Último registro de la cadena del usuario (alta o anulación).
create or replace function public.verifactu_ultimo_registro(p_user uuid)
returns public.fiscal_records language sql stable
as $$
  select * from public.fiscal_records
   where user_id = p_user
   order by orden desc
   limit 1
$$;

create or replace function public.verifactu_encadenamiento(p_anterior public.fiscal_records)
returns jsonb language sql immutable
as $$
  select case
    when p_anterior.id is null then jsonb_build_object('PrimerRegistro', 'S')
    else jsonb_build_object('RegistroAnterior', jsonb_build_object(
      'IDEmisorFactura', p_anterior.nif_emisor,
      'NumSerieFactura', p_anterior.numero_factura,
      'FechaExpedicionFactura', public.verifactu_fecha(p_anterior.fecha_expedicion),
      'Huella', p_anterior.hash))
  end
$$;

-- 5. Registro de alta ───────────────────────────────────────────────────────
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
  v_nombre_emisor := left(btrim(coalesce(nullif(btrim(v_profile.business_name), ''), v_profile.full_name, '')), 120);
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

-- 6. Registro de anulación ──────────────────────────────────────────────────
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
begin
  if v_user is null then
    raise exception 'Hace falta iniciar sesión para anular una factura.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('registro_fiscal:' || v_user::text, 0));

  if not exists (select 1 from public.invoices where id = p_invoice_id and user_id = v_user) then
    raise exception 'Factura no encontrada o no pertenece al usuario actual.';
  end if;

  select * into v_alta from public.fiscal_records
   where invoice_id = p_invoice_id and user_id = v_user and record_type = 'alta';
  if not found then
    raise exception 'Esta factura no tiene registro fiscal — no hace falta anularla, se puede borrar normalmente.';
  end if;
  if exists (select 1 from public.fiscal_records where invoice_id = p_invoice_id and record_type = 'anulacion') then
    raise exception 'Esta factura ya está anulada.';
  end if;

  -- El registro de anulación identifica la factura con los MISMOS datos de su alta.
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
    jsonb_build_object(
      'IDVersion', '1.0',
      'IDFactura', jsonb_build_object(
        'IDEmisorFacturaAnulada', v_alta.nif_emisor,
        'NumSerieFacturaAnulada', v_alta.numero_factura,
        'FechaExpedicionFacturaAnulada', v_fecha),
      'Encadenamiento', public.verifactu_encadenamiento(v_anterior),
      'SistemaInformatico', public.verifactu_sistema_informatico(v_user),
      'FechaHoraHusoGenRegistro', v_fhh,
      'TipoHuella', '01',
      'Huella', v_hash)
  )
  returning * into v_record;

  return v_record;
end;
$function$;

revoke all on function public.generate_fiscal_cancellation(uuid) from public, anon;
grant execute on function public.generate_fiscal_cancellation(uuid) to authenticated, service_role;

-- 7. Verificación de la cadena ──────────────────────────────────────────────
-- Un registro es válido si (a) su huella es el SHA-256 de su cadena de entrada
-- (en mayúsculas en el formato oficial; en minúsculas en el antiguo), y (b) en
-- el formato oficial, la huella anterior de su cadena es la del registro que
-- le precede.
create or replace function public.verify_fiscal_chain(p_user_id uuid)
returns table(record_id uuid, numero_factura text, created_at timestamptz, is_valid boolean, expected_hash text, stored_hash text)
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
begin
  if auth.uid() is null then
    raise exception 'No autorizado: hace falta sesion.' using errcode = '42501';
  end if;
  if p_user_id is distinct from auth.uid() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  return query
  with r as (
    select fr.*,
           lag(fr.hash) over (order by fr.orden) as hash_previo,
           fr.hash_input like 'IDEmisorFactura%' as oficial
      from public.fiscal_records fr
     where fr.user_id = p_user_id
  )
  select r.id, r.numero_factura, r.created_at,
         case
           when r.oficial then
             upper(encode(digest(r.hash_input, 'sha256'), 'hex')) = r.hash
             and r.hash_input like '%&Huella=' || coalesce(r.hash_previo, '') || '&FechaHoraHusoGenRegistro=%'
             and coalesce(r.hash_anterior, '') = coalesce(r.hash_previo, '')
           else encode(digest(r.hash_input, 'sha256'), 'hex') = r.hash
         end,
         case when r.oficial then upper(encode(digest(r.hash_input, 'sha256'), 'hex'))
              else encode(digest(r.hash_input, 'sha256'), 'hex') end,
         r.hash
    from r
   order by r.orden;
end;
$function$;

revoke all on function public.verify_fiscal_chain(uuid) from public, anon;
grant execute on function public.verify_fiscal_chain(uuid) to authenticated;

-- Las piezas internas no se exponen por la API.
revoke all on function public.verifactu_destinatario(public.clients) from public, anon, authenticated;
revoke all on function public.verifactu_comprobar_factura(public.invoices) from public, anon, authenticated;
revoke all on function public.verifactu_ultimo_registro(uuid) from public, anon, authenticated;
revoke all on function public.verifactu_encadenamiento(public.fiscal_records) from public, anon, authenticated;
revoke all on function public.verifactu_sistema_informatico(uuid) from public, anon, authenticated;
