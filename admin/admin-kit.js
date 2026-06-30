/* ============================================================
   Kameraad Admin — interaction kernel
   The reusable patterns from the feedback doc (P-01…P-22, G-01…G-11),
   defined once and called from every screen.
   ============================================================ */
(function () {
  const KA = (window.KA = window.KA || {});
  const ic = () => { if (window.lucide) lucide.createIcons(); };
  KA.icons = ic;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  KA.esc = esc;

  /* ---------- P-11 · toast ---------- */
  function host() {
    let h = document.querySelector('.toasts');
    if (!h) { h = document.createElement('div'); h.className = 'toasts'; document.body.appendChild(h); }
    return h;
  }
  KA.toast = function (msg, opts = {}) {
    const { type = 'ok', actionText, onAction, duration } = opts;
    const dur = duration != null ? duration : (type === 'err' ? 0 : actionText ? 6000 : 4000);
    const t = document.createElement('div');
    t.className = 'toast toast--' + type;
    const iconName = type === 'ok' ? 'check-circle-2' : type === 'err' ? 'alert-triangle' : 'info';
    t.innerHTML = `<i data-lucide="${iconName}"></i><span class="toast__msg">${esc(msg)}</span>` +
      (actionText ? `<button class="toast__act">${esc(actionText)}</button>` : '') +
      `<button class="toast__x" aria-label="Sluiten"><i data-lucide="x"></i></button>`;
    host().appendChild(t); ic();
    let done = false;
    const close = (ran) => { if (done) return; done = true; t.classList.add('out'); setTimeout(() => t.remove(), 220); if (!ran && opts.onTimeout) opts.onTimeout(); };
    t.querySelector('.toast__x').onclick = () => close(false);
    if (actionText) t.querySelector('.toast__act').onclick = () => { if (onAction) onAction(); close(true); };
    if (dur) setTimeout(() => close(false), dur);
    return { close };
  };
  // reversible delete helper: removes now, offers Undo, commits on timeout
  KA.undoable = function (msg, doRemove, restore) {
    doRemove();
    KA.toast(msg, { type: 'info', actionText: 'Ongedaan', onAction: restore });
  };

  /* ---------- inline page banner (P-11 persistent) ---------- */
  KA.banner = function (container, { type = 'warn', msg, icon = 'alert-triangle', id } = {}) {
    if (id && container.querySelector('[data-bn="' + id + '"]')) return;
    const b = document.createElement('div');
    b.className = 'banner-note ' + type; if (id) b.dataset.bn = id;
    b.innerHTML = `<i data-lucide="${icon}"></i><span>${msg}</span><button class="x" aria-label="Sluiten"><i data-lucide="x"></i></button>`;
    container.prepend(b); ic();
    b.querySelector('.x').onclick = () => b.remove();
    return b;
  };

  /* ---------- modal base ---------- */
  KA.modal = function ({ card, wide, onClose, closeOnScrim = true } = {}) {
    const m = document.createElement('div');
    m.className = 'modal on';
    m.innerHTML = `<div class="modal__scrim"></div><div class="modal__card${wide ? ' wide' : ''}"></div>`;
    const cardEl = m.querySelector('.modal__card');
    if (typeof card === 'string') cardEl.innerHTML = card; else if (card) cardEl.appendChild(card);
    document.body.appendChild(m); ic();
    let closed = false;
    const close = () => { if (closed) return; closed = true; m.remove(); document.removeEventListener('keydown', onKey); if (onClose) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    if (closeOnScrim) m.querySelector('.modal__scrim').onclick = close;
    m.querySelectorAll('[data-close]').forEach((b) => (b.onclick = close));
    return { el: m, card: cardEl, close };
  };

  /* ---------- P-05 · confirm (simple) ---------- */
  KA.confirm = function ({ title, body, confirmText = 'Bevestig', cancelText = 'Annuleren', danger = false, icon = 'alert-triangle', onConfirm }) {
    const m = KA.modal({
      card: `<div class="ico ${danger ? 'ico--danger' : 'ico--warn'}"><i data-lucide="${icon}"></i></div>
        <h2 class="serif">${esc(title)}</h2>
        <p class="muted" style="font-size:.9rem;margin:0">${body}</p>
        <div class="modal__foot"><button class="b b--ghost" data-close>${esc(cancelText)}</button>
        <button class="b ${danger ? 'b--danger' : 'b--gold'} js-ok">${esc(confirmText)}</button></div>`,
    });
    m.card.querySelector('.js-ok').onclick = () => { if (onConfirm) onConfirm(); m.close(); };
    return m;
  };

  /* ---------- P-06 · type-to-confirm ---------- */
  KA.typeConfirm = function ({ title, body, word = 'VERWIJDER', confirmText = 'Permanent verwijderen', onConfirm }) {
    const m = KA.modal({
      card: `<div class="ico ico--danger"><i data-lucide="trash-2"></i></div>
        <h2 class="serif">${esc(title)}</h2>
        <p class="muted" style="font-size:.9rem;margin:0">${body} Typ <b style="color:var(--ink)">${esc(word)}</b> om te bevestigen.</p>
        <div class="field" style="margin:16px 0 0"><input class="in js-in" placeholder="${esc(word)}" autocomplete="off" /></div>
        <div class="modal__foot"><button class="b b--ghost" data-close>Annuleren</button>
        <button class="b b--danger js-ok" disabled>${esc(confirmText)}</button></div>`,
    });
    const inp = m.card.querySelector('.js-in'), ok = m.card.querySelector('.js-ok');
    inp.focus();
    inp.oninput = () => { ok.disabled = inp.value.trim() !== word; };
    ok.onclick = () => { if (ok.disabled) return; ok.classList.add('loading', 'ondk'); setTimeout(() => { if (onConfirm) onConfirm(); m.close(); }, 500); };
    return m;
  };

  /* ---------- generic drawer (P-02 / P-03) ---------- */
  let drawerDirty = null;
  KA.openDrawer = function ({ title, subtitle, avatar, body, onClose, dirtyCheck }) {
    const d = document.getElementById('drawer');
    const slot = document.getElementById('drawerBody');
    drawerDirty = dirtyCheck || null;
    let head = '';
    if (avatar) head = `<span class="av av--txt" style="width:44px;height:44px;font-size:1rem">${esc(avatar)}</span>`;
    else if (avatar === '') head = '';
    slot.innerHTML = `<div class="dw-head">${head}<div><h2 class="serif" style="margin:0;font-size:1.3rem">${title}</h2>${subtitle ? `<span class="muted" style="font-size:.85rem">${subtitle}</span>` : ''}</div></div>`;
    if (typeof body === 'string') slot.insertAdjacentHTML('beforeend', body); else if (body) slot.appendChild(body);
    d._onClose = onClose || null;
    d.classList.add('on'); ic();
    return slot;
  };
  KA.closeDrawer = function (force) {
    const d = document.getElementById('drawer');
    if (!d.classList.contains('on')) return;
    if (!force && drawerDirty && drawerDirty()) {
      KA.discardGuard(() => KA.closeDrawer(true));
      return;
    }
    d.classList.remove('on');
    const cb = d._onClose; d._onClose = null; drawerDirty = null;
    if (cb) cb();
  };

  /* ---------- P-20 · unsaved-changes guard ---------- */
  KA.discardGuard = function (onDiscard) {
    KA.confirm({
      title: 'Niet-opgeslagen wijzigingen', icon: 'alert-circle',
      body: 'Je hebt wijzigingen die nog niet bewaard zijn. Weggooien?',
      confirmText: 'Weggooien', cancelText: 'Blijven', danger: true, onConfirm: onDiscard,
    });
  };

  /* ---------- P-01 · form save lifecycle ---------- */
  // root must contain .js-save, optional .js-cancel, optional .js-dirty
  KA.form = function (root, { validate, onSave, baseline, onCancel }) {
    const saveBtn = root.querySelector('.js-save');
    const cancelBtn = root.querySelector('.js-cancel');
    const dirtyEl = root.querySelector('.js-dirty');
    const snapshot = () => Array.from(root.querySelectorAll('input,textarea,select')).map((f) => f.type === 'checkbox' ? f.checked : f.value).join('\u0001');
    let base = baseline != null ? baseline : snapshot();
    const isDirty = () => snapshot() !== base;
    const sync = () => {
      const d = isDirty();
      if (dirtyEl) dirtyEl.classList.toggle('on', d);
      if (saveBtn) saveBtn.disabled = !d;
    };
    root.addEventListener('input', sync); root.addEventListener('change', sync); sync();
    const clearErrs = () => root.querySelectorAll('.field.bad').forEach((f) => f.classList.remove('bad'));
    if (saveBtn) saveBtn.onclick = () => {
      clearErrs();
      const errs = validate ? validate(root) : null;
      if (errs && Object.keys(errs).length) {
        let first = null;
        Object.keys(errs).forEach((name) => {
          const field = root.querySelector('[data-f="' + name + '"]');
          if (field) { field.classList.add('bad'); const e = field.querySelector('.ferr'); if (e) e.lastChild.textContent = ' ' + errs[name]; if (!first) first = field; }
        });
        if (first) { const inp = first.querySelector('input,textarea,select'); if (inp) inp.focus(); }
        return;
      }
      saveBtn.classList.add('loading');
      setTimeout(() => {
        saveBtn.classList.remove('loading');
        const ok = onSave ? onSave(root) : true;
        if (ok !== false) { base = snapshot(); sync(); }
      }, 480);
    };
    if (cancelBtn) cancelBtn.onclick = () => { if (isDirty()) KA.discardGuard(() => { if (onCancel) onCancel(); }); else if (onCancel) onCancel(); };
    return { isDirty, reset: () => { base = snapshot(); sync(); }, sync };
  };

  /* ---------- P-16 · segmented control ---------- */
  KA.wireSeg = function (segEl, onChange) {
    segEl.querySelectorAll('button').forEach((btn, i) => {
      btn.onclick = () => {
        if (btn.classList.contains('on')) return;
        segEl.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
        btn.classList.add('on'); onChange(i, btn);
      };
    });
  };

  /* ---------- P-07 · toggle switch ---------- */
  KA.makeToggle = function (on, onChange) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'sw' + (on ? ' on' : ''); b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', on);
    b.onclick = () => {
      const next = !b.classList.contains('on');
      b.classList.toggle('on', next); b.setAttribute('aria-checked', next);
      const ok = onChange ? onChange(next) : true;
      if (ok === false) { b.classList.toggle('on', !next); b.setAttribute('aria-checked', !next); } // revert
    };
    return b;
  };

  /* ---------- P-17 · date nav helpers ---------- */
  KA.dateLabel = function (date, view) {
    const d = KA.DAYS_SHORT[(date.getDay() + 6) % 7];
    if (view === 'week') {
      const mon = new Date(date); mon.setDate(date.getDate() - ((date.getDay() + 6) % 7));
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      return mon.getDate() + ' – ' + sun.getDate() + ' ' + KA.MONTHS[sun.getMonth()] + ' ' + sun.getFullYear();
    }
    if (view === 'month') return KA.MONTHS[date.getMonth()].replace(/^./, (c) => c.toUpperCase()) + ' ' + date.getFullYear();
    return d + ' ' + date.getDate() + ' ' + KA.MONTHS[date.getMonth()] + ' ' + date.getFullYear();
  };
  KA.openDatePicker = function (anchor, date, onPick, opts = {}) {
    document.querySelectorAll('.pop').forEach((p) => p.remove());
    const pop = document.createElement('div'); pop.className = 'pop';
    let view = new Date(date.getFullYear(), date.getMonth(), 1);
    const render = () => {
      const y = view.getFullYear(), mo = view.getMonth();
      const first = (new Date(y, mo, 1).getDay() + 6) % 7;
      const days = new Date(y, mo + 1, 0).getDate();
      let cells = KA.DAYS_SHORT.map((d) => `<div class="dd dow">${d}</div>`).join('');
      for (let i = 0; i < first; i++) cells += '<div></div>';
      for (let d = 1; d <= days; d++) {
        const cur = new Date(y, mo, d);
        const sel = cur.toDateString() === date.toDateString();
        const over = opts.maxDate && cur > opts.maxDate;
        cells += `<button class="dd${sel ? ' sel' : ''}${over ? ' dim' : ''}" ${over ? 'disabled' : ''} data-d="${d}">${d}</button>`;
      }
      pop.innerHTML = `<div class="pop__nav"><button data-mv="-1"><i data-lucide="chevron-left"></i></button><b>${KA.MONTHS[mo].replace(/^./, (c) => c.toUpperCase())} ${y}</b><button data-mv="1"><i data-lucide="chevron-right"></i></button></div><div class="pop__grid">${cells}</div>`;
      ic();
      pop.querySelectorAll('[data-mv]').forEach((b) => (b.onclick = () => { view.setMonth(view.getMonth() + (+b.dataset.mv)); render(); }));
      pop.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => { onPick(new Date(y, mo, +b.dataset.d)); cleanup(); }));
    };
    render();
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.top = (r.bottom + window.scrollY + 6) + 'px';
    pop.style.left = Math.max(8, Math.min(r.left + window.scrollX, window.innerWidth - 272)) + 'px';
    const cleanup = () => { pop.remove(); document.removeEventListener('click', out, true); };
    const out = (e) => { if (!pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) cleanup(); };
    setTimeout(() => document.addEventListener('click', out, true), 0);
  };

  /* ---------- P-09 · export with status ---------- */
  KA.exportSheet = function ({ title = 'Exporteren', sections, allowFormats = ['CSV', 'XLSX', 'PDF'], onEmpty } = {}) {
    const secRows = (sections || []).map((s, i) =>
      `<label class="toggle-row" style="cursor:pointer"><input type="checkbox" class="ck js-sec" ${i === 0 || s.on ? 'checked' : ''}><span class="tt"><b>${esc(s.label)}</b>${s.hint ? `<small>${esc(s.hint)}</small>` : ''}</span></label>`).join('');
    const m = KA.modal({
      wide: true,
      card: `<h2 class="serif">${esc(title)}</h2>
        <p class="muted" style="font-size:.88rem;margin:2px 0 16px">Kies formaat en wat je wil meenemen.</p>
        <div class="js-stage1">
          <div class="field" data-f="fmt"><label class="lbl">Formaat</label><div class="seg js-fmt">${allowFormats.map((f, i) => `<button class="${i === 0 ? 'on' : ''}">${f}</button>`).join('')}</div></div>
          <div class="dw-sec"><label class="lbl">Wat exporteren</label>${secRows}</div>
          <div class="modal__foot"><button class="b b--ghost grow js-all" type="button">Alles aanvinken</button><button class="b b--ghost" data-close>Annuleren</button><button class="b b--gold js-go"><i data-lucide="download"></i> Exporteer</button></div>
        </div>
        <div class="js-stage2" hidden>
          <div class="prog"><i></i></div><div class="logline js-log"></div>
        </div>`,
    });
    KA.wireSeg(m.card.querySelector('.js-fmt'), () => {});
    m.card.querySelector('.js-all').onclick = () => m.card.querySelectorAll('.js-sec').forEach((c) => (c.checked = true));
    m.card.querySelector('.js-go').onclick = () => {
      const chosen = Array.from(m.card.querySelectorAll('.js-sec')).filter((c) => c.checked).length;
      if (!chosen) { KA.toast('Niets gekozen om te exporteren.', { type: 'err' }); return; }
      const fmt = m.card.querySelector('.js-fmt .on').textContent;
      m.card.querySelector('.js-stage1').hidden = true;
      m.card.querySelector('.js-stage2').hidden = false;
      const bar = m.card.querySelector('.prog > i'); const log = m.card.querySelector('.js-log');
      let p = 0; log.innerHTML = '<div>Bestand opbouwen…</div>';
      const t = setInterval(() => {
        p += 22 + Math.random() * 20; if (p >= 100) p = 100;
        bar.style.width = p + '%';
        if (p >= 100) { clearInterval(t); log.innerHTML += `<div class="ok">Klaar — kameraad-export.${fmt.toLowerCase()} gedownload.</div>`;
          setTimeout(() => { m.close(); KA.toast('Export klaar — bestand gedownload.', { type: 'ok' }); }, 700); }
      }, 320);
    };
    return m;
  };

  /* ---------- P-22 · conflict resolution ---------- */
  // conflicts: [{label, sub}]. onApply(choices[]) where choice = 'keep'|'cancel'
  KA.conflictModal = function ({ changeLabel, conflicts, onApply, onCancel }) {
    const rows = conflicts.map((c, i) =>
      `<div class="conflict__row"><div class="ci"><b>${esc(c.label)}</b><small>${esc(c.sub || '')}</small></div>
       <div class="seg" data-i="${i}"><button class="on" data-v="keep">Behoud</button><button data-v="cancel">Annuleer + mail</button></div></div>`).join('');
    const m = KA.modal({
      wide: true,
      card: `<div class="ico ico--warn"><i data-lucide="calendar-x"></i></div>
        <h2 class="serif">Overlappende afspraken</h2>
        <p class="muted" style="font-size:.9rem;margin:0 0 8px">${esc(changeLabel)} overlapt met ${conflicts.length} bevestigde afspraak(en). Kies per afspraak — nooit stil.</p>
        <div class="conflict">${rows}</div>
        <div class="modal__foot"><button class="b b--ghost" data-close>Wijziging annuleren</button><button class="b b--gold js-apply"><i data-lucide="check"></i> Toepassen</button></div>`,
      onClose: () => { if (onCancel) onCancel(); },
    });
    m.card.querySelectorAll('.seg').forEach((s) => KA.wireSeg(s, () => {}));
    m.card.querySelector('.js-apply').onclick = () => {
      const choices = Array.from(m.card.querySelectorAll('.seg')).map((s) => s.querySelector('.on').dataset.v);
      m._applied = true; m.close();
      const cancels = choices.filter((c) => c === 'cancel').length;
      if (onApply) onApply(choices);
      KA.toast(cancels ? `Bewaard — ${cancels} klant(en) gemaild.` : 'Bewaard.', { type: 'ok' });
    };
    // override onClose so cancel-fires only if not applied
    const origClose = m.close;
    return m;
  };

  /* ---------- RBAC ---------- */
  KA.setRole = function (role) {
    KA.state.role = role;
    document.body.classList.toggle('role-barber', role === 'barber');
    const u = document.querySelector('.sb__user .rl'); if (u) u.textContent = role === 'owner' ? 'Eigenaar' : 'Barbier';
    // if barber lands on an owner-only screen, bounce to vandaag
    if (role === 'barber') {
      const cur = (location.hash || '#vandaag').slice(1);
      if (['diensten', 'instellingen', 'banner', 'mailing', 'beheerders'].includes(cur)) location.hash = '#vandaag';
    }
  };

  /* ---------- responsive sidebar ---------- */
  KA.wireResponsive = function () {
    const sb = document.getElementById('sb');
    const burger = document.querySelector('.burger');
    let scrim = document.querySelector('.scrim-sb');
    if (!scrim) { scrim = document.createElement('div'); scrim.className = 'scrim-sb'; document.body.appendChild(scrim); }
    const openSb = () => { sb.classList.add('open'); scrim.classList.add('on'); };
    const closeSb = () => { sb.classList.remove('open'); scrim.classList.remove('on'); };
    if (burger) burger.onclick = openSb;
    scrim.onclick = closeSb;
    sb.querySelectorAll('a[data-route]').forEach((a) => a.addEventListener('click', closeSb));
  };
})();
