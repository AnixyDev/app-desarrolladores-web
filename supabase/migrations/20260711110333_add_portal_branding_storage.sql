ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS portal_logo_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-logos', 'brand-logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "brand_logos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'brand-logos');

CREATE POLICY "brand_logos_owner_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'brand-logos'
    AND (select auth.uid())::text = (storage.foldername(name))[1]
  );

CREATE POLICY "brand_logos_owner_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'brand-logos'
    AND (select auth.uid())::text = (storage.foldername(name))[1]
  );

CREATE POLICY "brand_logos_owner_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'brand-logos'
    AND (select auth.uid())::text = (storage.foldername(name))[1]
  );;
