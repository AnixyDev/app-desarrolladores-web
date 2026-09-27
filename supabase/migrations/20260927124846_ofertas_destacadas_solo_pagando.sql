-- Dos cosas que se podian hacer desde el navegador sin pagar.
--
-- 1) OFERTA DE EMPLEO DESTACADA. Es un producto de pago (featuredJobPost en
--    el catalogo de Stripe): stripe-webhook pone jobs.isfeatured = true al
--    confirmarse el cobro. Pero las politicas de jobs dejan al dueno insertar
--    y editar cualquier columna, asi que bastaba con crear la oferta ya
--    destacada, o destacarla despues con un update. Tampoco se comprobaba
--    user_id al editar: se podia pasar una oferta a otro usuario.
--    Comprobado el 27/09 en un ensayo deshecho.
--
--    Arreglo: el mismo patron que las columnas de pago del perfil. Desde el
--    navegador (anon/authenticated) una oferta nace sin destacar, y ni el
--    destacado ni el dueno se pueden cambiar. El webhook usa la clave de
--    servicio y no le afecta.
--
-- 2) PAGOS FALSOS EN platform_payments. La tabla alimenta los ingresos del
--    panel de administracion, y tenia una politica que dejaba a cualquier
--    usuario insertar filas propias con el importe que quisiera. Nada en la
--    app ni en las Edge Functions inserta ahi desde el navegador. Se quita.

create or replace function public.jobs_proteger_destacado()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.isfeatured := false;
    return new;
  end if;

  if new.isfeatured is distinct from old.isfeatured then
    raise exception 'El destacado de una oferta solo se activa pagándolo.'
      using errcode = '42501';
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'No se puede cambiar el dueño de una oferta.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists a_jobs_proteger_destacado on public.jobs;
create trigger a_jobs_proteger_destacado
  before insert or update on public.jobs
  for each row execute function public.jobs_proteger_destacado();

drop policy if exists "Users can insert their own payments" on public.platform_payments;
