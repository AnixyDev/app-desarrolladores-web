-- Programa de afiliados: que registre de verdad las comisiones.
--
-- Estaba roto en todas sus piezas (ver la auditoria, 27/09): el registro
-- ignoraba el ?ref= del enlace, nada lo mandaba a Stripe, el webhook insertaba
-- en columnas que no existen y solo miraba el primer pago, y la pagina nunca
-- cargaba los datos. Ademas la politica de referrals dejaba a cualquiera
-- escribir sus propias comisiones.
--
-- Como queda:
--  - Un referido es UNA fila de referrals por usuario invitado (unique en
--    referred_user_id). Se crea al darse de alta:
--      * con correo: handle_new_user lee el codigo de raw_user_meta_data->>'ref';
--      * con Google (no admite metadatos): la app llama despues a
--        vincular_referido(codigo), que solo vale en los 7 dias siguientes al
--        alta y si la cuenta aun no tiene afiliado.
--  - Cada factura PAGADA de una suscripcion del referido (primer pago y
--    renovaciones) genera una comision del 20% sobre la base sin impuestos,
--    en comisiones_afiliado (una fila por factura de Stripe: idempotente).
--    La registra stripe-webhook (evento invoice.paid) con
--    registrar_comision_afiliado(), que solo puede llamar el servidor.
--  - El navegador solo puede LEER sus referidos y sus comisiones.
--
-- El pago de las comisiones al afiliado es manual: esto solo las registra.

-- 1. referrals: una fila por invitado, y solo lectura desde el navegador.
alter table public.referrals
  add constraint referrals_referred_user_id_key unique (referred_user_id);

alter table public.referrals alter column commission_cents set default 0;
alter table public.referrals alter column status set default 'Registered';

drop policy if exists "Users can view their own referrals" on public.referrals;
create policy referrals_ver_los_mios on public.referrals
  for select to authenticated
  using (referrer_id = (select auth.uid()));

-- 2. Una fila por factura pagada.
create table if not exists public.comisiones_afiliado (
  id                  uuid primary key default gen_random_uuid(),
  referral_id         uuid not null references public.referrals(id) on delete cascade,
  referrer_id         uuid not null references public.profiles(id) on delete cascade,
  stripe_invoice_id   text not null unique,
  base_cents          integer not null check (base_cents > 0),
  comision_cents      integer not null check (comision_cents >= 0),
  created_at          timestamptz not null default now()
);

create index if not exists comisiones_afiliado_referrer_idx
  on public.comisiones_afiliado (referrer_id, created_at desc);
create index if not exists comisiones_afiliado_referral_idx
  on public.comisiones_afiliado (referral_id);

alter table public.comisiones_afiliado enable row level security;

create policy comisiones_ver_las_mias on public.comisiones_afiliado
  for select to authenticated
  using (referrer_id = (select auth.uid()));

-- 3. Crear el referido (lo usan el alta y vincular_referido).
create or replace function public.crear_referido(p_referido uuid, p_codigo text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_afiliado uuid;
  v_nombre   text;
begin
  if p_referido is null or coalesce(btrim(p_codigo), '') = '' then
    return false;
  end if;

  select id into v_afiliado
    from public.profiles
   where affiliate_code = lower(btrim(p_codigo))
   limit 1;

  -- Codigo desconocido o autorreferencia.
  if v_afiliado is null or v_afiliado = p_referido then
    return false;
  end if;

  -- Solo el nombre de pila: el afiliado no necesita mas.
  select split_part(btrim(coalesce(full_name, '')), ' ', 1) into v_nombre
    from public.profiles where id = p_referido;

  insert into public.referrals
    (referrer_id, referred_user_id, referred_user_name, join_date, status, commission_cents, user_id)
  values
    (v_afiliado, p_referido, nullif(v_nombre, ''), current_date, 'Registered', 0, v_afiliado)
  on conflict (referred_user_id) do nothing;

  return found;
end;
$$;

revoke all on function public.crear_referido(uuid, text) from public, anon, authenticated;

-- 4. Alta de usuario: igual que antes, y ademas el referido si trae codigo.
--    Un fallo al crear el referido nunca debe impedir el alta.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, affiliate_code)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', ''),
    lower(substring(md5(new.id::text), 1, 8))
  )
  on conflict (id) do nothing;

  begin
    perform public.crear_referido(new.id, new.raw_user_meta_data->>'ref');
  exception when others then
    raise warning 'No se pudo registrar el referido de %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

-- 5. Para altas con Google: la app lo llama con el codigo guardado.
create or replace function public.vincular_referido(p_codigo text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_creado timestamptz;
begin
  if auth.uid() is null then
    return false;
  end if;

  select created_at into v_creado from auth.users where id = auth.uid();
  if v_creado is null or v_creado < now() - interval '7 days' then
    return false;
  end if;

  return public.crear_referido(auth.uid(), p_codigo);
end;
$$;

revoke all on function public.vincular_referido(text) from public, anon;
grant execute on function public.vincular_referido(text) to authenticated;

-- 6. Comision por factura pagada. Solo el servidor (stripe-webhook).
--    Devuelve la comision registrada (0 si no hay afiliado o ya estaba).
create or replace function public.registrar_comision_afiliado(
  p_referido uuid,
  p_stripe_invoice_id text,
  p_base_cents integer
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ref      public.referrals%rowtype;
  v_comision integer;
begin
  if p_base_cents is null or p_base_cents <= 0 or coalesce(p_stripe_invoice_id, '') = '' then
    return 0;
  end if;

  select * into v_ref from public.referrals where referred_user_id = p_referido;
  if not found then
    return 0;
  end if;

  v_comision := round(p_base_cents * 0.20);

  insert into public.comisiones_afiliado
    (referral_id, referrer_id, stripe_invoice_id, base_cents, comision_cents)
  values
    (v_ref.id, v_ref.referrer_id, p_stripe_invoice_id, p_base_cents, v_comision)
  on conflict (stripe_invoice_id) do nothing;

  if not found then
    return 0;  -- factura ya registrada (reintento de Stripe)
  end if;

  update public.referrals
     set commission_cents = coalesce(commission_cents, 0) + v_comision,
         status = 'Subscribed'
   where id = v_ref.id;

  return v_comision;
end;
$$;

revoke all on function public.registrar_comision_afiliado(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.registrar_comision_afiliado(uuid, text, integer) to service_role;

-- 7. El unico perfil sin codigo de afiliado.
update public.profiles
   set affiliate_code = lower(substring(md5(id::text), 1, 8))
 where coalesce(affiliate_code, '') = '';
