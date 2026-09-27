-- Portal: una misma persona puede ser cliente de varios freelancers.
--
-- Hasta hoy `clients.portal_user_id` era único: una cuenta del portal solo
-- podía estar enlazada a UNA ficha de cliente. Quien fuese cliente de dos
-- freelancers de DevFreelancer (o tuviera dos fichas con el mismo email)
-- entraba siempre a la primera, y los documentos de la otra no aparecían:
-- el enlace del contrato llevaba a un portal donde ese contrato "no existía".
-- Visto el 27/09 con un contrato real enviado por email.
--
-- Las políticas RLS del portal ya usan `client_id in (select id from clients
-- where portal_user_id = auth.uid())`, así que funcionan con varias fichas sin
-- cambiar. Solo sobra la restricción única y hay que enlazar todas.

alter table public.clients drop constraint if exists clients_portal_user_id_key;
create index if not exists clients_portal_user_id_idx on public.clients (portal_user_id);

drop function if exists public.link_portal_client();

create function public.link_portal_client()
returns table(client_id uuid, client_name text, owner_business_name text, owner_full_name text, owner_logo_url text, owner_brand_color text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_email text;
begin
  v_email := lower(auth.jwt() ->> 'email');
  if v_email is null or auth.uid() is null then
    return;
  end if;

  -- Fichas enlazadas cuyo correo ya no es el de esta cuenta: el freelancer lo
  -- cambió y el enlace caduca.
  update public.clients c
     set portal_user_id = null
   where c.portal_user_id = auth.uid()
     and lower(c.email) is distinct from v_email;

  -- Todas las fichas libres con este correo, de cualquier freelancer.
  update public.clients c
     set portal_user_id = auth.uid()
   where lower(c.email) = v_email
     and c.portal_user_id is null;

  return query
    select c.id, c.name::text, p.business_name::text, p.full_name::text, p.portal_logo_url::text, p.pdf_color::text
      from public.clients c
      left join public.profiles p on p.id = c.user_id
     where c.portal_user_id = auth.uid()
     order by c.created_at desc, c.id;
end;
$function$;

revoke all on function public.link_portal_client() from public, anon;
grant execute on function public.link_portal_client() to authenticated, service_role;
