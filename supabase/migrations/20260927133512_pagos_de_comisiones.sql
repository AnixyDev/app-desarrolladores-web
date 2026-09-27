-- Pagos de comisiones de afiliado: el panel de administración para ver lo que
-- se debe a cada afiliado y marcarlo como pagado.
--
--  - pagos_afiliado: un pago (transferencia, Bizum…) a un afiliado. Agrupa
--    todas las comisiones que estaban pendientes en ese momento.
--  - comisiones_afiliado.pago_id: null = pendiente de pagar.
--  - Las funciones admin_* solo las puede usar un perfil con rol Admin (el rol
--    ya no se puede cambiar desde el navegador: disparador de columnas de pago
--    del perfil). Para cualquier otro usuario lanzan 42501.
--  - El afiliado ve sus propios pagos (y así su página separa lo pendiente de
--    lo ya cobrado).

create table if not exists public.pagos_afiliado (
  id              uuid primary key default gen_random_uuid(),
  referrer_id     uuid not null references public.profiles(id) on delete cascade,
  importe_cents   integer not null check (importe_cents > 0),
  num_comisiones  integer not null check (num_comisiones > 0),
  nota            text check (char_length(nota) <= 200),
  pagado_en       timestamptz not null default now(),
  creado_por      uuid references public.profiles(id) on delete set null
);

create index if not exists pagos_afiliado_referrer_idx
  on public.pagos_afiliado (referrer_id, pagado_en desc);

alter table public.pagos_afiliado enable row level security;

create policy pagos_afiliado_ver_los_mios on public.pagos_afiliado
  for select to authenticated
  using (referrer_id = (select auth.uid()));

alter table public.comisiones_afiliado
  add column if not exists pago_id uuid references public.pagos_afiliado(id) on delete set null;

create index if not exists comisiones_afiliado_pendientes_idx
  on public.comisiones_afiliado (referrer_id) where pago_id is null;

-- ¿Es la persona con sesión administradora de la plataforma?
create or replace function public.es_admin_plataforma()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and lower(coalesce(role, '')) = 'admin'
  );
$$;

revoke all on function public.es_admin_plataforma() from public, anon;
grant execute on function public.es_admin_plataforma() to authenticated;

-- Resumen por afiliado: referidos, lo pendiente y lo ya pagado.
create or replace function public.admin_resumen_afiliados()
returns table (
  referrer_id      uuid,
  nombre           text,
  email            text,
  referidos        integer,
  suscritos        integer,
  pendiente_cents  bigint,
  pagado_cents     bigint,
  ultima_comision  timestamptz,
  ultimo_pago      timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.es_admin_plataforma() then
    raise exception 'Solo para administración.' using errcode = '42501';
  end if;

  return query
  select p.id,
         coalesce(nullif(p.business_name, ''), nullif(p.full_name, ''), p.email),
         p.email,
         (select count(*)::int from public.referrals r where r.referrer_id = p.id),
         (select count(*)::int from public.referrals r where r.referrer_id = p.id and r.status = 'Subscribed'),
         coalesce((select sum(c.comision_cents) from public.comisiones_afiliado c
                    where c.referrer_id = p.id and c.pago_id is null), 0)::bigint,
         coalesce((select sum(c.comision_cents) from public.comisiones_afiliado c
                    where c.referrer_id = p.id and c.pago_id is not null), 0)::bigint,
         (select max(c.created_at) from public.comisiones_afiliado c where c.referrer_id = p.id),
         (select max(g.pagado_en) from public.pagos_afiliado g where g.referrer_id = p.id)
    from public.profiles p
   where exists (select 1 from public.referrals r where r.referrer_id = p.id)
   order by 6 desc, 4 desc;
end;
$$;

revoke all on function public.admin_resumen_afiliados() from public, anon;
grant execute on function public.admin_resumen_afiliados() to authenticated;

-- Detalle de las comisiones pendientes de un afiliado.
create or replace function public.admin_comisiones_pendientes(p_referrer uuid)
returns table (
  id                 uuid,
  created_at         timestamptz,
  invitado           text,
  base_cents         integer,
  comision_cents     integer,
  stripe_invoice_id  text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.es_admin_plataforma() then
    raise exception 'Solo para administración.' using errcode = '42501';
  end if;

  return query
  select c.id, c.created_at, r.referred_user_name, c.base_cents, c.comision_cents, c.stripe_invoice_id
    from public.comisiones_afiliado c
    join public.referrals r on r.id = c.referral_id
   where c.referrer_id = p_referrer and c.pago_id is null
   order by c.created_at;
end;
$$;

revoke all on function public.admin_comisiones_pendientes(uuid) from public, anon;
grant execute on function public.admin_comisiones_pendientes(uuid) to authenticated;

-- Marca como pagadas TODAS las comisiones pendientes de un afiliado, en un
-- solo pago. p_importe_esperado es lo que el panel enseñó al confirmar: si
-- entre medias entró otra comisión, no cuadra y no se marca nada (así nunca
-- se da por pagado algo que no se ha visto).
create or replace function public.admin_marcar_comisiones_pagadas(
  p_referrer uuid,
  p_importe_esperado integer,
  p_nota text default null
)
returns public.pagos_afiliado
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total integer;
  v_num   integer;
  v_pago  public.pagos_afiliado;
begin
  if not public.es_admin_plataforma() then
    raise exception 'Solo para administración.' using errcode = '42501';
  end if;

  -- Bloquea las pendientes para que un doble clic no pague dos veces.
  perform 1 from public.comisiones_afiliado
   where referrer_id = p_referrer and pago_id is null
   for update;

  select coalesce(sum(comision_cents), 0)::int, count(*)::int
    into v_total, v_num
    from public.comisiones_afiliado
   where referrer_id = p_referrer and pago_id is null;

  if v_num = 0 or v_total <= 0 then
    raise exception 'Este afiliado no tiene comisiones pendientes.' using errcode = 'P0002';
  end if;

  if v_total <> p_importe_esperado then
    raise exception 'El importe pendiente ha cambiado (ahora %). Recarga el panel y vuelve a confirmar.', v_total
      using errcode = '40001';
  end if;

  insert into public.pagos_afiliado (referrer_id, importe_cents, num_comisiones, nota, creado_por)
  values (p_referrer, v_total, v_num, nullif(btrim(coalesce(p_nota, '')), ''), auth.uid())
  returning * into v_pago;

  update public.comisiones_afiliado
     set pago_id = v_pago.id
   where referrer_id = p_referrer and pago_id is null;

  return v_pago;
end;
$$;

revoke all on function public.admin_marcar_comisiones_pagadas(uuid, integer, text) from public, anon;
grant execute on function public.admin_marcar_comisiones_pagadas(uuid, integer, text) to authenticated;
