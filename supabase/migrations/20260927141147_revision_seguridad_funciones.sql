-- Revisión de seguridad de las funciones del servidor (27/09).
-- Los huecos de la base de datos que salieron al revisarlas:
--
-- 1. clients.portal_invitado_en lo podía escribir el navegador. El tope de
--    invitaciones al portal se calculaba con esa columna, así que bastaba con
--    ponerla a null para mandar correos sin límite desde el dominio de la app.
--    Además, el límite de 1 cliente del plan Free solo lo aplicaba la pantalla.
-- 2. team_members: el dueño podía insertar filas sin límite y escribir él mismo
--    accepted_user_id y status='Activo', repartiendo los créditos del equipo
--    (y el acceso a sus datos) entre usuarios ilimitados, o enganchando a un
--    tercero para que gastase de una cuenta vacía.
-- 3. profiles: al crear el perfil desde el navegador (borrarlo y volver a
--    crearlo) se podía poner cualquier email, y send-document-email lo acepta
--    como "tu propio correo".
-- 4. Referencias cruzadas: se podía crear una factura, presupuesto, propuesta,
--    contrato, proyecto o recibo apuntando al CLIENTE de otro freelancer (y le
--    aparecía en su portal), o gastos/horas/tareas apuntando a un PROYECTO
--    ajeno (y falseaban su informe de rentabilidad). Hacía falta conocer el
--    UUID, pero nada lo impedía.
-- 5. Los cupos de envío (invitaciones al portal, documentos por email) se
--    llevan ahora en tablas que solo toca el servidor, con reserva atómica.
--
-- Todos los disparadores actúan solo sobre anon/authenticated: las funciones
-- del servidor (clave de servicio) y las SECURITY DEFINER no se ven afectadas.

-- ───────────────────────────── 1. clients ─────────────────────────────

create or replace function public.clients_proteger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan text;
  v_n    int;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.portal_invitado_en := null;

    select plan into v_plan from public.profiles where id = new.user_id;
    if coalesce(v_plan, 'Free') = 'Free' then
      select count(*) into v_n from public.clients where user_id = new.user_id;
      if v_n >= 1 then
        raise exception 'El plan Free permite 1 cliente. Pásate a Pro para añadir más.'
          using errcode = 'P0001';
      end if;
    end if;
    return new;
  end if;

  if new.portal_invitado_en is distinct from old.portal_invitado_en then
    raise exception 'La fecha de invitación al portal solo la escribe el servidor.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists a_clients_proteger on public.clients;
create trigger a_clients_proteger
  before insert or update on public.clients
  for each row execute function public.clients_proteger();

-- ─────────────────────────── 2. team_members ──────────────────────────

create or replace function public.team_members_proteger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan   text;
  v_limite int;
  v_n      int;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Mismo límite que _shared/limites-equipo.ts: Teams 5, el resto 0.
    select plan into v_plan from public.profiles where id = new.user_id;
    v_limite := case when v_plan = 'Teams' then 5 else 0 end;
    select count(*) into v_n from public.team_members where user_id = new.user_id;
    if v_n >= v_limite then
      raise exception 'Tu plan permite % miembros de equipo.', v_limite using errcode = 'P0001';
    end if;

    -- Quién acepta lo decide link_team_membership() al iniciar sesión, no el dueño.
    new.accepted_user_id := null;
    new.status := 'Pendiente';
    return new;
  end if;

  if new.accepted_user_id is distinct from old.accepted_user_id then
    raise exception 'Solo la persona invitada puede aceptar la invitación.' using errcode = '42501';
  end if;
  if new.user_id is distinct from old.user_id then
    raise exception 'No se puede cambiar el dueño del equipo.' using errcode = '42501';
  end if;
  if new.email is distinct from old.email and old.accepted_user_id is not null then
    raise exception 'No se puede cambiar el correo de un miembro que ya aceptó.' using errcode = '42501';
  end if;
  if new.status = 'Activo' and old.status is distinct from 'Activo' and new.accepted_user_id is null then
    raise exception 'Un miembro solo pasa a activo cuando acepta la invitación.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists a_team_members_proteger on public.team_members;
create trigger a_team_members_proteger
  before insert or update on public.team_members
  for each row execute function public.team_members_proteger();

-- ───────────────────────────── 3. profiles ────────────────────────────
-- Igual que antes, y además el email de un perfil creado desde el navegador
-- es siempre el de la cuenta de Auth.

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
    new.email := coalesce(auth.jwt() ->> 'email', new.email);
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

-- ─────────────────────── 4. referencias cruzadas ──────────────────────
-- Un documento solo puede apuntar a clientes y proyectos de su mismo dueño.

create or replace function public.exigir_referencias_propias()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client  uuid;
  v_project uuid;
  v_old_client  uuid;
  v_old_project uuid;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  v_client  := case when tg_argv[0] = 'si' then (to_jsonb(new) ->> 'client_id')::uuid end;
  v_project := case when tg_argv[1] = 'si' then (to_jsonb(new) ->> 'project_id')::uuid end;
  if tg_op = 'UPDATE' then
    v_old_client  := case when tg_argv[0] = 'si' then (to_jsonb(old) ->> 'client_id')::uuid end;
    v_old_project := case when tg_argv[1] = 'si' then (to_jsonb(old) ->> 'project_id')::uuid end;
  end if;

  if v_client is not null
     and (tg_op = 'INSERT' or v_client is distinct from v_old_client)
     and not exists (select 1 from public.clients c where c.id = v_client and c.user_id = new.user_id) then
    raise exception 'Ese cliente no es tuyo.' using errcode = '42501';
  end if;

  if v_project is not null
     and (tg_op = 'INSERT' or v_project is distinct from v_old_project)
     and not exists (select 1 from public.projects p where p.id = v_project and p.user_id = new.user_id) then
    raise exception 'Ese proyecto no es tuyo.' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Argumentos: ¿tiene client_id?, ¿tiene project_id?
