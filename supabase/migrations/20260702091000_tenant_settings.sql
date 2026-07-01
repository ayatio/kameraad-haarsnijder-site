-- PR-K · Mig 2 — settings key/value → per-tenant PK. Serves RQ-K4; resolves B-04. [REG]
-- ATOMICITY (critic B3): ship this migration AND the admin-bridge change
-- (admin/admin-supabase.js: onConflict:'tenant_id,key' + inject tenant_id) in the SAME PR-K
-- deploy. The transitional partial unique below covers the interim so nothing 500s either way.
-- Do NOT apply to prod: for an isolated Supabase branch review only.

-- settings is key/value with PK(key); make it per-tenant. tenant_id already added in 090000.
ALTER TABLE public.settings DROP CONSTRAINT IF EXISTS settings_pkey;
-- Guard: only add the composite PK if it is not already present (re-runnable).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.settings'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE public.settings ADD PRIMARY KEY (tenant_id, key);
  END IF;
END $$;
-- Existing rows already tenant_id=1 via the DEFAULT backfill; nothing to move.

-- B3 LIVE-BREAK GUARD: the live admin bridge does upsert(...,{onConflict:'key'}); dropping the
-- standalone unique on `key` makes every settings save error until the FE deploys. Keep a
-- TRANSITIONAL partial unique on key (tenant 1 only) so the old onConflict:'key' keeps resolving
-- during the deploy window; drop it once the bridge ships onConflict:'tenant_id,key'.
CREATE UNIQUE INDEX IF NOT EXISTS settings_legacy_key_t1 ON public.settings (key) WHERE tenant_id = 1;

-- FOLLOW-UP (after FE deploy of onConflict:'tenant_id,key' is verified live):
--   DROP INDEX IF EXISTS public.settings_legacy_key_t1;
