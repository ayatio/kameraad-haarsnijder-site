-- Slice 3 · Mig · site_content_cms (G-12/14/15/16, FR-121/123/124/125, S-13). [LG]
-- Server content store with draft/published layers + owner-only publish/discard.
-- Diensten/Barbiers are NOT here (they bind to the live services/barbers tables, G-14).
-- Applied to kameraad-staging 2026-07-01. Verified: MIG-13..17, RLS-01/05.

-- Owner helpers -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$ SELECT EXISTS (SELECT 1 FROM public.admin_users au
  WHERE lower(au.email)=lower(coalesce(auth.jwt()->>'email','')) AND au.role='owner'); $$;

CREATE OR REPLACE FUNCTION public.auth_admin_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$ SELECT id FROM public.admin_users WHERE lower(email)=lower(coalesce(auth.jwt()->>'email','')) LIMIT 1; $$;

-- Table ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.site_content (
  key          text PRIMARY KEY,
  draft        jsonb NOT NULL DEFAULT '{}'::jsonb,
  published    jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  published_at timestamptz,
  published_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL
);
ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;

-- Published-only view for anon/public. security_invoker=false (definer) runs as the
-- view owner and bypasses the base table's owner-only RLS; the view selects `published`
-- only, so `draft` is never reachable through it. RLS-05.
DROP VIEW IF EXISTS public.site_content_public;
CREATE VIEW public.site_content_public WITH (security_invoker = false) AS
  SELECT key, published FROM public.site_content;
GRANT SELECT ON public.site_content_public TO anon, authenticated;

-- RLS: owner full on base; barbers/anon get nothing on base (draft never exposed).
DROP POLICY IF EXISTS site_content_owner_all ON public.site_content;
CREATE POLICY site_content_owner_all ON public.site_content
  FOR ALL TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());

-- Six section rows (empty; the JS DEFAULTS provide fallback content, the DB holds overrides).
INSERT INTO public.site_content (key) VALUES
  ('banner'),('hero'),('comforts'),('products'),('hours'),('contact')
ON CONFLICT (key) DO NOTHING;

-- Publish / discard RPCs -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_site_content(p_keys text[] DEFAULT NULL)
RETURNS TABLE(key text, warnings text[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE r RECORD; me uuid := public.auth_admin_id(); w text[];
BEGIN
  IF NOT public.is_owner() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  FOR r IN SELECT * FROM public.site_content sc
           WHERE p_keys IS NULL OR sc.key = ANY(p_keys) LOOP
    w := ARRAY[]::text[];
    -- BLOCK: banner active with empty NL title (G-16 / REG-08)
    IF r.key='banner' AND coalesce((r.draft->>'active')::boolean,false)
       AND coalesce(btrim(r.draft->'l'->'nl'->>'title'),'')='' THEN
      RAISE EXCEPTION 'NL is verplicht: banner-titel (NL) is leeg' USING ERRCODE='42501';
    END IF;
    -- WARN: non-NL locales with an empty title where NL has one
    IF coalesce(btrim(r.draft->'l'->'nl'->>'title'),'') <> '' THEN
      IF coalesce(btrim(r.draft->'l'->'en'->>'title'),'')='' THEN w := w || (r.key||': EN valt terug op NL'); END IF;
      IF coalesce(btrim(r.draft->'l'->'fr'->>'title'),'')='' THEN w := w || (r.key||': FR valt terug op NL'); END IF;
      IF coalesce(btrim(r.draft->'l'->'es'->>'title'),'')='' THEN w := w || (r.key||': ES valt terug op NL'); END IF;
    END IF;
    UPDATE public.site_content
       SET published=draft, published_at=now(), published_by=me, updated_at=now()
     WHERE site_content.key=r.key;
    key := r.key; warnings := w; RETURN NEXT;
  END LOOP;
  INSERT INTO public.audit_log(actor, action, payload)
  VALUES (coalesce(auth.jwt()->>'email','?'), 'site_content_publish',
          jsonb_build_object('keys', coalesce(p_keys, ARRAY(SELECT sc.key FROM public.site_content sc))));
END; $$;

CREATE OR REPLACE FUNCTION public.discard_site_content(p_keys text[] DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE me uuid := public.auth_admin_id();
BEGIN
  IF NOT public.is_owner() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  UPDATE public.site_content SET draft=published, updated_at=now(), updated_by=me
   WHERE p_keys IS NULL OR key = ANY(p_keys);
END; $$;

REVOKE ALL ON FUNCTION public.publish_site_content(text[]) FROM public;
REVOKE ALL ON FUNCTION public.discard_site_content(text[]) FROM public;
GRANT EXECUTE ON FUNCTION public.publish_site_content(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.discard_site_content(text[]) TO authenticated;

-- DOWN
-- DROP VIEW IF EXISTS public.site_content_public;
-- DROP TABLE IF EXISTS public.site_content;
-- DROP FUNCTION IF EXISTS public.publish_site_content(text[]);
-- DROP FUNCTION IF EXISTS public.discard_site_content(text[]);
-- DROP FUNCTION IF EXISTS public.is_owner(); DROP FUNCTION IF EXISTS public.auth_admin_id();
