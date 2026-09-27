-- Panel de administración con cifras reales.
--
-- El panel leía los ingresos de platform_payments, pero nada escribía nunca en
-- esa tabla: marcaba siempre 0 € y un beneficio negativo. Y "Usuarios totales"
-- y "Uso de IA" salían de consultas que, por la RLS, solo veían el perfil de
-- quien miraba.
--
--  - stripe-webhook apunta ahora cada cobro real: facturas pagadas de
--    suscripciones (invoice.paid, primer pago y renovaciones) y compras sueltas
--    (checkout en modo payment: créditos, oferta destacada). La referencia de
--    Stripe es única, así que un reintento no duplica.
--  - admin_metricas() devuelve las cifras globales, solo para Admin.

alter table public.platform_payments
  add constraint platform_payments_stripe_session_id_key unique (stripe_session_id);

create or replace function public.admin_metricas()
returns table (
  usuarios_total        integer,
  usuarios_nuevos_30d   integer,
  suscriptores_pro      integer,
  suscriptores_teams    integer,
  ingresos_total_cents  bigint,
  ingresos_30d_cents    bigint,
  cobros_total          integer,
  cobros_30d            integer
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
  select
    (select count(*)::int from auth.users),
    (select count(*)::int from auth.users where created_at >= now() - interval '30 days'),
    (select count(*)::int from public.profiles
      where plan = 'Pro' and subscription_status in ('active', 'trialing')),
    (select count(*)::int from public.profiles
      where plan = 'Teams' and subscription_status in ('active', 'trialing')),
    (select coalesce(sum(amount_cents), 0)::bigint from public.platform_payments),
    (select coalesce(sum(amount_cents), 0)::bigint from public.platform_payments
      where created_at >= now() - interval '30 days'),
    (select count(*)::int from public.platform_payments),
    (select count(*)::int from public.platform_payments
      where created_at >= now() - interval '30 days');
end;
$$;

revoke all on function public.admin_metricas() from public, anon;
grant execute on function public.admin_metricas() to authenticated;
