/* ============================================================
   Kameraad Admin — Supabase bridge
   Makes the real design functional: real login, loads the live DB
   into KA.state (exact shapes the renderers expect), and persists
   every action. The design files are untouched except for tiny
   `KA.db.*` calls added at each write site.
   ============================================================ */
(function () {
  const KA = (window.KA = window.KA || {});
  const URL = 'https://hzvhyslujvkwqpkevahj.supabase.co';
  const KEY = 'sb_publishable_s7EpcEpv2hdZiNgufSWLlQ_xsGOifv_';
  const sb = window.supabase.createClient(URL, KEY);
  KA.SB = sb;
  const TZ = 'Europe/Brussels';
  const $ = (id) => document.getElementById(id);

  // ---- id strategy: barbers 'b-'+slug, services 'sv-'+slug (match the design's
  //      hardcoded ids); customers/appts/blocks/admins keep their DB uuid.
  const M = { svcDb: {}, barbDb: {} };           // KA id -> DB uuid
  const barberKA = {};                            // DB uuid -> 'b-'+slug
  const serviceKA = {};                           // DB uuid -> 'sv-'+slug

  // ---- date/time helpers (Brussels) ----
  const dayStr = (d) => d.toLocaleDateString('en-CA', { timeZone: TZ });
  const hhmm = (iso) => new Date(iso).toLocaleTimeString('nl-BE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  const dlabel = (iso) => new Date(iso).toLocaleDateString('nl-BE', { timeZone: TZ, day: 'numeric', month: 'short' });
  // Build a timestamptz ISO from 'YYYY-MM-DD' + 'HH:MM' using the admin's local
  // timezone (the shop runs in Europe/Brussels).
  function localISO(date, time) {
    const [Y, Mo, D] = date.split('-').map(Number);
    const [H, Mi] = time.split(':').map(Number);
    return new Date(Y, Mo - 1, D, H, Mi, 0, 0).toISOString();
  }
  const ST_TO_DB = { confirmed: 'confirmed', completed: 'completed', cancelled: 'cancelled', noshow: 'no_show' };
  const ST_FROM_DB = { confirmed: 'confirmed', completed: 'completed', cancelled: 'cancelled', no_show: 'noshow', pending: 'confirmed' };

  // ============================================================
  // LOAD: DB -> KA.state
  // ============================================================
  async function loadAll() {
    const [svc, barb, bsvc, avail, cust, appt, blk, adm, set, cont] = await Promise.all([
      sb.from('services').select('*').order('sort_order'),
      sb.from('barbers').select('*').order('sort_order'),
      sb.from('barber_services').select('barber_id,service_id'),
      sb.from('availability').select('barber_id,day_of_week,start_time,end_time').eq('is_active', true),
      sb.from('customers').select('*').order('last_name'),
      sb.from('appointments').select('id,start_at,status,customer_id,service_id,barber_id,customer_notes,customers(first_name,last_name),services(duration_min)').order('start_at'),
      sb.from('blocked_slots').select('id,barber_id,start_at,end_at,reason'),
      sb.from('admin_users').select('id,email,role,barber_id'),
      sb.from('settings').select('key,value'),
      sb.from('content').select('*').eq('key', 'seasonal_banner').maybeSingle(),
    ]);

    // --- services ---
    const services = (svc.data || []).map((s) => {
      const id = 'sv-' + s.slug; M.svcDb[id] = s.id; serviceKA[s.id] = id;
      return { id, name: s.name_nl, color: s.color || '#C9A24B', dur: s.duration_min, price: Math.round(s.price_cents / 100), active: s.is_active, walkin: s.is_walk_in, order: s.sort_order, desc: { nl: s.description_nl || '', en: s.description_en || '', fr: s.description_fr || '' } };
    });
    // --- barbers ---
    const matrix = {}; (bsvc.data || []).forEach((r) => { (matrix[r.barber_id] = matrix[r.barber_id] || []).push(r.service_id); });
    const hoursBy = {}; (avail.data || []).forEach((r) => { const i = (r.day_of_week + 6) % 7; (hoursBy[r.barber_id] = hoursBy[r.barber_id] || [[], [], [], [], [], [], []])[i].push({ s: r.start_time.slice(0, 5), e: r.end_time.slice(0, 5) }); });
    const barbers = (barb.data || []).map((b) => {
      const id = 'b-' + b.slug; M.barbDb[id] = b.id; barberKA[b.id] = id;
      const svcIds = (matrix[b.id] || []).map((dbid) => serviceKA[dbid]).filter((x) => { const sv = services.find((z) => z.id === x); return sv && !sv.walkin; });
      return { id, name: b.name, photo: b.photo_url || ('assets/team-' + b.slug + '.jpg'), slug: b.slug, active: b.is_active, order: b.sort_order, bio: { nl: b.bio_nl || '', en: b.bio_en || '', fr: b.bio_fr || '' }, services: svcIds, hours: hoursBy[b.id] || [[], [], [], [], [], [], []] };
    });
    // --- appts (all, dated) + per-customer history ---
    const histBy = {};
    const allAppts = (appt.data || []).map((a) => {
      const ap = { id: a.id, date: dayStr(new Date(a.start_at)), start: hhmm(a.start_at), dur: (a.services ? a.services.duration_min : 30), cust: a.customer_id, sv: serviceKA[a.service_id], barber: barberKA[a.barber_id], status: ST_FROM_DB[a.status] || 'confirmed', rating: null, reason: '', pref: false, custName: a.customers ? ((a.customers.first_name || '') + ' ' + (a.customers.last_name || '')).trim() : '' };
      (histBy[a.customer_id] = histBy[a.customer_id] || []).unshift({ id: a.id, date: dlabel(a.start_at), service: serviceKA[a.service_id], barber: barberKA[a.barber_id], status: ST_FROM_DB[a.status] || 'confirmed', rating: null, reason: '' });
      return ap;
    });
    KA._allAppts = allAppts;
    // --- customers ---
    const customers = (cust.data || []).map((c) => ({ id: c.id, name: ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || c.email, first: c.first_name, last: c.last_name, email: c.email, phone: c.phone || '', since: new Date(c.created_at).getFullYear(), visits: (histBy[c.id] || []).length, noshows: c.no_show_count || 0, optins: { reminders: !!c.reminder_opt_in, rebook: !!c.rebooking_opt_in, marketing: !!c.marketing_opt_in }, notes: c.notes ? [{ id: 'n-0', text: c.notes, author: '', date: '' }] : [], history: (histBy[c.id] || []) }));
    // --- blocks (treat as all-day for display) ---
    const blocks = (blk.data || []).map((b) => { const f = new Date(b.start_at), t = new Date(b.end_at); const multi = dayStr(f) !== dayStr(t); return { id: b.id, label: b.reason || 'Gesloten', who: b.barber_id ? barberKA[b.barber_id] : 'all', day: dayStr(f), start: '', end: '', allday: true, range: dlabel(b.start_at) + (multi ? (' – ' + dlabel(b.end_at)) : ' · hele dag') }; });
    // --- admins ---
    const admins = (adm.data || []).map((a) => ({ id: a.id, name: (a.email || '').split('@')[0].replace(/^\w/, (m) => m.toUpperCase()), email: a.email, role: a.role, linked: a.barber_id ? barberKA[a.barber_id] : null, last: '—', status: 'active' }));
    // --- settings ---
    const sm = {}; (set.data || []).forEach((s) => { sm[s.key] = (typeof s.value === 'object' && s.value !== null) ? s.value : s.value; });
    const settings = { cancelWindow: +sm.cancellation_window_hours || 24, buffer: +sm.buffer_min || 0, leadTime: +sm.min_lead_time_hours || 2, horizon: +sm.booking_horizon_days || 56, interval: +(sm.slot_increment_min || 15), rebook: +sm.rebooking_weeks || 5 };
    // --- banner ---
    const cb = cont.data || {};
    const banner = { active: !!cb.is_active, nl: { title: cb.title_nl || '', text: cb.text_nl || '' }, en: { title: cb.title_en || '', text: cb.text_en || '' }, fr: { title: cb.title_fr || '', text: cb.text_fr || '' } };

    // assign (keep existing shopHours/closedLabels defaults from admin-data.js)
    KA.state.services = services;
    KA.state.barbers = barbers;
    KA.state.customers = customers;
    KA.state.blocks = blocks;
    KA.state.admins = admins;
    KA.state.settings = settings;
    KA.state.banner = banner;
    KA.setDay(dayStr(KA.today));
    if (!KA.barber(KA.besch.scope)) KA.besch.scope = barbers[0] ? barbers[0].id : 'all';
  }

  // KA.state.appts = the appointments for a given day (the renderers treat
  // KA.state.appts as "the active day").
  KA.setDay = function (ds) { if (!KA._allAppts) return; KA.state.appts = KA._allAppts.filter((a) => a.date === ds); };

  // Day-context: Vandaag shows today; Agenda shows its navigated date.
  const _rv = KA.renderVandaag; if (_rv) KA.renderVandaag = function () { KA.setDay(dayStr(KA.today)); var r = _rv.apply(this, arguments); patchKPIs(); return r; };
  const _ra = KA.renderAgenda; if (_ra) KA.renderAgenda = function () { if (KA.agenda && KA.agenda.date) KA.setDay(dayStr(KA.agenda.date)); return _ra.apply(this, arguments); };

  // Real Vandaag KPI tiles (replace the static demo numbers).
  function patchKPIs() {
    if (!KA._allAppts) return;
    const tk = dayStr(KA.today);
    const today = KA._allAppts.filter((a) => a.date === tk && a.status !== 'cancelled');
    const now = new Date();
    const noShowMonth = KA._allAppts.filter((a) => { const d = new Date(a.date); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && a.status === 'noshow'; }).length;
    const monday = new Date(KA.today); monday.setDate(KA.today.getDate() - ((KA.today.getDay() + 6) % 7)); monday.setHours(0, 0, 0, 0);
    const weekRev = KA._allAppts.filter((a) => { const d = new Date(a.date); return d >= monday && a.status === 'completed'; }).reduce((s, a) => { const sv = KA.service(a.sv); return s + (sv ? sv.price : 0); }, 0);
    const tiles = document.querySelectorAll('#v-vandaag .kpi .n');
    if (tiles[0]) tiles[0].textContent = today.length;
    if (tiles[2]) tiles[2].textContent = noShowMonth;
    if (tiles[3]) tiles[3].textContent = '€' + weekRev;
    const todo = document.getElementById('kpiTodo'); if (todo) todo.textContent = today.filter((a) => a.status === 'confirmed').length + ' nog te gaan';
  }

  // Real Statistieken (override the seeded numbers with live aggregates).
  KA.renderStatistieken = function () {
    if (!KA._allAppts) return;
    const all = KA._allAppts, completed = all.filter((a) => a.status === 'completed');
    const pb = document.getElementById('statPerBarber');
    if (pb) pb.innerHTML = KA.barbersSorted().map((b) => {
      const mine = all.filter((a) => a.barber === b.id), done = mine.filter((a) => a.status === 'completed');
      const ns = mine.filter((a) => a.status === 'noshow').length;
      const rev = done.reduce((s, a) => { const sv = KA.service(a.sv); return s + (sv ? sv.price : 0); }, 0);
      return `<tr data-barber="${b.id}"><td data-l="Barbier"><div class="who"><span class="av av--txt" style="width:26px;height:26px;font-size:.6rem">${KA.esc(b.name[0])}</span> ${KA.esc(b.name)}</div></td><td class="num" data-l="Boekingen">${mine.length}</td><td class="num" data-l="Voltooid">${done.length}</td><td class="num" data-l="No-shows">${ns}</td><td class="num" data-l="Omzet">${KA.euro(rev)}</td></tr>`;
    }).join('');
    const pd = document.getElementById('statPerDienst');
    if (pd) pd.innerHTML = KA.activeServices().map((s) => {
      const n = completed.filter((a) => a.sv === s.id).length;
      return `<tr><td data-l="Dienst"><div class="who"><span class="dot" style="width:10px;height:10px;background:${s.color}"></span> ${KA.esc(s.name)}</div></td><td class="num" data-l="Boekingen">${n}</td><td class="num" data-l="Omzet">${KA.euro(n * s.price)}</td></tr>`;
    }).join('');
    const fb = KA.feedbackStats ? KA.feedbackStats() : { pct: null, up: 0, down: 0 };
    const sat = document.getElementById('statSat');
    if (sat) sat.innerHTML = `<div class="l"><i data-lucide="smile"></i> Tevredenheid</div><div class="n">${fb.pct == null ? '—' : fb.pct + '%'}</div><div class="d">${fb.up} 👍 · ${fb.down} 👎</div>`;
    if (KA.icons) KA.icons();
  };

  function patchSettings() {
    const s = KA.state.settings, map = { setCancel: 'cancelWindow', setBuffer: 'buffer', setLead: 'leadTime', setHorizon: 'horizon', setInterval: 'interval', setRebook: 'rebook' };
    for (const id in map) { const el = document.getElementById(id); if (el) el.value = s[map[id]]; }
  }

  // ============================================================
  // PERSISTENCE — KA.db.* (called from the design's write sites)
  // Every method is fire-and-report; UI already updated optimistically.
  // ============================================================
  function toast(ok, msgErr) { if (!ok && KA.toast) KA.toast(msgErr || 'Opslaan mislukt', 'error'); }
  const svcDb = (kaId) => M.svcDb[kaId];
  const barbDb = (kaId) => M.barbDb[kaId];

  KA.db = {
    // appointments
    async apptStatus(id, status) { const p = { status: ST_TO_DB[status] || 'confirmed' }; if (status === 'cancelled') p.cancelled_at = new Date().toISOString(); const r = await sb.from('appointments').update(p).eq('id', id); toast(!r.error); syncAppt(id, (a) => { a.status = status; }); },
    async apptAssign(id, barberKaId) { const r = await sb.from('appointments').update({ barber_id: barbDb(barberKaId) }).eq('id', id); toast(!r.error); syncAppt(id, (a) => { a.barber = barberKaId; a.pref = false; }); },
    async apptReschedule(id, dateStr, time, durMin) { const start = localISO(dateStr, time); const end = new Date(new Date(start).getTime() + (durMin || 30) * 60000).toISOString(); const r = await sb.from('appointments').update({ start_at: start, end_at: end }).eq('id', id); toast(!r.error); syncAppt(id, (a) => { a.start = time; a.date = dateStr; }); },
    async apptCreate(o, tempId) {
      // o: { svKaId, barberKaId, dateStr, time, durMin, custName }
      const email = 'walkin+' + Math.random().toString(36).slice(2, 8) + '@kameraad.local';
      const nm = (o.custName || 'Walk-in').trim().split(/\s+/);
      const c = await sb.from('customers').insert({ first_name: nm[0] || 'Walk-in', last_name: nm.slice(1).join(' ') || '', email, preferred_language: 'nl' }).select('id').single();
      if (c.error) { toast(false); return; }
      const start = localISO(o.dateStr, o.time); const end = new Date(new Date(start).getTime() + (o.durMin || 30) * 60000).toISOString();
      const r = await sb.from('appointments').insert({ customer_id: c.data.id, service_id: svcDb(o.svKaId), barber_id: barbDb(o.barberKaId), start_at: start, end_at: end, status: 'confirmed' }).select('id').single();
      toast(!r.error);
      if (!r.error) {
        const ex = (KA._allAppts || []).find((a) => a.id === tempId);
        if (ex) { ex.id = r.data.id; ex.cust = c.data.id; }
        else KA._allAppts.push({ id: r.data.id, date: o.dateStr, start: o.time, dur: o.durMin || 30, cust: c.data.id, sv: o.svKaId, barber: o.barberKaId, status: 'confirmed', rating: null, reason: '', pref: false, custName: o.custName });
      }
    },
    // customers
    async custSave(id, patch) { const r = await sb.from('customers').update(patch).eq('id', id); toast(!r.error); },
    async custOptin(id, key, val) { const col = { reminders: 'reminder_opt_in', rebook: 'rebooking_opt_in', marketing: 'marketing_opt_in' }[key]; const r = await sb.from('customers').update({ [col]: val }).eq('id', id); toast(!r.error); },
    async custNotes(id, text) { const r = await sb.from('customers').update({ notes: text || null }).eq('id', id); toast(!r.error); },
    async custDelete(id) { await sb.from('appointments').delete().eq('customer_id', id); const r = await sb.from('customers').delete().eq('id', id); toast(!r.error); KA._allAppts = KA._allAppts.filter((a) => a.cust !== id); },
    // services
    async svcSave(kaId, o) { const r = await sb.from('services').update({ name_nl: o.name, price_cents: Math.round(o.price * 100), duration_min: o.dur, color: o.color, is_active: o.active, description_nl: o.desc && o.desc.nl, description_en: o.desc && o.desc.en, description_fr: o.desc && o.desc.fr }).eq('id', svcDb(kaId)); toast(!r.error); },
    async svcActive(kaId, val) { const r = await sb.from('services').update({ is_active: val }).eq('id', svcDb(kaId)); toast(!r.error); },
    async svcCreate(s, newKaId) { const slug = (newKaId || ('sv-' + Date.now())).replace(/^sv-/, ''); const ins = await sb.from('services').insert({ slug, name_nl: s.name, price_cents: Math.round(s.price * 100), duration_min: s.dur, color: s.color, is_active: s.active, is_walk_in: false, sort_order: s.order }).select('id').single(); if (ins.error) { toast(false); return; } M.svcDb[s.id] = ins.data.id; serviceKA[ins.data.id] = s.id; /* offer to all barbers */ const rows = KA.state.barbers.map((b) => ({ barber_id: barbDb(b.id), service_id: ins.data.id })); await sb.from('barber_services').insert(rows); },
    // matrix
    async matrix(barberKaId, svcKaId, on) { if (on) { const r = await sb.from('barber_services').insert({ barber_id: barbDb(barberKaId), service_id: svcDb(svcKaId) }); toast(!r.error); } else { const r = await sb.from('barber_services').delete().eq('barber_id', barbDb(barberKaId)).eq('service_id', svcDb(svcKaId)); toast(!r.error); } },
    // barbers
    async barberSave(kaId, o) { const r = await sb.from('barbers').update({ name: o.name, slug: o.slug, bio_nl: o.bio && o.bio.nl, bio_en: o.bio && o.bio.en, bio_fr: o.bio && o.bio.fr }).eq('id', barbDb(kaId)); toast(!r.error); },
    async barberActive(kaId, val) { const r = await sb.from('barbers').update({ is_active: val }).eq('id', barbDb(kaId)); toast(!r.error); },
    async barberReorder(orderedKaIds) { for (let i = 0; i < orderedKaIds.length; i++) { await sb.from('barbers').update({ sort_order: i + 1 }).eq('id', barbDb(orderedKaIds[i])); } },
    // availability — rewrite a barber's (or all) windows for a Mon-first day index
    async hours(scope, dayIdx, windows) {
      const dow = (dayIdx + 1) % 7; // Mon-first idx -> DB dow (0=Sun)
      const targets = scope === 'all' ? KA.state.barbers.map((b) => b.id) : scope === 'shop' ? [] : [scope];
      for (const kaId of targets) {
        const bid = barbDb(kaId);
        await sb.from('availability').delete().eq('barber_id', bid).eq('day_of_week', dow);
        if (windows && windows.length) { const rows = windows.map((w) => ({ barber_id: bid, day_of_week: dow, start_time: w.s, end_time: w.e, is_active: true })); await sb.from('availability').insert(rows); }
      }
    },
    async copyHours(fromKaId, toKaIds) { const src = KA.barber(fromKaId); for (const to of toKaIds) { const bid = barbDb(to); for (let i = 0; i < 7; i++) { const dow = (i + 1) % 7; await sb.from('availability').delete().eq('barber_id', bid).eq('day_of_week', dow); const w = src.hours[i]; if (w && w.length) await sb.from('availability').insert(w.map((x) => ({ barber_id: bid, day_of_week: dow, start_time: x.s, end_time: x.e, is_active: true }))); } } },
    // barbers (create/delete)
    async barberCreate(b, kaId) { const slug = (b.slug || ('barber-' + Math.random().toString(36).slice(2, 6))).toLowerCase(); const ins = await sb.from('barbers').insert({ slug, name: b.name, bio_nl: b.bio && b.bio.nl, bio_en: b.bio && b.bio.en, bio_fr: b.bio && b.bio.fr, is_active: b.active, sort_order: b.order }).select('id').single(); if (ins.error) { toast(false); return; } M.barbDb[kaId] = ins.data.id; barberKA[ins.data.id] = kaId; const rows = KA.state.services.filter((s) => !s.walkin).map((s) => ({ barber_id: ins.data.id, service_id: svcDb(s.id) })); if (rows.length) await sb.from('barber_services').insert(rows); },
    async barberDelete(kaId) { const bid = barbDb(kaId); await sb.from('barber_services').delete().eq('barber_id', bid); await sb.from('availability').delete().eq('barber_id', bid); const r = await sb.from('barbers').delete().eq('id', bid); toast(!r.error); },
    // blocks
    async blockAdd(o, kaId) { const start = o.from + 'T00:00:00+02:00'; const end = (o.to || o.from) + 'T23:59:00+02:00'; const r = await sb.from('blocked_slots').insert({ barber_id: o.who === 'all' ? null : barbDb(o.who), start_at: start, end_at: end, reason: o.label }).select('id').single(); toast(!r.error); if (!r.error && kaId) { const b = KA.state.blocks.find((x) => x.id === kaId); if (b) b.id = r.data.id; } },
    async blockDelete(id) { const r = await sb.from('blocked_slots').delete().eq('id', id); toast(!r.error); },
    // settings
    async settings(s) { for (const [k, key] of [['cancelWindow', 'cancellation_window_hours'], ['buffer', 'buffer_min'], ['leadTime', 'min_lead_time_hours'], ['horizon', 'booking_horizon_days'], ['interval', 'slot_increment_min'], ['rebook', 'rebooking_weeks']]) { await sb.from('settings').update({ value: s[k] }).eq('key', key); } },
    // banner
    async banner(b) { const r = await sb.from('content').update({ title_nl: b.nl.title, text_nl: b.nl.text, title_en: b.en.title, text_en: b.en.text, title_fr: b.fr.title, text_fr: b.fr.text, is_active: b.active }).eq('key', 'seasonal_banner'); toast(!r.error); },
    // admins
    async adminInvite(o, kaId) { const r = await sb.from('admin_users').insert({ email: o.email, role: o.role, barber_id: o.linked ? barbDb(o.linked) : null }).select('id').single(); toast(!r.error); if (!r.error && kaId) { const a = KA.state.admins.find((x) => x.id === kaId); if (a) a.id = r.data.id; } },
    async adminRole(id, role) { const r = await sb.from('admin_users').update({ role }).eq('id', id); toast(!r.error); },
    async adminDelete(id) { const r = await sb.from('admin_users').delete().eq('id', id); toast(!r.error); },
  };
  function syncAppt(id, fn) { const a = (KA._allAppts || []).find((x) => x.id === id); if (a) fn(a); }
  KA._svcDb = svcDb; KA._barbDb = barbDb; // expose for any inline needs

  // ============================================================
  // AUTH + BOOT
  // ============================================================
  async function enter(session) {
    if ($('login')) $('login').hidden = true;
    try { await loadAll(); } catch (e) { console.error('[KA] loadAll failed', e); KA._loadErr = String(e); }
    try {
      const email = session.user.email;
      const me = KA.state.admins.find((a) => a.email.toLowerCase() === email.toLowerCase());
      const role = me ? me.role : 'owner';
      const dispName = me ? me.name : email.split('@')[0];
      const nm = document.querySelector('.sb__user .nm'), rl = document.querySelector('.sb__user .rl'), av = document.querySelector('.sb__avatar');
      if (nm) nm.textContent = dispName; if (rl) rl.textContent = role === 'owner' ? 'Eigenaar' : 'Barbier'; if (av) av.textContent = (dispName[0] || 'A').toUpperCase();
      if (me && me.linked) KA.state.currentBarber = me.linked;
      KA._me = { name: dispName, role };
      if (KA.setRole) KA.setRole(role);
    } catch (e) { console.error('[KA] identity', e); }
    if ($('app')) $('app').hidden = false;
    if (KA.refreshAll) KA.refreshAll();
    try { patchKPIs(); patchSettings(); } catch (e) { console.warn('[KA] patch', e); }
  }

  function rebind() {
    // Replace the demo login check with real Supabase auth.
    const form = $('loginForm');
    if (form) {
      const fresh = form.cloneNode(true);
      form.parentNode.replaceChild(fresh, form);
      fresh.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = fresh.querySelector('input[type=email]').value.trim();
        const pw = fresh.querySelector('input[type=password]').value;
        const btn = fresh.querySelector('button[type=submit]'); const lbl = btn.textContent; btn.disabled = true; btn.textContent = '…';
        const r = await sb.auth.signInWithPassword({ email, password: pw });
        btn.disabled = false; btn.textContent = lbl;
        if (r.error) { const er = $('loginErr'); if (er) { er.textContent = 'Aanmelden mislukt — controleer e-mail en wachtwoord.'; er.hidden = false; } return; }
        await enter(r.data.session);
      });
    }
    const out = $('logout');
    if (out) out.addEventListener('click', async (e) => { e.preventDefault(); await sb.auth.signOut(); location.reload(); }, true);
  }

  // Gate runs AFTER the design's boot() (which forces #app visible). The 60ms
  // timeout guarantees boot() has executed, then we deterministically gate.
  function gate() {
    if ($('app')) $('app').hidden = true;
    if ($('login')) $('login').hidden = true;
    rebind();
    sb.auth.getSession().then(function (res) {
      if (res.data && res.data.session) enter(res.data.session);
      else if ($('login')) $('login').hidden = false;
    }).catch(function () { if ($('login')) $('login').hidden = false; });
  }
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', function () { setTimeout(gate, 60); });
  else setTimeout(gate, 60);
})();
