-- Slice 3 · Mig · site_media_bucket (G-13, FR-122, S-13/P-27).
-- Public-read Storage bucket for hero/comforts/products/footer/barber photos.
-- Read: anyone (public site). Write/update/delete: owner only.
-- Applied to kameraad-staging 2026-07-01. Verified: MIG-18/19.
INSERT INTO storage.buckets (id, name, public)
VALUES ('site-media','site-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS site_media_public_read ON storage.objects;
DROP POLICY IF EXISTS site_media_owner_write ON storage.objects;
DROP POLICY IF EXISTS site_media_owner_update ON storage.objects;
DROP POLICY IF EXISTS site_media_owner_delete ON storage.objects;

CREATE POLICY site_media_public_read ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'site-media');
CREATE POLICY site_media_owner_write ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'site-media' AND public.is_owner());
CREATE POLICY site_media_owner_update ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'site-media' AND public.is_owner());
CREATE POLICY site_media_owner_delete ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'site-media' AND public.is_owner());

-- DOWN: drop the four policies; bucket left in place (deleting a non-empty bucket fails).
