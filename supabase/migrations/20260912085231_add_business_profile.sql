CREATE TABLE IF NOT EXISTS public.business_profile (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  proposal_signature TEXT,
  logo_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.business_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own business profile"
  ON public.business_profile
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_profile TO authenticated, service_role;;
