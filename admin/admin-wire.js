/* ============================================================
   Kameraad Admin — wiring: routing, auth, toolbars, delegation,
   forms, search, RBAC, print. Connects rendered DOM to editors.
   ============================================================ */
(function () {
  const KA = (window.KA = window.KA || {});
  const $ = (s, r = document) => r.querySelector(s);
  const ic = KA.icons;

  const TITLES = { vandaag: 'Vandaag', agenda: 'Agenda', beschikbaarheid: 'Beschikbaarheid', klanten: 'Klanten', statistieken: 'Statistieken', barbiers: 'Barbiers', diensten: 'Diensten & matrix', instellingen: 'Instellingen', banner: 'Banner', mailing: 'Bulk e-mail', beheerders: 'Beheerders' };
  const OWNER_ONLY = ['diensten', 'instellingen', 'banner', 'mailing', 'beheerders'];

  function renderScreen(h) {
    if (h === 'vandaag') KA.renderVandaag();
    else if (h === 'agenda') KA.renderAgenda();
    else if (h === 'klanten') KA.renderKlanten($('#klantSearch') ? $('#klantSearch').value : '');
    else if (h === 'statistieken') KA.renderStatistieken();
    else if (h === 'barbiers') KA.renderBarbiers();
    else if (h === 'diensten') { KA.renderDiensten(); if (KA._scrollMatrix) { KA._scrollMatrix = false; setTimeout(() => { const mp = $('#matrixPanel'); if (mp) mp.scrollIntoView({ block: 'center' }); }, 60); } }
    else if (h === 'beschikbaarheid') KA.renderBeschikbaarheid();
    else if (h === 'beheerders') KA.renderBeheerders();
  }

  function route() {
    let h = (location.hash || '#vandaag').slice(1);
    if (!TITLES[h]) h = 'vandaag';
    if (KA.state.role === 'barber' && OWNER_ONLY.includes(h)) { location.hash = '#vandaag'; return; }
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('on', v.id === 'v-' + h));
    document.querySelectorAll('.sb a[data-route]').forEach((a) => a.classList.toggle('on', a.getAttribute('data-route') === h));
    const t = $('#pageTitle'); if (t) t.textContent = TITLES[h];
    renderScreen(h);
    ic();
  }

  /* ---------- AUTH ---------- */
  let attempts = 0;
  function initAuth() {
    const login = $('#login'), app = $('#app');
    const form = $('#loginForm');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = form.querySelector('input[type=email]').value.trim();
      const pw = form.querySelector('input[type=password]').value;
      const errEl = $('#loginErr');
      const btn = form.querySelector('button[type=submit]');
      if (attempts >= 5) return;
      btn.classList.add('loading');
      setTimeout(() => {
        btn.classList.remove('loading');
        if (pw === 'kameraad' && /@/.test(email)) {
          attempts = 0; errEl.hidden = true; login.hidden = true; app.hidden = false; if (!location.hash) location.hash = '#vandaag'; route();
        } else {
          attempts++;
          if (attempts >= 5) { errEl.hidden = false; lockout(btn); }
          else KA.toast('Onjuiste gegevens (' + attempts + '/5). Probeer opnieuw.', { type: 'err' });
        }
      }, 500);
    });
    function lockout(btn) {
      let left = 15 * 60; btn.disabled = true;
      const errEl = $('#loginErr');
      const tick = () => { const m = String(Math.floor(left / 60)).padStart(2, '0'), s = String(left % 60).padStart(2, '0'); errEl.textContent = `Te veel pogingen. Probeer opnieuw over ${m}:${s}.`; if (left-- <= 0) { clearInterval(t); btn.disabled = false; errEl.hidden = true; attempts = 0; } };
      tick(); const t = setInterval(tick, 1000);
    }
    $('#toForgot').addEventListener('click', (e) => { e.preventDefault();
      const m = KA.modal({ card: `<h2 class="serif">Wachtwoord vergeten</h2><p class="muted" style="font-size:.9rem;margin:0 0 12px">Vul je e-mailadres in — we sturen een reset-link.</p><div class="field"><input class="in js-em" type="email" placeholder="naam@kameraadhaarsnijder.be"></div><div class="modal__foot"><button class="b b--ghost" data-close>Annuleren</button><button class="b b--gold js-ok">Stuur link</button></div>` });
      m.card.querySelector('.js-ok').onclick = () => { m.close(); KA.toast('Als dit adres bestaat, ligt er een reset-link klaar.', { duration: 5000 }); };
    });
    $('#logout').addEventListener('click', () => {
      const doLogout = () => { app.hidden = true; login.hidden = false; };
      if ($('#drawer').classList.contains('on')) { KA.closeDrawer(); doLogout(); } else doLogout();
    });
  }

  /* ---------- TOP BAR ---------- */
  function initTopbar() {
    const roleSeg = $('#roleSeg');
    if (roleSeg) KA.wireSeg(roleSeg, (i, btn) => { KA.setRole(btn.dataset.v); route(); KA.toast('Weergave: ' + (btn.dataset.v === 'owner' ? 'Eigenaar' : 'Barbier'), { duration: 1600 }); });
    // global search
    const gs = $('#globalSearch');
    if (gs) {
      let tmo;
      gs.addEventListener('input', () => { clearTimeout(tmo); tmo = setTimeout(() => {
        const q = gs.value.trim(); if (!q) return;
        const hit = KA.state.customers.find((c) => (c.name + ' ' + c.email).toLowerCase().includes(q.toLowerCase()));
        if (hit) { location.hash = '#klanten'; setTimeout(() => KA.openCustomer(hit.id), 80); gs.value = ''; }
      }, 350); });
      gs.addEventListener('keydown', (e) => { if (e.key === 'Escape') gs.value = ''; });
    }
  }

  /* ---------- VANDAAG ---------- */
  function initVandaag() {
    $('#openAgendaBtn').onclick = () => { KA.agenda.view = 'day'; KA.agenda.date = new Date(2026, 5, 30); location.hash = '#agenda'; };
    const print = $('#printDagBtn'); if (print) print.onclick = () => KA.printDagbladen();
    document.querySelectorAll('[data-kpi]').forEach((k) => (k.onclick = () => {
      const t = k.dataset.kpi;
      if (t === 'today') { KA.agenda.view = 'day'; KA.agenda.filter = 'all'; location.hash = '#agenda'; }
      else if (t === 'noshow') { KA.stats.view = 'month'; location.hash = '#statistieken'; }
      else if (t === 'revenue') { KA.stats.view = 'week'; location.hash = '#statistieken'; }
    }));
  }

  /* ---------- AGENDA ---------- */
  function initAgenda() {
    const step = (dir) => { const d = KA.agenda.date, v = KA.agenda.view; if (v === 'week') d.setDate(d.getDate() + dir * 7); else if (v === 'month') d.setMonth(d.getMonth() + dir); else d.setDate(d.getDate() + dir); KA.renderAgenda(); };
    $('#agPrev').onclick = () => step(-1);
    $('#agNext').onclick = () => step(1);
    $('#agToday').onclick = () => { KA.agenda.date = new Date(2026, 5, 30); KA.renderAgenda(); };
    $('#agLabel').onclick = () => KA.openDatePicker($('#agLabel'), KA.agenda.date, (d) => { KA.agenda.date = d; if (KA.agenda.view === 'month') KA.agenda.view = 'day'; syncViewSeg(); KA.renderAgenda(); }, { maxDate: new Date(2026, 7, 24) });
    KA.wireSeg($('#agSeg'), (i) => { KA.agenda.view = ['day', 'week', 'month'][i]; KA.renderAgenda(); });
    $('#agFilter').onclick = () => {
      const m = KA.modal({ card: `<h2 class="serif">Toon barbier</h2><div style="display:grid;gap:6px;margin-top:10px"><button class="crosslink js-f" data-id="all"><i data-lucide="users" class="lead"></i><div class="cl-t"><b>Alle barbiers</b></div></button>${KA.barbersSorted().filter((b) => b.active).map((b) => `<button class="crosslink js-f" data-id="${b.id}"><span class="av av--txt" style="width:24px;height:24px;font-size:.6rem">${b.name[0]}</span><div class="cl-t"><b>${KA.esc(b.name)}</b></div></button>`).join('')}</div>` });
      m.card.querySelectorAll('.js-f').forEach((btn) => (btn.onclick = () => { KA.agenda.filter = btn.dataset.id; KA.renderAgenda(); m.close(); }));
      ic();
    };
    $('#agAdd').onclick = () => newAppt(null, null);
    const p = $('#agPrint'); if (p) p.onclick = () => KA.printDagbladen();
    function syncViewSeg() { const seg = $('#agSeg'); seg.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', ['day', 'week', 'month'][i] === KA.agenda.view)); }
  }

  function newAppt(barberId, startMin) {
    const m = KA.modal({ card: `<h2 class="serif">Nieuwe afspraak</h2><p class="muted" style="font-size:.86rem;margin:2px 0 14px">Handmatige boeking of walk-in.</p>
      <div class="field"><label class="lbl">Klant</label><input class="in" id="naCust" placeholder="Naam of telefoon" list="custList"><datalist id="custList">${KA.state.customers.map((c) => `<option value="${KA.esc(c.name)}">`).join('')}</datalist></div>
      <div class="field"><label class="lbl">Dienst</label><select class="in" id="naSvc">${KA.activeServices().map((s) => `<option value="${s.id}">${KA.esc(s.name)} · ${s.dur}min · €${s.price}</option>`).join('')}</select></div>
      <div class="row2"><div class="field"><label class="lbl">Barbier</label><select class="in" id="naBarber">${KA.barbersSorted().filter((b) => b.active).map((b) => `<option value="${b.id}" ${b.id === barberId ? 'selected' : ''}>${KA.esc(b.name)}</option>`).join('')}</select></div>
      <div class="field"><label class="lbl">Starttijd</label><input class="in" id="naTime" type="time" value="${startMin != null ? KA.fromMin(startMin) : '10:00'}"></div></div>
      <div class="modal__foot"><button class="b b--ghost grow" id="naWalkin" type="button"><i data-lucide="footprints"></i> Walk-in nu</button><button class="b b--ghost" data-close>Annuleren</button><button class="b b--gold js-ok"><i data-lucide="check"></i> Boek</button></div>` });
    const make = (walkin) => {
      const name = m.card.querySelector('#naCust').value.trim() || (walkin ? 'Walk-in' : '');
      if (!name) { KA.toast('Vul een klant in.', { type: 'err' }); return; }
      const svId = m.card.querySelector('#naSvc').value; const sv = KA.service(svId);
      const dateStr = (KA.agenda && KA.agenda.date) ? new Date(KA.agenda.date).toLocaleDateString('en-CA') : new Date().toLocaleDateString('en-CA');
      const a = { id: KA.uid('a'), date: dateStr, start: m.card.querySelector('#naTime').value, dur: sv.dur || 30, cust: 'walkin', custName: name, sv: svId, barber: m.card.querySelector('#naBarber').value, status: 'confirmed', rating: null, reason: '', pref: false };
      KA.state.appts.push(a); if (KA._allAppts) KA._allAppts.push(a);
      if (KA.db) KA.db.apptCreate({ svKaId: svId, barberKaId: a.barber, dateStr, time: a.start, durMin: a.dur, custName: name }, a.id);
      KA.refreshAll(); m.close(); KA.toast(walkin ? 'Walk-in toegevoegd.' : 'Afspraak geboekt — klant gemaild.');
    };
    m.card.querySelector('.js-ok').onclick = () => make(false);
    m.card.querySelector('#naWalkin').onclick = () => make(true);
    ic();
  }
  KA.newAppt = newAppt;

  /* ---------- BESCHIKBAARHEID ---------- */
  function initBesch() {
    KA.wireSeg($('#beschSeg'), (i, btn) => { KA.besch.scope = btn.dataset.v; KA.renderBeschikbaarheid(); });
    $('#blokBtn').onclick = () => KA.openBlockCreate();
  }

  /* ---------- KLANTEN bulk + search ---------- */
  function initKlanten() {
    const s = $('#klantSearch');
    if (s) { let t; s.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => KA.renderKlanten(s.value), 250); }); }
    document.addEventListener('change', (e) => { if (e.target.classList && e.target.classList.contains('js-crow')) updateBulk(); if (e.target.id === 'ckAll') { document.querySelectorAll('.js-crow').forEach((c) => (c.checked = e.target.checked)); updateBulk(); } });
    function selected() { return Array.from(document.querySelectorAll('.js-crow:checked')).map((c) => c.dataset.id); }
    function updateBulk() {
      const ids = selected(); const mount = $('#bulkMount'); if (!mount) return;
      if (!ids.length) { mount.innerHTML = ''; return; }
      mount.innerHTML = `<div class="bulkbar"><span class="cnt">${ids.length} geselecteerd</span><div class="sp"><button class="b b--ghost b--sm" id="bExport"><i data-lucide="download"></i> Exporteer</button><button class="b b--ghost b--sm" id="bOptout">Opt-out</button><button class="b b--danger b--sm" id="bDel"><i data-lucide="trash-2"></i> Verwijder</button></div></div>`;
      ic();
      $('#bExport').onclick = () => KA.exportSheet({ title: ids.length + ' klanten exporteren', sections: [{ label: 'Contactgegevens', on: true }, { label: 'Historie' }], allowFormats: ['CSV', 'XLSX', 'JSON'] });
      $('#bOptout').onclick = () => KA.confirm({ title: 'Marketing uitschakelen?', body: `Voor ${ids.length} klant(en) wordt marketing-opt-in uitgezet.`, confirmText: 'Uitschakelen', onConfirm: () => { ids.forEach((id) => { KA.customer(id).optins.marketing = false; if (KA.db) KA.db.custOptin(id, 'marketing', false); }); KA.renderKlanten($('#klantSearch').value); KA.toast(ids.length + ' klant(en) afgemeld.'); } });
      $('#bDel').onclick = () => KA.typeConfirm({ title: ids.length + ' klanten verwijderen', body: `Dit verwijdert ${ids.length} klant(en) en al hun gegevens onomkeerbaar (GDPR).`, word: 'VERWIJDER', onConfirm: () => { ids.forEach((id) => { if (KA.db) KA.db.custDelete(id); const i = KA.state.customers.findIndex((c) => c.id === id); if (i > -1) KA.state.customers.splice(i, 1); }); KA.renderKlanten($('#klantSearch').value); $('#bulkMount').innerHTML = ''; KA.toast(ids.length + ' klant(en) verwijderd.'); } });
    }
  }

  /* ---------- BARBIERS create + drag ---------- */
  function initBarbiers() {
    $('#addBarberBtn').onclick = () => KA.openBarber(null);
    let dragId = null;
    document.addEventListener('dragstart', (e) => { const tr = e.target.closest('tr[data-barber]'); if (tr) { dragId = tr.dataset.barber; tr.style.opacity = '.4'; } });
    document.addEventListener('dragend', (e) => { const tr = e.target.closest('tr[data-barber]'); if (tr) tr.style.opacity = ''; });
    document.addEventListener('dragover', (e) => { if (dragId && e.target.closest('tr[data-barber]')) e.preventDefault(); });
    document.addEventListener('drop', (e) => {
      const tr = e.target.closest('tr[data-barber]'); if (!tr || !dragId || tr.dataset.barber === dragId) return;
      e.preventDefault();
      const arr = KA.barbersSorted(); const from = arr.findIndex((b) => b.id === dragId), to = arr.findIndex((b) => b.id === tr.dataset.barber);
      const [m] = arr.splice(from, 1); arr.splice(to, 0, m); arr.forEach((b, i) => (b.order = i + 1));
      if (KA.db) KA.db.barberReorder(arr.map((b) => b.id));
      dragId = null; KA.renderBarbiers(); KA.toast('Volgorde aangepast.', { duration: 1600 });
    });
  }

  /* ---------- DIENSTEN create + matrix ---------- */
  function initDiensten() {
    $('#addDienstBtn').onclick = () => KA.openService(null);
    document.addEventListener('click', (e) => {
      const cell = e.target.closest('.js-cell'); if (!cell) return;
      const b = KA.barber(cell.dataset.b), sId = cell.dataset.s; const has = b.services.includes(sId);
      if (has) {
        if (b.services.filter((x) => KA.service(x) && !KA.service(x).walkin).length <= 1) { KA.toast('Dit is de laatste dienst van ' + b.name + ' — minstens één blijft nodig.', { type: 'err' }); return; }
        const others = KA.state.barbers.filter((x) => x.id !== b.id && x.services.includes(sId)).length;
        const doRemove = () => { b.services = b.services.filter((x) => x !== sId); if (KA.db) KA.db.matrix(b.id, sId, false); KA.renderDiensten(); KA.renderBarbiers(); };
        if (others === 0) KA.confirm({ title: 'Laatste barbier voor deze dienst', body: KA.service(sId).name + ' wordt door niemand meer aangeboden en verdwijnt uit boekingen.', confirmText: 'Toch weghalen', danger: true, onConfirm: doRemove });
        else doRemove();
      } else { b.services.push(sId); if (KA.db) KA.db.matrix(b.id, sId, true); KA.renderDiensten(); KA.renderBarbiers(); }
    });
  }

  /* ---------- BEHEERDERS ---------- */
  function initBeheerders() { $('#inviteBtn').onclick = () => KA.openAdmin(null); }

  /* ---------- STATISTIEKEN ---------- */
  function initStats() {
    KA.wireSeg($('#statSeg'), (i, btn) => {
      const labels = ['Vandaag', '24 – 30 juni 2026', 'Juni 2026', 'Aangepast'];
      $('#statRange').textContent = labels[i];
      if (btn.textContent === 'Aangepast') {
        const m = KA.modal({ card: `<h2 class="serif">Aangepaste periode</h2><div class="row2" style="margin-top:12px"><div class="field"><label class="lbl">Van</label><input class="in" type="date" id="rf" value="2026-06-01"></div><div class="field"><label class="lbl">Tot</label><input class="in" type="date" id="rt" value="2026-06-30"></div></div><div class="modal__foot"><button class="b b--ghost" data-close>Annuleren</button><button class="b b--gold js-ok">Toepassen</button></div>` });
        m.card.querySelector('.js-ok').onclick = () => { $('#statRange').textContent = m.card.querySelector('#rf').value + ' → ' + m.card.querySelector('#rt').value; m.close(); KA.renderStatistieken(); };
      } else KA.renderStatistieken();
    });
    $('#statExport').onclick = () => KA.exportSheet({ title: 'Statistieken exporteren', sections: [{ label: 'Samenvatting (KPI’s)', on: true }, { label: 'Per barbier' }, { label: 'Per dienst' }, { label: 'Per dag' }, { label: 'Afspraak-niveau (alle rijen)' }] });
    document.addEventListener('click', (e) => { const r = e.target.closest('#statPerBarber tr[data-barber]'); if (r) { KA.agenda.filter = r.dataset.barber; location.hash = '#agenda'; } });
    const sat = $('#statSatTile'); if (sat) sat.onclick = () => { const fb = KA.feedbackStats(); const rs = Object.entries(fb.reasons); KA.modal({ card: `<h2 class="serif">Tevredenheid</h2><p class="muted" style="font-size:.9rem;margin:0 0 12px">${fb.pct == null ? 'Nog geen beoordelingen' : fb.pct + '% positief'} · ${fb.up} 👍 · ${fb.down} 👎</p>${rs.length ? '<label class="lbl">Redenen bij 👎</label>' + rs.map(([k, v]) => `<div class="conflict__row"><div class="ci">${KA.esc(k)}</div><b>${v}</b></div>`).join('') : '<p class="muted" style="font-size:.86rem">Geen negatieve redenen geregistreerd.</p>'}<div class="modal__foot"><button class="b b--ghost" data-close>Sluiten</button></div>` }); };
  }

  /* ---------- INSTELLINGEN (P-01) ---------- */
  function initInstellingen() {
    const root = $('#settingsForm'); if (!root) return;
    KA.form(root, { onSave: () => { const s = KA.state.settings; s.cancelWindow = +$('#setCancel').value; s.buffer = +$('#setBuffer').value; s.leadTime = +$('#setLead').value; s.horizon = +$('#setHorizon').value; s.interval = +$('#setInterval').value; s.rebook = +$('#setRebook').value; if (KA.db) KA.db.settings(s); KA.toast('Opgeslagen — geldt voor nieuwe boekingen.'); }, onCancel: () => route() });
  }

  /* ---------- BANNER ---------- */
  function initBanner() {
    const root = $('#bannerForm'); if (!root) return;
    let locale = 'nl';
    const load = () => { const d = KA.state.banner[locale]; $('#bnrTitle').value = d.title; $('#bnrText').value = d.text; updatePreview(); };
    const save = () => { KA.state.banner[locale] = { title: $('#bnrTitle').value, text: $('#bnrText').value }; };
    KA.wireSeg($('#bnrLocale'), (i, btn) => { save(); locale = btn.textContent.toLowerCase(); load(); });
    const updatePreview = () => { const pv = $('#bnrPreview'); if (!pv) return; const active = KA.state.banner.active; pv.querySelector('.strip').innerHTML = active ? `<b>${KA.esc($('#bnrTitle').value || '—')}</b> — ${KA.esc($('#bnrText').value || '')}` : '<span class="muted">Banner staat uit</span>'; };
    root.addEventListener('input', updatePreview);
    $('#bnrSave').onclick = () => { save(); if (KA.db) KA.db.banner(KA.state.banner); KA.toast('Banner opgeslagen — live binnen 60 s.'); };
    const toggleWrap = $('#bnrActive');
    const setActiveUI = () => { $('#bnrStatus').innerHTML = KA.state.banner.active ? '<span class="bdg bdg--ok"><span class="dot" style="background:#2e6b4f"></span> Actief</span>' : '<span class="bdg bdg--mut">Uit</span>'; updatePreview(); };
    toggleWrap.appendChild(KA.makeToggle(KA.state.banner.active, (on) => { if (on && !$('#bnrTitle').value.trim() && !KA.state.banner.nl.title.trim()) { KA.toast('Vul eerst de NL-titel in om te activeren.', { type: 'err' }); return false; } KA.state.banner.active = on; if (KA.db) KA.db.banner(KA.state.banner); setActiveUI(); KA.toast(on ? 'Banner staat aan.' : 'Banner staat uit.'); }));
    load(); setActiveUI();
  }

  /* ---------- MAILING ---------- */
  function initMailing() {
    const root = $('#mailForm'); if (!root) return;
    let audience = 84;
    KA.wireSeg($('#mailRecip'), (i, btn) => { audience = i === 0 ? 84 : 312; $('#mailSendCount').textContent = 'Verstuur naar ' + audience; });
    KA.wireSeg($('#mailLocale'), () => {});
    $('#mailTest').onclick = () => KA.toast('Test verstuurd naar jezelf.', { duration: 2500 });
    $('#mailPreview').onclick = () => { KA.modal({ wide: true, card: `<label class="lbl">Voorbeeld</label><div class="bnr-preview" style="margin-top:8px"><div style="padding:20px;background:var(--paper)"><h3 class="serif" style="margin:0 0 8px">${KA.esc($('#mailSubject').value)}</h3><div style="white-space:pre-wrap;font-size:.9rem;color:var(--fg2)">${KA.esc($('#mailBody').value)}</div></div></div><div class="modal__foot"><button class="b b--ghost" data-close>Sluiten</button></div>` }); };
    $('#mailSend').onclick = () => KA.confirm({ title: 'Versturen naar ' + audience + ' klanten?', body: 'Elke ontvanger krijgt de mail in hun voorkeurstaal. Dit kan niet ongedaan worden.', confirmText: 'Verstuur', onConfirm: () => runSend(audience) });
    function runSend(n) {
      const m = KA.modal({ closeOnScrim: false, card: `<h2 class="serif">Versturen…</h2><div class="prog"><i></i></div><div class="logline js-log"></div><div class="modal__foot"><button class="b b--ghost" data-close hidden>Sluiten</button></div>` });
      const bar = m.card.querySelector('.prog > i'), log = m.card.querySelector('.js-log'); let sent = 0;
      const t = setInterval(() => {
        sent += Math.ceil(n / 8); if (sent > n) sent = n; bar.style.width = (sent / n * 100) + '%'; log.innerHTML = `<div>${sent} / ${n} verstuurd…</div>`;
        if (sent >= n) { clearInterval(t); const bounced = 1; log.innerHTML = `<div class="ok">${n - bounced} verstuurd.</div><div class="bad">${bounced} bounce — 1 adres onbereikbaar.</div>`; m.card.querySelector('[data-close]').hidden = false; setTimeout(() => KA.toast(`${n - bounced} mails verstuurd · gelogd.`, { type: 'ok' }), 200); }
      }, 260);
    }
  }

  /* ---------- delegation: row / button clicks ---------- */
  function initDelegation() {
    document.addEventListener('click', (e) => {
      const t = e.target;
      const editB = t.closest('.js-edit-barber'); if (editB) { e.stopPropagation(); KA.openBarber(editB.dataset.id); return; }
      const editS = t.closest('.js-edit-svc'); if (editS) { e.stopPropagation(); KA.openService(editS.dataset.id); return; }
      const adminB = t.closest('.js-admin-edit'); if (adminB) { e.stopPropagation(); KA.openAdmin(adminB.dataset.id); return; }
      const toMatrix = t.closest('.js-tomatrix'); if (toMatrix) { e.preventDefault(); KA._scrollMatrix = true; location.hash = '#diensten'; return; }
      const editDay = t.closest('.js-edit-day'); if (editDay) { KA.openDayEditor(+editDay.dataset.d); return; }
      const copyH = t.closest('.js-copy-hours'); if (copyH) { KA.copyHours(); return; }
      const delBlock = t.closest('.js-del-block'); if (delBlock) { const id = delBlock.dataset.id; const i = KA.state.blocks.findIndex((b) => b.id === id); const saved = KA.state.blocks[i]; KA.confirm({ title: 'Blokkade verwijderen?', body: 'Deze periode wordt weer vrijgegeven.', confirmText: 'Verwijder', danger: true, onConfirm: () => { if (KA.db) KA.db.blockDelete(id); KA.undoable('Blokkade verwijderd.', () => { KA.state.blocks.splice(i, 1); KA.renderBeschikbaarheid(); }, () => { KA.state.blocks.splice(i, 0, saved); KA.renderBeschikbaarheid(); }); } }); return; }
      const clearF = t.closest('.js-clear'); if (clearF) { e.preventDefault(); if ($('#klantSearch')) $('#klantSearch').value = ''; KA.renderKlanten(''); return; }
      // free slot / appt / block in agenda
      const free = t.closest('.ev--free'); if (free) { newAppt(free.dataset.b, +free.dataset.min); return; }
      const block = t.closest('[data-block]'); if (block) { const bl = KA.state.blocks.find((b) => b.id === block.dataset.block); if (bl) KA.confirm({ title: 'Pauze / blokkade', body: KA.esc(bl.label) + (bl.start ? ` · ${bl.start}–${bl.end}` : ''), confirmText: 'Verwijder', cancelText: 'Sluiten', danger: true, onConfirm: () => { const i = KA.state.blocks.findIndex((x) => x.id === bl.id); if (KA.db) KA.db.blockDelete(bl.id); KA.undoable('Blokkade verwijderd.', () => { KA.state.blocks.splice(i, 1); KA.renderAgenda(); KA.renderBeschikbaarheid(); }, () => { KA.state.blocks.splice(i, 0, bl); KA.renderAgenda(); KA.renderBeschikbaarheid(); }); } }); return; }
      const apptEl = t.closest('[data-appt]'); if (apptEl) { KA.openAppointment(apptEl.dataset.appt); return; }
      const monthCell = t.closest('.ag-month .mc[data-day]'); if (monthCell && !monthCell.classList.contains('out')) { const parts = monthCell.dataset.day.split('-'); KA.agenda.date = new Date(+parts[0], +parts[1] - 1, +parts[2]); KA.agenda.view = 'day'; $('#agSeg').querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i === 0)); KA.renderAgenda(); return; }
      const custRow = t.closest('tr[data-cust]'); if (custRow && !t.closest('.ck') && !t.closest('.ckcell')) { KA.openCustomer(custRow.dataset.cust); return; }
    });
    // drawer close
    const d = $('#drawer');
    d.addEventListener('click', (e) => { if (e.target.hasAttribute('data-close')) KA.closeDrawer(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && d.classList.contains('on')) KA.closeDrawer(); });
  }

  /* ---------- PRINT DAGBLADEN ---------- */
  KA.printDagbladen = function () {
    const bs = KA.barbersSorted().filter((b) => b.active);
    const m = KA.modal({ card: `<h2 class="serif">Print dagbladen</h2><p class="muted" style="font-size:.86rem;margin:2px 0 12px">Eén A4 per barbier — ${KA.dateLabel(KA.today, 'day')}.</p>${bs.map((b) => `<label class="toggle-row" style="cursor:pointer"><input type="checkbox" class="ck js-pb" data-id="${b.id}" checked><span class="tt"><b>${KA.esc(b.name)}</b><small>${KA.state.appts.filter((a) => a.barber === b.id && a.status !== 'cancelled').length} afspraken</small></span></label>`).join('')}<div class="modal__foot"><button class="b b--ghost" data-close>Annuleren</button><button class="b b--gold js-ok"><i data-lucide="printer"></i> Print</button></div>` });
    m.card.querySelector('.js-ok').onclick = () => {
      const ids = Array.from(m.card.querySelectorAll('.js-pb:checked')).map((c) => c.dataset.id);
      if (!ids.length) { KA.toast('Kies minstens één barbier.', { type: 'err' }); return; }
      buildDaysheet(ids); m.close(); setTimeout(() => window.print(), 150);
    };
    ic();
  };
  function buildDaysheet(ids) {
    let host = $('#daysheet'); if (!host) { host = document.createElement('div'); host.id = 'daysheet'; host.className = 'daysheet'; document.body.appendChild(host); }
    host.innerHTML = ids.map((id) => {
      const b = KA.barber(id);
      const items = KA.state.appts.filter((a) => a.barber === id && a.status !== 'cancelled').sort((x, y) => KA.toMin(x.start) - KA.toMin(y.start));
      const rows = items.map((a) => { const c = KA.customer(a.cust); return `<tr><td style="padding:8px 10px;border-bottom:1px solid #ddd;font-variant-numeric:tabular-nums">${a.start}</td><td style="padding:8px 10px;border-bottom:1px solid #ddd">${KA.esc(KA.apptCustName(a))}<br><span style="color:#777;font-size:11px">${c ? KA.esc(c.phone) : ''}</span></td><td style="padding:8px 10px;border-bottom:1px solid #ddd">${KA.esc(KA.service(a.sv).name)}</td><td style="padding:8px 10px;border-bottom:1px solid #ddd">${a.dur}m</td></tr>`; }).join('');
      return `<div class="page"><div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #16140F;padding-bottom:10px;margin-bottom:14px"><h1 style="font-family:'Playfair Display',serif;margin:0;font-size:28px">${KA.esc(b.name)}</h1><div style="text-align:right"><div style="font-family:Oswald,sans-serif;text-transform:uppercase;letter-spacing:.1em;font-size:11px;color:#9A7B33">Kameraad Haarsnijder</div><div style="font-size:13px">${KA.dateLabel(KA.today, 'day')}</div></div></div>${items.length ? `<table style="width:100%;border-collapse:collapse;font-family:'Hanken Grotesk',sans-serif;font-size:13px"><thead><tr><th style="text-align:left;padding:6px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#777">Tijd</th><th style="text-align:left;padding:6px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#777">Klant</th><th style="text-align:left;padding:6px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#777">Dienst</th><th style="text-align:left;padding:6px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#777">Duur</th></tr></thead><tbody>${rows}</tbody></table>` : '<p style="font-family:Hanken Grotesk,sans-serif;color:#777">Geen afspraken vandaag.</p>'}</div>`;
    }).join('');
  }

  /* ---------- boot ---------- */
  function boot() {
    initAuth(); initTopbar(); initVandaag(); initAgenda(); initBesch(); initKlanten();
    initBarbiers(); initDiensten(); initBeheerders(); initStats(); initInstellingen(); initBanner(); initMailing();
    initDelegation(); KA.wireResponsive();
    window.addEventListener('hashchange', route);
    KA.setRole('owner');
    // land in the app (login stays reachable via Afmelden — full auth loop intact)
    $('#login').hidden = true; $('#app').hidden = false;
    if (!location.hash) location.hash = '#vandaag';
    route();
    ic();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
