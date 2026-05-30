-- Trigger: creación automática de perfil al registrar usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, email, full_name, avatar_url, business_name, tax_id,
    plan, role, ai_credits, hourly_rate_cents, pdf_color,
    payment_reminders_enabled, reminder_template_upcoming,
    reminder_template_overdue, affiliate_code,
    stripe_account_id, stripe_onboarding_complete
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
    '', '', 'Free', 'Developer', 10, 0, '#d9009f',
    false, '', '',
    lower(substring(md5(NEW.id::text), 1, 8)),
    '', false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Los usuarios pueden actualizar su propio perfil" 
ON public.profiles 
FOR UPDATE 
TO authenticated 
USING (auth.uid() = id) 
WITH CHECK (auth.uid() = id);

CREATE POLICY "Los usuarios pueden ver su propio perfil" 
ON public.profiles 
FOR SELECT 
TO authenticated 
USING (auth.uid() = id);

CREATE TABLE public.referrals (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    affiliate_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    referred_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    amount_cents integer NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    stripe_session_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo los afiliados pueden ver sus referidos" ON public.referrals FOR SELECT TO authenticated USING (auth.uid() = affiliate_id);
CREATE POLICY "Los usuarios autenticados pueden insertar referidos" ON public.referrals FOR INSERT TO authenticated WITH CHECK (true);
