/* ============================================================
   KAMERAAD HAARSNIJDER — booking backend bridge
   Single source of truth = Supabase. The public site reads the
   canonical service catalogue + barber→service matrix from the DB,
   and writes/reads only through two locked-down RPCs:
     • taken_slots(p_barber_slug, p_date)  → ["HH:MM", ...]
     • book_appointment(...)               → appointment uuid
   The anon/publishable key is safe to ship: RLS seals every table;
   only services/barbers/barber_services are anon-readable and only
   these two functions are callable.
   ============================================================ */
(function () {
  var SUPABASE_URL = 'https://hzvhyslujvkwqpkevahj.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_s7EpcEpv2hdZiNgufSWLlQ_xsGOifv_';

  if (!window.supabase || !window.supabase.createClient) {
    console.warn('[KB] supabase-js not loaded — booking unavailable.');
    return;
  }
  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // Site language code → DB name_* column suffix.
  function langKey(lang) {
    switch ((lang || 'nl').toLowerCase()) {
      case 'leuvens': case 'le': return 'le';
      case 'en': return 'en';
      case 'fr': return 'fr';
      default: return 'nl';
    }
  }

  // Resilience fallback — mirrors the DB `services` rows (canonical five).
  // The DB is the source of truth; this only keeps the menu rendering if a
  // transient fetch fails. Keep in sync with the services table.
  var FALLBACK_SERVICES = [
    { slug: 'haircut',               order: 1, price_cents: 4000, dur: 40, name: { nl: 'Haarsnit / Haircut', en: 'Haircut', fr: 'Coupe de cheveux', le: 'Haarsnit' } },
    { slug: 'haircut-beard-hotwash', order: 2, price_cents: 6000, dur: 60, name: { nl: 'Haarsnit & Baard Hot Towel', en: 'Haircut & Beard Hot Towel Wet-Shave', fr: 'Coupe & Barbe Serviette Chaude', le: 'Haarsnit & Boord Hot Towel' } },
    { slug: 'haircut-beardtrim',     order: 3, price_cents: 5000, dur: 50, name: { nl: 'Haarsnit & Baardtrim', en: 'Haircut & Beardtrim', fr: 'Coupe & Taille de barbe', le: 'Haarsnit & Boordtrim' } },
    { slug: 'beardtrim-hotwash',     order: 4, price_cents: 3500, dur: 35, name: { nl: 'Baardtrim Hot Towel', en: 'Beardtrim with Hot Towel Wet Shave', fr: 'Taille de barbe Serviette Chaude', le: 'Boordtrim Hot Towel' } },
    { slug: 'wet-shave',             order: 5, price_cents: 3500, dur: 35, name: { nl: 'Baard Glad Nat Scheren', en: 'Full Hot Towel Wet Shave', fr: 'Rasage complet à la serviette chaude', le: 'Boord Glad Nat Schere' } }
  ];

  var KB = {
    SERVICES: [],          // [{slug, order, price_cents, dur, name:{nl,en,fr,le}}]
    MATRIX: {},            // { barberSlug: [serviceSlug, ...] }  (which barber offers what)
    bySlug: {},

    langKey: langKey,
    svc: function (slug) { return KB.bySlug[slug] || null; },
    svcDur: function (slug) { var s = KB.svc(slug); return s ? s.dur : 30; },
    svcPriceCents: function (slug) { var s = KB.svc(slug); return s ? s.price_cents : 0; },
    svcName: function (slug, lang) {
      var s = KB.svc(slug); if (!s) return slug;
      return s.name[langKey(lang)] || s.name.nl || s.slug;
    },
    euro: function (cents) { return '€' + (cents % 100 === 0 ? (cents / 100) : (cents / 100).toFixed(2)); },

    // Load catalogue + matrix from the DB. Resolves once KB.SERVICES is set.
    loadCatalogue: function () {
      var pServices = sb.from('services')
        .select('slug,sort_order,price_cents,duration_min,name_nl,name_en,name_fr,name_le')
        .eq('is_active', true).eq('is_walk_in', false).order('sort_order');
      var pMatrix = sb.from('barber_services')
        .select('barbers(slug),services(slug,is_walk_in)');

      return Promise.all([pServices, pMatrix]).then(function (res) {
        var sRes = res[0], mRes = res[1];
        if (sRes.error || !sRes.data || !sRes.data.length) throw (sRes.error || new Error('no services'));
        KB.SERVICES = sRes.data.map(function (r) {
          return { slug: r.slug, order: r.sort_order, price_cents: r.price_cents, dur: r.duration_min,
                   name: { nl: r.name_nl, en: r.name_en, fr: r.name_fr, le: r.name_le } };
        });
        KB.MATRIX = {};
        if (mRes.data) mRes.data.forEach(function (row) {
          var b = row.barbers && row.barbers.slug, sv = row.services;
          if (!b || !sv || sv.is_walk_in) return;
          (KB.MATRIX[b] = KB.MATRIX[b] || []).push(sv.slug);
        });
        return finalize();
      }).catch(function (e) {
        console.warn('[KB] catalogue fetch failed, using fallback mirror:', e);
        KB.SERVICES = FALLBACK_SERVICES.map(function (s) { return s; });
        KB.MATRIX = {};   // empty → caller treats every barber as offering all (all-do-all provisional)
        return finalize();
      });

      function finalize() {
        KB.bySlug = {};
        KB.SERVICES.forEach(function (s) { KB.bySlug[s.slug] = s; });
        return { services: KB.SERVICES, matrix: KB.MATRIX };
      }
    },

    // Booked HH:MM start-times for a barber on a given day.
    takenSlots: function (barberSlug, d) {
      var ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      return sb.rpc('taken_slots', { p_barber_slug: (barberSlug || '').toLowerCase(), p_date: ds })
        .then(function (r) { if (r.error) { console.warn('[KB] taken_slots', r.error); return []; } return r.data || []; })
        .catch(function (e) { console.warn('[KB] taken_slots ex', e); return []; });
    },

    // Create a real, persisted appointment. p.svc is a DB service slug.
    book: function (p) {
      return sb.rpc('book_appointment', {
        p_service_slug: p.svc,
        p_barber_slug: (p.barber || '').toLowerCase(),
        p_start: p.start,            // ISO 8601 string (UTC)
        p_first: p.first, p_last: p.last, p_email: p.email,
        p_phone: p.phone, p_note: p.note || null, p_lang: p.lang || 'nl'
      }).then(function (res) {
        // Fire-and-forget the confirmation email; never block/break the booking.
        if (res && !res.error && res.data) {
          try { sb.functions.invoke('send-confirmation', { body: { appointment_id: res.data } }).catch(function () {}); }
          catch (e) {}
        }
        return res;
      });
    }
  };

  window.KB = KB;
})();
