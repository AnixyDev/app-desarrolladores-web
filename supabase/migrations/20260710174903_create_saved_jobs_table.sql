-- La funcionalidad "Ofertas Guardadas" del marketplace vivía solo en memoria
-- (Zustand), sin tabla en Supabase. Se perdía en cada refresh o nuevo login.
CREATE TABLE public.saved_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, job_id)
);

ALTER TABLE public.saved_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_jobs_select_own" ON public.saved_jobs
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "saved_jobs_insert_own" ON public.saved_jobs
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "saved_jobs_delete_own" ON public.saved_jobs
  FOR DELETE USING ((select auth.uid()) = user_id);

CREATE INDEX idx_saved_jobs_user_id ON public.saved_jobs(user_id);
CREATE INDEX idx_saved_jobs_job_id ON public.saved_jobs(job_id);

REVOKE ALL ON public.saved_jobs FROM anon;
GRANT SELECT, INSERT, DELETE ON public.saved_jobs TO authenticated;;
