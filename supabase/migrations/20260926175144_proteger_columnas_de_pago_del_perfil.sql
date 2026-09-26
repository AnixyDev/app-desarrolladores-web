-- Las columnas de pago del perfil solo las cambia el servidor.
--
-- La política profiles_update_own deja a cada usuario hacer UPDATE de su
-- propia fila, y el rol authenticated tenía permiso de UPDATE sobre TODAS las
-- columnas. Con una sesión normal, desde la consola del navegador:
--
--   supabase.from('profiles').update({ plan: 'Teams', ai_credits: 1000000 }).eq('id', miId)
--
-- daba el plan Teams y un millón de créditos sin pagar. Eso anulaba el cobro
-- de créditos en el servidor (ai-gemini) y todos los planes de pago. Lo mismo
-- con DELETE + INSERT de la propia fila (profiles_delete_own + insert_own).
--
-- Comprobado antes de cerrarlo (26/09): ningún formulario de la aplicación
-- escribe estas columnas; upgradePlan() y purchaseCredits() existían en el
-- store pero nadie las llamaba. Y ninguna cuenta muestra señales de abuso:
-- todas las Free tienen 10 créditos o menos y solo la dueña es Admin.
--
-- Quién sigue pudiendo cambiarlas: todo lo que no corre como anon ni como
-- authenticated. Es decir, las Edge Functions con la clave de servicio
-- (stripe-webhook, create-connect-account, create-checkout-session), las
-- funciones SECURITY DEFINER (consume_credits_atomic, sumar_creditos,
-- recargar_creditos_mensuales, que corren como su dueño) y pg_cron.

create or replace function public.proteger_columnas_de_pago_del_perfil()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Una fila creada desde el navegador nace como cualquier alta nueva.
    new.plan := 'Free';
    new.ai_credits := 10;
    new.signature_credits := 0;
    new.subscription_status := null;
    new.stripe_subscription_id := null;
    new.stripe_customer_id := null;
    new.stripe_account_id := null;
    new.stripe_onboarding_complete := false;
    new.role := 'Developer';
    new.affiliate_code := null;
    new.creditos_mensuales_proxima := null;
    return new;
  end if;

  if new.plan                        is distinct from old.plan
  or new.ai_credits                  is distinct from old.ai_credits
  or new.signature_credits           is distinct from old.signature_credits
  or new.subscription_status         is distinct from old.subscription_status
  or new.stripe_subscription_id      is distinct from old.stripe_subscription_id
  or new.stripe_customer_id          is distinct from old.stripe_customer_id
  or new.stripe_account_id           is distinct from old.stripe_account_id
  or new.stripe_onboarding_complete  is distinct from old.stripe_onboarding_complete
  or new.role                        is distinct from old.role
  or new.affiliate_code              is distinct from old.affiliate_code
  or new.email                       is distinct from old.email
  or new.creditos_mensuales_proxima  is distinct from old.creditos_mensuales_proxima
  then
    raise exception 'El plan, los créditos, la suscripción, Stripe, el rol, el código de afiliado y el correo solo los cambia el servidor.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.proteger_columnas_de_pago_del_perfil() from public, anon, authenticated;

drop trigger if exists profiles_proteger_columnas_de_pago on public.profiles;
-- El nombre empieza por "a" para que Postgres lo ejecute ANTES que
-- profiles_creditos_mensuales_ancla (los BEFORE van por orden alfabético):
-- primero se decide si el cambio está permitido, después se ajusta el ancla.
create trigger a_profiles_proteger_columnas_de_pago
  before insert or update on public.profiles
  for each row execute function public.proteger_columnas_de_pago_del_perfil();
