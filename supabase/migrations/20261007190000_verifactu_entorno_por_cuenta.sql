-- Verifactu, fase 4 (preparación, 07/10/2026): solo VERI*FACTU y envío a la
-- AEAT encendido cuenta por cuenta. Decidido por Ana: «empezar de cero».
--
--   profiles.verifactu_entorno
--     'sin_envio'  (por defecto) los registros se generan y encadenan, pero
--                  son internos: no se envían a ningún sitio (estado no_aplica)
--                  y el PDF no lleva QR ni la mención VERI*FACTU.
--     'pruebas'    se envían al entorno de pruebas de la AEAT.
--     'produccion' se envían a la AEAT real (además, la función de envío
--                  necesita VERIFACTU_PRODUCCION_PERMITIDA = 'si').
--   Solo lo cambia el servidor (verifactu_cambiar_entorno, clave de servicio).
--
--   fiscal_records.entorno: el entorno con el que nació cada registro
--   (null = interno). Cada entorno lleva su PROPIA cadena: al encender una
--   cuenta, su primer registro oficial es PrimerRegistro=S. Lo anterior queda
--   como registro interno, sin enviarse nunca.
--
-- «No Veri*Factu» desaparece: exige firmar cada registro y un registro de
-- eventos que la app no tiene (decisión de Ana del 06/10: solo VERI*FACTU).

alter table public.profiles
  add column if not exists verifactu_entorno text not null default 'sin_envio';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_verifactu_entorno_check') then
    alter table public.profiles add constraint profiles_verifactu_entorno_check
      check (verifactu_entorno in ('sin_envio', 'pruebas', 'produccion'));
  end if;
  -- Solo queda la modalidad VERI*FACTU.
  update public.profiles set veri_factu_modality = 'verifactu' where veri_factu_modality is distinct from 'verifactu';
  alter table public.profiles alter column veri_factu_modality set default 'verifactu';
  if not exists (select 1 from pg_constraint where conname = 'profiles_solo_verifactu') then
    alter table public.profiles add constraint profiles_solo_verifactu check (veri_factu_modality = 'verifactu');
  end if;
end $$;

comment on column public.profiles.verifactu_entorno is
  'Adónde se envían los registros de facturación: sin_envio (internos), pruebas (AEAT de pruebas) o produccion (AEAT real). Solo lo cambia el servidor con verifactu_cambiar_entorno.';

-- El usuario no puede encenderse solo el envío (ni a la AEAT real ni a pruebas).
-- Decide por current_user: NUNCA security definer.
create or replace function public.proteger_verifactu_entorno()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.verifactu_entorno is distinct from old.verifactu_entorno
     and current_user in ('anon', 'authenticated') then
    raise exception 'El envío a la Agencia Tributaria lo activa DevFreelancer, no se cambia desde la cuenta.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace trigger proteger_verifactu_entorno
  before update of verifactu_entorno on public.profiles
  for each row execute function public.proteger_verifactu_entorno();

alter table public.fiscal_records
  add column if not exists entorno text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fiscal_records_entorno_check') then
    alter table public.fiscal_records add constraint fiscal_records_entorno_check
      check (entorno is null or entorno in ('pruebas', 'produccion'));
  end if;
end $$;

comment on column public.fiscal_records.entorno is
  'Entorno de la AEAT al que va este registro (null = registro interno, no se envía). Fijado al crearlo.';

-- Entorno actual de una cuenta como lo guarda fiscal_records (null = interno).
create or replace function public.verifactu_entorno_de(p_user uuid)
returns text
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select nullif(verifactu_entorno, 'sin_envio') from public.profiles where id = p_user
$$;

-- Al crearse, cada registro toma el entorno de su cuenta y, con él, su estado.
-- Así no hay que tocar las funciones que lo insertan (alta, anulación,
-- subsanación): todas pasan por aquí.
create or replace function public.fiscal_records_entorno()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  new.entorno := public.verifactu_entorno_de(new.user_id);
  new.modalidad := 'verifactu';
  new.estado_envio := case when new.entorno is null then 'no_aplica' else 'pendiente' end;
  return new;
