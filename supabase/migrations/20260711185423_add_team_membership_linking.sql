-- Vincula la cuenta real que crea un invitado (al aceptar la invitación de
-- equipo) con la fila de team_members que lo describe. Sin esto, el
-- invitado entraba a su propia cuenta vacía sin ninguna señal de a qué
-- equipo pertenece.
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS accepted_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_team_members_accepted_user_id ON public.team_members(accepted_user_id);

-- Permite que el propio invitado (una vez vinculado) pueda leer SU fila,
-- además de la política existente "Users can manage their own team members"
-- (que solo cubre al dueño del equipo).
CREATE POLICY "team_members_select_own_membership" ON public.team_members
  FOR SELECT USING ((select auth.uid()) = accepted_user_id);

-- Vincula al usuario autenticado con su invitación pendiente (por email) la
-- primera vez que entra, y devuelve los datos del equipo al que pertenece.
-- SECURITY DEFINER porque el invitado no tiene permiso para leer
-- directamente la fila de team_members (pertenece al dueño) ni el perfil
-- del dueño, hasta que esta función establece el vínculo.
CREATE OR REPLACE FUNCTION public.link_team_membership()
RETURNS TABLE(
  membership_id uuid,
  role text,
  status text,
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

  -- ¿Ya está vinculado este usuario a una invitación?
  select tm.id, tm.role, tm.status, tm.user_id into v_member
    from public.team_members tm
    where tm.accepted_user_id = auth.uid()
    limit 1;

  if found then
    membership_id := v_member.id;
    role := v_member.role;
    status := v_member.status;
    select p.business_name, p.full_name into owner_business_name, owner_full_name
      from public.profiles p where p.id = v_member.user_id;
    return next;
    return;
  end if;

  -- ¿Hay una invitación pendiente con este email, aún sin vincular?
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
    select p.business_name, p.full_name into owner_business_name, owner_full_name
      from public.profiles p where p.id = v_member.user_id;
    return next;
  end if;

  return;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.link_team_membership() TO authenticated;;
