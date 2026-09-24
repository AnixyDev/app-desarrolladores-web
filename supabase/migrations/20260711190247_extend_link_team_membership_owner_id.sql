DROP FUNCTION IF EXISTS public.link_team_membership();

CREATE OR REPLACE FUNCTION public.link_team_membership()
RETURNS TABLE(
  membership_id uuid,
  role text,
  status text,
  owner_user_id uuid,
  owner_business_name text,
  owner_full_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_email text;
  v_member record;
begin
  v_email := lower(auth.jwt() ->> 'email');
  if v_email is null then
    return;
  end if;

  select tm.id, tm.role, tm.status, tm.user_id into v_member
    from public.team_members tm
    where tm.accepted_user_id = auth.uid()
    limit 1;

  if found then
    membership_id := v_member.id;
    role := v_member.role;
    status := v_member.status;
    owner_user_id := v_member.user_id;
    select p.business_name, p.full_name into owner_business_name, owner_full_name
      from public.profiles p where p.id = v_member.user_id;
    return next;
    return;
  end if;

  select tm.id, tm.role, tm.status, tm.user_id into v_member
    from public.team_members tm
    where lower(tm.email) = v_email and tm.accepted_user_id is null
    order by tm.created_at desc
    limit 1;

  if found then
    update public.team_members
      set accepted_user_id = auth.uid(), status = 'Activo'
      where id = v_member.id;

    membership_id := v_member.id;
    role := v_member.role;
    status := 'Activo';
    owner_user_id := v_member.user_id;
    select p.business_name, p.full_name into owner_business_name, owner_full_name
      from public.profiles p where p.id = v_member.user_id;
    return next;
  end if;

  return;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.link_team_membership() TO authenticated;;
