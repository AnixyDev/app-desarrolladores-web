-- Eliminar cuenta (30/09/2026, a petición de Ana).
--
-- Un suscriptor puede darse de baja desde Ajustes → Seguridad. La Edge
-- Function `eliminar-cuenta` cancela su suscripción en Stripe, llama a
-- eliminar_datos_de_cuenta() (esta migración), borra sus ficheros y por
-- último su usuario de Auth (que arrastra en cascada todo lo que cuelga de
-- profiles y auth.users).
--
-- Decisiones de Ana:
--   * Lo fiscal se CONSERVA: facturas, registros Veri*Factu y cobros se
--     copian a `archivo_fiscal_cuentas_eliminadas`, sin acceso para nadie
--     salvo la clave de servicio, hasta el 31 de diciembre del cuarto año
--     posterior a la última factura. Después, la tarea diaria
--     `purgar-archivo-fiscal` los borra solos.
--   * Todo lo demás se borra.
--   * Lo que es de OTRAS personas no se borra, se desengancha: la ficha en
--     la que figuraba como cliente del portal de otro freelancer, el referido
--     por el que otro cobra comisión, los cobros de suscripción (son ingresos
--     de la plataforma) y sus comentarios en portales ajenos.

-- 1) Archivo fiscal ------------------------------------------------------------
create table if not exists public.archivo_fiscal_cuentas_eliminadas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,                 -- sin FK: el usuario ya no existe
  emisor jsonb not null,                 -- nombre, NIF y domicilio fiscal
  facturas jsonb not null,
  registros_fiscales jsonb not null,
  cobros jsonb not null,
  clientes jsonb not null,               -- solo las fichas que aparecen en sus facturas
  eliminada_en timestamptz not null default now(),
  conservar_hasta date not null
);

alter table public.archivo_fiscal_cuentas_eliminadas enable row level security;
-- Sin políticas a propósito: solo la clave de servicio llega a esta tabla.
revoke all on public.archivo_fiscal_cuentas_eliminadas from anon, authenticated;

-- 2) Claves foráneas: lo ajeno se desengancha en vez de impedir el borrado ----
alter table public.referrals alter column referred_user_id drop not null;
alter table public.referrals drop constraint referrals_referred_user_id_fkey,
  add constraint referrals_referred_user_id_fkey foreign key (referred_user_id) references public.profiles(id) on delete set null;
alter table public.referrals drop constraint referrals_referrer_id_fkey,
  add constraint referrals_referrer_id_fkey foreign key (referrer_id) references public.profiles(id) on delete cascade;

alter table public.platform_payments drop constraint platform_payments_user_fk,
  add constraint platform_payments_user_fk foreign key (user_id) references public.profiles(id) on delete set null;

alter table public.clients drop constraint clients_portal_user_id_fkey,
  add constraint clients_portal_user_id_fkey foreign key (portal_user_id) references auth.users(id) on delete set null;
alter table public.interactions drop constraint interactions_actor_id_fkey,
  add constraint interactions_actor_id_fkey foreign key (actor_id) references auth.users(id) on delete set null;
alter table public.portal_comments drop constraint portal_comments_user_id_fkey,
  add constraint portal_comments_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;
alter table public.portal_files drop constraint portal_files_user_id_fkey,
  add constraint portal_files_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;

-- 3) El bloqueo fiscal deja borrar SOLO durante la baja de su propia cuenta ---
-- La marca `app.eliminar_cuenta` la pone eliminar_datos_de_cuenta() dentro de
-- su transacción; desde la API no se puede poner (set_config no está expuesta).
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
        return OLD;  -- baja de la cuenta: la factura ya está en el archivo fiscal
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
    then
      raise exception 'No se puede modificar una factura con registro fiscal Veri*Factu generado. Usa una factura rectificativa.';
    end if;
  end if;

  return NEW;
end;
$function$;

-- 4) Borrado de los datos de una cuenta -----------------------------------------
-- Lo llama la Edge Function con la clave de servicio, ANTES de borrar el
-- usuario de Auth. Borra lo que no tiene clave foránea a profiles/auth.users
-- (el resto cae en cascada al borrar el usuario) y archiva lo fiscal.
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

  -- Archivo fiscal: facturas, registros Veri*Factu, cobros y las fichas de sus clientes.
  select count(*), max(issue_date) into v_facturas, v_ultima from public.invoices where user_id = p_user;
  if v_facturas > 0 then
    insert into public.archivo_fiscal_cuentas_eliminadas
      (user_id, emisor, facturas, registros_fiscales, cobros, clientes, conservar_hasta)
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
      (make_date(extract(year from greatest(current_date, v_ultima))::int + 4, 12, 31))
    );
  end if;

  -- Lo ajeno se desengancha (los cobros de suscripción son ingresos de la plataforma).
  update public.platform_payments set user_id = null, user_email = null where user_id = p_user;
  update public.referrals set status = 'Cancelled', referred_user_name = null where referred_user_id = p_user;

  -- Tablas sin clave foránea al usuario: se borran a mano.
  delete from public.payments where user_id = p_user or invoice_id in (select id from public.invoices where user_id = p_user);
  delete from public.fiscal_records where user_id = p_user;
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

  return jsonb_build_object('facturas_archivadas', v_facturas);
end;
$function$;

revoke all on function public.eliminar_datos_de_cuenta(uuid) from public, anon, authenticated;
grant execute on function public.eliminar_datos_de_cuenta(uuid) to service_role;

-- 5) Purga del archivo fiscal cuando vence el plazo ----------------------------
create or replace function public.purgar_archivo_fiscal()
 returns integer
 language sql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
  with borradas as (
    delete from public.archivo_fiscal_cuentas_eliminadas where conservar_hasta < current_date returning 1
  )
  select count(*)::int from borradas;
$function$;

revoke all on function public.purgar_archivo_fiscal() from public, anon, authenticated;

select cron.unschedule('purgar-archivo-fiscal')
where exists (select 1 from cron.job where jobname = 'purgar-archivo-fiscal');

select cron.schedule('purgar-archivo-fiscal', '20 4 * * *', $$select public.purgar_archivo_fiscal();$$);
