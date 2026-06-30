/* ============================================================
   Kameraad Admin — editors (drawers, detail panels, create flows)
   The sub-screens that were missing: each opens, edits state, saves
   with feedback, and closes back to a known resting state.
   ============================================================ */
(function () {
  const KA = (window.KA = window.KA || {});
  const esc = KA.esc, ic = KA.icons;
  const CURRENT_ADMIN = 'Avraz';

  function refreshAll() {
    KA.renderVandaag(); KA.renderKlanten(); KA.renderBarbiers(); KA.renderDiensten();
    KA.renderBeheerders(); KA.renderBeschikbaarheid(); KA.renderStatistieken();
    if (KA.agenda) KA.renderAgenda();
  }
  KA.refreshAll = refreshAll;

  /* ============ S-05 · CUSTOMER DRAWER ============ */
  KA.openCustomer = function (id) {
    const c = KA.customer(id); if (!c) return;
    const optRow = (key, label, sub) => `<div class="toggle-row"><span class="tt"><b>${label}</b><small>${sub}</small></span><span class="js-opt" data-k="${key}"></span></div>`;
    const body = `
      <div style="display:flex;gap:8px;margin:16px 0"><span class="bdg bdg--ok">${c.visits} bezoeken</span><span class="bdg bdg--mut">${c.noshows} no-shows</span><span class="muted" style="font-size:.82rem;align-self:center">Klant sinds ${c.since}</span></div>
      <div class="dw-sec js-contact">
        <label class="lbl">Contact</label>
        <div class="field" data-f="email"><input class="in" id="cEmail" value="${esc(c.email)}"><div class="ferr"><i data-lucide="alert-circle"></i><span></span></div></div>
        <div class="field" data-f="phone" style="margin-bottom:0"><input class="in" id="cPhone" value="${esc(c.phone)}"></div>
        <div class="savebar" style="position:static;padding:10px 0 0"><span class="dirty js-dirty"><span class="dot"></span> Niet bewaard</span><button class="b b--gold b--sm js-save" disabled><i data-lucide="check"></i> Bewaar contact</button></div>
      </div>
      <div class="dw-sec"><label class="lbl">Voorkeuren (opt-in)</label>
        ${optRow('reminders', 'Herinneringen', 'Afspraak-reminders per e-mail')}
        ${optRow('rebook', 'Herboeking', 'Nudge "tijd voor een trim"')}
        ${optRow('marketing', 'Marketing', 'Acties &amp; nieuws')}
      </div>
      <div class="dw-sec"><label class="lbl">Interne notities</label><div class="notes js-notes"></div>
        <div class="note-add"><textarea class="in js-note-in" placeholder="Notitie voor het team…"></textarea><button class="b b--gold b--sm js-note-add" style="white-space:nowrap"><i data-lucide="plus"></i> Voeg toe</button></div>
      </div>
      <div class="dw-sec"><label class="lbl">Afspraak-historie</label><div class="js-hist"></div></div>
      <div style="display:flex;gap:8px;margin-top:18px"><button class="b b--ghost b--sm js-cust-export"><i data-lucide="download"></i> Exporteer</button><button class="b b--ghost b--sm js-cust-del" data-owner-only style="color:#a23b2b;border-color:rgba(162,59,43,.4)"><i data-lucide="trash-2"></i> Verwijder (GDPR)</button></div>`;
    const slot = KA.openDrawer({ title: esc(c.name), subtitle: 'Klant sinds ' + c.since, avatar: KA.initials(c.name), body });

    // contact P-01
    KA.form(slot.querySelector('.js-contact'), {
      validate: (root) => { const e = {}; const em = root.querySelector('#cEmail').value.trim();
        if (!/^\S+@\S+\.\S+$/.test(em)) e.email = 'Ongeldig e-mailadres.';
        else if (KA.state.customers.some((x) => x.id !== id && x.email.toLowerCase() === em.toLowerCase())) e.email = 'Dit e-mailadres bestaat al.';
        return e; },
      onSave: (root) => { c.email = root.querySelector('#cEmail').value.trim(); c.phone = root.querySelector('#cPhone').value.trim(); if (KA.db) KA.db.custSave(id, { email: c.email, phone: c.phone }); KA.renderKlanten(); KA.toast('Contact bewaard.'); },
    });
    // opt-ins P-07
    slot.querySelectorAll('.js-opt').forEach((wrap) => {
      const k = wrap.dataset.k;
      wrap.appendChild(KA.makeToggle(c.optins[k], (on) => { c.optins[k] = on; if (KA.db) KA.db.custOptin(id, k, on); KA.renderKlanten(); KA.toast(on ? 'Opt-in aan.' : 'Opt-in uit.', { duration: 1800 }); }));
    });
    // notes
    const notesEl = slot.querySelector('.js-notes');
    const renderNotes = () => {
      notesEl.innerHTML = c.notes.length ? c.notes.map((n) => `<div class="note" data-n="${n.id}"><p>${esc(n.text)}</p><div class="meta">${esc(n.author)} · ${esc(n.date)}</div><button class="del js-note-del" data-id="${n.id}" aria-label="Verwijder"><i data-lucide="x"></i></button></div>`).join('')
        : `<p class="muted" style="font-size:.84rem;margin:0">Nog geen notities.</p>`;
      ic();
      notesEl.querySelectorAll('.js-note-del').forEach((b) => (b.onclick = () => {
        const nid = b.dataset.id; const idx = c.notes.findIndex((n) => n.id === nid); const saved = c.notes[idx];
        KA.confirm({ title: 'Notitie verwijderen?', body: 'Deze notitie wordt verwijderd.', confirmText: 'Verwijder', danger: true, onConfirm: () => {
          KA.undoable('Notitie verwijderd.', () => { c.notes.splice(idx, 1); if (KA.db) KA.db.custNotes(id, c.notes.map((n) => n.text).join('\n')); renderNotes(); }, () => { c.notes.splice(idx, 0, saved); if (KA.db) KA.db.custNotes(id, c.notes.map((n) => n.text).join('\n')); renderNotes(); });
        } });
      }));
    };
    renderNotes();
    const noteIn = slot.querySelector('.js-note-in');
    slot.querySelector('.js-note-add').onclick = () => {
      const v = noteIn.value.trim(); if (!v) { noteIn.focus(); return; }
      c.notes.unshift({ id: KA.uid('n'), text: v, author: CURRENT_ADMIN, date: 'vandaag' });
      if (KA.db) KA.db.custNotes(id, c.notes.map((n) => n.text).join('\n'));
      noteIn.value = ''; renderNotes(); KA.toast('Notitie toegevoegd.');
    };
    // history
    const histEl = slot.querySelector('.js-hist');
    if (!c.history.length) histEl.innerHTML = `<div class="empty" style="padding:24px"><i data-lucide="calendar"></i><h3 style="font-size:1rem">Nog geen bezoeken</h3></div>`;
    else histEl.innerHTML = `<div class="hist">${c.history.map((h) => `<div class="hist__row" data-h="${h.id}"><div class="hd">${esc(h.date)}</div><div class="hs">${esc(KA.service(h.service).name)}<small>${esc(KA.barber(h.barber).name)} · ${KA.statusLabel(h.status)}</small></div><span class="thumb ${h.rating === 'up' ? 'up' : h.rating === 'down' ? 'down' : 'none'}">${h.rating === 'up' ? '👍' : h.rating === 'down' ? '👎' : '·'}</span></div>`).join('')}</div>`;
    histEl.querySelectorAll('.hist__row').forEach((r) => (r.onclick = () => {
      const h = c.history.find((x) => x.id === r.dataset.h);
      KA.modal({ card: `<h2 class="serif">${esc(c.name)}</h2><p class="muted" style="font-size:.86rem;margin:0 0 10px">${esc(h.date)} · ${esc(KA.service(h.service).name)} · ${esc(KA.barber(h.barber).name)}</p><div style="display:flex;gap:8px;align-items:center"><span>${KA.statusBadge(h.status)}</span>${h.rating ? `<span class="thumb ${h.rating}">${h.rating === 'up' ? '👍' : '👎'}</span>` : '<span class="muted" style="font-size:.84rem">geen beoordeling</span>'}</div>${h.reason ? `<p style="margin:12px 0 0;font-size:.88rem"><b>Reden:</b> ${esc(h.reason)}</p>` : ''}<div class="modal__foot"><button class="b b--ghost" data-close>Sluiten</button></div>` });
    }));
    ic();
    // export + GDPR
    slot.querySelector('.js-cust-export').onclick = () => KA.exportSheet({ title: 'Exporteer ' + c.name, sections: [{ label: 'Contactgegevens', on: true }, { label: 'Afspraak-historie' }, { label: 'Notities' }], allowFormats: ['JSON', 'PDF'] });
    const del = slot.querySelector('.js-cust-del');
    if (del) del.onclick = () => KA.typeConfirm({ title: 'Klant permanent verwijderen', body: `Dit verwijdert ${esc(c.name)}, alle afspraken en e-maillogs onomkeerbaar (GDPR).`, onConfirm: () => {
      const i = KA.state.customers.findIndex((x) => x.id === id); KA.state.customers.splice(i, 1);
      if (KA.db) KA.db.custDelete(id);
      KA.closeDrawer(true); KA.renderKlanten(); KA.toast('Klant en alle gegevens permanent verwijderd.');
    } });
  };

  KA.statusLabel = (s) => ({ confirmed: 'Bevestigd', completed: 'Voltooid', noshow: 'No-show', cancelled: 'Geannuleerd' }[s] || s);

  /* ============ S-02 / S-03 · APPOINTMENT DETAIL DRAWER ============ */
  KA.openAppointment = function (id) {
    const a = KA.state.appts.find((x) => x.id === id); if (!a) return;
    const sv = KA.service(a.sv), b = KA.barber(a.barber);
    const body = `
      <div style="display:flex;gap:8px;margin:14px 0;align-items:center">${KA.statusBadge(a.status)}${a.pref ? '<span class="bdg bdg--warn">Geen voorkeur</span>' : ''}</div>
      <div class="dw-sec"><label class="lbl">Afspraak</label>
        <div class="crosslink" style="cursor:default"><span class="dot" style="width:12px;height:12px;background:${sv.color}"></span><div class="cl-t"><b>${esc(sv.name)}</b><small>${a.start} · ${a.dur} min · ${esc(b.name)}</small></div></div>
      </div>
      ${a.pref ? `<div class="dw-sec"><label class="lbl">Barbier toewijzen</label><select class="in js-assign">${KA.barbersSorted().filter((x) => x.active).map((x) => `<option value="${x.id}" ${x.id === a.barber ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>` : ''}
      <div class="dw-sec"><label class="lbl">Acties</label>
        <div style="display:grid;gap:7px">
          <button class="b b--gold js-complete" ${a.status === 'completed' ? 'disabled' : ''}><i data-lucide="check-circle-2"></i> Markeer voltooid</button>
          <div style="display:flex;gap:7px"><button class="b b--ghost b--sm js-noshow" style="flex:1" ${a.status === 'noshow' ? 'disabled' : ''}><i data-lucide="user-x"></i> No-show</button>
          <button class="b b--ghost b--sm js-resched" style="flex:1"><i data-lucide="calendar-clock"></i> Verzet</button></div>
          <button class="b b--ghost b--sm js-cancel" style="color:#a23b2b;border-color:rgba(162,59,43,.4)"><i data-lucide="x-circle"></i> Annuleer afspraak</button>
        </div>
      </div>
      <div class="dw-sec js-fb"></div>`;
    const slot = KA.openDrawer({ title: esc(KA.apptCustName(a)), subtitle: KA.service(a.sv).name + ' · ' + a.start, avatar: KA.initials(KA.apptCustName(a)), body });

    if (a.pref) slot.querySelector('.js-assign').onchange = (e) => { a.barber = e.target.value; a.pref = false; if (KA.db) KA.db.apptAssign(a.id, a.barber); refreshAll(); KA.toast('Barbier toegewezen: ' + KA.barber(a.barber).name); KA.openAppointment(id); };

    const fbEl = slot.querySelector('.js-fb');
    const renderFb = () => {
      if (a.status !== 'completed') { fbEl.innerHTML = `<label class="lbl">Tevredenheid</label><p class="muted" style="font-size:.82rem;margin:0">Beschikbaar zodra de afspraak voltooid is.</p>`; return; }
      KA.fbBlock(fbEl, a, () => { refreshAll(); });
    };
    renderFb();

    slot.querySelector('.js-complete').onclick = () => { a.status = 'completed'; if (KA.db) KA.db.apptStatus(a.id, 'completed'); KA.toast('Afspraak voltooid — telt mee voor omzet.'); refreshAll(); KA.openAppointment(id); };
    slot.querySelector('.js-noshow').onclick = () => KA.confirm({ title: 'Als no-show markeren?', body: 'Telt mee in de no-show-statistiek. Er vertrekt geen e-mail.', confirmText: 'No-show', onConfirm: () => { a.status = 'noshow'; if (KA.db) KA.db.apptStatus(a.id, 'noshow'); const c = KA.customer(a.cust); if (c) c.noshows++; KA.toast('Gemarkeerd als no-show.'); refreshAll(); KA.openAppointment(id); } });
    slot.querySelector('.js-resched').onclick = () => KA.rescheduleAppt(a, () => KA.openAppointment(id));
    slot.querySelector('.js-cancel').onclick = () => KA.cancelAppt(a, () => { KA.closeDrawer(true); });
    ic();
  };

  // FB capture block (FB-1/FB-2)
  KA.fbBlock = function (el, a, after) {
    const chips = KA.FB_CHIPS;
    el.innerHTML = `<label class="lbl">Tevredenheid <span class="muted" style="text-transform:none;letter-spacing:0;font-family:var(--font-body)">— hoe ging het?</span></label>
      <div class="thumbs"><button class="thumb-btn js-up ${a.rating === 'up' ? 'sel-up' : ''}">👍</button><button class="thumb-btn js-down ${a.rating === 'down' ? 'sel-down' : ''}">👎</button>
      <button class="b b--ghost b--sm js-skip" style="margin-left:auto;align-self:center">Overslaan</button></div>
      <div class="js-reason" ${a.rating === 'down' ? '' : 'hidden'} style="margin-top:12px"><small class="muted" style="font-size:.8rem">Wat liep er mis?</small>
        <div class="chips">${chips.map((ch) => `<button class="chip ${a.reason === ch ? 'on' : ''}" data-c="${esc(ch)}">${esc(ch)}</button>`).join('')}</div>
        <textarea class="in js-rnote" rows="2" placeholder="Optioneel — extra (max 200)" maxlength="200" style="margin-top:8px">${esc(a.note || '')}</textarea>
        <button class="b b--gold b--sm js-rsave" style="margin-top:8px"><i data-lucide="check"></i> Bewaar</button></div>`;
    ic();
    const reason = el.querySelector('.js-reason');
    el.querySelector('.js-up').onclick = () => { a.rating = 'up'; a.reason = ''; KA.toast('Merci — 👍 bewaard.', { duration: 1800 }); if (after) after(); KA.fbBlock(el, a, after); };
    el.querySelector('.js-down').onclick = () => { a.rating = 'down'; reason.hidden = false; el.querySelector('.js-down').classList.add('sel-down'); el.querySelector('.js-up').classList.remove('sel-up'); };
    el.querySelector('.js-skip').onclick = () => { a.rating = null; a.reason = ''; KA.toast('Geen beoordeling.', { duration: 1500 }); if (after) after(); KA.fbBlock(el, a, after); };
    reason.querySelectorAll('.chip').forEach((c) => (c.onclick = () => { reason.querySelectorAll('.chip').forEach((x) => x.classList.remove('on')); c.classList.add('on'); a.reason = c.dataset.c; }));
    el.querySelector('.js-rsave').onclick = () => { a.note = el.querySelector('.js-rnote').value.trim(); if (!a.reason) a.reason = 'andere'; KA.toast('We horen het, we maken het goed.', { duration: 2200 }); if (after) after(); };
  };

  KA.rescheduleAppt = function (a, after) {
    const m = KA.modal({ card: `<h2 class="serif">Verzetten</h2><p class="muted" style="font-size:.88rem;margin:2px 0 14px">Kies een nieuw moment. De klant krijgt een verzet-mail.</p>
      <div class="row2"><div class="field"><label class="lbl">Datum</label><input class="in" type="date" value="2026-06-30"></div><div class="field"><label class="lbl">Starttijd</label><input class="in" type="time" value="${a.start}"></div></div>
      <label style="display:flex;gap:8px;align-items:center;font-size:.86rem;margin-top:4px"><input type="checkbox" class="ck" checked> Klant verwittigen per e-mail</label>
      <div class="modal__foot"><button class="b b--ghost" data-close>Annuleren</button><button class="b b--gold js-ok"><i data-lucide="calendar-clock"></i> Verzet</button></div>` });
    m.card.querySelector('.js-ok').onclick = () => { const t = m.card.querySelector('input[type=time]').value; const d = m.card.querySelector('input[type=date]').value || a.date; if (t) { a.start = t; a.date = d; if (KA.db) KA.db.apptReschedule(a.id, d, t, a.dur); } m.close(); KA.toast('Verzet — klant gemaild.'); refreshAll(); if (after) after(); };
  };

  KA.cancelAppt = function (a, after) {
    const m = KA.modal({ card: `<div class="ico ico--danger"><i data-lucide="x-circle"></i></div><h2 class="serif">Afspraak annuleren?</h2>
      <p class="muted" style="font-size:.9rem;margin:0">${esc(KA.apptCustName(a))} · ${esc(KA.service(a.sv).name)} · ${a.start}. Het slot komt weer vrij.</p>
      <label style="display:flex;gap:8px;align-items:center;font-size:.86rem;margin-top:14px"><input type="checkbox" class="ck js-notify" checked> Klant verwittigen per e-mail</label>
      <div class="modal__foot"><button class="b b--ghost" data-close>Terug</button><button class="b b--danger js-ok">Annuleer afspraak</button></div>` });
    m.card.querySelector('.js-ok').onclick = () => { const notify = m.card.querySelector('.js-notify').checked; a.status = 'cancelled'; if (KA.db) KA.db.apptStatus(a.id, 'cancelled'); m.close(); KA.toast(notify ? 'Afspraak geannuleerd — klant gemaild.' : 'Afspraak geannuleerd.'); refreshAll(); if (after) after(); };
  };

  /* ============ S-07 · BARBER EDIT HUB / CREATE ============ */
  KA.openBarber = function (id) {
    const create = !id;
    const b = create ? { id: null, name: '', slug: '', photo: '', active: true, bio: { nl: '', en: '', fr: '' }, services: [] } : KA.barber(id);
    const body = `
      <div class="dw-sec js-bform">
        <label class="lbl">Identiteit</label>
        <div style="display:flex;gap:14px;align-items:center;margin-bottom:12px">
          <div class="av av--txt js-photo" style="width:56px;height:56px;font-size:1.2rem;${b.photo ? `background-image:url('${b.photo}');background-size:cover;` : ''}">${b.photo ? '' : esc(b.name ? KA.initials(b.name) : '?')}</div>
          <label class="b b--ghost b--sm" style="cursor:pointer"><i data-lucide="upload"></i> Foto<input type="file" accept="image/*" class="js-foto" hidden></label>
        </div>
        <div class="field" data-f="name"><label class="lbl">Naam</label><input class="in" id="bName" value="${esc(b.name)}"><div class="ferr"><i data-lucide="alert-circle"></i><span></span></div></div>
        <div class="field" data-f="slug"><label class="lbl">Slug (URL)</label><input class="in" id="bSlug" value="${esc(b.slug)}" placeholder="bv. avraz"></div>
        <div class="field"><label class="lbl">Bio · NL</label><textarea class="in" id="bioNl" rows="2">${esc(b.bio.nl)}</textarea></div>
        <div class="row2"><div class="field"><label class="lbl">Bio · EN</label><textarea class="in" id="bioEn" rows="2">${esc(b.bio.en)}</textarea></div><div class="field"><label class="lbl">Bio · FR</label><textarea class="in" id="bioFr" rows="2">${esc(b.bio.fr)}</textarea></div></div>
        <div class="toggle-row"><span class="tt"><b>Actief</b><small>Zichtbaar op de site &amp; boekbaar</small></span><span class="js-active"></span></div>
        ${create ? `<label style="display:flex;gap:8px;align-items:center;font-size:.86rem;margin-top:10px"><input type="checkbox" class="ck" id="bInvite" checked> Stuur een login-uitnodiging</label>` : ''}
        <div class="savebar"><span class="dirty js-dirty"><span class="dot"></span> Niet bewaard</span><button class="b b--ghost js-cancel">Annuleren</button><button class="b b--gold js-save"${create ? '' : ' disabled'}><i data-lucide="check"></i> ${create ? 'Aanmaken' : 'Bewaar'}</button></div>
      </div>
      ${create ? '' : `<div class="dw-sec"><label class="lbl">Elders voor deze barbier</label><div class="crosslinks">
        <button class="crosslink js-cl" data-go="diensten"><i data-lucide="list" class="lead"></i><div class="cl-t"><b>Diensten</b><small>${b.services.length} van ${KA.activeServices().length} · open de matrix</small></div><i data-lucide="chevron-right" class="chev"></i></button>
        <button class="crosslink js-cl" data-go="beschikbaarheid" data-besch="${b.id}"><i data-lucide="clock" class="lead"></i><div class="cl-t"><b>Beschikbaarheid</b><small>Weekuren &amp; blokkades</small></div><i data-lucide="chevron-right" class="chev"></i></button>
        <button class="crosslink js-cl" data-go="beheerders"><i data-lucide="shield" class="lead"></i><div class="cl-t"><b>Login &amp; rol</b><small>Beheerders-account</small></div><i data-lucide="chevron-right" class="chev"></i></button>
      </div></div>
      <div style="margin-top:18px"><button class="b b--ghost b--sm js-del-barber" style="color:#a23b2b;border-color:rgba(162,59,43,.4)"><i data-lucide="trash-2"></i> Verwijder barbier</button></div>`}`;
    const slot = KA.openDrawer({ title: create ? 'Nieuwe barbier' : esc(b.name), subtitle: create ? 'Voeg een teamlid toe' : 'Bewerk teamlid', avatar: create ? '+' : KA.initials(b.name), body, dirtyCheck: () => slot && slot._dirty && slot._dirty() });

    // active toggle
    let activeState = b.active;
    slot.querySelector('.js-active').appendChild(KA.makeToggle(b.active, (on) => {
      if (!create && !on) {
        const future = KA.state.appts.filter((x) => x.barber === b.id && x.status === 'confirmed').length;
        if (future) { KA.confirm({ title: 'Barbier deactiveren?', body: `${esc(b.name)} heeft ${future} toekomstige afspraak(en). Die blijven staan; de barbier verdwijnt van de site en uit nieuwe boekingen.`, confirmText: 'Deactiveer', onConfirm: () => { b.active = false; if (KA.db) KA.db.barberActive(b.id, false); refreshAll(); KA.toast(b.name + ' gedeactiveerd.'); } });
          return false; }
      }
      activeState = on; if (!create) { b.active = on; if (KA.db) KA.db.barberActive(b.id, on); refreshAll(); KA.toast(on ? b.name + ' actief.' : b.name + ' inactief.'); }
      return true;
    }));

    // foto upload
    slot.querySelector('.js-foto').onchange = (e) => { const f = e.target.files[0]; if (!f) return; if (f.size > 4e6) { KA.toast('Foto te groot (max 4MB).', { type: 'err' }); return; } const url = URL.createObjectURL(f); const ph = slot.querySelector('.js-photo'); ph.style.backgroundImage = `url('${url}')`; ph.style.backgroundSize = 'cover'; ph.textContent = ''; b._newPhoto = url; };

    const f = KA.form(slot.querySelector('.js-bform'), {
      validate: (root) => { const e = {}; if (!root.querySelector('#bName').value.trim()) e.name = 'Naam is verplicht.'; return e; },
      onSave: (root) => {
        const data = { name: root.querySelector('#bName').value.trim(), slug: root.querySelector('#bSlug').value.trim(), bio: { nl: root.querySelector('#bioNl').value, en: root.querySelector('#bioEn').value, fr: root.querySelector('#bioFr').value } };
        if (create) {
          const nb = { id: KA.uid('b'), photo: b._newPhoto || '', active: activeState, order: KA.state.barbers.length + 1, services: KA.activeServices().map((s) => s.id), hours: KA.barber('b-avraz').hours.map((d) => d.map((w) => ({ ...w }))), ...data };
          KA.state.barbers.push(nb);
          if (KA.db) KA.db.barberCreate(nb, nb.id);
          if (root.querySelector('#bInvite') && root.querySelector('#bInvite').checked) { const ad = { id: KA.uid('ad'), name: data.name, email: (data.slug || data.name.toLowerCase()) + '@kameraadhaarsnijder.be', role: 'barber', linked: nb.id, last: '—', status: 'invited' }; KA.state.admins.push(ad); if (KA.db) KA.db.adminInvite({ email: ad.email, role: 'barber', linked: nb.id }, ad.id); }
          refreshAll(); KA.toast(data.name + ' toegevoegd.'); KA.closeDrawer(true);
        } else { Object.assign(b, data); if (b._newPhoto) { b.photo = b._newPhoto; delete b._newPhoto; } if (KA.db) KA.db.barberSave(b.id, data); refreshAll(); KA.toast('Barbier bewaard.'); }
      },
      onCancel: () => KA.closeDrawer(true),
    });
    slot._dirty = f.isDirty;
    slot.querySelectorAll('.js-cl').forEach((cl) => (cl.onclick = () => { if (cl.dataset.besch) KA.besch.scope = cl.dataset.besch; if (cl.dataset.go === 'diensten') KA._scrollMatrix = true; KA.closeDrawer(true); location.hash = '#' + cl.dataset.go; }));
    const delB = slot.querySelector('.js-del-barber');
    if (delB) delB.onclick = () => {
      const future = KA.state.appts.filter((x) => x.barber === b.id && x.status !== 'cancelled' && x.status !== 'completed').length;
      if (future) { KA.confirm({ title: 'Kan niet hard verwijderen', icon: 'info', body: `${esc(b.name)} heeft nog lopende afspraken. Deactiveer in plaats daarvan — de historie blijft bewaard.`, confirmText: 'Deactiveer', onConfirm: () => { b.active = false; refreshAll(); KA.closeDrawer(true); KA.toast(b.name + ' gedeactiveerd.'); } }); return; }
      KA.confirm({ title: 'Barbier verwijderen?', body: `${esc(b.name)} wordt verwijderd.`, confirmText: 'Verwijder', danger: true, onConfirm: () => { if (KA.db) KA.db.barberDelete(b.id); const i = KA.state.barbers.findIndex((x) => x.id === b.id); KA.state.barbers.splice(i, 1); refreshAll(); KA.closeDrawer(true); KA.toast(b.name + ' verwijderd.'); } });
    };
    ic();
  };

  /* ============ S-08 · SERVICE EDIT / CREATE ============ */
  KA.SWATCHES = ['#E8B84B', '#3D9970', '#F39C12', '#3498DB', '#E74C8B', '#9A7B33', '#2C6E8F', '#8E5572'];
  KA.openService = function (id) {
    const create = !id;
    const s = create ? { id: null, name: '', color: '#E8B84B', dur: 30, price: 30, active: true, walkin: false, desc: { nl: '', en: '', fr: '' } } : KA.service(id);
    if (s.walkin) { // limited info-only editor
      const body = `<div class="dw-sec js-sform"><div class="banner-note warn" style="margin-top:0"><i data-lucide="info"></i><span>Info-dienst — nooit boekbaar, niet in matrix of statistieken.</span></div>
        <div class="field" data-f="name"><label class="lbl">Label</label><input class="in" id="sName" value="${esc(s.name)}"></div>
        <div class="field"><label class="lbl">Tekst · NL</label><textarea class="in" id="dNl" rows="2">${esc(s.desc.nl)}</textarea></div>
        <div class="row2"><div class="field"><label class="lbl">EN</label><textarea class="in" id="dEn" rows="2">${esc(s.desc.en)}</textarea></div><div class="field"><label class="lbl">FR</label><textarea class="in" id="dFr" rows="2">${esc(s.desc.fr)}</textarea></div></div>
        <div class="savebar"><span class="dirty js-dirty"><span class="dot"></span> Niet bewaard</span><button class="b b--ghost js-cancel">Annuleren</button><button class="b b--gold js-save" disabled><i data-lucide="check"></i> Bewaar</button></div></div>`;
      const slot = KA.openDrawer({ title: esc(s.name), subtitle: 'Info-dienst', avatar: '', body });
      KA.form(slot.querySelector('.js-sform'), { onSave: (r) => { s.name = r.querySelector('#sName').value; s.desc = { nl: r.querySelector('#dNl').value, en: r.querySelector('#dEn').value, fr: r.querySelector('#dFr').value }; if (KA.db) KA.db.svcSave(s.id, { name: s.name, price: s.price, dur: s.dur, color: s.color, active: s.active, desc: s.desc }); KA.renderDiensten(); KA.toast('Bewaard.'); }, onCancel: () => KA.closeDrawer(true) });
      ic(); return;
    }
    const body = `<div class="dw-sec js-sform">
      <div class="field" data-f="name"><label class="lbl">Naam · NL</label><input class="in" id="sName" value="${esc(s.name)}"><div class="ferr"><i data-lucide="alert-circle"></i><span></span></div></div>
      <div class="field"><label class="lbl">Omschrijving · NL</label><textarea class="in" id="dNl" rows="2">${esc(s.desc.nl)}</textarea></div>
      <div class="row2"><div class="field"><label class="lbl">EN</label><textarea class="in" id="dEn" rows="2">${esc(s.desc.en)}</textarea></div><div class="field"><label class="lbl">FR</label><textarea class="in" id="dFr" rows="2">${esc(s.desc.fr)}</textarea></div></div>
      <div class="row2"><div class="field" data-f="price"><label class="lbl">Prijs (€)</label><input class="in" id="sPrice" type="number" min="0" value="${s.price}"><div class="ferr"><i data-lucide="alert-circle"></i><span></span></div></div>
      <div class="field" data-f="dur"><label class="lbl">Duur (min)</label><input class="in" id="sDur" type="number" min="5" step="5" value="${s.dur}"><div class="ferr"><i data-lucide="alert-circle"></i><span></span></div></div></div>
      <div class="field"><label class="lbl">Kleur (in agenda)</label><div class="chips js-sw">${KA.SWATCHES.map((c) => `<button type="button" class="js-swatch" data-c="${c}" style="width:30px;height:30px;border-radius:8px;border:2px solid ${c === s.color ? 'var(--ink)' : 'transparent'};background:${c};cursor:pointer"></button>`).join('')}</div></div>
      <div class="toggle-row"><span class="tt"><b>Actief</b><small>Boekbaar op de site</small></span><span class="js-active"></span></div>
      <div class="hint" id="durNote" hidden>Een gewijzigde duur geldt enkel voor nieuwe boekingen.</div>
      <div class="savebar"><span class="dirty js-dirty"><span class="dot"></span> Niet bewaard</span><button class="b b--ghost js-cancel">Annuleren</button><button class="b b--gold js-save"${create ? '' : ' disabled'}><i data-lucide="check"></i> ${create ? 'Aanmaken' : 'Bewaar'}</button></div></div>`;
    const slot = KA.openDrawer({ title: create ? 'Nieuwe dienst' : esc(s.name), subtitle: create ? 'Voeg een dienst toe' : 'Bewerk dienst', avatar: '', body });
    let color = s.color, active = s.active;
    slot.querySelectorAll('.js-swatch').forEach((sw) => (sw.onclick = () => { color = sw.dataset.c; slot.querySelectorAll('.js-swatch').forEach((x) => (x.style.borderColor = 'transparent')); sw.style.borderColor = 'var(--ink)'; slot.querySelector('.js-sform').dispatchEvent(new Event('change', { bubbles: true })); }));
    slot.querySelector('.js-active').appendChild(KA.makeToggle(s.active, (on) => { active = on; if (!create) { s.active = on; if (KA.db) KA.db.svcActive(s.id, on); KA.renderDiensten(); KA.toast(on ? 'Actief.' : 'Inactief.'); } }));
    const durEl = slot.querySelector('#sDur'); durEl.addEventListener('input', () => { if (!create && +durEl.value !== s.dur) slot.querySelector('#durNote').hidden = false; });
    KA.form(slot.querySelector('.js-sform'), {
      validate: (r) => { const e = {}; if (!r.querySelector('#sName').value.trim()) e.name = 'Naam verplicht.'; if (+r.querySelector('#sPrice').value < 0) e.price = 'Ongeldig.'; if (+r.querySelector('#sDur').value < 5) e.dur = 'Min. 5 min.'; return e; },
      onSave: (r) => {
        const data = { name: r.querySelector('#sName').value.trim(), price: +r.querySelector('#sPrice').value, dur: +r.querySelector('#sDur').value, color, active, desc: { nl: r.querySelector('#dNl').value, en: r.querySelector('#dEn').value, fr: r.querySelector('#dFr').value } };
        if (create) { const ns = { id: KA.uid('sv'), walkin: false, order: KA.state.services.length + 1, ...data }; KA.state.services.push(ns); KA.state.barbers.forEach((b) => b.services.push(ns.id)); if (KA.db) KA.db.svcCreate(ns, ns.id); KA.renderDiensten(); KA.toast(data.name + ' toegevoegd.'); KA.closeDrawer(true); }
        else { Object.assign(s, data); if (KA.db) KA.db.svcSave(s.id, data); KA.renderDiensten(); KA.renderAgenda(); KA.toast('Dienst bewaard.'); }
      }, onCancel: () => KA.closeDrawer(true),
    });
    ic();
  };

  /* ============ S-04 · DAY EDITOR + BLOCK CREATE ============ */
  KA.openDayEditor = function (dayIdx) {
    const sc = KA.besch.scope;
    const src = sc === 'shop' ? KA.state.shopHours : sc === 'all' ? KA.barber('b-avraz').hours : KA.barber(sc).hours;
    const wins = (src[dayIdx] || []).map((w) => ({ ...w }));
    const w1 = wins[0] || { s: '10:00', e: '20:00' }, w2 = wins[1];
    const scopeName = sc === 'shop' ? 'de zaak' : sc === 'all' ? 'alle barbiers' : KA.barber(sc).name;
    const m = KA.modal({ card: `<h2 class="serif">${KA.DAYS[dayIdx]} · ${esc(scopeName)}</h2>
      <p class="muted" style="font-size:.86rem;margin:2px 0 14px">Max. 2 vensters. Start moet voor einde liggen.</p>
      <div class="field" data-f="w1"><label class="lbl">Venster 1</label><div class="row2"><input class="in" type="time" id="w1s" value="${w1.s}"><input class="in" type="time" id="w1e" value="${w1.e}"></div><div class="ferr"><i data-lucide="alert-circle"></i><span></span></div></div>
      <div id="w2wrap" ${w2 ? '' : 'hidden'} class="field" data-f="w2"><label class="lbl">Venster 2</label><div class="row2"><input class="in" type="time" id="w2s" value="${w2 ? w2.s : '15:00'}"><input class="in" type="time" id="w2e" value="${w2 ? w2.e : '20:00'}"></div><div class="ferr"><i data-lucide="alert-circle"></i><span></span></div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="b b--ghost b--sm" id="addW2" ${w2 ? 'hidden' : ''}><i data-lucide="plus"></i> Tweede venster</button><button class="b b--ghost b--sm" id="closeDay" style="color:#a23b2b;border-color:rgba(162,59,43,.4)">Sluit deze dag</button></div>
      <div class="modal__foot"><button class="b b--ghost" data-close>Annuleren</button><button class="b b--gold" id="saveDay"><i data-lucide="check"></i> Bewaar</button></div>` });
    const card = m.card;
    card.querySelector('#addW2').onclick = () => { card.querySelector('#w2wrap').hidden = false; card.querySelector('#addW2').hidden = true; };
    const commit = (newWins) => {
      const apply = () => { if (sc === 'shop') KA.state.shopHours[dayIdx] = newWins; else if (sc === 'all') KA.state.barbers.forEach((b) => (b.hours[dayIdx] = newWins.map((w) => ({ ...w })))); else KA.barber(sc).hours[dayIdx] = newWins; if (KA.db) KA.db.hours(sc, dayIdx, newWins); KA.renderBeschikbaarheid(); m.close(); KA.toast(newWins.length ? 'Uren bewaard.' : 'Dag gesloten.'); };
      // conflict check on shrink (demo: only the seeded Tue case for a barber)
      const conflicts = (sc !== 'shop') && dayIdx === 1 && newWins.length === 0 ? KA.state.appts.filter((a) => (sc === 'all' || a.barber === sc) && a.status === 'confirmed').map((a) => ({ label: KA.apptCustName(a) + ' · ' + a.start, sub: KA.service(a.sv).name + ' · ' + KA.barber(a.barber).name })) : [];
      if (conflicts.length) { KA.conflictModal({ changeLabel: KA.DAYS[dayIdx] + ' sluiten', conflicts, onApply: () => apply() }); }
      else if (sc === 'all') KA.confirm({ title: 'Geldt voor alle barbiers', body: 'Deze uren worden voor alle 4 barbiers ingesteld.', confirmText: 'Toepassen', onConfirm: apply });
      else apply();
    };
    card.querySelector('#closeDay').onclick = () => commit([]);
    card.querySelector('#saveDay').onclick = () => {
      card.querySelectorAll('.field.bad').forEach((f) => f.classList.remove('bad'));
      const w1s = card.querySelector('#w1s').value, w1e = card.querySelector('#w1e').value;
      if (KA.toMin(w1s) >= KA.toMin(w1e)) { const f = card.querySelector('[data-f=w1]'); f.classList.add('bad'); f.querySelector('.ferr span').textContent = ' Start moet voor einde.'; return; }
      const nw = [{ s: w1s, e: w1e }];
      if (!card.querySelector('#w2wrap').hidden) { const w2s = card.querySelector('#w2s').value, w2e = card.querySelector('#w2e').value;
        if (KA.toMin(w2s) >= KA.toMin(w2e)) { const f = card.querySelector('[data-f=w2]'); f.classList.add('bad'); f.querySelector('.ferr span').textContent = ' Start moet voor einde.'; return; }
        if (KA.toMin(w2s) < KA.toMin(w1e)) { const f = card.querySelector('[data-f=w2]'); f.classList.add('bad'); f.querySelector('.ferr span').textContent = ' Mag niet overlappen met venster 1.'; return; }
        nw.push({ s: w2s, e: w2e }); }
      commit(nw);
    };
    ic();
  };

  KA.copyHours = function () {
    const from = KA.besch.scope; if (from === 'shop' || from === 'all') return;
    const others = KA.barbersSorted().filter((b) => b.id !== from);
    const m = KA.modal({ card: `<h2 class="serif">Kopieer uren van ${esc(KA.barber(from).name)}</h2><p class="muted" style="font-size:.86rem;margin:2px 0 12px">Naar wie?</p>
      ${others.map((b) => `<label class="toggle-row" style="cursor:pointer"><input type="checkbox" class="ck js-t" data-id="${b.id}"><span class="tt"><b>${esc(b.name)}</b></span></label>`).join('')}
      <div class="modal__foot"><button class="b b--ghost" data-close>Annuleren</button><button class="b b--gold js-ok"><i data-lucide="copy"></i> Kopieer</button></div>` });
    m.card.querySelector('.js-ok').onclick = () => { const ids = Array.from(m.card.querySelectorAll('.js-t:checked')).map((c) => c.dataset.id); if (!ids.length) { KA.toast('Niemand gekozen.', { type: 'err' }); return; } const srcH = KA.barber(from).hours; ids.forEach((id) => (KA.barber(id).hours = srcH.map((d) => d.map((w) => ({ ...w }))))); if (KA.db) KA.db.copyHours(from, ids); m.close(); KA.toast('Uren gekopieerd naar ' + ids.length + ' barbier(s).'); };
    ic();
  };

  KA.openBlockCreate = function () {
    const m = KA.modal({ card: `<h2 class="serif">Nieuwe blokkade</h2><p class="muted" style="font-size:.86rem;margin:2px 0 14px">Verlof, feestdag of een pauze.</p>
      <div class="row2"><div class="field"><label class="lbl">Van</label><input class="in" type="date" id="blFrom" value="2026-07-01"></div><div class="field"><label class="lbl">Tot</label><input class="in" type="date" id="blTo" value="2026-07-01"></div></div>
      <label style="display:flex;gap:8px;align-items:center;font-size:.86rem;margin-bottom:10px"><input type="checkbox" class="ck" id="blAll" checked> Hele dag</label>
      <div class="field"><label class="lbl">Reden</label><input class="in" id="blReason" placeholder="bv. Verlof"></div>
      <div class="field"><label class="lbl">Wie</label><select class="in" id="blWho"><option value="all">Alle barbiers</option>${KA.barbersSorted().map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></div>
      <div class="modal__foot"><button class="b b--ghost" data-close>Annuleren</button><button class="b b--gold js-ok"><i data-lucide="check"></i> Toevoegen</button></div>` });
    m.card.querySelector('.js-ok').onclick = () => {
      const reason = m.card.querySelector('#blReason').value.trim() || 'Blokkade';
      const who = m.card.querySelector('#blWho').value; const from = m.card.querySelector('#blFrom').value, to = m.card.querySelector('#blTo').value;
      const range = from === to ? new Date(from).getDate() + ' ' + KA.MONTHS[new Date(from).getMonth()].slice(0, 3) + ' ' + new Date(from).getFullYear() + ' · hele dag' : 'van ' + from + ' tot ' + to;
      const add = () => { const nb = { id: KA.uid('bl'), label: reason, who, day: from, allday: true, start: '', end: '', range }; KA.state.blocks.push(nb); if (KA.db) KA.db.blockAdd({ who, from, to, label: reason }, nb.id); KA.renderBeschikbaarheid(); m.close(); KA.toast('Blokkade toegevoegd.'); };
      // conflict demo: if covers today
      const covers = from <= '2026-06-30' && to >= '2026-06-30';
      const conflicts = covers ? KA.state.appts.filter((a) => (who === 'all' || a.barber === who) && a.status === 'confirmed').map((a) => ({ label: KA.apptCustName(a) + ' · ' + a.start, sub: KA.service(a.sv).name })) : [];
      if (conflicts.length) KA.conflictModal({ changeLabel: 'Blokkade "' + reason + '"', conflicts, onApply: add });
      else add();
    };
    ic();
  };

  /* ============ S-12 · ADMIN INVITE / MANAGE ============ */
  KA.openAdmin = function (id) {
    const create = !id;
    const a = create ? null : KA.admin(id);
    if (create) {
      const m = KA.modal({ card: `<h2 class="serif">Beheerder uitnodigen</h2><p class="muted" style="font-size:.86rem;margin:2px 0 14px">Stuurt een uitnodiging; de link is 48 u geldig.</p>
        <div class="field" data-f="email"><label class="lbl">E-mail</label><input class="in" id="adEmail" type="email" placeholder="naam@kameraadhaarsnijder.be"><div class="ferr"><i data-lucide="alert-circle"></i><span></span></div></div>
        <div class="field"><label class="lbl">Rol</label><div class="seg js-role"><button class="on" data-v="barber">Barbier</button><button data-v="owner">Eigenaar</button></div></div>
        <div class="field"><label class="lbl">Koppel aan barbier (optioneel)</label><select class="in" id="adLink"><option value="">— geen —</option>${KA.barbersSorted().map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></div>
        <div class="modal__foot"><button class="b b--ghost" data-close>Annuleren</button><button class="b b--gold js-ok"><i data-lucide="send"></i> Uitnodiging sturen</button></div>` });
      KA.wireSeg(m.card.querySelector('.js-role'), () => {});
      m.card.querySelector('.js-ok').onclick = () => {
        const email = m.card.querySelector('#adEmail').value.trim();
        const f = m.card.querySelector('[data-f=email]');
        if (!/^\S+@\S+\.\S+$/.test(email)) { f.classList.add('bad'); f.querySelector('.ferr span').textContent = ' Ongeldig e-mailadres.'; return; }
        if (KA.state.admins.some((x) => x.email.toLowerCase() === email.toLowerCase())) { f.classList.add('bad'); f.querySelector('.ferr span').textContent = ' Bestaat al als beheerder.'; return; }
        const role = m.card.querySelector('.js-role .on').dataset.v; const link = m.card.querySelector('#adLink').value;
        const ad = { id: KA.uid('ad'), name: email.split('@')[0].replace(/^./, (c) => c.toUpperCase()), email, role, linked: link || null, last: '—', status: 'invited' }; KA.state.admins.push(ad); if (KA.db) KA.db.adminInvite({ email, role, linked: link || null }, ad.id);
        KA.renderBeheerders(); m.close(); KA.toast('Uitnodiging verstuurd naar ' + email + '.');
      };
      ic(); return;
    }
    // manage existing
    const owners = KA.state.admins.filter((x) => x.role === 'owner' && x.status === 'active');
    const isLastOwner = a.role === 'owner' && owners.length <= 1;
    let actions = '';
    if (a.status === 'invited' || a.status === 'expired') actions = `<button class="b b--gold b--sm js-resend"><i data-lucide="send"></i> Opnieuw sturen</button><button class="b b--ghost b--sm js-revoke" style="color:#a23b2b;border-color:rgba(162,59,43,.4)">Intrekken</button>`;
    else if (a.status === 'inactive') actions = `<button class="b b--gold b--sm js-react"><i data-lucide="rotate-ccw"></i> Heractiveren</button>`;
    else actions = `<button class="b b--ghost b--sm js-deact" ${isLastOwner ? 'disabled' : ''} style="color:#a23b2b;border-color:rgba(162,59,43,.4)">Deactiveren</button>`;
    const m = KA.modal({ card: `<h2 class="serif">${esc(a.name)}</h2><p class="muted" style="font-size:.86rem;margin:2px 0 14px">${esc(a.email)}</p>
      <div class="field"><label class="lbl">Rol</label><div class="seg js-role"><button class="${a.role === 'barber' ? 'on' : ''}" data-v="barber" ${isLastOwner ? 'disabled' : ''}>Barbier</button><button class="${a.role === 'owner' ? 'on' : ''}" data-v="owner">Eigenaar</button></div>${isLastOwner ? '<div class="hint">Laatste eigenaar — rol kan niet gewijzigd worden.</div>' : ''}</div>
      <div class="modal__foot"><div class="grow" style="display:flex;gap:8px">${actions}</div><button class="b b--ghost" data-close>Sluiten</button></div>` });
    if (!isLastOwner) KA.wireSeg(m.card.querySelector('.js-role'), (i, btn) => { a.role = btn.dataset.v; if (KA.db) KA.db.adminRole(a.id, a.role); KA.renderBeheerders(); KA.toast('Rol gewijzigd naar ' + (a.role === 'owner' ? 'Eigenaar' : 'Barbier') + '.'); });
    const q = (s) => m.card.querySelector(s);
    if (q('.js-resend')) q('.js-resend').onclick = () => { a.status = 'invited'; KA.renderBeheerders(); KA.toast('Uitnodiging opnieuw verstuurd.'); };
    if (q('.js-revoke')) q('.js-revoke').onclick = () => KA.confirm({ title: 'Uitnodiging intrekken?', body: 'De link wordt ongeldig en de rij verdwijnt.', confirmText: 'Intrekken', danger: true, onConfirm: () => { if (KA.db) KA.db.adminDelete(a.id); const i = KA.state.admins.findIndex((x) => x.id === a.id); KA.state.admins.splice(i, 1); KA.renderBeheerders(); m.close(); KA.toast('Uitnodiging ingetrokken.'); } });
    if (q('.js-deact')) q('.js-deact').onclick = () => KA.confirm({ title: 'Beheerder deactiveren?', body: esc(a.name) + ' kan niet meer inloggen. Account blijft bewaard voor audit.', confirmText: 'Deactiveer', danger: true, onConfirm: () => { a.status = 'inactive'; KA.renderBeheerders(); m.close(); KA.toast(a.name + ' gedeactiveerd.'); } });
    if (q('.js-react')) q('.js-react').onclick = () => { a.status = 'active'; KA.renderBeheerders(); m.close(); KA.toast(a.name + ' geheractiveerd.'); };
    ic();
  };
})();
