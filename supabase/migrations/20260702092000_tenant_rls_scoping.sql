-- PR-K · Mig 3 — rebuild every authenticated RLS policy with the tenant predicate + tenant-scope
-- the caller-identity helpers. Serves RQ-K1; resolves B-02/B-07. [REG]
--
-- *** ORDERING-CRITICAL (D-a38, critic B2) ***
-- The D-a38 ops backfill that writes app_metadata.tenant_id=1 to EVERY current auth user
-- (via auth.admin.updateUserById) MUST run BEFORE this migration. If applied first,
-- auth_tenant_id() returns 0, matches nothing, and locks every admin/barber out of the console.
-- Deploy order: (1) run app_metadata backfill → (2) apply this migration → (3) verify console + booking.
--
-- Rebuilt from the LIVE 45-policy inventory (queried from the running DB), NOT the repo (critic B5):
--   45 live = 5 anon catalogue SELECTs (UNCHANGED) + 40 authenticated (dropped+recreated below).
-- Helper bodies below are reconstructed from the live source — DIFF each against pg_get_functiondef()
-- on the branch before merge. auth.jwt() is wrapped in (select …) so the planner caches it once per
-- statement (RLS best practice / RQ-K1); functionally identical to the bare live body.
-- Do NOT apply to prod: for an isolated Supabase branch review only.

-- ── The tenant claim, fail-closed ──────────────────────────────────────────────
-- 0 = no claim → matches nothing (fail-closed). The D-a38 backfill MUST precede this migration.
CREATE OR REPLACE FUNCTION public.auth_tenant_id()
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$ SELECT COALESCE(((select auth.jwt())->'app_metadata'->>'tenant_id')::int, 0); $$;
GRANT EXECUTE ON FUNCTION public.auth_tenant_id() TO authenticated, service_role;

-- ── Tenant-scope the caller-identity helpers (add AND …tenant_id = auth_tenant_id()) ───────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$ SELECT EXISTS (SELECT 1 FROM public.admin_users au
  WHERE lower(au.email)=lower(coalesce((select auth.jwt())->>'email','')) AND au.tenant_id=public.auth_tenant_id()); $$;
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$ SELECT EXISTS (SELECT 1 FROM public.admin_users au
  WHERE lower(au.email)=lower(coalesce((select auth.jwt())->>'email','')) AND au.role='owner' AND au.tenant_id=public.auth_tenant_id()); $$;
CREATE OR REPLACE FUNCTION public.auth_barber_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$ SELECT barber_id FROM public.admin_users
  WHERE lower(email)=lower(coalesce((select auth.jwt())->>'email','')) AND tenant_id=public.auth_tenant_id() LIMIT 1; $$;
-- NOTE (deviation from design §092000, per task LIVE ground truth): auth_admin_id() is ALSO
-- tenant-scoped here — the design body omitted it. Flagged in the handoff report.
CREATE OR REPLACE FUNCTION public.auth_admin_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$ SELECT id FROM public.admin_users
  WHERE lower(email)=lower(coalesce((select auth.jwt())->>'email','')) AND tenant_id=public.auth_tenant_id() LIMIT 1; $$;

