-- Slice 6 · RLS-02: scope the barber console to its OWN appointments (server-enforced).
-- Owner keeps full access; a barber sees/edits only rows where barber_id = own barber.
-- book_appointment / portal RPCs / edge fns are SECURITY DEFINER or service-role and
-- bypass RLS, so public booking is unaffected. Applied to staging 2026-07-01. Verified RLS-02.
CREATE OR REPLACE FUNCTION public.auth_barber_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$ SELECT barber_id FROM public.admin_users WHERE lower(email)=lower(coalesce(auth.jwt()->>'email','')) LIMIT 1; $$;

DROP POLICY IF EXISTS admin_read_appointments ON public.appointments;
CREATE POLICY appt_read ON public.appointments FOR SELECT TO authenticated
  USING (public.is_owner() OR barber_id = public.auth_barber_id());
DROP POLICY IF EXISTS admin_update_appointments ON public.appointments;
CREATE POLICY appt_update ON public.appointments FOR UPDATE TO authenticated
  USING (public.is_owner() OR barber_id = public.auth_barber_id())
  WITH CHECK (public.is_owner() OR barber_id = public.auth_barber_id());
DROP POLICY IF EXISTS admin_ins_appointments ON public.appointments;
CREATE POLICY appt_insert ON public.appointments FOR INSERT TO authenticated
  WITH CHECK (public.is_owner() OR barber_id = public.auth_barber_id());
DROP POLICY IF EXISTS admin_del_appointments ON public.appointments;
CREATE POLICY appt_delete ON public.appointments FOR DELETE TO authenticated USING (public.is_owner());
