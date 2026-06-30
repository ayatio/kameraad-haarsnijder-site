/* ============================================================
   Kameraad Admin — screen renderers (state → DOM)
   Each dynamic screen rebuilds from KA.state so every edit shows.
   ============================================================ */
(function () {
  const KA = (window.KA = window.KA || {});
  const esc = KA.esc, ic = KA.icons;
  const statusBadge = (s) => ({
    confirmed: '<span class="bdg bdg--ok"><span class="dot" style="background:#2e6b4f"></span> Bevestigd</span>',
    completed: '<span class="bdg bdg--info">Voltooid</span>',
    noshow: '<span class="bdg bdg--fail">No-show</span>',
    cancelled: '<span class="bdg bdg--mut">Geannuleerd</span>',
  }[s] || '');
  const thumbMini = (r) => `<span class="thumb ${r === 'up' ? 'up' : r === 'down' ? 'down' : 'none'}" style="width:22px;height:22px;font-size:.72rem">${r === 'up' ? '👍' : r === 'down' ? '👎' : '·'}</span>`;
  KA.statusBadge = statusBadge;

  /* ---------- VANDAAG ---------- */
  KA.renderVandaag = function () {
    const tb = document.getElementById('vandaagRows'); if (!tb) return;
    const list = KA.state.appts;
    tb.innerHTML = list.map((a) => {
      const pref = a.pref ? '<span class="bdg bdg--warn" style="margin-left:6px">Geen voorkeur</span>' : '';
      return `<tr data-appt="${a.id}"><td class="num" data-l="Tijd">${a.start}</td><td data-l="Klant">${esc(KA.apptCustName(a))}</td><td data-l="Dienst">${esc(KA.service(a.sv).name)}</td><td data-l="Barbier">${esc(KA.barber(a.barber).name)}${pref}</td><td data-l="Status">${statusBadge(a.status)} ${a.rating ? thumbMini(a.rating) : ''}</td></tr>`;
    }).join('');
    const cnt = document.getElementById('vandaagCount'); if (cnt) cnt.textContent = list.length + ' afspraken';
    const togo = list.filter((a) => a.status === 'confirmed').length;
    const k = document.getElementById('kpiTodo'); if (k) k.textContent = togo + ' nog te gaan';
    ic();
  };

  /* ---------- AGENDA ---------- */
  KA.agenda = { date: new Date(2026, 5, 30), view: 'day', filter: 'all' };

  function freeBands(barberId, date) {
    const b = KA.barber(barberId);
    const wd = (date.getDay() + 6) % 7;
    const windows = (b.hours[wd] || []).map((w) => ({ s: KA.toMin(w.s), e: KA.toMin(w.e) }));
    const occ = KA.state.appts.filter((a) => a.barber === barberId && a.status !== 'cancelled').map((a) => ({ s: KA.toMin(a.start), e: KA.toMin(a.start) + a.dur }));
    KA.state.blocks.filter((bl) => !bl.allday && bl.day === '2026-06-30' && (bl.who === barberId)).forEach((bl) => occ.push({ s: KA.toMin(bl.start), e: KA.toMin(bl.end) }));
    occ.sort((x, y) => x.s - y.s);
    const bands = [];
    windows.forEach((w) => {
      let cur = w.s;
      occ.filter((o) => o.e > w.s && o.s < w.e).forEach((o) => { if (o.s > cur) bands.push({ s: cur, e: o.s }); cur = Math.max(cur, o.e); });
      if (cur < w.e) bands.push({ s: cur, e: w.e });
    });
    return bands.filter((x) => x.e - x.s >= 20);
  }

  function dayGrid() {
    const date = KA.agenda.date;
    let cols = KA.barbersSorted().filter((b) => b.active);
    if (KA.agenda.filter !== 'all') cols = cols.filter((b) => b.id === KA.agenda.filter);
    const open = KA.agendaOpenMin, pph = KA.pxPerHour;
    const posY = (min) => ((min - open) / 60) * pph;
    const rail = [];
    for (let h = 10; h <= 19; h++) rail.push(`<div class="hr">${h}:00</div>`);
    let html = `<div class="ag" style="grid-template-columns:60px repeat(${cols.length},1fr)"><div class="ag__corner"></div>`;
    cols.forEach((b) => (html += `<div class="ag__col-h"><span class="av av--txt" style="width:24px;height:24px;font-size:.58rem">${esc(b.name[0])}</span> ${esc(b.name)}</div>`));
    html += `<div class="ag__rail">${rail.join('')}</div>`;
    cols.forEach((b) => {
      html += `<div class="ag__lane" data-lane="${b.id}">`;
      // free bands
      freeBands(b.id, date).forEach((f) => {
        html += `<div class="ev ev--free" data-free="${b.id}" data-min="${f.s}" style="top:${posY(f.s)}px;height:${((f.e - f.s) / 60) * pph}px">Vrij · klik om te boeken</div>`;
      });
      // blocks
      KA.state.blocks.filter((bl) => !bl.allday && bl.day === '2026-06-30' && bl.who === b.id).forEach((bl) => {
        const top = posY(KA.toMin(bl.start)), h = ((KA.toMin(bl.end) - KA.toMin(bl.start)) / 60) * pph;
        html += `<div class="ev ev--block" data-block="${bl.id}" style="top:${top}px;height:${h}px"><b>${esc(bl.label)}</b><span class="s">${bl.start}–${bl.end}</span></div>`;
      });
      // appointments
      KA.state.appts.filter((a) => a.barber === b.id && a.status !== 'cancelled').forEach((a) => {
        const sv = KA.service(a.sv); const top = posY(KA.toMin(a.start)); const h = (a.dur / 60) * pph;
        const dim = a.status === 'noshow' ? 'opacity:.5;' : '';
        const txt = (sv.color === '#E8B84B' || sv.color === '#C9A24B') ? '#3a2a06' : '#fff';
        html += `<div class="ev" data-appt="${a.id}" style="top:${top}px;height:${Math.max(h, 30)}px;background:${sv.color};color:${txt};${dim}"><b>${esc(KA.apptCustName(a))}</b><span class="s">${esc(sv.name)} · ${a.start}</span></div>`;
      });
      html += `</div>`;
    });
    html += `</div>`;
    return html;
  }

  function weekGrid() {
    const date = KA.agenda.date;
    const mon = new Date(date); mon.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    const open = KA.agendaOpenMin, pph = 46;
    const posY = (min) => ((min - open) / 60) * pph;
    let head = `<div class="ag-week"><div class="ag__corner"></div>`;
    const days = [];
    for (let i = 0; i < 7; i++) { const d = new Date(mon); d.setDate(mon.getDate() + i); days.push(d); const today = d.toDateString() === KA.today.toDateString();
      head += `<div class="wh${today ? ' today' : ''}">${KA.DAYS_SHORT[i]}<small>${d.getDate()}</small></div>`; }
    head += `<div class="ag__rail" style="">`;
    for (let h = 10; h <= 19; h++) head += `<div class="hr" style="height:${pph}px">${h}:00</div>`;
    head += `</div>`;
    days.forEach((d) => {
      head += `<div class="wcol" data-day="${d.toISOString().slice(0, 10)}">`;
      if (d.toDateString() === KA.today.toDateString()) {
        let appts = KA.state.appts.filter((a) => a.status !== 'cancelled');
        if (KA.agenda.filter !== 'all') appts = appts.filter((a) => a.barber === KA.agenda.filter);
        appts.forEach((a) => { const sv = KA.service(a.sv); const txt = (sv.color === '#E8B84B' || sv.color === '#C9A24B') ? '#3a2a06' : '#fff';
          head += `<div class="ev" data-appt="${a.id}" style="top:${posY(KA.toMin(a.start))}px;height:${Math.max((a.dur / 60) * pph, 26)}px;background:${sv.color};color:${txt}"><b>${esc(KA.apptCustName(a))}</b></div>`; });
      }
      head += `</div>`;
    });
    head += `</div>`;
    return head;
  }

  function monthGrid() {
    const date = KA.agenda.date;
    const y = date.getFullYear(), mo = date.getMonth();
    const first = (new Date(y, mo, 1).getDay() + 6) % 7;
    const days = new Date(y, mo + 1, 0).getDate();
    let html = `<div class="ag-month">` + KA.DAYS_SHORT.map((d) => `<div class="mh">${d}</div>`).join('');
    for (let i = 0; i < first; i++) html += `<div class="mc out"></div>`;
    for (let d = 1; d <= days; d++) {
      const cur = new Date(y, mo, d); const today = cur.toDateString() === KA.today.toDateString();
      const count = today ? KA.state.appts.filter((a) => a.status !== 'cancelled').length : 0;
      html += `<div class="mc${today ? ' today' : ''}" data-day="${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}"><div class="dn">${d}</div><div class="mcount ${count ? '' : 'zero'}">${count ? count + ' afspr.' : '—'}</div></div>`;
    }
    html += `</div>`;
    return html;
  }

  KA.renderAgenda = function () {
    const mount = document.getElementById('agGrid'); if (!mount) return;
    const v = KA.agenda.view;
    mount.innerHTML = v === 'week' ? weekGrid() : v === 'month' ? monthGrid() : dayGrid();
    const lbl = document.getElementById('agLabel'); if (lbl) lbl.textContent = KA.dateLabel(KA.agenda.date, v);
    const fb = document.getElementById('agFilterLabel');
    if (fb) fb.textContent = KA.agenda.filter === 'all' ? 'Alle barbiers' : KA.barber(KA.agenda.filter).name;
    ic();
  };

  /* ---------- KLANTEN ---------- */
  KA.renderKlanten = function (q) {
    const tb = document.getElementById('customerRows'); if (!tb) return;
    q = (q || '').trim().toLowerCase();
    let list = KA.state.customers;
    if (q) list = list.filter((c) => (c.name + ' ' + c.email + ' ' + c.phone).toLowerCase().includes(q));
    if (!list.length) {
      tb.innerHTML = `<tr><td colspan="7"><div class="empty"><i data-lucide="${q ? 'search-x' : 'users'}"></i><h3>${q ? 'Geen resultaten' : 'Nog geen klanten'}</h3><p class="muted">${q ? 'Pas je zoekopdracht aan of ' : ''}${q ? '<a href="#" class="js-clear gold">wis de filter</a>.' : 'Klanten verschijnen hier na hun eerste boeking.'}</p></div></td></tr>`;
      ic(); return;
    }
    const optLabel = (o) => { const parts = []; if (o.reminders) parts.push('Herinneringen'); if (o.rebook) parts.push('Herboeking'); if (o.marketing) parts.push('Marketing'); return parts.length ? (parts.length === 3 ? 'Alle' : parts.join(' · ')) : 'Geen'; };
    tb.innerHTML = list.map((c) => `<tr data-cust="${c.id}">
      <td class="ckcell" data-owner-only><input type="checkbox" class="ck js-crow" data-id="${c.id}" onclick="event.stopPropagation()"></td>
      <td data-l="Klant"><div class="who"><span class="av av--txt">${esc(KA.initials(c.name))}</span> ${esc(c.name)}</div></td>
      <td class="muted" data-l="Contact">${esc(c.email)}<br>${esc(c.phone)}</td>
      <td data-l="Laatste">${c.history[0] ? esc(c.history[0].date) : '—'}</td>
      <td class="num" data-l="Bezoeken">${c.visits}</td>
      <td class="num" data-l="No-shows">${c.noshows}</td>
      <td data-l="Opt-ins"><span class="bdg bdg--mut">${optLabel(c.optins)}</span></td></tr>`).join('');
    ic();
  };

  /* ---------- BARBIERS ---------- */
  KA.renderBarbiers = function () {
    const tb = document.getElementById('barbiersRows'); if (!tb) return;
    tb.innerHTML = KA.barbersSorted().map((b) => {
      const today = KA.state.appts.filter((a) => a.barber === b.id && a.status !== 'cancelled').length;
      const cnt = b.services.length, total = KA.activeServices().length;
      return `<tr data-barber="${b.id}" draggable="true">
        <td style="width:24px;color:var(--stone);cursor:grab" class="js-grip" data-l=""><i data-lucide="grip-vertical"></i></td>
        <td data-l="Barbier"><div class="who"><img class="av" src="${b.photo}" alt=""> ${esc(b.name)}</div></td>
        <td data-l="Diensten"><a href="#" class="js-tomatrix gold" data-id="${b.id}">${cnt} van ${total}</a></td>
        <td class="num" data-l="Vandaag">${today}</td>
        <td data-l="Status">${b.active ? '<span class="bdg bdg--ok">Actief</span>' : '<span class="bdg bdg--mut">Inactief</span>'}</td>
        <td style="text-align:right" data-l=""><button class="b b--ghost b--sm js-edit-barber" data-id="${b.id}">Bewerk</button></td></tr>`;
    }).join('');
    ic();
  };

  /* ---------- DIENSTEN + MATRIX ---------- */
  KA.renderDiensten = function () {
    const tb = document.getElementById('dienstenRows'); if (!tb) return;
    const all = [...KA.state.services].sort((a, b) => a.order - b.order);
    tb.innerHTML = all.map((s) => {
      if (s.walkin) return `<tr data-svc="${s.id}"><td data-l="Dienst"><div class="who"><span class="dot" style="width:11px;height:11px;background:${s.color}"></span> ${esc(s.name)}</div></td><td data-l="Duur">—</td><td class="num" data-l="Prijs">—</td><td data-l="Status"><span class="bdg bdg--mut">Info · niet boekbaar</span></td><td style="text-align:right" data-l=""><button class="b b--ghost b--sm js-edit-svc" data-id="${s.id}">Bewerk</button></td></tr>`;
      return `<tr data-svc="${s.id}"><td data-l="Dienst"><div class="who"><span class="dot" style="width:11px;height:11px;background:${s.color}"></span> ${esc(s.name)}</div></td><td data-l="Duur">${s.dur} min</td><td class="num" data-l="Prijs">${KA.euro(s.price)}</td><td data-l="Status">${s.active ? '<span class="bdg bdg--ok">Actief</span>' : '<span class="bdg bdg--mut">Inactief</span>'}</td><td style="text-align:right" data-l=""><button class="b b--ghost b--sm js-edit-svc" data-id="${s.id}">Bewerk</button></td></tr>`;
    }).join('');
    // matrix
    const head = document.getElementById('matrixHead'), rows = document.getElementById('matrixRows');
    if (head && rows) {
      const bs = KA.barbersSorted();
      head.innerHTML = `<tr><th>Dienst</th>${bs.map((b) => `<th style="text-align:center">${esc(b.name)}</th>`).join('')}</tr>`;
      rows.innerHTML = KA.activeServices().map((s) => `<tr><td>${esc(s.name)}</td>${bs.map((b) => {
        const has = b.services.includes(s.id);
        return `<td style="text-align:center"><button class="js-cell" data-b="${b.id}" data-s="${s.id}" style="background:none;border:none;cursor:pointer;padding:6px">${has ? '<i data-lucide="check" style="color:#2e6b4f"></i>' : '<span class="muted">–</span>'}</button></td>`;
      }).join('')}</tr>`).join('');
    }
    ic();
  };

  /* ---------- BEHEERDERS ---------- */
  KA.renderBeheerders = function () {
    const tb = document.getElementById('beheerdersRows'); if (!tb) return;
    const statusB = (a) => ({ active: '<span class="bdg bdg--ok">Actief</span>', invited: '<span class="bdg bdg--warn">Uitgenodigd</span>', expired: '<span class="bdg bdg--fail">Verlopen</span>', inactive: '<span class="bdg bdg--mut">Inactief</span>' }[a.status]);
    tb.innerHTML = KA.state.admins.map((a) => {
      let actions = `<button class="b b--ghost b--sm js-admin-edit" data-id="${a.id}">Beheer</button>`;
      return `<tr data-admin="${a.id}"><td data-l="Naam">${esc(a.name)}</td><td class="muted" data-l="E-mail">${esc(a.email)}</td><td data-l="Rol">${a.role === 'owner' ? '<span class="bdg bdg--info">Eigenaar</span>' : '<span class="bdg bdg--mut">Barbier</span>'}</td><td data-l="Gekoppeld">${a.linked ? esc(KA.barber(a.linked).name) : '—'}</td><td data-l="Laatste login">${esc(a.last)}</td><td data-l="Status">${statusB(a)}</td><td style="text-align:right" data-l="">${actions}</td></tr>`;
    }).join('');
    ic();
  };

  /* ---------- BESCHIKBAARHEID ---------- */
  KA.besch = { scope: 'b-avraz' }; // barber id | 'all' | 'shop'
  KA.renderBeschikbaarheid = function () {
    const panel = document.getElementById('hoursPanel'); if (!panel) return;
    const sc = KA.besch.scope;
    let hours, title, sub;
    if (sc === 'shop') { hours = KA.state.shopHours; title = 'Openingsuren van de zaak'; sub = 'Publiek zichtbaar op de site'; }
    else if (sc === 'all') { hours = KA.barber('b-avraz').hours; title = 'Weekuren · Alle barbiers'; sub = 'Opslaan geldt voor alle 4 barbiers'; }
    else { hours = KA.barber(sc).hours; title = 'Weekuren · ' + KA.barber(sc).name; sub = 'Max. 2 vensters per dag'; }
    const win = (w) => w && w.length ? w.map((x) => `${x.s} – ${x.e}`) : null;
    const rows = KA.DAYS.map((d, i) => {
      const w = win(hours[i]);
      const lab = sc === 'shop' && (!hours[i] || !hours[i].length) ? `<span class="muted">${esc(KA.state.closedLabels[i] || 'Gesloten')}</span>` : '';
      const c1 = w ? w[0] : (lab || '<span class="muted">Gesloten</span>');
      const c2 = w && w[1] ? w[1] : '<span class="muted">—</span>';
      const action = sc === 'shop' ? `<button class="b b--ghost b--sm js-edit-day" data-d="${i}">${w ? 'Bewerk' : 'Open'}</button>`
        : `<button class="b b--ghost b--sm js-edit-day" data-d="${i}">${w ? 'Bewerk' : 'Open'}</button>`;
      return `<tr><td data-l="Dag">${d}</td><td data-l="Venster 1">${c1}</td><td data-l="Venster 2">${c2}</td><td style="text-align:right" data-l="">${action}</td></tr>`;
    }).join('');
    const copyBtn = (sc !== 'shop' && sc !== 'all') ? `<button class="b b--ghost b--sm js-copy-hours"><i data-lucide="copy"></i> Kopieer naar…</button>` : '';
    panel.innerHTML = `<div class="panel"><div class="panel__h"><h2>${title}</h2><div class="r"><span class="muted" style="font-size:.82rem">${sub}</span>${copyBtn}</div></div>
      <div class="panel__b flush"><table class="t collapse"><thead><tr><th>Dag</th><th>Venster 1</th><th>Venster 2</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    // blocks
    const bp = document.getElementById('blocksPanel');
    if (bp) {
      const bl = KA.state.blocks.filter((b) => b.allday || b.id !== 'bl-pauze');
      const blRows = bl.map((b) => `<tr data-block="${b.id}"><td data-l="Periode">${esc(b.range || (b.day + ' · ' + (b.allday ? 'hele dag' : b.start + '–' + b.end)))}</td><td data-l="Reden">${esc(b.label)}</td><td data-l="Wie">${b.who === 'all' ? '<span class="bdg bdg--mut">Alle barbiers</span>' : '<span class="bdg bdg--info">' + esc(KA.barber(b.who).name) + '</span>'}</td><td style="text-align:right" data-l=""><button class="b b--ghost b--sm js-del-block" data-id="${b.id}"><i data-lucide="trash-2"></i></button></td></tr>`).join('');
      bp.innerHTML = `<div class="panel"><div class="panel__h"><h2>Geblokkeerde periodes</h2></div><div class="panel__b flush">${bl.length ? `<table class="t collapse"><thead><tr><th>Periode</th><th>Reden</th><th>Wie</th><th></th></tr></thead><tbody>${blRows}</tbody></table>` : `<div class="empty"><i data-lucide="calendar-off"></i><h3>Geen blokkades</h3><p class="muted">Voeg verlof of een feestdag toe met <b>+ Blokkade</b>.</p></div>`}</div></div>`;
    }
    ic();
  };

  /* ---------- STATISTIEKEN ---------- */
  KA.stats = { view: 'week' };
  KA.renderStatistieken = function () {
    const pb = document.getElementById('statPerBarber');
    if (pb) pb.innerHTML = KA.barbersSorted().map((b, i) => {
      const seed = [11, 9, 9, 8][i] || 6;
      return `<tr data-barber="${b.id}"><td data-l="Barbier"><div class="who"><span class="av av--txt" style="width:26px;height:26px;font-size:.6rem">${esc(b.name[0])}</span> ${esc(b.name)}</div></td><td class="num" data-l="Boekingen">${seed}</td><td class="num" data-l="Voltooid">${seed - (i % 2)}</td><td class="num" data-l="No-shows">${i % 2}</td><td class="num" data-l="Omzet">${KA.euro([420, 360, 250, 210][i] || 180)}</td></tr>`;
    }).join('');
    const pd = document.getElementById('statPerDienst');
    if (pd) pd.innerHTML = KA.activeServices().map((s, i) => {
      const n = [14, 7, 9, 5, 2][i] || 3;
      return `<tr><td data-l="Dienst"><div class="who"><span class="dot" style="width:10px;height:10px;background:${s.color}"></span> ${esc(s.name)}</div></td><td class="num" data-l="Boekingen">${n}</td><td class="num" data-l="Omzet">${KA.euro(n * s.price)}</td></tr>`;
    }).join('');
    const fb = KA.feedbackStats();
    const sat = document.getElementById('statSat');
    if (sat) sat.innerHTML = `<div class="l"><i data-lucide="smile"></i> Tevredenheid</div><div class="n">${fb.pct == null ? '—' : fb.pct + '%'}</div><div class="d">${fb.up} 👍 · ${fb.down} 👎 deze periode</div>`;
    ic();
  };
})();
