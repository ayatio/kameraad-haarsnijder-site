-- PR-K · Mig 5 — per-tenant secrets via Supabase Vault. Serves RQ-K2, D-a34.
-- New table ships ENABLE ROW LEVEL SECURITY (critic B1); no anon/authenticated write, no anon read.
-- Do NOT apply to prod: for an isolated Supabase branch review only.

-- Map a tenant + logical secret name to a Vault secret id. The ciphertext lives in vault.secrets
-- (external encryption key), so a public-schema dump leaks only the mapping, never the token.
CREATE TABLE IF NOT EXISTS public.tenant_secret_refs (
  tenant_id    int  NOT NULL REFERENCES public.tenants(id),
  secret_name  text NOT NULL,          -- 'mailjet_api', 'mailjet_secret', 'meta_token', 'gbp_token', 'pref_hmac'
  vault_secret_id uuid NOT NULL,       -- vault.secrets.id
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, secret_name)
);
ALTER TABLE public.tenant_secret_refs ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated access at all beyond the owner-read below; the definer RPC + service_role read it.
DROP POLICY IF EXISTS tsr_owner_read ON public.tenant_secret_refs;
CREATE POLICY tsr_owner_read ON public.tenant_secret_refs FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id() AND public.is_owner());

-- Locked-down read path for edge functions (service_role) — hard-filters on the passed tenant,
-- returns the decrypted value for ONE named secret. Never expose vault.decrypted_secrets directly.
CREATE OR REPLACE FUNCTION public.get_tenant_secret(p_tenant_id int, p_name text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'vault','public','pg_temp'
AS $$ SELECT ds.decrypted_secret FROM public.tenant_secret_refs r
      JOIN vault.decrypted_secrets ds ON ds.id = r.vault_secret_id
      WHERE r.tenant_id = p_tenant_id AND r.secret_name = p_name; $$;
REVOKE ALL ON FUNCTION public.get_tenant_secret(int,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_secret(int,text) TO service_role;
