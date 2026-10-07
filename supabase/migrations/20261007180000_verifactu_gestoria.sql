-- ============================================================================
-- Verifactu: lo que pidió la gestoría (07/10/2026), decisiones de Ana.
--
-- 1. Rectificativas R1 o R4 según la CAUSA (antes, siempre R1):
--      descuento posterior, operación cancelada o devuelta (art. 80.Dos LIVA)
--      o error en el IVA (error fundado en derecho)            → R1
--      cualquier otro motivo (error de precio, horas o datos,
--      acuerdo posterior)                                       → R4 (residual,
--                                                                 «válida siempre»)
--      rectificativa de una simplificada                        → R5 (como antes)
--    La causa se elige al rectificar (crear_factura_rectificativa_causa) y queda
--    bloqueada con la factura. Sin causa (llamadas antiguas) → R4.
-- 2. Conservación: lo fiscal de una cuenta dada de baja se guarda 6 AÑOS
--    (Código de Comercio art. 30), no 4. La política de privacidad ya decía
--    «hasta 6 años». El archivo que ya existía se alarga 2 años.
-- 3. Cada envío a la AEAT se guarda entero: XML enviado y respuesta íntegra
--    (verifactu_envios), enlazado desde cada registro. Se archiva con la baja.
-- ============================================================================

-- 1. Causa de la rectificativa ──────────────────────────────────────────────
alter table public.invoices
  add column if not exists causa_rectificacion text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_causa_rectificacion_valida') then
    alter table public.invoices add constraint invoices_causa_rectificacion_valida
      check (causa_rectificacion is null or causa_rectificacion in ('descuento', 'cancelacion', 'error_iva', 'otro'));
  end if;
end $$;

comment on column public.invoices.causa_rectificacion is
  'Causa de una factura rectificativa: descuento | cancelacion | error_iva (→ R1) u otro (→ R4). Decide el TipoFactura del registro Verifactu.';

-- Tipo de factura de una rectificativa según la causa y la factura original.
create or replace function public.verifactu_tipo_rectificativa(p_causa text, p_tipo_original text)
returns text language sql immutable
set search_path to 'public', 'pg_temp'
as $$
  select case
    when p_tipo_original in ('F2', 'R5') then 'R5'
    when p_causa in ('descuento', 'cancelacion', 'error_iva') then 'R1'
    else 'R4'
  end
$$;

-- La causa y la factura rectificada también quedan bloqueadas con el registro.
create or replace function public.enforce_invoice_fiscal_lock()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_has_cancellation boolean;
begin
  if TG_OP = 'DELETE' then
    if OLD.fiscal_locked then
      if current_setting('app.eliminar_cuenta', true) = OLD.user_id::text then
        return OLD;
      end if;

      select exists(
        select 1 from public.fiscal_records
        where invoice_id = OLD.id and record_type = 'anulacion'
      ) into v_has_cancellation;

      if not v_has_cancellation then
        raise exception 'No se puede eliminar una factura con registro fiscal Veri*Factu sin anularla antes.';
      end if;
    end if;
    return OLD;
  end if;

  if OLD.fiscal_locked then
    if NEW.items is distinct from OLD.items
      or NEW.subtotal_cents is distinct from OLD.subtotal_cents
      or NEW.tax_percent is distinct from OLD.tax_percent
      or NEW.total_cents is distinct from OLD.total_cents
      or NEW.irpf_percent is distinct from OLD.irpf_percent
      or NEW.issue_date is distinct from OLD.issue_date
      or NEW.client_id is distinct from OLD.client_id
      or NEW.invoice_number is distinct from OLD.invoice_number
      or NEW.motivo_sin_iva is distinct from OLD.motivo_sin_iva
      or NEW.rectifies_invoice_id is distinct from OLD.rectifies_invoice_id
      or NEW.causa_rectificacion is distinct from OLD.causa_rectificacion
    then
      raise exception 'No se puede modificar una factura con registro fiscal Veri*Factu generado. Usa una factura rectificativa.';
    end if;
  end if;

  return NEW;
end;
$function$;