-- ===== 40 authenticated policies recreated with the row-level tenant predicate =====
-- admin_users (4)
DROP POLICY IF EXISTS admin_read_admins ON public.admin_users;
CREATE POLICY admin_read_admins ON public.admin_users FOR SELECT TO authenticated USING (tenant_id=public.auth_tenant_id() AND public.is_admin());
DROP POLICY IF EXISTS admin_ins_admins ON public.admin_users;
CREATE POLICY admin_ins_admins ON public.admin_users FOR INSERT TO authenticated WITH CHECK (tenant_id=public.auth_tenant_id() AND public.is_admin());
DROP POLICY IF EXISTS admin_upd_admins ON public.admin_users;
CREATE POLICY admin_upd_admins ON public.admin_users FOR UPDATE TO authenticated USING (tenant_id=public.auth_tenant_id() AND public.is_admin()) WITH CHECK (tenant_id=public.auth_tenant_id() AND public.is_admin());
DROP POLICY IF EXISTS admin_del_admins ON public.admin_users;
CREATE POLICY admin_del_admins ON public.admin_users FOR DELETE TO authenticated USING (tenant_id=public.auth_tenant_id() AND public.is_admin());
-- appointments (4)
DROP POLICY IF EXISTS appt_read ON public.appointments;
CREATE POLICY appt_read ON public.appointments FOR SELECT TO authenticated USING (tenant_id=public.auth_tenant_id() AND (public.is_owner() OR barber_id=public.auth_barber_id()));
DROP POLICY IF EXISTS appt_insert ON public.appointments;
CREATE POLICY appt_insert ON public.appointments FOR INSERT TO authenticated WITH CHECK (tenant_id=public.auth_tenant_id() AND (public.is_owner() OR barber_id=public.auth_barber_id()));
DROP POLICY IF EXISTS appt_update ON public.appointments;
CREATE POLICY appt_update ON public.appointments FOR UPDATE TO authenticated USING (tenant_id=public.auth_tenant_id() AND (public.is_owner() OR barber_id=public.auth_barber_id())) WITH CHECK (tenant_id=public.auth_tenant_id() AND (public.is_owner() OR barber_id=public.auth_barber_id()));
DROP POLICY IF EXISTS appt_delete ON public.appointments;
CREATE POLICY appt_delete ON public.appointments FOR DELETE TO authenticated USING (tenant_id=public.auth_tenant_id() AND public.is_owner());
-- audit_log (1)
DROP POLICY IF EXISTS admin_read_audit ON public.audit_log;
CREATE POLICY admin_read_audit ON public.audit_log FOR SELECT TO authenticated USING (tenant_id=public.auth_tenant_id() AND public.is_admin());
-- availability (4 authenticated; anon_read_availability UNCHANGED)
DROP POLICY IF EXISTS admin_read_availability ON public.availability;
CREATE POLICY admin_read_availability ON public.availability FOR SELECT TO authenticated USING (tenant_id=public.auth_tenant_id() AND public.is_admin());
DROP POLICY IF EXISTS admin_ins_availability ON public.availability;
CREATE POLICY admin_ins_availability ON public.availability FOR INSERT TO authenticated WITH CHECK (tenant_id=public.auth_tenant_id() AND public.is_admin());
DROP POLICY IF EXISTS admin_upd_availability ON public.availability;
CREATE POLICY admin_upd_availability ON public.availability FOR UPDATE TO authenticated USING (tenant_id=public.auth_tenant_id() AND public.is_admin()) WITH CHECK (tenant_id=public.auth_tenant_id() AND public.is_admin());
DROP POLICY IF EXISTS admin_del_availability ON public.availability;
CREATE POLICY admin_del_availability ON public.availability FOR DELETE TO authenticated USING (tenant_id=public.auth_tenant_id() AND public.is_admin());
-- barber_services (3 authenticated; anon_read_barber_services UNCHANGED)
DROP POLICY IF EXISTS auth_read_barber_services ON public.barber_services;
CREATE POLICY auth_read_barber_services ON public.barber_services FOR SELECT TO authenticated USING (tenant_id=public.auth_tenant_id());
DROP POLICY IF EXISTS admin_ins_barber_services ON public.barber_services;
CREATE POLICY admin_ins_barber_services ON public.barber_services FOR INSERT TO authenticated WITH CHECK (tenant_id=public.auth_tenant_id() AND public.is_admin());
DROP POLICY IF EXISTS admin_del_barber_services ON public.barber_services;
CREATE POLICY admin_del_barber_services ON public.barber_services FOR DELETE TO authenticated USING (tenant_id=public.auth_tenant_id() AND public.is_admin());
-- barbers (4 authenticated; anon_read_barbers UNCHANGED)
DROP POLICY IF EXISTS auth_read_barbers ON public.barbers;
CREATE POLICY auth_read_barbers ON public.barbers FOR SELECT TO authenticated USING (tenant_id=public.auth_tenant_id());
DROP POLICY IF EXISTS admin_ins_barbers ON public.barbers;
CREATE POLICY admin_ins_barbers ON public.barbers FOR INSERT TO authenticated WITH CHECK (tenant_id=public.auth_tenant_id() AND public.is_admin());
DROP POLICY IF EXISTS admin_upd_barbers ON public.barbers;
CREATE POLICY admin_upd_barbers ON public.barbers FOR UPDATE TO authenticated USING (tenant_id=public.auth_tenant_id() AND public.is_admin()) WITH CHECK (tenant_id=public.auth_tenant_id() AND public.is_admin());
DROP POLICY IF EXISTS admin_del_barbers ON public.barbers;
CREATE POLICY admin_del_barbers ON public.barbers FOR DELETE TO authenticated USING (tenant_id=public.auth_tenant_id() AND public.is_admin());
-- blocked_slots (3 authenticated; anon_read_blocks UNCHANGED)
DROP POLICY IF EXISTS admin_read_blocked ON public.blocked_slots;
CREATE POLICY admin_read_blocked ON public.blocked_slots FOR SELECT TO authenticated USING (tenant_id=public.auth_tenant_id() AND public.is_admin());
DROP POLICY IF EXISTS admin_ins_blocks ON public.blocked_slots;
CREATE POLICY admin_ins_blocks ON public.blocked_slots FOR INSERT TO authenticated WITH CHECK (tenant_id=public.auth_tenant_id() AND public.is_admin());
DROP POLICY IF EXISTS admin_del_blocks ON public.blocked_slots;
CREATE POLICY admin_del_blocks ON public.blocked_slots FOR DELETE TO authenticated USING (tenant_id=public.auth_tenant_id() AND public.is_admin());
-- content (3)
DROP POLICY IF EXISTS admin_read_content ON public.content;
CREATE POLICY admin_read_content ON public.content FOR SELECT TO authenticated USING (tenant_id=public.auth_tenant_id() AND public.is_admin());
DROP POLICY IF EXISTS admin_ins_content ON public.content;
CREATE POLICY admin_ins_content ON public.content FOR INSERT TO authenticated WITH CHECK (tenant_id=public.auth_tenant_id() AND public.is_admin());
DROP POLICY IF EXISTS admin_upd_content ON public.content;
CREATE POLICY admin_upd_content ON public.content FOR UPDATE TO authenticated USING (tenant_id=public.auth_tenant_id() AND public.is_admin()) WITH CHECK (tenant_id=public.auth_tenant_id() AND public.is_admin());
-- customers (4) — PERSONAL DATA: the tenant predicate here is a GDPR boundary
DROP POLICY IF EXISTS admin_read_customers ON public.customers;
CREATE POLICY admin_read_customers ON public.customers FOR SELECT TO authenticated USING (tenant_id=public.auth_tenant_id() AND public.is_admin());
DROP POLICY IF EXISTS admin_ins_customers ON public.customers;
CREATE POLICY admin_ins_customers ON public.customers FOR INSERT TO authenticated WITH CHECK (tenant_id=public.auth_tenant_id() AND public.is_admin());
DROP POLICY IF EXISTS admin_upd_customers ON public.customers;
CREATE POLICY admin_upd_customers ON public.customers FOR UPDATE TO authenticated USING (tenant_id=public.auth_tenant_id() AND public.is_admin()) WITH CHECK (tenant_id=public.auth_tenant_id() AND public.is_admin());
DROP POLICY IF EXISTS admin_del_customers ON public.customers;
CREATE POLICY admin_del_customers ON public.customers FOR DELETE TO authenticated USING (tenant_id=public.auth_tenant_id() AND public.is_admin());
-- email_log (1) — PERSONAL DATA
DROP POLICY IF EXISTS admin_read_email_log ON public.email_log;
CREATE POLICY admin_read_email_log ON public.email_log FOR SELECT TO authenticated USING (tenant_id=public.auth_tenant_id() AND public.is_admin());
-- marketing_spend (1, owner ALL)
DROP POLICY IF EXISTS marketing_spend_owner_all ON public.marketing_spend;
CREATE POLICY marketing_spend_owner_all ON public.marketing_spend FOR ALL TO authenticated USING (tenant_id=public.auth_tenant_id() AND public.is_owner()) WITH CHECK (tenant_id=public.auth_tenant_id() AND public.is_owner());
-- services (4 authenticated; anon_read_services UNCHANGED)
DROP POLICY IF EXISTS auth_read_services ON public.services;
CREATE POLICY auth_read_services ON public.services FOR SELECT TO authenticated USING (tenant_id=public.auth_tenant_id());
DROP POLICY IF EXISTS admin_ins_services ON public.services;
CREATE POLICY admin_ins_services ON public.services FOR INSERT TO authenticated WITH CHECK (tenant_id=public.auth_tenant_id() AND public.is_admin());
DROP POLICY IF EXISTS admin_upd_services ON public.services;
CREATE POLICY admin_upd_services ON public.services FOR UPDATE TO authenticated USING (tenant_id=public.auth_tenant_id() AND public.is_admin()) WITH CHECK (tenant_id=public.auth_tenant_id() AND public.is_admin());
DROP POLICY IF EXISTS admin_del_services ON public.services;
CREATE POLICY admin_del_services ON public.services FOR DELETE TO authenticated USING (tenant_id=public.auth_tenant_id() AND public.is_admin());
-- settings (3)
DROP POLICY IF EXISTS admin_read_settings ON public.settings;
CREATE POLICY admin_read_settings ON public.settings FOR SELECT TO authenticated USING (tenant_id=public.auth_tenant_id() AND public.is_admin());
DROP POLICY IF EXISTS admin_ins_settings ON public.settings;
CREATE POLICY admin_ins_settings ON public.settings FOR INSERT TO authenticated WITH CHECK (tenant_id=public.auth_tenant_id() AND public.is_admin());
DROP POLICY IF EXISTS admin_upd_settings ON public.settings;
CREATE POLICY admin_upd_settings ON public.settings FOR UPDATE TO authenticated USING (tenant_id=public.auth_tenant_id() AND public.is_admin()) WITH CHECK (tenant_id=public.auth_tenant_id() AND public.is_admin());
-- site_content (1, owner ALL)
DROP POLICY IF EXISTS site_content_owner_all ON public.site_content;
CREATE POLICY site_content_owner_all ON public.site_content FOR ALL TO authenticated USING (tenant_id=public.auth_tenant_id() AND public.is_owner()) WITH CHECK (tenant_id=public.auth_tenant_id() AND public.is_owner());

-- UNCHANGED (5 anon catalogue SELECTs — no JWT claim; non-personal public data, RPC-scoped B-05):
--   availability.anon_read_availability, barber_services.anon_read_barber_services,
--   barbers.anon_read_barbers, blocked_slots.anon_read_blocks, services.anon_read_services.
-- Policy count check: 45 live = 5 anon (unchanged) + 40 authenticated (recreated above).
