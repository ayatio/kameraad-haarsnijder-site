-- Slice 1 · customer-portal late-cancel path (CM / FR-119).
-- Token-gated SECURITY DEFINER RPCs so an anon customer (email link) can view and
-- cancel their own appointment. cancel_token is a random-uuid capability (text);
-- an invalid token returns nothing / a neutral error (no leakage, CM-08).
-- Server-authoritative + idempotent. Applied to kameraad-staging 2026-07-01.

CREATE OR REPLACE FUNCTION public.get_appointment_by_token(p_token text)
RETURNS TABLE (
  appointment_id uuid, first_name text, service_name text, barber_name text,
  start_at timestamptz, status text, price_cents int,
  cancellation_window_hours int, is_late boolean, payment_due boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
  SELECT a.id, c.first_name, s.name_nl, b.name, a.start_at, a.status::text, s.price_cents,
         w.win,
         (a.start_at < now() + make_interval(hours => w.win)) AS is_late,
         a.payment_due
  FROM public.appointments a
  JOIN public.services s ON s.id = a.service_id
  JOIN public.barbers  b ON b.id = a.barber_id
  JOIN public.customers c ON c.id = a.customer_id
  CROSS JOIN LATERAL (SELECT COALESCE((value::text)::int,24) AS win FROM public.settings WHERE key='cancellation_window_hours') w
  WHERE a.cancel_token = p_token;
$$;

CREATE OR REPLACE FUNCTION public.cancel_appointment_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE a public.appointments; win int; late boolean;
BEGIN
  SELECT * INTO a FROM public.appointments WHERE cancel_token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid'); END IF;
  IF a.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'appointment_id', a.id, 'late', a.payment_due);
  END IF;
  IF a.status NOT IN ('pending','confirmed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_cancellable');
  END IF;
  SELECT COALESCE((value::text)::int,24) INTO win FROM public.settings WHERE key='cancellation_window_hours';
  late := a.start_at < now() + make_interval(hours => win);
  UPDATE public.appointments
     SET status = 'cancelled', cancelled_at = now(),
         cancellation_reason = 'customer_portal',
         payment_due = CASE WHEN late THEN true ELSE payment_due END
   WHERE id = a.id;
  RETURN jsonb_build_object('ok', true, 'appointment_id', a.id, 'late', late);
END; $$;

REVOKE ALL ON FUNCTION public.get_appointment_by_token(text) FROM public;
REVOKE ALL ON FUNCTION public.cancel_appointment_by_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_appointment_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_appointment_by_token(text) TO anon, authenticated;

-- DOWN
-- DROP FUNCTION IF EXISTS public.cancel_appointment_by_token(text);
-- DROP FUNCTION IF EXISTS public.get_appointment_by_token(text);