-- Rectificativa con su causa. Envuelve crear_factura_rectificativa (que sigue
-- igual) y apunta la causa antes de que la factura se registre y se bloquee.
create or replace function public.crear_factura_rectificativa_causa(p_factura uuid, p_items jsonb, p_motivo text, p_causa text)
returns public.invoices
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_nueva public.invoices%rowtype;
begin
  if p_causa is null or p_causa not in ('descuento', 'cancelacion', 'error_iva', 'otro') then
    raise exception 'Elige la causa de la rectificación.' using errcode = '22023';
  end if;
  select * into v_nueva from public.crear_factura_rectificativa(p_factura, p_items, p_motivo);
  update public.invoices set causa_rectificacion = p_causa
   where id = v_nueva.id and user_id = auth.uid()
   returning * into v_nueva;
  return v_nueva;
end;
$function$;

revoke all on function public.crear_factura_rectificativa_causa(uuid, jsonb, text, text) from public, anon;
grant execute on function public.crear_factura_rectificativa_causa(uuid, jsonb, text, text) to authenticated, service_role;

-- El alta: igual que en verifactu_fase3, salvo el tipo de las rectificativas
-- (R1/R4/R5 según la causa) y que R4 también exige destinatario.
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

  if v_invoice.rectifies_invoice_id is not null then
    select * into v_original from public.invoices where id = v_invoice.rectifies_invoice_id;
    select * into v_reg_original from public.fiscal_records
     where invoice_id = v_invoice.rectifies_invoice_id and record_type = 'alta'
     order by orden limit 1;
    v_tipo := public.verifactu_tipo_rectificativa(v_invoice.causa_rectificacion, v_reg_original.tipo_factura);
  elsif v_destinatario is not null then
    v_tipo := 'F1';
  elsif v_importe <= 40000 then
    v_tipo := 'F2';
  else
    raise exception 'Para una factura de más de 400 € el cliente tiene que estar identificado: añade su NIF (o su documento y país, si es extranjero) en su ficha.'
      using errcode = 'P0001';
  end if;
  if v_tipo in ('R1', 'R4') and v_destinatario is null then
    raise exception 'Para rectificar la factura hace falta identificar al cliente: añade su NIF (o su documento y país) en su ficha.'
      using errcode = 'P0001';
  end if;
  if v_tipo in ('F2', 'R5') then
    v_destinatario := null;
  end if;

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
    'TipoRectificativa', case when v_tipo like 'R%' then 'I' end,
    'FacturasRectificadas', case when v_tipo like 'R%' then jsonb_build_array(jsonb_build_object(
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

-- 2 y 3. Envíos completos a la AEAT ─────────────────────────────────────────
create table if not exists public.verifactu_envios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nif_emisor text not null,
  entorno text not null check (entorno in ('pruebas', 'produccion')),
  enviado_en timestamptz not null default now(),
  num_registros int not null,
  http_status int,
  estado_envio text,
  csv text,
  codigo_error text,
  peticion_xml text not null,
  respuesta_xml text
);
comment on table public.verifactu_envios is
  'Cada envío a la AEAT, entero: el XML enviado y la respuesta íntegra (lo pide la gestoría para poder demostrar qué se envió y qué contestó Hacienda). Solo lo escribe verifactu-enviar.';
create index if not exists verifactu_envios_usuario on public.verifactu_envios (user_id, enviado_en desc);

alter table public.verifactu_envios enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'verifactu_envios' and policyname = 'verifactu_envios_leer') then
    create policy verifactu_envios_leer on public.verifactu_envios
      for select to authenticated using ((select auth.uid()) = user_id);
  end if;
end $$;

-- Como el registro fiscal: no se cambia, no se borra (salvo la baja) ni se vacía.
create or replace function public.verifactu_envios_inmutable()
returns trigger language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'Los envíos a la AEAT no se pueden vaciar.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    raise exception 'Un envío a la AEAT no se puede modificar.' using errcode = '42501';
  end if;
  if current_setting('app.eliminar_cuenta', true) is distinct from old.user_id::text then
    raise exception 'Un envío a la AEAT no se puede borrar.' using errcode = '42501';
  end if;
  return old;
end;
$$;
create or replace trigger verifactu_envios_inmutable
  before update or delete on public.verifactu_envios
  for each row execute function public.verifactu_envios_inmutable();
