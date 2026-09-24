-- Función reutilizable: ¿el usuario autenticado es un miembro de equipo
-- activo y vinculado del dueño p_owner_id? Se usa en varias políticas RLS
-- para dar acceso de lectura/escritura limitado a miembros del equipo.
CREATE OR REPLACE FUNCTION public.is_active_team_member(p_owner_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.user_id = p_owner_id
      AND tm.accepted_user_id = auth.uid()
      AND tm.status = 'Activo'
  );
$function$;

GRANT EXECUTE ON FUNCTION public.is_active_team_member(uuid) TO authenticated;

-- Knowledge Base: el miembro de equipo puede LEER (no editar/borrar) los
-- artículos del dueño del equipo al que pertenece.
CREATE POLICY "knowledge_articles_select_team_member" ON public.knowledge_articles
  FOR SELECT USING (public.is_active_team_member(user_id));

-- Proyectos: el miembro de equipo puede LEER los proyectos del dueño, para
-- poder elegir contra qué proyecto registrar sus horas en Mi Hoja de Horas.
CREATE POLICY "projects_select_team_member" ON public.projects
  FOR SELECT USING (public.is_active_team_member(user_id));

-- Time entries: se añade "logged_by" para distinguir quién registró la hora
-- de verdad, de "user_id" (el dueño de la cuenta a la que se factura/reporta
-- esa hora). Antes ambos eran siempre la misma persona.
ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS logged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- El miembro de equipo puede VER las horas que él mismo ha registrado,
-- aunque pertenezcan a la cuenta del dueño (user_id != auth.uid()).
CREATE POLICY "time_entries_select_logged_by_team_member" ON public.time_entries
  FOR SELECT USING ((select auth.uid()) = logged_by);

-- El miembro de equipo puede REGISTRAR horas contra los proyectos del dueño,
-- siempre que marque logged_by = él mismo (no puede suplantar a otro) y sea
-- miembro activo vinculado de ese dueño.
CREATE POLICY "time_entries_insert_team_member" ON public.time_entries
  FOR INSERT WITH CHECK (
    (select auth.uid()) = logged_by
    AND public.is_active_team_member(user_id)
  );;
