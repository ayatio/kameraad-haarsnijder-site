/* ============================================================
   KAMERAAD HAARSNIJDER — booking backend bridge
   Connects the homepage booking widget to Supabase via two
   locked-down RPCs (anon key only ever calls these):
     • taken_slots(p_barber_slug, p_date)  → ["HH:MM", ...]
     • book_appointment(...)               → appointment uuid
   The anon/publishable key is safe to ship: RLS seals every
   table, and only these two functions are exposed.
   ============================================================ */
(function () {
  var SUPABASE_URL = 'https://hzvhyslujvkwqpkevahj.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_s7EpcEpv2hdZiNgufSWLlQ_xsGOifv_';

  if (!window.supabase || !window.supabase.createClient) {
    console.warn('[KB] supabase-js not loaded — booking will run in display-only mode.');
    return;
  }
  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // Homepage service label → real DB service slug (DB is source of truth
  // for price/duration of the stored appointment).
  var SVC_SLUG = {
    'Knippen': 'haircut',
    'Baard': 'beardtrim-hotwash',
    'Knippen + Baard': 'haircut-beardtrim',
    'Kind (–12 j.)': 'haircut'
  };

  function barberSlug(name) { return (name || '').toString().trim().toLowerCase(); }
  function dateStr(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  window.KB = {
    SVC_SLUG: SVC_SLUG,
    barberSlug: barberSlug,
    dateStr: dateStr,

    // Booked HH:MM start-times for a barber on a given day.
    takenSlots: function (barber, d) {
      return sb.rpc('taken_slots', { p_barber_slug: barberSlug(barber), p_date: dateStr(d) })
        .then(function (r) { if (r.error) { console.warn('[KB] taken_slots', r.error); return []; } return r.data || []; })
        .catch(function (e) { console.warn('[KB] taken_slots ex', e); return []; });
    },

    // Create a real, persisted appointment. Returns the supabase {data, error}.
    book: function (p) {
      return sb.rpc('book_appointment', {
        p_service_slug: SVC_SLUG[p.svc] || 'haircut',
        p_barber_slug: barberSlug(p.barber),
        p_start: p.start,            // ISO 8601 string (UTC)
        p_first: p.first,
        p_last: p.last,
        p_email: p.email,
        p_phone: p.phone,
        p_note: p.note || null,
        p_lang: p.lang || 'nl'
      });
    }
  };
})();