create or replace trigger verifactu_envios_no_vaciar
  before truncate on public.verifactu_envios
  for each statement execute function public.verifactu_envios_inmutable();

alter table public.fiscal_records
  add column if not exists envio_id uuid references public.verifactu_envios(id);
comment on column public.fiscal_records.envio_id is
  'Último envío a la AEAT de este registro (verifactu_envios: XML enviado y respuesta íntegra).';

alter table public.archivo_fiscal_cuentas_eliminadas
  add column if not exists envios_aeat jsonb not null default '[]'::jsonb;

-- Baja de cuenta: 6 años y con los envíos a la AEAT.
create or replace function public.eliminar_datos_de_cuenta(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_facturas int;
  v_ultima date;
  v_perfil public.profiles%rowtype;
begin
  select * into v_perfil from public.profiles where id = p_user;
  if not found then
    raise exception 'La cuenta no existe' using errcode = 'P0002';
  end if;

  perform set_config('app.eliminar_cuenta', p_user::text, true);

  select count(*), max(issue_date) into v_facturas, v_ultima from public.invoices where user_id = p_user;
  if v_facturas > 0 then
    insert into public.archivo_fiscal_cuentas_eliminadas
      (user_id, emisor, facturas, registros_fiscales, cobros, clientes, envios_aeat, conservar_hasta)
    values (
      p_user,
      jsonb_build_object(
        'nombre', coalesce(v_perfil.business_name, v_perfil.full_name),
        'email', v_perfil.email,
        'nif', v_perfil.tax_id,
        'direccion', concat_ws(', ', v_perfil.fiscal_street, v_perfil.fiscal_postal_code, v_perfil.fiscal_city, v_perfil.fiscal_province)
      ),
      (select coalesce(jsonb_agg(to_jsonb(i) order by i.issue_date, i.invoice_number), '[]') from public.invoices i where i.user_id = p_user),
      (select coalesce(jsonb_agg(to_jsonb(f) order by f.created_at), '[]') from public.fiscal_records f where f.user_id = p_user),
      (select coalesce(jsonb_agg(to_jsonb(p) order by p.paid_at), '[]') from public.payments p
         where p.invoice_id in (select id from public.invoices where user_id = p_user)),
      (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'company', c.company, 'email', c.email, 'tax_id', c.tax_id, 'address', c.address)), '[]')
         from public.clients c where c.id in (select client_id from public.invoices where user_id = p_user)),
      (select coalesce(jsonb_agg(to_jsonb(e) order by e.enviado_en), '[]') from public.verifactu_envios e where e.user_id = p_user),
      -- 6 años: Código de Comercio (art. 30); cubre también los 4 de Hacienda.
      (make_date(extract(year from greatest(current_date, v_ultima))::int + 6, 12, 31))
    );
  end if;

  update public.platform_payments set user_id = null, user_email = null where user_id = p_user;
  update public.referrals set status = 'Cancelled', referred_user_name = null where referred_user_id = p_user;

  delete from public.payments where user_id = p_user or invoice_id in (select id from public.invoices where user_id = p_user);
  delete from public.fiscal_records where user_id = p_user;
  delete from public.verifactu_envios where user_id = p_user;
  delete from public.invoices where user_id = p_user;
  delete from public.budgets where user_id = p_user;
  delete from public.proposals where user_id = p_user;
  delete from public.expenses where user_id = p_user;
  delete from public.project_milestones where user_id = p_user;
  delete from public.project_comments where user_id = p_user::text;  -- esta columna es text
  delete from public.time_entries where user_id = p_user;
  delete from public.tasks where user_id = p_user;
  delete from public.jobs where user_id = p_user;
  delete from public.webhooks_enviados where user_id = p_user;
  delete from public.rate_limit_buckets where user_id = p_user;
  delete from auth.flow_state where user_id = p_user;

  return jsonb_build_object('facturas_archivadas', v_facturas);
end;
$function$;

-- Lo ya archivado con el plazo antiguo (4 años) pasa a 6.
update public.archivo_fiscal_cuentas_eliminadas
   set conservar_hasta = (conservar_hasta + interval '2 years')::date
 where conservar_hasta < make_date(extract(year from eliminada_en)::int + 6, 12, 31);
