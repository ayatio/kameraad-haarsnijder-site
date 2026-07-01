-- Slice 2 · Mig 4 · harden_book_appointment (G-17 / FR-117). [LG]
-- Server authority: re-validate barber-service matrix, lead time, availability
-- window + buffer + slot grid, and blocks INSIDE the RPC, mirroring available_slots.
-- Signature unchanged; existing name/email/service/barber/past/overlap checks kept.
-- New guards raise ERRCODE 23514 → the UI maps them to "niet beschikbaar".
-- Applied to kameraad-staging 2026-07-01. Verified: ENG-20..25, MIG-20.
CREATE OR REPLACE FUNCTION public.book_appointment(
  p_service_slug text, p_barber_slug text, p_start timestamptz,
  p_first text, p_last text, p_email text, p_phone text,
  p_note text DEFAULT NULL::text, p_lang text DEFAULT 'nl'::text)
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
  if coalesce(btrim(p_first),'') = '' or coalesce(btrim(p_last),'') = '' then
    raise exception 'name_required';
  end if;
  if coalesce(btrim(p_email),'') !~ '^\S+@\S+\.\S+$' then
    raise exception 'email_invalid';
  end if;

  select * into v_service from public.services
   where slug = p_service_slug and is_active and not is_walk_in;
  if not found then raise exception 'service_unknown'; end if;

  select * into v_barber from public.barbers
   where slug = p_barber_slug and is_active;
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
       and a.status in ('pending','confirmed')
       and a.start_at < v_end and a.end_at > p_start
  ) then
    raise exception 'slot_taken';
  end if;

  -- ===== NEW server-authority guards (G-17) =====
  select coalesce((value::text)::int,2)  into v_lead from public.settings where key='min_lead_time_hours';
  select coalesce((value::text)::int,0)  into v_buf  from public.settings where key='buffer_min';
  select coalesce((value::text)::int,30) into v_grid from public.settings where key='slot_increment_min';
  v_grid := greatest(v_grid, 1);

  -- G-17.1 barber must offer this service (matrix)
  if not exists (select 1 from public.barber_services bs
                 where bs.barber_id = v_barber.id and bs.service_id = v_service.id) then
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
    where a.barber_id = v_barber.id and a.day_of_week = v_dow and a.is_active
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
      and b.start_at < v_end and b.end_at > p_start
  ) then
    raise exception 'slot blocked' using errcode='23514';
  end if;
  -- ===== end new guards =====

  insert into public.customers (first_name, last_name, email, phone, preferred_language, consent_given_at)
  values (btrim(p_first), btrim(p_last), lower(btrim(p_email)), nullif(btrim(p_phone),''), v_lang, now())
  on conflict (email) do update
    set first_name = excluded.first_name,
        last_name  = excluded.last_name,
        phone      = coalesce(excluded.phone, public.customers.phone),
        preferred_language = excluded.preferred_language,
        updated_at = now()
  returning id into v_customer_id;

  insert into public.appointments (barber_id, service_id, customer_id, start_at, end_at, status, customer_notes)
  values (v_barber.id, v_service.id, v_customer_id, p_start, v_end, 'confirmed', nullif(btrim(p_note),''))
  returning id into v_appt;

  return v_appt;
end;
$function$;
