-- Recarga mensual de créditos de IA: 50 en Pro, 200 en Teams.
--
-- La página de precios promete "50 Créditos IA mensuales" (Pro) y "200
-- Créditos IA compartidos" (Teams). Hasta ahora stripe-webhook los daba UNA
-- sola vez, al activarse la suscripción, y como suelo (greatest), así que
-- quien ya tuviera más no recibía nada. Nunca se recargaban.
--
-- Por qué en la base de datos y no en el webhook de renovación de Stripe:
-- los planes ANUALES solo generan un cobro al año. Recargar en invoice.paid
-- daría 50 créditos al año a un Pro anual. Una tarea diaria que mira la fecha
-- de la última recarga trata igual a mensuales y anuales.
--
-- Reglas:
--  - Solo suscripciones que Stripe da por vivas (active, trialing). Un plan
--    'Pro' con la suscripción caducada o impagada no recarga.
--  - Se SUMA: los créditos comprados en paquetes no se tocan ni se pierden.
--  - Una recarga por mes y por cuenta. El ancla es la fecha en que empezó a
--    contar (activación del plan); cada recarga la adelanta un mes. Si la
--    tarea no corre algún día, al siguiente se recupera: no se pierde ningún
--    mes, y tampoco se dan dos por el mismo.
--  - La bienvenida del webhook (al activar) cuenta como el primer mes: al
--    pasar a un plan de pago, la próxima recarga queda a un mes vista.

alter table public.profiles
  add column if not exists creditos_mensuales_proxima timestamptz;

comment on column public.profiles.creditos_mensuales_proxima is
  'Cuándo toca la próxima recarga mensual de créditos de IA (Pro 50, Teams 200). NULL = sin plan de pago activo.';

create or replace function public.creditos_mensuales_del_plan(p_plan text)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_plan when 'Pro' then 50 when 'Teams' then 200 else 0 end;
$$;

-- Al pasar a un plan de pago con la suscripción viva, la próxima recarga
-- queda a un mes: la bienvenida del webhook es la de este mes. Al perder el
-- plan, se borra, para que una reactivación futura empiece de nuevo.
create or replace function public.creditos_mensuales_ajustar_ancla()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_de_pago boolean := new.plan in ('Pro', 'Teams')
                       and coalesce(new.subscription_status, '') in ('active', 'trialing');
begin
  if not v_de_pago then
    new.creditos_mensuales_proxima := null;
  elsif new.creditos_mensuales_proxima is null then
    new.creditos_mensuales_proxima := now() + interval '1 month';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_creditos_mensuales_ancla on public.profiles;
create trigger profiles_creditos_mensuales_ancla
  before insert or update of plan, subscription_status on public.profiles
  for each row execute function public.creditos_mensuales_ajustar_ancla();

-- La recarga. Devuelve cuántas cuentas ha recargado, para el registro.
-- SECURITY DEFINER porque toca perfiles de todos; por eso no se publica a
-- anon ni a authenticated: solo la llama pg_cron.
create or replace function public.recargar_creditos_mensuales()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_recargadas integer;
begin
  with vencidas as (
    select id
      from public.profiles
     where plan in ('Pro', 'Teams')
       and coalesce(subscription_status, '') in ('active', 'trialing')
       and creditos_mensuales_proxima is not null
       and creditos_mensuales_proxima <= now()
     for update
  )
  update public.profiles p
     set ai_credits = coalesce(p.ai_credits, 0) + public.creditos_mensuales_del_plan(p.plan),
         creditos_mensuales_proxima = p.creditos_mensuales_proxima + interval '1 month'
    from vencidas v
   where p.id = v.id;

  get diagnostics v_recargadas = row_count;
  return v_recargadas;
end;
$$;

revoke all on function public.recargar_creditos_mensuales() from public, anon, authenticated;
revoke all on function public.creditos_mensuales_ajustar_ancla() from public, anon, authenticated;

-- Cuentas de pago que ya existen: su bienvenida ya la cobraron; la próxima
-- recarga, dentro de un mes.
update public.profiles
   set creditos_mensuales_proxima = now() + interval '1 month'
 where plan in ('Pro', 'Teams')
   and coalesce(subscription_status, '') in ('active', 'trialing')
   and creditos_mensuales_proxima is null;

-- Diaria. Si un día falla, al siguiente recoge lo pendiente.
select cron.unschedule('recarga-mensual-creditos')
 where exists (select 1 from cron.job where jobname = 'recarga-mensual-creditos');

select cron.schedule(
  'recarga-mensual-creditos',
  '15 5 * * *',
  $$select public.recargar_creditos_mensuales();$$
);
