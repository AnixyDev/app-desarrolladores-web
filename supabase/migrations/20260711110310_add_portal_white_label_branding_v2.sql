DROP FUNCTION IF EXISTS public.link_portal_client();

CREATE OR REPLACE FUNCTION public.link_portal_client()
RETURNS TABLE(
  client_id uuid,
  client_name text,
  owner_business_name text,
  owner_full_name text,
  owner_logo_url text,
  owner_brand_color text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_email text;
  v_client record;
begin
  v_email := lower(auth.jwt() ->> 'email');
  if v_email is null then
    return;
  end if;

  select id, name, user_id into v_client from public.clients where portal_user_id = auth.uid();
  if found then
    client_id := v_client.id;
    client_name := v_client.name;
    select p.business_name, p.full_name, p.portal_logo_url, p.pdf_color
      into owner_business_name, owner_full_name, owner_logo_url, owner_brand_color
      from public.profiles p where p.id = v_client.user_id;
    return next;
    return;
  end if;

  select id, name, user_id into v_client from public.clients
    where lower(email) = v_email and portal_user_id is null
    limit 1;

  if found then
    update public.clients set portal_user_id = auth.uid() where id = v_client.id;
    client_id := v_client.id;
    client_name := v_client.name;
    select p.business_name, p.full_name, p.portal_logo_url, p.pdf_color
      into owner_business_name, owner_full_name, owner_logo_url, owner_brand_color
      from public.profiles p where p.id = v_client.user_id;
    return next;
  end if;

  return;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.link_portal_client() TO authenticated;;
