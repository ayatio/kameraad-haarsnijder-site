-- PR-K · Mig 4 — the 3 public booking RPCs become tenant-aware. Serves RQ-K1; resolves B-03/B-05. [REG]
--
-- *** ATOMICITY (critic B2) ***
-- A CREATE OR REPLACE with an extra p_tenant_id param creates a NEW OVERLOAD; the live booking.js
-- would keep resolving to the UN-scoped originals. So we DROP the EXACT live signatures first, then
-- create the single tenant-aware version, and the booking.js change (pass p_tenant_id) ships in the
-- SAME PR. The DEFAULT 1 only covers the deploy interim — it is NOT a substitute for the DROP.
--
-- *** GROUNDING FLAG (critic B5) ***
-- book_appointment below is the AUTHORITATIVE live body (from repo migration
-- 20260701093000_harden_book_appointment.sql) with tenant scoping folded in — every table/settings
-- read filtered on tenant_id = p_tenant_id, ON CONFLICT (tenant_id, lower(email)), tenant stamped on
-- new customer + appointment, and a fail-closed NULL-tenant guard. ALL 2026-07-01 server-authority
-- guards (matrix, lead, availability window+buffer+grid, blocks, overlap) are preserved verbatim.
--
-- available_slots + taken_slots bodies are LIVE-ONLY (not in the repo/git history/vault). The
-- versions below are RECONSTRUCTED from the algorithm the harden migration documents it "mirrors"
-- and from the booking.js contract (returns ["HH:MM", …], Europe/Brussels). >>> BEFORE MERGE, DIFF
-- each against pg_get_functiondef('public.available_slots'::regproc) / ('public.taken_slots'::regproc)
-- on the isolated branch (which carries the authoritative bodies) and reconcile any divergence in the
-- non-tenant logic. Only the tenant_id filter + p_tenant_id param are the intended delta. <<<
-- Do NOT apply to prod: for an isolated Supabase branch review only.

-- ── Drop the exact live signatures (kills the overload trap) ──────────────────
DROP FUNCTION IF EXISTS public.available_slots(p_barber_slug text, p_service_slug text, p_date date);
DROP FUNCTION IF EXISTS public.taken_slots(p_barber_slug text, p_date date);
DROP FUNCTION IF EXISTS public.book_appointment(p_service_slug text, p_barber_slug text, p_start timestamptz,
  p_first text, p_last text, p_email text, p_phone text, p_note text, p_lang text);

-- ── available_slots (RECONSTRUCTED — diff before merge) ───────────────────────
-- p_tenant_id appended LAST so a positional call stays valid; DEFAULT 1 covers the interim.
CREATE OR REPLACE FUNCTION public.available_slots(
  p_barber_slug text, p_service_slug text, p_date date, p_tenant_id int DEFAULT 1)
RETURNS SETOF text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare
  v_service public.services%rowtype;
  v_barber  public.barbers%rowtype;
  v_lead int; v_buf int; v_grid int;
  v_dow int; v_win record; m int; v_cand timestamptz;
begin
  if p_tenant_id is null then return; end if;   -- fail-closed (pairs with resolve_tenant, B4)

  select * into v_service from public.services
   where slug = p_service_slug and tenant_id = p_tenant_id and is_active and not is_walk_in;
  if not found then return; end if;
  select * into v_barber from public.barbers
   where slug = p_barber_slug and tenant_id = p_tenant_id and is_active;
  if not found then return; end if;

  select coalesce((value::text)::int,2)  into v_lead from public.settings where key='min_lead_time_hours' and tenant_id=p_tenant_id;
  select coalesce((value::text)::int,0)  into v_buf  from public.settings where key='buffer_min'          and tenant_id=p_tenant_id;
  select coalesce((value::text)::int,30) into v_grid from public.settings where key='slot_increment_min'  and tenant_id=p_tenant_id;
  v_grid := greatest(coalesce(v_grid,30), 1);
  v_dow  := extract(dow from p_date)::int;   -- 0=Sun..6=Sat

  for v_win in
    select a.start_time, a.end_time from public.availability a
    where a.barber_id = v_barber.id and a.tenant_id = p_tenant_id
      and a.day_of_week = v_dow and a.is_active
  loop
    m := extract(hour from v_win.start_time)::int*60 + extract(minute from v_win.start_time)::int;
    while (m + v_service.duration_min + v_buf)
            <= (extract(hour from v_win.end_time)::int*60 + extract(minute from v_win.end_time)::int) loop
      v_cand := (p_date::text || ' ' || to_char(m/60,'FM00') || ':' || to_char(m%60,'FM00') || ':00')::timestamp
                  at time zone 'Europe/Brussels';
      if v_cand >= now() + make_interval(hours => v_lead)
         and not exists (
           select 1 from public.appointments ap
           where ap.barber_id = v_barber.id and ap.tenant_id = p_tenant_id
             and ap.status in ('pending','confirmed')
             and ap.start_at < v_cand + make_interval(mins => v_service.duration_min)
             and ap.end_at   > v_cand)
         and not exists (
           select 1 from public.blocked_slots b
           where (b.barber_id = v_barber.id or b.barber_id is null) and b.tenant_id = p_tenant_id
             and b.start_at < v_cand + make_interval(mins => v_service.duration_min)
             and b.end_at   > v_cand)
      then
        return next to_char(m/60,'FM00') || ':' || to_char(m%60,'FM00');
      end if;
      m := m + v_grid;
    end loop;
  end loop;
