/* ============================================================
   KAMERAAD — Barbier-console (tablet)
   A per-barber surface: own day + calendar, add appointment,
   customer fiche, close-out (confirm=cut / cancel=payment),
   NPS (like/normal/dislike + note), walk-ins on a generic customer.
   Auth = Supabase Auth (admin_users role=barber). RLS: barbers are
   admins (is_admin()), so direct table ops are allowed; the UI
   scopes everything to the logged-in barber.
   ============================================================ */
(function () {
  'use strict';
  var SUPABASE_URL = 'https://hzvhyslujvkwqpkevahj.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_s7EpcEpv2hdZiNgufSWLlQ_xsGOifv_';
  var GENERIC_CUST = '00000000-0000-0000-0000-0000000000d0';
  var TZ = 'Europe/Brussels';
  if (!window.supabase) { document.body.innerHTML = '<p style="padding:24px">Supabase kon niet laden.</p>'; return; }
  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  var B = { me: null, date: new Date(), services: [], customers: [], appts: [] };

  // ---- helpers ----
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function ymd(d) { return d.toLocaleDateString('en-CA'); } // device-local (Brussels on the shop tablet)
  function brusselsDate(iso) { return new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ }); }
  function hhmm(iso) { return new Date(iso).toLocaleTimeString('nl-BE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }); }
  function money(cents) { return '€' + (cents % 100 === 0 ? cents / 100 : (cents / 100).toFixed(2)); }
  function dayLabel(d) {
    var s = d.toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' });
    var t = ymd(d) === ymd(new Date()) ? 'Vandaag · ' : '';
    return t + s.charAt(0).toUpperCase() + s.slice(1);
  }
  function toast(msg) {
    var el = document.createElement('div'); el.className = 'toast'; el.textContent = msg; document.body.appendChild(el);
    setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(function () { el.remove(); }, 320); }, 2200);
  }
  function authHeaders() { return { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' }; }
  function callFn(name, body) {
    return fetch(SUPABASE_URL + '/functions/v1/' + name, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) })
      .then(function (r) { return r.json(); }).catch(function (e) { console.warn('[fn]', name, e); return null; });
  }

  // ---- modal ----
  function modal(html) {
    var mount = $('modalMount');
    var scrim = document.createElement('div'); scrim.className = 'scrim';
    scrim.innerHTML = '<div class="sheet">' + html + '</div>';
    mount.appendChild(scrim);
    var card = scrim.querySelector('.sheet');
    function close() { scrim.remove(); }
    scrim.addEventListener('click', function (e) { if (e.target === scrim) close(); });
    card.querySelectorAll('[data-close]').forEach(function (b) { b.onclick = close; });
    return { scrim: scrim, card: card, close: close };
  }

  // ---- auth ----
  function showLogin(msg) {
    $('login').hidden = false; $('app').hidden = true;
    if (msg) { var e = $('liErr'); e.textContent = msg; e.hidden = false; }
  }
  $('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var email = $('liEmail').value.trim(), pass = $('liPass').value;
    var btn = $('liBtn'); btn.disabled = true; btn.textContent = '…'; $('liErr').hidden = true;
    sb.auth.signInWithPassword({ email: email, password: pass }).then(function (r) {
      btn.disabled = false; btn.textContent = 'Aanmelden';
      if (r.error) { showLogin('Aanmelden mislukt — controleer e-mail en wachtwoord.'); return; }
      enter(r.data.session);
    });
  });
  $('logoutBtn').onclick = function () { sb.auth.signOut().then(function () { location.reload(); }); };

  function enter(session) {
    var email = session.user.email;
    sb.from('admin_users').select('barber_id,role,email').eq('email', email).maybeSingle().then(function (r) {
      var au = r.data;
      if (!au || !au.barber_id) { showLogin('Dit account is niet aan een barbier gekoppeld.'); sb.auth.signOut(); return; }
      sb.from('barbers').select('id,name').eq('id', au.barber_id).single().then(function (br) {
        B.me = { barberId: au.barber_id, name: (br.data && br.data.name) || email.split('@')[0], email: email, role: au.role };
        $('login').hidden = true; $('app').hidden = false;
        $('meName').textContent = B.me.name; $('meAv').textContent = (B.me.name[0] || 'B').toUpperCase();
        bootData();
      });
    });
  }

  function bootData() {
    Promise.all([
      sb.from('services').select('id,slug,name_nl,duration_min,price_cents').eq('is_active', true).eq('is_walk_in', false).order('sort_order'),
      sb.from('customers').select('id,first_name,last_name,email,phone,notes,no_show_count')
    ]).then(function (res) {
      B.services = (res[0].data || []);
      B.customers = (res[1].data || []).map(function (c) { return Object.assign(c, { name: ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || c.email }); });
      loadDay();
    });
  }

  // ---- day load ----
  function loadDay() {
    $('dLabel').textContent = dayLabel(B.date);
    var ds = ymd(B.date);
    var lo = new Date(ds + 'T00:00:00Z'); lo.setUTCDate(lo.getUTCDate() - 1);
    var hi = new Date(ds + 'T00:00:00Z'); hi.setUTCDate(hi.getUTCDate() + 2);
    sb.from('appointments')
      .select('id,start_at,end_at,status,payment_due,nps_rating,nps_note,customer_notes,resolved_at,customer_id,service_id,customers(id,first_name,last_name,email,phone,notes,no_show_count),services(name_nl,duration_min,price_cents)')
      .eq('barber_id', B.me.barberId)
      .gte('start_at', lo.toISOString()).lt('start_at', hi.toISOString())
      .order('start_at')
      .then(function (r) {
        B.appts = (r.data || []).filter(function (a) { return brusselsDate(a.start_at) === ds; });
        render();
      });
  }

  function render() {
    var open = 0, done = 0, cancelled = 0, revenue = 0;
    B.appts.forEach(function (a) {
      if (a.status === 'completed') { done++; revenue += (a.services ? a.services.price_cents : 0); }
      else if (a.status === 'cancelled' || a.status === 'no_show') cancelled++;
      else open++;
    });
    $('statRow').innerHTML =
      stat(B.appts.length, 'Afspraken') + stat(open, 'Open') + stat(done, 'Geknipt') + stat(money(revenue), 'Omzet');

    var list = $('dayList');
    if (!B.appts.length) { list.innerHTML = '<div class="empty"><span class="serif">Geen afspraken</span><p class="muted">Een rustige dag — of voeg een walk-in toe.</p></div>'; return; }
    list.innerHTML = B.appts.map(apptCard).join('');
    wireCards();
  }
  function stat(n, l) { return '<div class="stat"><div class="n">' + n + '</div><div class="l">' + l + '</div></div>'; }

  function npsGlyph(r) { return r === 'like' ? '👍' : r === 'dislike' ? '👎' : r === 'normal' ? '😐' : ''; }

  function apptCard(a) {
    var c = a.customers || {}; var name = ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || 'Walk-in';
    var svc = a.services || {}; var resolved = a.status === 'completed' || a.status === 'cancelled' || a.status === 'no_show';
    var cls = a.status === 'completed' ? ' done' : (a.status === 'cancelled' || a.status === 'no_show') ? ' cancelled' : '';
    var badge = '';
    if (a.status === 'completed') badge = '<span class="bdg bdg--ok">Geknipt</span> ' + (a.nps_rating ? '<span class="nps">' + npsGlyph(a.nps_rating) + '</span>' : '');
    else if (a.status === 'cancelled' || a.status === 'no_show') badge = '<span class="bdg bdg--no">Geannuleerd</span>' + (a.payment_due ? ' <span class="bdg bdg--pay">Betaling</span>' : '');
    else badge = '<span class="bdg">Open</span>';

    var actions = resolved ? '' :
      '<div class="appt__actions">' +
        '<button class="btn btn--ok js-cut" data-id="' + a.id + '">✓ Geknipt</button>' +
        '<button class="btn btn--danger js-cancel" data-id="' + a.id + '">✕ Annuleren</button>' +
      '</div>';
    var note = a.nps_note ? '<div class="appt__note">📝 ' + esc(a.nps_note) + '</div>' : '';

    return '<div class="appt' + cls + '">' +
      '<div class="appt__top"><div class="appt__time">' + hhmm(a.start_at) + '</div>' +
        '<div><div class="appt__cust"><span class="js-fiche linkish" data-cid="' + (c.id || '') + '">' + esc(name) + '</span></div>' +
          '<div class="appt__svc">' + esc(svc.name_nl || '') + ' · ' + (svc.duration_min || '') + ' min · ' + money(svc.price_cents || 0) + '</div></div>' +
        '<div class="appt__badges">' + badge + '</div></div>' +
      note + actions + '</div>';
  }

  function wireCards() {
    document.querySelectorAll('.js-cut').forEach(function (b) { b.onclick = function () { openNps(b.dataset.id); }; });
    document.querySelectorAll('.js-cancel').forEach(function (b) { b.onclick = function () { cancelAppt(b.dataset.id); }; });
    document.querySelectorAll('.js-fiche').forEach(function (b) { b.onclick = function () { if (b.dataset.cid) openFiche(b.dataset.cid); }; });
  }

  // ---- close-out: confirm (cut) -> NPS ----
  function openNps(id) {
    var a = B.appts.find(function (x) { return x.id === id; }); if (!a) return;
    var c = a.customers || {}; var name = ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || 'deze klant';
    var m = modal(
      '<h2 class="serif">Geknipt — beoordeling</h2>' +
      '<p class="muted" style="font-size:.9rem;margin:2px 0 4px">Hoe was ' + esc(name) + ' als klant?</p>' +
      '<div class="nps-grid">' +
        '<div class="nps-opt" data-r="like"><div class="e">👍</div><div class="t">Top</div></div>' +
        '<div class="nps-opt" data-r="normal"><div class="e">😐</div><div class="t">Normaal</div></div>' +
        '<div class="nps-opt dislike" data-r="dislike"><div class="e">👎</div><div class="t">Mindere klant</div></div>' +
      '</div>' +
      '<div class="field"><label>Notitie <span class="muted" id="npsNoteHint">(optioneel)</span></label><textarea class="in" id="npsNote" rows="3" placeholder="Zichtbaar op het klantprofiel…"></textarea></div>' +
      '<div class="err" id="npsErr" hidden></div>' +
      '<div class="sheet__foot"><button class="btn btn--ghost" data-close>Annuleren</button><button class="btn btn--gold" id="npsSave">Bevestigen</button></div>'
    );
    var chosen = null;
    m.card.querySelectorAll('.nps-opt').forEach(function (opt) {
      opt.onclick = function () {
        m.card.querySelectorAll('.nps-opt').forEach(function (o) { o.classList.remove('on'); });
        opt.classList.add('on'); chosen = opt.dataset.r;
        $('npsNoteHint').textContent = chosen === 'dislike' ? '(verplicht)' : '(optioneel)';
      };
    });
    $('npsSave').onclick = function () {
      var note = $('npsNote').value.trim();
      if (!chosen) { showErr('npsErr', 'Kies een beoordeling.'); return; }
      if (chosen === 'dislike' && !note) { showErr('npsErr', 'Een notitie is verplicht bij “Mindere klant”.'); return; }
      var btn = $('npsSave'); btn.disabled = true; btn.textContent = '…';
      sb.from('appointments').update({
        status: 'completed', nps_rating: chosen, nps_note: note || null,
        resolved_at: new Date().toISOString(), resolved_by: B.me.barberId
      }).eq('id', id).then(function (r) {
        if (r.error) { btn.disabled = false; btn.textContent = 'Bevestigen'; showErr('npsErr', 'Opslaan mislukt.'); return; }
        m.close(); toast('Afspraak afgerond.'); loadDay();
      });
    };
  }
  function showErr(elId, msg) { var e = $(elId); e.textContent = msg; e.hidden = false; }

  // ---- close-out: cancel -> payment ----
  function cancelAppt(id) {
    var m = modal(
      '<h2 class="serif">Afspraak annuleren</h2>' +
      '<p style="font-size:.95rem;line-height:1.5;color:var(--fg2)">Dit telt als een laattijdige annulering. De klant wordt een <b>vergoeding</b> aangerekend en ontvangt een e-mail.</p>' +
      '<div class="sheet__foot"><button class="btn btn--ghost" data-close>Terug</button><button class="btn btn--danger" id="cxOk">Annuleren & aanrekenen</button></div>'
    );
    $('cxOk').onclick = function () {
      var btn = $('cxOk'); btn.disabled = true; btn.textContent = '…';
      sb.from('appointments').update({
        status: 'cancelled', payment_due: true, cancelled_at: new Date().toISOString(),
        resolved_at: new Date().toISOString(), resolved_by: B.me.barberId
      }).eq('id', id).then(function (r) {
        if (r.error) { btn.disabled = false; btn.textContent = 'Annuleren & aanrekenen'; toast('Mislukt.'); return; }
        callFn('send-payment-due', { appointment_id: id, reason: 'barber_cancel' });
        m.close(); toast('Geannuleerd — klant aangerekend.'); loadDay();
      });
    };
  }

  // ---- add appointment ----
  $('addBtn').onclick = function () {
    var svcOpts = B.services.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name_nl) + ' · ' + s.duration_min + ' min · ' + money(s.price_cents) + '</option>'; }).join('');
    var custList = B.customers.map(function (c) { return '<option value="' + esc(c.name) + '">'; }).join('');
    var m = modal(
      '<h2 class="serif">Nieuwe afspraak</h2>' +
      '<p class="muted" style="font-size:.88rem;margin:2px 0 12px">Handmatige boeking of walk-in.</p>' +
      '<div class="field"><label>Klant</label><input class="in" id="naCust" list="naCustList" placeholder="Naam — of laat leeg voor walk-in"><datalist id="naCustList">' + custList + '</datalist></div>' +
      '<label style="display:flex;align-items:center;gap:8px;font-size:.9rem;margin:2px 0 12px;cursor:pointer"><input type="checkbox" id="naWalkin"> Walk-in (onbekende klant)</label>' +
      '<div class="field"><label>Dienst</label><select class="in" id="naSvc">' + svcOpts + '</select></div>' +
      '<div class="row2"><div class="field"><label>Tijd</label><input class="in" id="naTime" type="time" step="1800" value="10:00"></div>' +
        '<div class="field"><label>Datum</label><input class="in" id="naDate" type="date" value="' + ymd(B.date) + '"></div></div>' +
      '<div class="err" id="naErr" hidden></div>' +
      '<div class="sheet__foot"><button class="btn btn--ghost" data-close>Annuleren</button><button class="btn btn--gold" id="naSave">Boeken</button></div>'
    );
    $('naSave').onclick = function () {
      var svcId = $('naSvc').value; var svc = B.services.find(function (s) { return s.id === svcId; });
      var time = $('naTime').value, dateStr = $('naDate').value;
      var walkin = $('naWalkin').checked; var typed = $('naCust').value.trim();
      if (!svc || !time || !dateStr) { showErr('naErr', 'Vul dienst, tijd en datum in.'); return; }
      var start = new Date(dateStr + 'T' + time + ':00'); // tablet tz = Brussels
      var end = new Date(start.getTime() + (svc.duration_min || 30) * 60000);
      var btn = $('naSave'); btn.disabled = true; btn.textContent = '…';

      resolveCustomer(walkin, typed).then(function (custId) {
        if (!custId) { btn.disabled = false; btn.textContent = 'Boeken'; showErr('naErr', 'Kon klant niet bepalen.'); return; }
        sb.from('appointments').insert({
          barber_id: B.me.barberId, service_id: svcId, customer_id: custId,
          start_at: start.toISOString(), end_at: end.toISOString(), status: 'confirmed'
        }).select('id').single().then(function (r) {
          if (r.error) { btn.disabled = false; btn.textContent = 'Boeken'; showErr('naErr', r.error.message.indexOf('slot') > -1 ? 'Tijd niet beschikbaar.' : 'Boeken mislukt.'); return; }
          m.close(); toast('Afspraak geboekt.');
          if (ymd(B.date) !== dateStr) { B.date = new Date(dateStr + 'T12:00:00'); }
          bootData();
        });
      });
    };
  };

  // walkin=true -> generic; typed matches existing -> that customer; else create minimal new customer
  function resolveCustomer(walkin, typed) {
    if (walkin || !typed) return Promise.resolve(GENERIC_CUST);
    var existing = B.customers.find(function (c) { return c.name.toLowerCase() === typed.toLowerCase(); });
    if (existing) return Promise.resolve(existing.id);
    var parts = typed.split(/\s+/); var first = parts[0] || 'Walk-in'; var last = parts.slice(1).join(' ') || '';
    var synthetic = 'walkin+' + Math.random().toString(36).slice(2, 8) + '@kameraadhaarsnijder.be';
    return sb.from('customers').insert({ first_name: first, last_name: last, email: synthetic, preferred_language: 'nl', email_missing: true }).select('id').single()
      .then(function (r) { return r.error ? null : r.data.id; });
  }

  // ---- customer fiche ----
  function openFiche(cid) {
    if (cid === GENERIC_CUST) { toast('Gedeeld walk-in profiel — geen klantgegevens.'); return; }
    Promise.all([
      sb.from('customers').select('id,first_name,last_name,email,phone,notes,no_show_count,marketing_opt_in,reminder_opt_in,created_at').eq('id', cid).single(),
      sb.from('appointments').select('start_at,status,nps_rating,nps_note,services(name_nl),barbers(name)').eq('customer_id', cid).order('start_at', { ascending: false }).limit(40)
    ]).then(function (res) {
      var c = res[0].data; if (!c) { toast('Klant niet gevonden.'); return; }
      var hist = res[1].data || [];
      var name = ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || c.email;
      var visits = hist.filter(function (h) { return h.status === 'completed'; }).length;
      var npsItems = hist.filter(function (h) { return h.nps_rating; });
      var npsHtml = npsItems.length ? npsItems.map(function (h) {
        return '<div class="hist__item"><b>' + npsGlyph(h.nps_rating) + '</b> ' + esc(brusselsDate(h.start_at)) + (h.barbers ? ' · ' + esc(h.barbers.name) : '') +
          (h.nps_note ? '<br><span class="muted">' + esc(h.nps_note) + '</span>' : '') + '</div>';
      }).join('') : '<p class="muted" style="font-size:.9rem">Nog geen beoordelingen.</p>';
      var histHtml = hist.length ? hist.slice(0, 12).map(function (h) {
        return '<div class="hist__item">' + esc(brusselsDate(h.start_at)) + ' · ' + esc(h.services ? h.services.name_nl : '') + ' · <span class="muted">' + statusNl(h.status) + '</span></div>';
      }).join('') : '<p class="muted" style="font-size:.9rem">Nog geen afspraken.</p>';

      modal(
        '<h2 class="serif">' + esc(name) + '</h2>' +
        '<div class="fiche__row"><span class="k">E-mail</span><span>' + esc(c.email || '—') + '</span></div>' +
        '<div class="fiche__row"><span class="k">Telefoon</span><span>' + esc(c.phone || '—') + '</span></div>' +
        '<div class="fiche__row"><span class="k">Bezoeken</span><span>' + visits + '</span></div>' +
        '<div class="fiche__row"><span class="k">No-shows</span><span>' + (c.no_show_count || 0) + '</span></div>' +
        (c.notes ? '<div class="appt__note" style="margin-top:12px">📝 ' + esc(c.notes) + '</div>' : '') +
        '<h3 class="serif" style="font-size:1.1rem;margin:18px 0 2px">Beoordelingen</h3><div class="hist">' + npsHtml + '</div>' +
        '<h3 class="serif" style="font-size:1.1rem;margin:18px 0 2px">Historie</h3><div class="hist">' + histHtml + '</div>' +
        '<div class="sheet__foot"><button class="btn btn--ghost" data-close>Sluiten</button></div>'
      );
    });
  }
  function statusNl(s) { return ({ completed: 'Geknipt', cancelled: 'Geannuleerd', no_show: 'No-show', confirmed: 'Bevestigd', pending: 'In afwachting' })[s] || s; }

  // ---- date nav ----
  $('dPrev').onclick = function () { B.date.setDate(B.date.getDate() - 1); loadDay(); };
  $('dNext').onclick = function () { B.date.setDate(B.date.getDate() + 1); loadDay(); };
  $('dToday').onclick = function () { B.date = new Date(); loadDay(); };

  // ---- boot ----
  sb.auth.getSession().then(function (r) {
    if (r.data && r.data.session) enter(r.data.session); else showLogin();
  });
})();