drop trigger if exists b_referencias_propias on public.invoices;
create trigger b_referencias_propias before insert or update on public.invoices
  for each row execute function public.exigir_referencias_propias('si', 'si');
drop trigger if exists b_referencias_propias on public.recurring_invoices;
create trigger b_referencias_propias before insert or update on public.recurring_invoices
  for each row execute function public.exigir_referencias_propias('si', 'si');
drop trigger if exists b_referencias_propias on public.receipts;
create trigger b_referencias_propias before insert or update on public.receipts
  for each row execute function public.exigir_referencias_propias('si', 'si');
drop trigger if exists b_referencias_propias on public.contracts;
create trigger b_referencias_propias before insert or update on public.contracts
  for each row execute function public.exigir_referencias_propias('si', 'si');
drop trigger if exists b_referencias_propias on public.budgets;
create trigger b_referencias_propias before insert or update on public.budgets
  for each row execute function public.exigir_referencias_propias('si', 'no');
drop trigger if exists b_referencias_propias on public.proposals;
create trigger b_referencias_propias before insert or update on public.proposals
  for each row execute function public.exigir_referencias_propias('si', 'no');
drop trigger if exists b_referencias_propias on public.projects;
create trigger b_referencias_propias before insert or update on public.projects
  for each row execute function public.exigir_referencias_propias('si', 'no');
drop trigger if exists b_referencias_propias on public.expenses;
create trigger b_referencias_propias before insert or update on public.expenses
  for each row execute function public.exigir_referencias_propias('no', 'si');
drop trigger if exists b_referencias_propias on public.tasks;
create trigger b_referencias_propias before insert or update on public.tasks
  for each row execute function public.exigir_referencias_propias('no', 'si');
drop trigger if exists b_referencias_propias on public.time_entries;
create trigger b_referencias_propias before insert or update on public.time_entries
  for each row execute function public.exigir_referencias_propias('no', 'si');

-- ─────────────────────── 5. cupos de envío atómicos ───────────────────

create table if not exists public.invitaciones_portal_enviadas (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  client_id  uuid,
  email      text not null,
  enviada_en timestamptz not null default now()
);
create index if not exists invitaciones_portal_user_idx
  on public.invitaciones_portal_enviadas (user_id, enviada_en desc);
alter table public.invitaciones_portal_enviadas enable row level security;
-- Sin políticas: solo la clave de servicio.

-- Reserva una invitación al portal. Devuelve null si se puede enviar, o el
-- motivo si no. El registro se hace en la misma operación que la cuenta, con
-- un candado por usuario: peticiones simultáneas no se cuelan.
create or replace function public.reservar_invitacion_portal(
  p_user uuid, p_client uuid, p_email text,
  p_max_dia int default 20, p_espera_min int default 10
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hoy    int;
  v_ultima timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('portal:' || p_user::text, 0));

  select count(*) into v_hoy from public.invitaciones_portal_enviadas
   where user_id = p_user and enviada_en > now() - interval '24 hours';
  if v_hoy >= p_max_dia then
    return format('Has llegado al máximo de %s invitaciones al portal en 24 horas. Inténtalo mañana.', p_max_dia);
  end if;

  select max(enviada_en) into v_ultima from public.invitaciones_portal_enviadas
   where user_id = p_user and lower(email) = lower(p_email);
  if v_ultima is not null and v_ultima > now() - make_interval(mins => p_espera_min) then
    return format('Ya invitaste a esta dirección hace poco. Espera %s minutos antes de reenviar.', p_espera_min);
  end if;

  insert into public.invitaciones_portal_enviadas (user_id, client_id, email)
  values (p_user, p_client, lower(p_email));
  return null;
end;
$$;
revoke all on function public.reservar_invitacion_portal(uuid, uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.reservar_invitacion_portal(uuid, uuid, text, int, int) to service_role;

create table if not exists public.envios_de_documentos (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  tipo       text not null,
  documento  uuid,
  email      text not null,
  enviado_en timestamptz not null default now()
);
create index if not exists envios_de_documentos_user_idx
  on public.envios_de_documentos (user_id, enviado_en desc);
alter table public.envios_de_documentos enable row level security;
-- Sin políticas: solo la clave de servicio.

create or replace function public.reservar_envio_documento(
  p_user uuid, p_tipo text, p_documento uuid, p_email text, p_max_dia int default 50
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hoy int;
begin
  perform pg_advisory_xact_lock(hashtextextended('documentos:' || p_user::text, 0));
  select count(*) into v_hoy from public.envios_de_documentos
   where user_id = p_user and enviado_en > now() - interval '24 hours';
  if v_hoy >= p_max_dia then
    return false;
  end if;
  insert into public.envios_de_documentos (user_id, tipo, documento, email)
  values (p_user, p_tipo, p_documento, lower(p_email));
  return true;
end;
$$;
revoke all on function public.reservar_envio_documento(uuid, text, uuid, text, int) from public, anon, authenticated;
grant execute on function public.reservar_envio_documento(uuid, text, uuid, text, int) to service_role;