end;
$function$;

-- ── taken_slots (RECONSTRUCTED — diff before merge) ───────────────────────────
CREATE OR REPLACE FUNCTION public.taken_slots(
  p_barber_slug text, p_date date, p_tenant_id int DEFAULT 1)
RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
  SELECT to_char(ap.start_at AT TIME ZONE 'Europe/Brussels','HH24:MI')
  FROM public.appointments ap
  JOIN public.barbers b ON b.id = ap.barber_id
  WHERE p_tenant_id IS NOT NULL
    AND b.slug = p_barber_slug AND b.tenant_id = p_tenant_id
    AND ap.tenant_id = p_tenant_id
    AND ap.status IN ('pending','confirmed')
    AND (ap.start_at AT TIME ZONE 'Europe/Brussels')::date = p_date;
$function$;

-- ── book_appointment (AUTHORITATIVE body + tenant scoping) ────────────────────
CREATE OR REPLACE FUNCTION public.book_appointment(
  p_service_slug text, p_barber_slug text, p_start timestamptz,
  p_first text, p_last text, p_email text, p_phone text,
  p_note text DEFAULT NULL::text, p_lang text DEFAULT 'nl'::text,
  p_tenant_id int DEFAULT 1)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare
  v_service public.services%rowtype;
  v_barber  public.barbers%rowtype;
  v_customer_id uuid;
  v_end timestamptz;
  v_lang text;
  v_appt uuid;
  v_lead int; v_buf int; v_grid int;
  v_dow int; v_start_min int; v_ok boolean;
