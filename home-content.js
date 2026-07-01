/* ============================================================
   KAMERAAD HOMEPAGE — CMS content consumer
   Renders owner-published site content over the static homepage:
   banner, hero, het huis (comforts), producten, uren, contact +
   footer social. Reads PUBLISHED from site_content_public (anon);
   with ?preview=1 + an owner session it reads the DRAFT.
   A section is only overridden once it's been published; otherwise
   the static/i18n content stays. Re-applies after every language
   switch (KH.onChange). Fail-safe: any error leaves the page as-is.
   ============================================================ */
(function () {
  'use strict';
  var URL = 'https://hzvhyslujvkwqpkevahj.supabase.co';
  var KEY = 'sb_publishable_s7EpcEpv2hdZiNgufSWLlQ_xsGOifv_';
  var preview = /[?&]preview=1/.test(location.search);
  if (!window.supabase) return;
  var sb = window.supabase.createClient(URL, KEY);

  // Defaults for the two DOM-injected/always-applied bits (banner has no static
  // element; social must hide empties). Section text/images fall back to static HTML.
  var DEF = {
    banner: { active: true, l: {
      leuvens: { title: 'Zomeractie', text: 'Boek deze moand e combo en krijgt e gratis boordolie van het hois.' },
      nl: { title: 'Zomeractie', text: 'Boek deze maand een combo en krijg een gratis baardolie van het huis.' },
      en: { title: 'Summer offer', text: 'Book a combo this month and get a free beard oil on the house.' },
      fr: { title: "Offre d'été", text: 'Réservez un combo ce mois-ci et recevez une huile à barbe offerte.' },
      es: { title: 'Oferta de verano', text: 'Reserva un combo este mes y llévate un aceite de barba de la casa.' } } },
    social: { facebook: 'https://www.facebook.com/kameraadhaarsnijder', instagram: 'https://www.instagram.com/kameraadhaarsnijder/', tiktok: 'https://www.tiktok.com/@kameraadhaarsnijder', youtube: 'https://www.youtube.com/@kameraadhaarsnijder' }
  };
  var DAYS_NL = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function merge(base, over) { if (!isObj(base)) return over === undefined ? base : over; var o = Object.assign({}, base); if (!isObj(over)) return o; Object.keys(over).forEach(function (k) { o[k] = isObj(over[k]) && isObj(base[k]) ? merge(base[k], over[k]) : over[k]; }); return o; }
  function nonEmpty(o) { return o && typeof o === 'object' && Object.keys(o).length > 0; }
  function lang() { return (window.KH && window.KH.lang) || 'nl'; }
  function pick(map) { if (!map) return ''; var l = lang(); if (map[l] != null) return map[l]; if (map.nl != null) return map.nl; for (var k in map) if (map[k] != null) return map[k]; return ''; }
  function pickL(lmap, field) { if (!lmap) return ''; var l = lang(); var o = lmap[l] || lmap.nl || {}; return (o && o[field]) != null ? o[field] : ((lmap.nl && lmap.nl[field]) || ''); }
  function esc(s) { return ('' + (s == null ? '' : s)).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function setText(sel, val) { var e = document.querySelector(sel); if (e && val != null && val !== '') e.textContent = val; }
  function setHtml(sel, val) { var e = document.querySelector(sel); if (e && val != null && val !== '') e.innerHTML = val; }
  function setSrc(sel, val) { var e = document.querySelector(sel); if (e && val) e.setAttribute('src', val); }

  var CONTENT = {};

  function apply() {
    try { renderBanner(merge(DEF.banner, CONTENT.banner || {})); } catch (e) {}
    try { renderSocial(merge(DEF.social, (CONTENT.contact || {}).social || {})); } catch (e) {}
    if (nonEmpty(CONTENT.hero)) { try { renderHero(CONTENT.hero); } catch (e) {} }
    if (nonEmpty(CONTENT.comforts)) { try { renderComforts(CONTENT.comforts); } catch (e) {} }
    if (nonEmpty(CONTENT.products)) { try { renderProducts(CONTENT.products); } catch (e) {} }
    if (nonEmpty(CONTENT.contact)) { try { renderContact(CONTENT.contact); } catch (e) {} }
    if (nonEmpty(CONTENT.hours)) { try { renderHours(CONTENT.hours); } catch (e) {} }
  }

  // ---- banner (injected bar at top of body) ----
  function renderBanner(b) {
    var existing = document.getElementById('khBanner');
    var title = pickL(b && b.l, 'title'), text = pickL(b && b.l, 'text');
    if (!b || !b.active || !title) { if (existing) existing.remove(); return; }
    if (!existing) {
      existing = document.createElement('div'); existing.id = 'khBanner'; existing.setAttribute('role', 'region');
      existing.style.cssText = 'background:linear-gradient(90deg,#C9A24B,#E1B34B);color:#16140F;font-family:\'Hanken Grotesk\',system-ui,sans-serif;text-align:center;padding:9px 40px 9px 16px;position:relative;z-index:60;font-size:.92rem;line-height:1.35';
      var close = document.createElement('button'); close.innerHTML = '&times;'; close.setAttribute('aria-label', 'Sluiten');
      close.style.cssText = 'position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:#16140F;font-size:1.2rem;cursor:pointer;line-height:1';
      close.onclick = function () { existing.remove(); };
      existing._msg = document.createElement('span'); existing.appendChild(existing._msg); existing.appendChild(close);
      document.body.insertBefore(existing, document.body.firstChild);
    }
    existing._msg.innerHTML = '<b>' + esc(title) + '</b>' + (text ? ' — ' + esc(text) : '');
  }

  // ---- footer social (shown iff set, G-15) ----
  function renderSocial(social) {
    var map = { Instagram: 'instagram', Facebook: 'facebook', TikTok: 'tiktok', YouTube: 'youtube' };
    Object.keys(map).forEach(function (label) {
      var a = document.querySelector('.foot__social a[aria-label="' + label + '"]'); if (!a) return;
      var url = social[map[label]];
      if (url) { a.href = url; a.style.display = ''; } else { a.style.display = 'none'; }
    });
    var block = document.querySelector('.foot__social');
    if (block) { var any = Array.prototype.some.call(block.querySelectorAll('a'), function (a) { return a.style.display !== 'none'; }); block.style.display = any ? '' : 'none'; }
  }

  // ---- hero ----
  function renderHero(h) {
    setText('.hero__eyebrow', pickL(h.l, 'eyebrow'));
    setHtml('.hero__title', pickL(h.l, 'title'));
    if (h.img) setSrc('.hero__media img', h.img);
  }

  // ---- het huis (comforts) ----
  function renderComforts(c) {
    setHtml('.comf__title', pickL(c.l, 'title'));
    setText('.comf__lead', pickL(c.l, 'lead'));
    var items = c.items || []; var figs = document.querySelectorAll('.comf__grid .comf__item');
    items.forEach(function (it, i) {
      var fig = figs[i]; if (!fig) return;
      var n = fig.querySelector('.cap-n'), m = fig.querySelector('.cap-m');
      if (n && pickL(it.l, 'name')) n.textContent = pickL(it.l, 'name');
      if (m && pickL(it.l, 'meta')) m.textContent = pickL(it.l, 'meta');
    });
  }

  // ---- producten ----
  function renderProducts(p) {
    setText('.prod .label[data-i18n="prod.eyebrow"]', pickL(p.l, 'eyebrow'));
    setText('.prod__title', pickL(p.l, 'title'));
    setText('.prod__intro', pickL(p.l, 'intro'));
    var items = p.items || []; var cards = document.querySelectorAll('.prod__grid .prod__item');
    items.forEach(function (it, i) {
      var card = cards[i]; if (!card) return;
      var n = card.querySelector('.name'), m = card.querySelector('.meta'), img = card.querySelector('img');
      if (n && pick(it.name)) n.textContent = pick(it.name);
      if (m && pick(it.meta)) m.textContent = pick(it.meta);
      if (img && it.img) img.setAttribute('src', it.img);
    });
  }

  // ---- contact (pitch, address, phone, footer photo) ----
  function renderContact(c) {
    setText('.foot__pitch', pickL(c.l, 'pitch'));
    if (c.footerImg) setSrc('.foot__top img', c.footerImg);
    var lines = document.querySelector('.foot__lines');
    if (lines && (Array.isArray(c.addr) || c.phone)) {
      var addr = (c.addr || []).filter(Boolean);
      var html = addr.map(esc).join('<br />');
      if (c.phone) html += (html ? '<br />' : '') + '<span class="muted">' + esc(c.phone) + '</span>';
      if (html) lines.innerHTML = html;
    }
  }

  // ---- uren (footer opening hours + holidays) ----
  function renderHours(h) {
    var el = document.getElementById('footHours'); if (!el || !h.days) return;
    var todayIdx = (new Date().getDay() + 6) % 7;
    var closedTxt = (window.KH && KH.t) ? KH.t('foot.closed') : 'Gesloten';
    var html = '';
    for (var i = 0; i < 7; i++) {
      var d = h.days[i] || {};
      var closed = !!d.closed;
      var cls = (i === todayIdx ? ' is-today' : '') + (closed ? ' is-closed' : '');
      var val = closed ? closedTxt : ((d.open || '10:00') + '–' + (d.close || '20:00'));
      html += '<li class="' + cls.trim() + '"><span class="d">' + DAYS_NL[i] + '</span><span class="h">' + val + '</span></li>';
    }
    var hk = pickL(h.l, 'holidays_k'), hv = pickL(h.l, 'holidays_v');
    if (hk) html += '<li class="foot__hours-note">' + esc(hk) + ' · ' + esc(hv) + '</li>';
    el.innerHTML = html;
  }

  // ---- load + hooks ----
  function load() {
    var q = preview ? sb.from('site_content').select('key,draft,published') : sb.from('site_content_public').select('key,published');
    q.then(function (r) {
      (r.data || []).forEach(function (row) { CONTENT[row.key] = preview ? (nonEmpty(row.draft) ? row.draft : row.published) : row.published; });
      apply();
    }).catch(function () { apply(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
  // re-apply CMS after every language switch (i18n runs applyStatic first, then subscribers)
  function hookLang() { if (window.KH && KH.onChange) KH.onChange(function () { apply(); }); else setTimeout(hookLang, 200); }
  hookLang();
})();
