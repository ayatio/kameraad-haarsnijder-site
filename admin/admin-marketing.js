/* ============================================================
   Kameraad Admin — Advertenties / Marketing (S-15, owner-only)
   €200/month ad-budget log: entries (period · channel · spend ·
   note · link) + a monthly report (besteed vs budget). Reads/writes
   marketing_spend + the ad_budget_monthly_cents setting via the
   owner session. Audit is written by a DB trigger.
   ============================================================ */
(function () {
  'use strict';
  var KA = (window.KA = window.KA || {});
  var URL = 'https://hzvhyslujvkwqpkevahj.supabase.co';
  var KEY = 'sb_publishable_s7EpcEpv2hdZiNgufSWLlQ_xsGOifv_';
  // Reuse the admin's single authenticated client (KA.SB); fall back to a fresh one.
  var sb = (window.KA && KA.SB) || (window.supabase ? window.supabase.createClient(URL, KEY) : null);
  var ic = KA.icons || function () { if (window.lucide) lucide.createIcons(); };
  var CHANNELS = [['instagram', 'Instagram'], ['meta', 'Meta Ads'], ['google', 'Google'], ['flyer', 'Flyer'], ['other', 'Andere']];
  var MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

  var M = { month: new Date(2026, 6, 1), budgetCents: 20000, rows: [] };
  function esc(s) { return ('' + (s == null ? '' : s)).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function eur(c) { return '€' + (c % 100 === 0 ? c / 100 : (c / 100).toFixed(2)); }
  function ymd(d) { return d.toLocaleDateString('en-CA'); }
  function monthBounds() { var s = new Date(M.month.getFullYear(), M.month.getMonth(), 1); var e = new Date(M.month.getFullYear(), M.month.getMonth() + 1, 1); return [ymd(s), ymd(e)]; }
  function chLabel(v) { for (var i = 0; i < CHANNELS.length; i++) if (CHANNELS[i][0] === v) return CHANNELS[i][1]; return v; }

  function load() {
    if (!sb) return Promise.resolve();
    var b = monthBounds();
    return Promise.all([
      sb.from('settings').select('value').eq('key', 'ad_budget_monthly_cents').maybeSingle(),
      sb.from('marketing_spend').select('*').gte('period_start', b[0]).lt('period_start', b[1]).order('period_start', { ascending: false })
    ]).then(function (res) {
      if (res[0].data) M.budgetCents = Number(res[0].data.value) || 20000;
      M.rows = res[1].data || [];
    });
  }

  KA.renderAdvertenties = function () {
    var root = document.getElementById('v-advertenties'); if (!root) return;
    root.innerHTML = '<div class="empty" style="padding:40px"><i data-lucide="loader"></i><p class="muted">Laden…</p></div>'; ic();
    load().then(function () { paint(root); });
  };

  function paint(root) {
    var besteed = M.rows.reduce(function (a, r) { return a + (r.spend_cents || 0); }, 0);
    var rest = M.budgetCents - besteed;
    var over = besteed > M.budgetCents;
    var pct = Math.min(100, M.budgetCents ? Math.round(besteed / M.budgetCents * 100) : 0);
    var label = MONTHS[M.month.getMonth()] + ' ' + M.month.getFullYear();

    var rows = M.rows.length ? M.rows.map(function (r) {
      var per = r.period_end ? (r.period_start + ' → ' + r.period_end) : r.period_start;
      return '<tr data-id="' + r.id + '">' +
        '<td data-l="Periode">' + esc(per) + '</td>' +
        '<td data-l="Kanaal">' + esc(chLabel(r.channel)) + '</td>' +
        '<td class="num" data-l="Uitgave">' + eur(r.spend_cents) + '</td>' +
        '<td data-l="Notitie" class="muted">' + esc(r.note || '') + (r.link ? ' <a href="' + esc(r.link) + '" target="_blank" rel="noopener" class="gold">link</a>' : '') + '</td>' +
        '<td style="text-align:right"><button class="b b--ghost b--sm js-edit" data-id="' + r.id + '">Bewerk</button> <button class="b b--danger b--sm js-del" data-id="' + r.id + '"><i data-lucide="trash-2"></i></button></td></tr>';
    }).join('') : '<tr><td colspan="5"><div class="empty" style="padding:34px"><i data-lucide="megaphone"></i><h3>Nog geen uitgaven deze maand</h3><p class="muted">' + eur(M.budgetCents) + ' beschikbaar.</p></div></td></tr>';

    root.innerHTML =
      '<div class="panel" style="margin-bottom:16px"><div class="panel__b"><div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">' +
        '<button class="b b--ghost b--sm js-prev">‹</button>' +
        '<b class="serif" style="font-size:1.15rem;min-width:150px;text-align:center">' + label + '</b>' +
        '<button class="b b--ghost b--sm js-next">›</button>' +
        '<div style="flex:1;min-width:220px">' +
          '<div style="display:flex;justify-content:space-between;font-size:.85rem;margin-bottom:5px"><span class="muted">Budget ' + eur(M.budgetCents) + ' · besteed <b>' + eur(besteed) + '</b></span>' +
            '<span class="' + (over ? 'bdg bdg--pay' : 'muted') + '">' + (over ? 'boven budget · ' + eur(-rest) : 'resterend ' + eur(rest)) + '</span></div>' +
          '<div style="height:9px;border-radius:99px;background:var(--paper-2);overflow:hidden"><div style="height:100%;width:' + pct + '%;background:' + (over ? '#C77A3A' : 'var(--gold)') + '"></div></div>' +
        '</div>' +
        '<button class="b b--gold b--sm js-add"><i data-lucide="plus"></i> Uitgave</button>' +
      '</div></div></div>' +
      '<div class="panel"><div class="panel__h"><h2>Uitgaven</h2></div><div class="panel__b flush"><table class="t collapse"><thead><tr><th>Periode</th><th>Kanaal</th><th class="num">Uitgave</th><th>Notitie</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';

    root.querySelector('.js-prev').onclick = function () { M.month = new Date(M.month.getFullYear(), M.month.getMonth() - 1, 1); KA.renderAdvertenties(); };
    root.querySelector('.js-next').onclick = function () { M.month = new Date(M.month.getFullYear(), M.month.getMonth() + 1, 1); KA.renderAdvertenties(); };
    root.querySelector('.js-add').onclick = function () { openEntry(null); };
    root.querySelectorAll('.js-edit').forEach(function (b) { b.onclick = function () { openEntry(M.rows.find(function (r) { return r.id === b.dataset.id; })); }; });
    root.querySelectorAll('.js-del').forEach(function (b) { b.onclick = function () { delEntry(b.dataset.id); }; });
    ic();
  }

  function openEntry(row) {
    var isEdit = !!row;
    var b = monthBounds();
    var m = KA.modal({ card:
      '<h2 class="serif">' + (isEdit ? 'Uitgave bewerken' : 'Nieuwe uitgave') + '</h2>' +
      '<div class="row2"><div class="field"><label class="lbl">Van</label><input class="in" type="date" id="msFrom" value="' + (row ? row.period_start : b[0]) + '"></div>' +
        '<div class="field"><label class="lbl">Tot (optioneel)</label><input class="in" type="date" id="msTo" value="' + (row && row.period_end ? row.period_end : '') + '"></div></div>' +
      '<div class="row2"><div class="field"><label class="lbl">Kanaal</label><select class="in" id="msCh">' + CHANNELS.map(function (c) { return '<option value="' + c[0] + '"' + (row && row.channel === c[0] ? ' selected' : '') + '>' + c[1] + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label class="lbl">Uitgave (€)</label><input class="in" type="number" min="0" step="0.01" id="msEur" value="' + (row ? (row.spend_cents / 100) : '') + '"></div></div>' +
      '<div class="field"><label class="lbl">Notitie</label><input class="in" id="msNote" value="' + (row ? esc(row.note || '') : '') + '" placeholder="bv. zomercampagne reels"></div>' +
      '<div class="field"><label class="lbl">Link (optioneel)</label><input class="in" id="msLink" value="' + (row ? esc(row.link || '') : '') + '" placeholder="https://…"></div>' +
      '<div class="ferr" id="msErr" hidden><span></span></div>' +
      '<div class="modal__foot"><button class="b b--ghost" data-close>Annuleren</button><button class="b b--gold js-save"><i data-lucide="check"></i> Bewaar</button></div>' });
    m.card.querySelector('.js-save').onclick = function () {
      var eurv = parseFloat(m.card.querySelector('#msEur').value);
      if (isNaN(eurv) || eurv < 0) { var e = m.card.querySelector('#msErr'); e.hidden = false; e.querySelector('span').textContent = 'Vul een geldig bedrag in (≥ 0).'; return; }
      var payload = {
        period_start: m.card.querySelector('#msFrom').value,
        period_end: m.card.querySelector('#msTo').value || null,
        channel: m.card.querySelector('#msCh').value,
        spend_cents: Math.round(eurv * 100),
        note: m.card.querySelector('#msNote').value.trim() || null,
        link: m.card.querySelector('#msLink').value.trim() || null
      };
      var q = isEdit ? sb.from('marketing_spend').update(payload).eq('id', row.id) : sb.from('marketing_spend').insert(payload);
      q.then(function (r) { if (r.error) { KA.toast('Opslaan mislukt.', { type: 'err' }); return; } m.close(); KA.toast(isEdit ? 'Uitgave bijgewerkt.' : 'Uitgave toegevoegd.'); KA.renderAdvertenties(); });
    };
    ic();
  }

  function delEntry(id) {
    KA.confirm({ title: 'Uitgave verwijderen?', body: 'Deze regel wordt verwijderd uit het budgetoverzicht.', confirmText: 'Verwijder', danger: true, onConfirm: function () {
      sb.from('marketing_spend').delete().eq('id', id).then(function (r) { if (r.error) { KA.toast('Verwijderen mislukt.', { type: 'err' }); return; } KA.toast('Uitgave verwijderd.'); KA.renderAdvertenties(); });
    } });
  }
})();