end;
$$;

create or replace trigger fiscal_records_entorno
  before insert on public.fiscal_records
  for each row execute function public.fiscal_records_entorno();

-- El entorno es parte del registro: no se cambia después.
create or replace function public.fiscal_records_inmutable()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if (new.user_id, new.invoice_id, new.record_type, new.nif_emisor, new.nombre_emisor, new.numero_factura,
      new.fecha_expedicion, new.tipo_factura, new.importe_total_cents, new.cuota_total_cents,
      new.hash_anterior, new.hash, new.hash_input, new.modalidad, new.fecha_hora_huso, new.registro,
      new.orden, new.created_at, new.subsana_registro_id, new.entorno)
     is distinct from
     (old.user_id, old.invoice_id, old.record_type, old.nif_emisor, old.nombre_emisor, old.numero_factura,
      old.fecha_expedicion, old.tipo_factura, old.importe_total_cents, old.cuota_total_cents,
      old.hash_anterior, old.hash, old.hash_input, old.modalidad, old.fecha_hora_huso, old.registro,
      old.orden, old.created_at, old.subsana_registro_id, old.entorno)
  then
    raise exception 'Un registro fiscal no se puede modificar: solo cambian los datos de su envío a la AEAT.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

-- Encadenamiento: el último registro de la cadena del entorno ACTUAL de la
-- cuenta. Al encender el envío, la cadena oficial empieza vacía
-- (PrimerRegistro=S); los registros internos siguen su propia cadena.
create or replace function public.verifactu_ultimo_registro(p_user uuid)
returns public.fiscal_records
language sql
stable
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  select * from public.fiscal_records
   where user_id = p_user
     and entorno is not distinct from public.verifactu_entorno_de(p_user)
   order by orden desc
   limit 1
$function$;

-- Comprobación de la cadena: una por entorno.
create or replace function public.verify_fiscal_chain(p_user_id uuid)
returns table(record_id uuid, numero_factura text, created_at timestamp with time zone, is_valid boolean, expected_hash text, stored_hash text)
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
           lag(fr.hash) over (partition by fr.entorno order by fr.orden) as hash_previo,
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

-- Encender o apagar el envío de una cuenta. Solo con la clave de servicio.
-- Para la AEAT real exige NIF válido y certificado digital subido.
create or replace function public.verifactu_cambiar_entorno(p_user uuid, p_entorno text)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_perfil public.profiles%rowtype;
begin
  if p_entorno not in ('sin_envio', 'pruebas', 'produccion') then
    raise exception 'Entorno no válido: %', p_entorno using errcode = '22023';
  end if;
  -- Misma cerradura que la emisión de registros: ninguno se cuela a medias.
  perform pg_advisory_xact_lock(hashtextextended('registro_fiscal:' || p_user::text, 0));

  select * into v_perfil from public.profiles where id = p_user for update;
  if not found then
    raise exception 'La cuenta no existe' using errcode = 'P0002';
  end if;
  if p_entorno <> 'sin_envio' then
    if not coalesce(v_perfil.veri_factu_enabled, false) then
      raise exception 'La cuenta no tiene activado el cumplimiento fiscal.' using errcode = 'P0001';
    end if;
    if not public.verifactu_nif_valido(v_perfil.tax_id) then
      raise exception 'La cuenta no tiene un NIF válido.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.user_secrets
                    where user_id = p_user
                      and veri_factu_cert_storage_path is not null
                      and veri_factu_cert_password_encrypted is not null) then
      raise exception 'La cuenta no ha subido su certificado digital.' using errcode = 'P0001';
    end if;
  end if;

  update public.profiles set verifactu_entorno = p_entorno where id = p_user;
  return p_entorno;
end;
$$;

revoke all on function public.verifactu_cambiar_entorno(uuid, text) from public, anon, authenticated;
grant execute on function public.verifactu_cambiar_entorno(uuid, text) to service_role;
revoke all on function public.verifactu_entorno_de(uuid) from public, anon;
