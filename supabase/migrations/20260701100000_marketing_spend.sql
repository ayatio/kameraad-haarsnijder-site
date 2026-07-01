-- Slice 5 · Mig · marketing_spend (G-19, FR-126/127, S-15).
-- Owner-only ad-spend log + editable monthly budget. Audit via trigger.
-- Applied to kameraad-staging 2026-07-01. Verified: MIG-21/22, RLS-03, ADS-02/04, API-06.
CREATE TABLE IF NOT EXISTS public.marketing_spend (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL, period_end date,
  channel text NOT NULL, spend_cents int NOT NULL CHECK (spend_cents >= 0),
  note text, link text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS marketing_spend_period_idx ON public.marketing_spend (period_start);
ALTER TABLE public.marketing_spend ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS marketing_spend_owner_all ON public.marketing_spend;
CREATE POLICY marketing_spend_owner_all ON public.marketing_spend
  FOR ALL TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());
INSERT INTO public.settings (key, value) VALUES ('ad_budget_monthly_cents', '20000') ON CONFLICT (key) DO NOTHING;
CREATE OR REPLACE FUNCTION public.marketing_spend_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE row_id uuid; ch text; cents int;
BEGIN
  IF TG_OP='DELETE' THEN row_id:=OLD.id; ch:=OLD.channel; cents:=OLD.spend_cents;
  ELSE row_id:=NEW.id; ch:=NEW.channel; cents:=NEW.spend_cents; END IF;
  INSERT INTO public.audit_log(actor, action, payload)
  VALUES (coalesce(auth.jwt()->>'email','?'),'marketing_spend_change',
          jsonb_build_object('op',TG_OP,'id',row_id,'channel',ch,'cents',cents));
  RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS marketing_spend_audit_trg ON public.marketing_spend;
CREATE TRIGGER marketing_spend_audit_trg AFTER INSERT OR UPDATE OR DELETE ON public.marketing_spend
  FOR EACH ROW EXECUTE FUNCTION public.marketing_spend_audit();
