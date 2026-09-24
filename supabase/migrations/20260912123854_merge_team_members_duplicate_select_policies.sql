DROP POLICY "Users can manage their own team members" ON public.team_members;
DROP POLICY "team_members_select_own_membership" ON public.team_members;

CREATE POLICY "Owner can manage own team members"
  ON public.team_members
  FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Owner can update own team members"
  ON public.team_members
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Owner can delete own team members"
  ON public.team_members
  FOR DELETE
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Owner or member can view team membership"
  ON public.team_members
  FOR SELECT
  USING ((select auth.uid()) = user_id OR (select auth.uid()) = accepted_user_id);;
