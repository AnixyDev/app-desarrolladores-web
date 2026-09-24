DROP POLICY "Users manage own business profile" ON public.business_profile;

CREATE POLICY "Users manage own business profile"
  ON public.business_profile
  FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);;
