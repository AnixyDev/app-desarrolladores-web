-- El enlace del portal (clients.portal_user_id) se quedaba apuntando a la
-- cuenta antigua cuando el freelancer cambiaba el correo de la ficha del
-- cliente. No era cosmético: once políticas RLS de ocho tablas leen esa
-- columna directamente, así que la persona del correo antiguo conservaba
-- acceso a proyectos, facturas, contratos, presupuestos, propuestas y
-- mensajes — y permiso de UPDATE sobre presupuestos, contratos y propuestas.
--
-- Tres piezas:
--   1. Un disparador que corta el enlace cuando cambia el correo.
--   2. link_portal_client() comprueba el enlace antes de fiarse de él, para
--      los enlaces que ya estuvieran torcidos o que se tuerzan por otra vía.
--   3. Limpieza de los enlaces obsoletos que ya hay.
--
-- OJO: la pieza 1 de esta migración la sustituye por completo la migración
-- siguiente (20260924201538). Se deja aquí tal cual se aplicó, porque el
-- historial tiene que contar lo que pasó de verdad.

-- 1 ------------------------------------------------------------------------
create or replace function public.clients_desenlazar_portal_si_cambia_email()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  -- Si quien escribe está cambiando el enlace a propósito (link_portal_client),
  -- no se toca. Solo se corta cuando cambia el correo y el enlace se queda
  -- como estaba, que es justo el caso en el que deja de ser cierto.
  if old.portal_user_id is not null
     and new.portal_user_id is not distinct from old.portal_user_id
     and lower(new.email) is distinct from lower(old.email)
  then
    new.portal_user_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists clients_desenlazar_portal on public.clients;
create trigger clients_desenlazar_portal
  before update on public.clients
  for each row
  execute function public.clients_desenlazar_portal_si_cambia_email();

-- 2 ------------------------------------------------------------------------
create or replace function public.link_portal_client()
returns table(client_id uuid, client_name text, owner_business_name text,
              owner_full_name text, owner_logo_url text, owner_brand_color text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_email text;
  v_client record;
  v_enlazado boolean := false;
begin
  v_email := lower(auth.jwt() ->> 'email');
  if v_email is null then
    return;
  end if;

  -- ¿Hay ya una ficha enlazada a esta cuenta? Solo vale si su correo sigue
  -- siendo el de esta cuenta: si el freelancer lo cambió, el enlace caducó.
  select id, name, user_id, lower(email) as email into v_client
    from public.clients
    where portal_user_id = auth.uid()
    limit 1;

  if found then
    if v_client.email is not distinct from v_email then
      v_enlazado := true;
    else
      update public.clients set portal_user_id = null where id = v_client.id;
    end if;
  end if;

  -- Si no, se enlaza una ficha libre que tenga este correo.
  if not v_enlazado then
    select id, name, user_id, lower(email) as email into v_client
      from public.clients
      where lower(email) = v_email and portal_user_id is null
      limit 1;

    if found then
      update public.clients set portal_user_id = auth.uid() where id = v_client.id;
      v_enlazado := true;
    end if;
  end if;

  if not v_enlazado then
    return;
  end if;

  client_id := v_client.id;
  client_name := v_client.name;
  select p.business_name, p.full_name, p.portal_logo_url, p.pdf_color
    into owner_business_name, owner_full_name, owner_logo_url, owner_brand_color
    from public.profiles p
    where p.id = v_client.user_id;
  return next;
  return;
end;
$$;

-- 3 ------------------------------------------------------------------------
update public.clients c
   set portal_user_id = null
  from auth.users u
 where u.id = c.portal_user_id
   and lower(c.email) is distinct from lower(u.email);