begin
  -- fail-closed pair to resolve_tenant (critic B4): a mis-hosted anon call cannot land in Kameraad.
  if p_tenant_id is null then raise exception 'unknown_tenant'; end if;

  if coalesce(btrim(p_first),'') = '' or coalesce(btrim(p_last),'') = '' then
    raise exception 'name_required';
  end if;
  if coalesce(btrim(p_email),'') !~ '^\S+@\S+\.\S+$' then
    raise exception 'email_invalid';
  end if;

  select * into v_service from public.services
   where slug = p_service_slug and tenant_id = p_tenant_id and is_active and not is_walk_in;
  if not found then raise exception 'service_unknown'; end if;

  select * into v_barber from public.barbers
   where slug = p_barber_slug and tenant_id = p_tenant_id and is_active;
  if not found then raise exception 'barber_unknown'; end if;

  if p_start < now() - interval '1 minute' then raise exception 'in_past'; end if;

  v_end := p_start + make_interval(mins => v_service.duration_min);

  v_lang := case lower(coalesce(p_lang,'nl'))
              when 'leuvens' then 'le' when 'le' then 'le'
              when 'en' then 'en' when 'fr' then 'fr' when 'es' then 'es'
              else 'nl' end;

  -- (existing) reject overlapping appointment
  if exists (
    select 1 from public.appointments a
     where a.barber_id = v_barber.id
       and a.tenant_id = p_tenant_id
       and a.status in ('pending','confirmed')
       and a.start_at < v_end and a.end_at > p_start
  ) then
    raise exception 'slot_taken';
  end if;

  -- ===== server-authority guards (G-17) =====
  select coalesce((value::text)::int,2)  into v_lead from public.settings where key='min_lead_time_hours' and tenant_id=p_tenant_id;
  select coalesce((value::text)::int,0)  into v_buf  from public.settings where key='buffer_min'          and tenant_id=p_tenant_id;
  select coalesce((value::text)::int,30) into v_grid from public.settings where key='slot_increment_min'  and tenant_id=p_tenant_id;
  v_grid := greatest(v_grid, 1);

  -- G-17.1 barber must offer this service (matrix)
  if not exists (select 1 from public.barber_services bs
                 where bs.barber_id = v_barber.id and bs.service_id = v_service.id and bs.tenant_id = p_tenant_id) then
    raise exception 'barber does not offer this service' using errcode='23514';
  end if;

  -- G-17.2 lead time
  if p_start < now() + make_interval(hours => v_lead) then
    raise exception 'inside lead time' using errcode='23514';
  end if;

  -- G-17.3 availability window + buffer + grid (mirrors available_slots, Brussels tz)
  v_dow := extract(dow from (p_start at time zone 'Europe/Brussels'))::int;      -- 0=Sun..6=Sat
  v_start_min := extract(hour from (p_start at time zone 'Europe/Brussels'))::int * 60
               + extract(minute from (p_start at time zone 'Europe/Brussels'))::int;
  select exists (
    select 1 from public.availability a
    where a.barber_id = v_barber.id and a.tenant_id = p_tenant_id and a.day_of_week = v_dow and a.is_active
      and v_start_min >= (extract(hour from a.start_time)::int*60 + extract(minute from a.start_time)::int)
      and (v_start_min + v_service.duration_min + v_buf)
            <= (extract(hour from a.end_time)::int*60 + extract(minute from a.end_time)::int)
      and ((v_start_min - (extract(hour from a.start_time)::int*60 + extract(minute from a.start_time)::int)) % v_grid) = 0
  ) into v_ok;
  if not v_ok then raise exception 'outside availability window' using errcode='23514'; end if;

  -- G-17.4 blocks (barber-specific or all-barber block)
  if exists (
    select 1 from public.blocked_slots b
    where (b.barber_id = v_barber.id or b.barber_id is null)
      and b.tenant_id = p_tenant_id
      and b.start_at < v_end and b.end_at > p_start
  ) then
    raise exception 'slot blocked' using errcode='23514';
  end if;
  -- ===== end guards =====

  insert into public.customers (tenant_id, first_name, last_name, email, phone, preferred_language, consent_given_at)
  values (p_tenant_id, btrim(p_first), btrim(p_last), lower(btrim(p_email)), nullif(btrim(p_phone),''), v_lang, now())
  on conflict (tenant_id, lower(email)) do update
    set first_name = excluded.first_name,
        last_name  = excluded.last_name,
        phone      = coalesce(excluded.phone, public.customers.phone),
        preferred_language = excluded.preferred_language,
        updated_at = now()
  returning id into v_customer_id;

  insert into public.appointments (tenant_id, barber_id, service_id, customer_id, start_at, end_at, status, customer_notes)
  values (p_tenant_id, v_barber.id, v_service.id, v_customer_id, p_start, v_end, 'confirmed', nullif(btrim(p_note),''))
  returning id into v_appt;

  return v_appt;
end;
$function$;

-- ── Re-grant EXECUTE to the anon booking path (DROP removed the old grants) ────
REVOKE ALL ON FUNCTION public.available_slots(text,text,date,int) FROM public;
REVOKE ALL ON FUNCTION public.taken_slots(text,date,int) FROM public;
REVOKE ALL ON FUNCTION public.book_appointment(text,text,timestamptz,text,text,text,text,text,text,int) FROM public;
GRANT EXECUTE ON FUNCTION public.available_slots(text,text,date,int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.taken_slots(text,date,int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.book_appointment(text,text,timestamptz,text,text,text,text,text,text,int) TO anon, authenticated;

-- Token portal RPCs (get_appointment_by_token / cancel_appointment_by_token): cancel_token is a
-- globally random-unique capability, so token lookup is already tenant-safe; NOT altered here to
-- avoid a return-type change (the design's "add tenant_id to the returned row" would change the
-- TABLE signature → a DROP, out of this migration's B2 scope). Flagged in the handoff report.
