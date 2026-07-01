-- Security pass (2026-07-01, after Supabase Security Advisor): gate gdpr_delete,
-- tighten function exposure, add a system-wide audit trail (ids + op only, no PII).
-- Applied to kameraad-staging. Verified: gdpr/publish no longer anon-executable;
-- public booking still works; audit_log captures INSERT/UPDATE/DELETE on key tables.

-- 1) gdpr_delete: owner-only, definer, fixed search_path (was invoker + anon-callable).
CREATE OR REPLACE FUNCTION public.gdpr_delete(p_customer_id uuid, p_actor text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_email_deleted INT; v_appt_deleted INT;
BEGIN
  IF NOT public.is_owner() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  DELETE FROM public.email_log WHERE customer_id = p_customer_id
     OR appointment_id IN (SELECT id FROM public.appointments WHERE customer_id = p_customer_id);
  GET DIAGNOSTICS v_email_deleted = ROW_COUNT;
  DELETE FROM public.appointments WHERE customer_id = p_customer_id;
  GET DIAGNOSTICS v_appt_deleted = ROW_COUNT;
  DELETE FROM public.customers WHERE id = p_customer_id;
  INSERT INTO public.audit_log(actor, action, payload)
  VALUES (coalesce(auth.jwt()->>'email', p_actor), 'gdpr_delete',
    jsonb_build_object('customer_id_hash', encode(digest(p_customer_id::text,'sha256'),'hex'),
                       'email_log_deleted', v_email_deleted, 'appointments_deleted', v_appt_deleted));
END; $function$;
REVOKE ALL ON FUNCTION public.gdpr_delete(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.gdpr_delete(uuid, text) TO authenticated;

-- 2) owner-only CMS RPCs: remove anon EXECUTE.
REVOKE EXECUTE ON FUNCTION public.publish_site_content(text[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.discard_site_content(text[]) FROM anon;

-- 3) internal/trigger-only functions: not an API surface.
REVOKE ALL ON FUNCTION public.marketing_spend_audit() FROM public, anon, authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='update_updated_at' AND pronamespace='public'::regnamespace) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.update_updated_at() FROM public, anon, authenticated';
    EXECUTE 'ALTER FUNCTION public.update_updated_at() SET search_path = ''public'',''pg_temp''';
  END IF;
END $$;

-- 4) settings INSERT policy: authenticated + is_admin (was granted to public).
DROP POLICY IF EXISTS admin_ins_settings ON public.settings;
CREATE POLICY admin_ins_settings ON public.settings FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- 5) System-wide audit trail (ids + op only, never PII).
CREATE OR REPLACE FUNCTION public.audit_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE rid text;
BEGIN
  rid := coalesce((CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END)->>'id', '');
  INSERT INTO public.audit_log(actor, action, payload)
  VALUES (coalesce(auth.jwt()->>'email','system'), TG_TABLE_NAME || '_' || lower(TG_OP),
          jsonb_build_object('table', TG_TABLE_NAME, 'op', TG_OP, 'id', rid));
  RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION public.audit_row() FROM public, anon, authenticated;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['appointments','customers','admin_users','settings','site_content','barbers','services','availability','blocked_slots','barber_services','content'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$s', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.audit_row()', t);
  END LOOP;
END $$;
