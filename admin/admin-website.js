/* ============================================================
   Kameraad Admin — Website editor (CMS controller)
   Renders the "Website" section: per-block editors that write the
   draft on KHSite, a live phone preview (?preview=1 iframe) that
   updates as you type, and a draft → publish bar.
   ============================================================ */
(function () {
  const KA = (window.KA = window.KA || {});
  const S = window.KHSite;
  const ic = KA.icons || function () { if (window.lucide) lucide.createIcons(); };

  const LANGS = [['leuvens', 'LEU'], ['nl', 'NL'], ['en', 'EN'], ['fr', 'FR'], ['es', 'ES']];
  const TABS = [
    ['banner', 'Banner', 'megaphone', 'top'],
    ['hero', 'Hero', 'panel-top', 'top'],
    ['diensten', 'Diensten', 'scissors', 'boeken'],
    ['barbiers', 'Barbiers', 'users', 'boeken'],
    ['huis', 'Het huis', 'armchair', 'huis'],
    ['producten', 'Producten', 'package', 'producten'],
    ['uren', 'Uren', 'clock', 'contact'],
    ['contact', 'Contact', 'map-pin', 'contact']
  ];
  const DAYS = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];

  let editorLang = 'nl';
  let activeTab = 'banner';
  let frame = null;

  /* ---------- tiny DOM helper ---------- */
  function h(tag, attrs, kids) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'text') e.textContent = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2).toLowerCase(), v);
      else e.setAttribute(k, v);
    }
    (kids || []).forEach(function (c) { if (c == null || c === false) return; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function esc(s) { return ('' + (s == null ? '' : s)).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function get(obj, path) { let n = obj; for (let i = 0; i < path.length; i++) { if (n == null) return undefined; n = n[path[i]]; } return n; }
  function debounce(fn, ms) { let t; return function () { const a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); }; }

  /* friendly rich-text ⇄ html (gold accent = *word*, italic = _word_, line break = newline) */
  function richToHtml(t) { return esc(t).replace(/\*([^*]+)\*/g, '<span class="accent">$1</span>').replace(/_([^_]+)_/g, '<em>$1</em>').replace(/\n/g, '<br />'); }
  function htmlToRich(html) { return ('' + (html || '')).replace(/<span class="accent">(.*?)<\/span>/g, '*$1*').replace(/<em>(.*?)<\/em>/g, '_$1_').replace(/<br\s*\/?>/g, '\n').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'); }

  /* ---------- draft read / write ---------- */
  function draft() { return S.draft(); }
  function gv(path) { return get(draft(), path); }
  function setVal(path, val) { S.update(path, val); afterEdit(); }
  function setArray(key, arr) { S.update([key], arr); afterEdit(); }
  function afterEdit() { updatePubbar(); refreshPreview(); }

  /* ---------- field builders ---------- */
  function fText(label, value, on, opts) {
    opts = opts || {};
    const inp = opts.area ? h('textarea', { class: 'in', rows: opts.rows || 2 }) : h('input', { class: 'in', type: opts.type || 'text' });
    if (opts.ph) inp.placeholder = opts.ph;
    if (opts.min != null) inp.min = opts.min;
    if (opts.step != null) inp.step = opts.step;
    inp.value = value == null ? '' : value;
    const handler = opts.now ? function () { on(opts.type === 'number' ? num(inp.value) : inp.value); } : debounce(function () { on(opts.type === 'number' ? num(inp.value) : inp.value); }, 240);
    inp.addEventListener('input', handler);
    const kids = [];
    if (label) kids.push(h('label', { text: label }));
    kids.push(inp);
    if (opts.hint) kids.push(h('div', { class: 'wcard__hint', style: 'margin:6px 0 0', text: opts.hint }));
    return h('div', { class: 'wfield' }, kids);
  }
  function num(v) { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; }
  function fToggle(label, sub, value, on) {
    const slot = h('span');
    const row = h('div', { class: 'toggle-row', style: 'border:none;padding:6px 0' }, [
      h('span', { class: 'tt' }, [h('b', { text: label }), sub ? h('small', { text: sub }) : null]),
      slot
    ]);
    slot.appendChild(KA.makeToggle(!!value, on));
    return row;
  }
  function card(title, subtitle, kids, hint) {
    const head = h('div', { class: 'wcard__h' }, [h('h3', { text: title }), subtitle ? h('span', { class: 'muted', text: subtitle }) : null]);
    const c = [head];
    if (hint) c.push(h('div', { class: 'wcard__hint', text: hint }));
    return h('div', { class: 'wcard' }, c.concat(kids));
  }
  function downscaleImg(file, maxDim, cb) {
    var img = new Image(), r = new FileReader();
    r.onload = function () { img.onload = function () {
      var scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      var w = Math.max(1, Math.round(img.width * scale)), hh = Math.max(1, Math.round(img.height * scale));
      var cv = document.createElement('canvas'); cv.width = w; cv.height = hh;
      cv.getContext('2d').drawImage(img, 0, 0, w, hh);
      var out; try { out = cv.toDataURL('image/webp', 0.82); } catch (e) { out = cv.toDataURL('image/jpeg', 0.85); }
      cb(out);
    }; img.onerror = function () { KA.toast('Kon de afbeelding niet lezen.', { type: 'err' }); cb(null); }; img.src = r.result; };
    r.readAsDataURL(file);
  }
  // Upload a downscaled image to Supabase Storage (site-media, public-read) and
  // return its public URL. done(null) on failure so the caller keeps the old value (P-27).
  function uploadToStorage(dataUrl, done) {
    var sb = window.KA && KA.SB;
    if (!sb || !sb.storage) { done(dataUrl); return; }   // dev fallback: keep the data-url
    fetch(dataUrl).then(function (r) { return r.blob(); }).then(function (blob) {
      var ext = blob.type.indexOf('png') > -1 ? 'png' : (blob.type.indexOf('webp') > -1 ? 'webp' : 'jpg');
      var path = 'cms/' + Math.random().toString(36).slice(2, 10) + '-' + Date.now() + '.' + ext;
      sb.storage.from('site-media').upload(path, blob, { contentType: blob.type, upsert: false }).then(function (res) {
        if (res.error) { done(null); return; }
        done(sb.storage.from('site-media').getPublicUrl(path).data.publicUrl);
      }, function () { done(null); });
    }, function () { done(null); });
  }
  // downscale → upload → callback(publicUrl); toasts + keeps old on failure.
  function pickAndUpload(file, maxDim, thumb, onUrl) {
    if (thumb) thumb.classList.add('is-loading');
    downscaleImg(file, maxDim, function (durl) {
      if (!durl) { if (thumb) thumb.classList.remove('is-loading'); return; }   // unreadable image → release the slot
      uploadToStorage(durl, function (publicUrl) {
        if (thumb) thumb.classList.remove('is-loading');
        if (publicUrl) onUrl(publicUrl);
        else KA.toast('Upload mislukt — vorige foto behouden.', { type: 'err' });
      });
    });
  }
  function imageField(label, url, onSet, opts) {
    opts = opts || {};
    const thumb = h('div', { class: 'wimg__thumb' + (url ? '' : ' is-empty'), style: url ? ("background-image:url('" + ('' + url).replace(/'/g, '%27') + "')") : '' }, [url ? null : iconEl('image')]);
    const file = h('input', { type: 'file', accept: 'image/*', hidden: 'hidden' });
    file.addEventListener('change', function (e) { const f = e.target.files[0]; if (!f) return; if (f.size > 8e6) { KA.toast('Foto te groot (max 8MB).', { type: 'err' }); return; } pickAndUpload(f, opts.max || 1200, thumb, function (url) { onSet(url); }); });
    const btns = [h('label', { class: 'b b--ghost b--sm', style: 'cursor:pointer' }, [iconEl('upload'), ' ' + (opts.btn || 'Foto'), file])];
    if (url) btns.push(h('button', { class: 'b b--ghost b--sm', onclick: function () { onSet(''); } }, [iconEl('x'), ' Verwijder']));
    const kids = [];
    if (label) kids.push(h('label', { text: label }));
    kids.push(h('div', { class: 'wimg' }, [thumb, h('div', { class: 'wimg__btns' }, btns)]));
    if (opts.hint) kids.push(h('div', { class: 'wcard__hint', style: 'margin:6px 0 0', text: opts.hint }));
    return h('div', { class: 'wfield' }, kids);
  }

  /* ============================================================
     TAB PANELS
     ============================================================ */
  function panelBanner() {
    const lang = editorLang;
    return [card('Promo-banner', 'gouden strip boven de hero', [
      fToggle('Banner tonen', 'Verschijnt boven aan de homepage', gv(['banner', 'active']), function (on) { setVal(['banner', 'active'], on); }),
      fText('Titel (' + lblFor(lang) + ')', gv(['banner', 'l', lang, 'title']), function (v) { setVal(['banner', 'l', lang, 'title'], v); }),
      fText('Tekst (' + lblFor(lang) + ')', gv(['banner', 'l', lang, 'text']), function (v) { setVal(['banner', 'l', lang, 'text'], v); }, { area: true })
    ], 'Tip: een korte, wervende boodschap werkt het best. Tekst per taal.')];
  }

  function panelHero() {
    const lang = editorLang;
    return [
      card('Hero', 'de eerste indruk', [
        fText('Bovenschrift (' + lblFor(lang) + ')', gv(['hero', 'l', lang, 'eyebrow']), function (v) { setVal(['hero', 'l', lang, 'eyebrow'], v); }),
        fText('Titel (' + lblFor(lang) + ')', htmlToRich(gv(['hero', 'l', lang, 'title'])), function (v) { setVal(['hero', 'l', lang, 'title'], richToHtml(v)); }, { area: true, rows: 2, hint: 'Zet een woord in *goud* met sterretjes. Nieuwe regel = regelafbreking.' })
      ]),
      card('Achtergrondfoto', 'de grote hero-afbeelding', [
        imageField('Desktop', gv(['hero', 'img']), function (v) { setVal(['hero', 'img'], v); renderPanel(); }, { max: 1700 }),
        imageField('Tablet (optioneel)', gv(['hero', 'imgTablet']), function (v) { setVal(['hero', 'imgTablet'], v); renderPanel(); }, { max: 1400, hint: 'Leeg = gebruikt de desktopfoto.' }),
        imageField('Mobiel (optioneel)', gv(['hero', 'imgMobile']), function (v) { setVal(['hero', 'imgMobile'], v); renderPanel(); }, { max: 900, hint: 'Leeg = gebruikt de desktopfoto.' })
      ])
    ];
  }

  function panelDiensten() {
    const lang = editorLang;
    const svcs = gv(['services']) || [];
    const items = svcs.map(function (s, i) {
      return h('div', { class: 'witem' + (s.active === false ? ' is-off' : '') }, [
        h('div', { class: 'witem__h' }, [
          h('div', { class: 'witem__t' }, [esc(S.pick(s.l, lang)) || 'Dienst', h('small', { text: '€' + s.price + ' · ' + s.dur + ' min' })]),
          h('div', { class: 'witem__sp' }, [
            delBtn(function () { const a = (gv(['services']) || []).slice(); a.splice(i, 1); setArray('services', a); renderPanel(); })
          ])
        ]),
        fText('Naam (' + lblFor(lang) + ')', S.pick(s.l, lang), function (v) { setVal(['services', i, 'l', lang], v); refreshItemHead(); }),
        h('div', { class: 'wrow' }, [
          fText('Prijs (€)', s.price, function (v) { setVal(['services', i, 'price'], v); }, { type: 'number', min: 0, now: true }),
          fText('Duur (min)', s.dur, function (v) { setVal(['services', i, 'dur'], v); }, { type: 'number', min: 5, step: 5, now: true })
        ]),
        fToggle('Boekbaar', 'Zichtbaar in het boekingsmenu', s.active !== false, function (on) { setVal(['services', i, 'active'], on); renderPanel(); })
      ]);
    });
    items.push(h('button', { class: 'b b--ghost b--sm wadd', onclick: function () {
      const a = (gv(['services']) || []).slice();
      a.push({ id: 'svc-' + Math.random().toString(36).slice(2, 7), dur: 30, price: 30, active: true, l: langMap('Nieuwe dienst') });
      setArray('services', a); renderPanel();
    } }, [iconEl('plus'), ' Dienst toevoegen']));
    return [card('Diensten & prijzen', 'het boekingsmenu', items, 'Volgorde en prijzen zoals bezoekers ze zien. Naam per taal; prijs en duur gelden voor iedereen.')];
  }

  function panelBarbiers() {
    const lang = editorLang;
    const obs = (KA.barbersSorted ? KA.barbersSorted() : []);
    const rows = obs.map(function (ob) {
      const spec = (ob.webSpec && (ob.webSpec[lang] || ob.webSpec.nl)) || '';
      const av = ob.photo
        ? h('img', { src: ob.photo, alt: '', style: 'width:44px;height:44px;border-radius:50%;object-fit:cover;flex:none' })
        : h('span', { class: 'av av--txt', style: 'width:44px;height:44px;flex:none', text: (ob.name || '?')[0] });
      const tog = KA.makeToggle(ob.webActive !== false, function (on) { ob.webActive = on; KA.syncBarbersToSite(); });
      return h('div', { class: 'witem' + (ob.webActive === false ? ' is-off' : ''), style: 'margin-bottom:10px' }, [
        h('div', { class: 'witem__h', style: 'margin-bottom:0' }, [
          av,
          h('div', { class: 'witem__t' }, [esc(ob.name), h('small', { text: spec || '—' })]),
          h('div', { class: 'witem__sp' }, [tog, h('button', { class: 'b b--ghost b--sm', onclick: function () { KA.openBarber(ob.id); } }, [iconEl('pencil'), ' Bewerk'])])
        ])
      ]);
    });
    rows.push(h('button', { class: 'b b--ghost b--sm wadd', onclick: function () { KA.openBarber(null); } }, [iconEl('plus'), ' Barbier toevoegen']));
    return [card('Barbiers', 'het team — beheerd als één fiche', rows, 'Eén fiche per barbier voor alles: agenda, login én website. Klik Bewerk om de volledige fiche te openen; de wisselknop zet iemand snel op de site aan/uit.')];
  }

  function panelHuis() {
    const lang = editorLang;
    const its = gv(['comforts', 'items']) || [];
    const head = card('Het huis trakteert', 'de comforts-sectie', [
      fText('Titel (' + lblFor(lang) + ')', htmlToRich(gv(['comforts', 'l', lang, 'title'])), function (v) { setVal(['comforts', 'l', lang, 'title'], richToHtml(v)); }, { hint: 'Cursief met _onderstrepingen_.' }),
      fText('Inleiding (' + lblFor(lang) + ')', gv(['comforts', 'l', lang, 'lead']), function (v) { setVal(['comforts', 'l', lang, 'lead'], v); }, { area: true, rows: 3 })
    ]);
    const items = its.map(function (it, i) {
      return h('div', { class: 'witem' }, [
        h('div', { class: 'witem__h' }, [
          h('div', { class: 'witem__t' }, [esc(get(it, ['l', lang, 'name'])) || 'Item']),
          h('div', { class: 'witem__sp' }, [delBtn(function () { const a = (gv(['comforts', 'items']) || []).slice(); a.splice(i, 1); setVal(['comforts', 'items'], a); renderPanel(); })])
        ]),
        imageField('Foto', it.img, function (v) { setVal(['comforts', 'items', i, 'img'], v); renderPanel(); }, { max: 900 }),
        h('div', { class: 'wrow' }, [
          fText('Naam (' + lblFor(lang) + ')', get(it, ['l', lang, 'name']), function (v) { setVal(['comforts', 'items', i, 'l', lang, 'name'], v); refreshItemHead(); }),
          fText('Onderschrift (' + lblFor(lang) + ')', get(it, ['l', lang, 'meta']), function (v) { setVal(['comforts', 'items', i, 'l', lang, 'meta'], v); })
        ])
      ]);
    });
    items.push(h('button', { class: 'b b--ghost b--sm wadd', onclick: function () {
      const a = (gv(['comforts', 'items']) || []).slice();
      a.push({ id: 'cf-' + Math.random().toString(36).slice(2, 6), slot: 'comfort-' + Math.random().toString(36).slice(2, 6), l: langObjMap({ name: 'Nieuw', meta: '' }) });
      setVal(['comforts', 'items'], a); renderPanel();
    } }, [iconEl('plus'), ' Item toevoegen']));
    const list = card('Items', '', items, 'Foto’s sleep je op de site/preview zelf in elk kader.');
    return [head, list];
  }

  function panelProducten() {
    const lang = editorLang;
    const its = gv(['products', 'items']) || [];
    const head = card('Producten', 'de productensectie', [
      fText('Bovenschrift (' + lblFor(lang) + ')', gv(['products', 'l', lang, 'eyebrow']), function (v) { setVal(['products', 'l', lang, 'eyebrow'], v); }),
      fText('Titel (' + lblFor(lang) + ')', gv(['products', 'l', lang, 'title']), function (v) { setVal(['products', 'l', lang, 'title'], v); }),
      fText('Intro (' + lblFor(lang) + ')', gv(['products', 'l', lang, 'intro']), function (v) { setVal(['products', 'l', lang, 'intro'], v); }, { area: true, rows: 3 })
    ]);
    const items = its.map(function (it, i) {
      const img = h('img', { class: 'wphoto__img', src: it.img || '', alt: '' });
      const file = h('input', { type: 'file', accept: 'image/*', hidden: 'hidden' });
      file.addEventListener('change', function (e) { const f = e.target.files[0]; if (!f) return; if (f.size > 8e6) { KA.toast('Foto te groot (max 8MB).', { type: 'err' }); return; } pickAndUpload(f, 1000, img, function (url) { img.src = url; setVal(['products', 'items', i, 'img'], url); }); });
      return h('div', { class: 'witem' }, [
        h('div', { class: 'witem__h' }, [
          h('div', { class: 'witem__t' }, [esc(S.pick(it.name, lang)) || 'Product']),
          h('div', { class: 'witem__sp' }, [delBtn(function () { const a = (gv(['products', 'items']) || []).slice(); a.splice(i, 1); setVal(['products', 'items'], a); renderPanel(); })])
        ]),
        h('div', { class: 'wphoto' }, [img, h('label', { class: 'b b--ghost b--sm', style: 'cursor:pointer' }, [iconEl('upload'), ' Foto', file])]),
        h('div', { class: 'wrow' }, [
          fText('Naam (' + lblFor(lang) + ')', S.pick(it.name, lang), function (v) { setVal(['products', 'items', i, 'name', lang], v); refreshItemHead(); }),
          fText('Onderschrift (' + lblFor(lang) + ')', S.pick(it.meta, lang), function (v) { setVal(['products', 'items', i, 'meta', lang], v); })
        ]),
        fToggle('Groot kader', 'Toont dit product hoger in het raster', !!it.tall, function (on) { setVal(['products', 'items', i, 'tall'], on); })
      ]);
    });
    items.push(h('button', { class: 'b b--ghost b--sm wadd', onclick: function () {
      const a = (gv(['products', 'items']) || []).slice();
      a.push({ id: 'p-' + Math.random().toString(36).slice(2, 6), img: '', tall: false, name: langMap('Nieuw product'), meta: langMap('') });
      setVal(['products', 'items'], a); renderPanel();
    } }, [iconEl('plus'), ' Product toevoegen']));
    return [head, card('Kaarten', '', items)];
  }

  function panelUren() {
    const lang = editorLang;
    const days = gv(['hours', 'days']) || [];
    const rows = DAYS.map(function (dn, i) {
      const d = days[i] || { closed: false, open: '10:00', close: '20:00' };
      const openI = h('input', { class: 'in', type: 'time', value: d.open });
      const closeI = h('input', { class: 'in', type: 'time', value: d.close });
      function sync() { const off = !!d.closed; openI.disabled = off; closeI.disabled = off; openI.style.opacity = closeI.style.opacity = off ? '.4' : '1'; }
      openI.addEventListener('input', function () { d.open = openI.value; setVal(['hours', 'days', i, 'open'], openI.value); });
      closeI.addEventListener('input', function () { d.close = closeI.value; setVal(['hours', 'days', i, 'close'], closeI.value); });
      const tog = KA.makeToggle(!d.closed, function (on) { d.closed = !on; setVal(['hours', 'days', i, 'closed'], !on); sync(); });
      sync();
      return h('div', { class: 'witem', style: 'padding:11px 13px;margin-bottom:9px' }, [
        h('div', { style: 'display:flex;align-items:center;gap:12px;flex-wrap:wrap' }, [
          h('b', { style: 'width:96px;flex:none', text: dn }),
          h('div', { style: 'display:flex;align-items:center;gap:6px;flex:1;min-width:150px' }, [openI, h('span', { class: 'muted', text: '–' }), closeI]),
          h('div', { style: 'display:flex;align-items:center;gap:7px' }, [h('small', { class: 'muted', text: 'Open' }), tog])
        ])
      ]);
    });
    const hol = card('Feestdagen', '', [
      h('div', { class: 'wrow' }, [
        fText('Label (' + lblFor(lang) + ')', gv(['hours', 'l', lang, 'holidays_k']), function (v) { setVal(['hours', 'l', lang, 'holidays_k'], v); }),
        fText('Waarde (' + lblFor(lang) + ')', gv(['hours', 'l', lang, 'holidays_v']), function (v) { setVal(['hours', 'l', lang, 'holidays_v'], v); })
      ])
    ]);
    return [card('Openingsuren', 'voettekst & boekingskalender', rows, 'Gesloten dagen verdwijnen uit de voettekst én uit het boekingsvenster.'), hol];
  }

  function panelContact() {
    const lang = editorLang;
    const addr = gv(['contact', 'addr']) || ['', '', ''];
    return [
      card('Contact', 'adres, telefoon & e-mail', [
        h('div', { class: 'wfield' }, [h('label', { text: 'Adres' }),
          h('div', { class: 'wpanel', style: 'gap:8px' }, addr.map(function (line, i) {
            return h('input', { class: 'in', value: line, placeholder: 'Adresregel ' + (i + 1), oninput: debounce(function (e) { const a = (gv(['contact', 'addr']) || []).slice(); a[i] = e.target.value; setVal(['contact', 'addr'], a); }, 240) });
          }))
        ]),
        h('div', { class: 'wrow' }, [
          fText('Telefoon', gv(['contact', 'phone']), function (v) { setVal(['contact', 'phone'], v); }),
          fText('E-mail', gv(['contact', 'email']), function (v) { setVal(['contact', 'email'], v); }, { type: 'email' })
        ]),
        fText('Voettekst-pitch (' + lblFor(lang) + ')', gv(['contact', 'l', lang, 'pitch']), function (v) { setVal(['contact', 'l', lang, 'pitch'], v); }, { area: true, rows: 2 })
      ]),
      card('Footerfoto', 'de grote foto bovenaan de footer', [
        imageField('Footerfoto', gv(['contact', 'footerImg']), function (v) { setVal(['contact', 'footerImg'], v); renderPanel(); }, { max: 1500 })
      ]),
      card('Social media', 'links naar je pagina’s', [
        fText('Facebook', gv(['contact', 'social', 'facebook']), function (v) { setVal(['contact', 'social', 'facebook'], v); }, { ph: 'https://facebook.com/…' }),
        fText('Instagram', gv(['contact', 'social', 'instagram']), function (v) { setVal(['contact', 'social', 'instagram'], v); }, { ph: 'https://instagram.com/…' }),
        fText('TikTok', gv(['contact', 'social', 'tiktok']), function (v) { setVal(['contact', 'social', 'tiktok'], v); }, { ph: 'https://tiktok.com/@…' }),
        fText('YouTube', gv(['contact', 'social', 'youtube']), function (v) { setVal(['contact', 'social', 'youtube'], v); }, { ph: 'https://youtube.com/@…' })
      ], 'Laat een veld leeg om dat icoon te verbergen.')
    ];
  }

  function panelRedirect(title, sub, route, btn) {
    return [card(title, sub, [
      h('p', { class: 'muted', style: 'margin:0 0 12px;line-height:1.5', text: 'Dit wordt op één plek beheerd — de wijzigingen verschijnen automatisch op de website. Geen aparte kopie.' }),
      h('button', { class: 'b b--gold b--sm', onclick: function () { location.hash = '#' + route; } }, [iconEl('arrow-right'), ' ' + btn])
    ])];
  }
  function panelDienstenBind() { return panelRedirect('Diensten & prijzen', 'het boekingsmenu — live gegevens', 'diensten', 'Open Diensten'); }
  function panelBarbiersBind() { return panelRedirect('Barbiers', 'het team — één fiche per barbier', 'barbiers', 'Open Barbiers'); }
  const PANELS = { banner: panelBanner, hero: panelHero, diensten: panelDienstenBind, barbiers: panelBarbiersBind, huis: panelHuis, producten: panelProducten, uren: panelUren, contact: panelContact };

  /* ---------- helpers used by panels ---------- */
  function lblFor(code) { for (let i = 0; i < LANGS.length; i++) if (LANGS[i][0] === code) return LANGS[i][1]; return code.toUpperCase(); }
  function langMap(v) { return { leuvens: v, nl: v, en: v, fr: v, es: v }; }
  function langObjMap(obj) { const o = {}; LANGS.forEach(function (l) { o[l[0]] = Object.assign({}, obj); }); return o; }
  function mapField(lset, f) { const m = {}; for (const k in (lset || {})) m[k] = lset[k] ? lset[k][f] : ''; return m; }
  function delBtn(on) { return h('button', { class: 'witem__del', title: 'Verwijder', onclick: on }, [iconEl('trash-2')]); }
  function iconEl(name) { return h('i', { 'data-lucide': name }); }
  function readImg(file, cb) { const r = new FileReader(); r.onload = function () { cb(r.result); }; r.readAsDataURL(file); }
  function refreshItemHead() { /* lightweight: titles refresh on next full renderPanel; no-op to avoid focus loss */ }

  /* ============================================================
     SHELL + PREVIEW + PUBLISH BAR
     ============================================================ */
  let pubbarEl, panelEl, tabsEl, langEl;

  function buildShell(root) {
    root.innerHTML = '';
    // publish bar
    pubbarEl = h('div', { class: 'wpub' }, [
      h('span', { class: 'wpub__dot' }),
      h('div', { class: 'wpub__txt' }, [h('b', { class: 'js-pub-h', text: 'Alles gepubliceerd' }), h('small', { class: 'js-pub-s', text: 'De site is up-to-date' })]),
      h('span', { class: 'wpub__sp' }),
      h('div', { class: 'wpub__actions' }, [
        h('button', { class: 'b b--ghost b--sm js-discard', disabled: 'disabled', onclick: discard }, [iconEl('rotate-ccw'), ' Verwerp']),
        h('button', { class: 'b b--gold b--sm js-publish', disabled: 'disabled', onclick: publish }, [iconEl('upload'), ' Publiceer'])
      ])
    ]);
    // tabs
    tabsEl = h('div', { class: 'wtabs' }, TABS.map(function (t) {
      return h('button', { class: 'wtab' + (t[0] === activeTab ? ' on' : ''), 'data-tab': t[0], onclick: function () { selectTab(t[0]); } }, [iconEl(t[2]), t[1]]);
    }));
    // language
    langEl = h('div', { class: 'wlang' }, [
      h('span', { class: 'wlang__lbl', text: 'Taal' }),
      h('div', { class: 'seg js-lang' }, LANGS.map(function (l) {
        return h('button', { class: (l[0] === editorLang ? 'on' : ''), 'data-l': l[0], onclick: function () { selectLang(l[0]); } }, [l[1]]);
      }))
    ]);
    panelEl = h('div', { class: 'wpanel', id: 'wsitePanel' });

    const main = h('div', { class: 'wsite__main' }, [pubbarEl, tabsEl, langEl, panelEl]);

    // preview
    frame = h('iframe', { src: '../index.html?preview=1', title: 'Voorbeeld van de site' });
    frame.addEventListener('load', function () { setPreviewLang(editorLang); scrollPreviewTo(currentSection()); });
    const device = h('div', { class: 'wprev__device' }, [h('div', { class: 'wprev__screen' }, [frame,
      h('button', { class: 'wprev__refresh', title: 'Vernieuw', onclick: function () { frame.contentWindow.location.reload(); } }, [iconEl('refresh-cw')])])]);
    const aside = h('aside', { class: 'wprev' }, [
      h('div', { class: 'wprev__bar' }, [h('span', { class: 'lbl', text: 'Live voorbeeld' }), h('span', { class: 'wprev__live' }, [iconEl('dot') , h('span', { text: 'concept' })])]),
      device,
      h('div', { class: 'wprev__foot' }, [
        h('a', { class: 'b b--ghost b--sm', href: '../index.html?preview=1', target: '_blank' }, [iconEl('external-link'), ' Open concept']),
        h('a', { class: 'b b--ghost b--sm', href: '../index.html', target: '_blank' }, [iconEl('globe'), ' Live site'])
      ])
    ]);

    const toggle = h('button', { class: 'b b--gold wprev-toggle', onclick: function () { aside.classList.toggle('is-open'); } }, [iconEl('eye'), ' Voorbeeld']);

    root.appendChild(h('div', { class: 'wsite' }, [main, aside]));
    root.appendChild(toggle);
    ic();
  }

  function renderPanel() {
    if (!panelEl) return;
    panelEl.innerHTML = '';
    (PANELS[activeTab] ? PANELS[activeTab]() : []).forEach(function (c) { panelEl.appendChild(c); });
    ic();
  }
  function renderPanelKeepScroll() { const y = panelEl ? panelEl.scrollTop : 0; renderPanel(); if (panelEl) panelEl.scrollTop = y; }

  function selectTab(tab) {
    activeTab = tab;
    if (tabsEl) tabsEl.querySelectorAll('.wtab').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === tab); });
    renderPanel();
    scrollPreviewTo(currentSection());
  }
  function selectLang(l) {
    editorLang = l;
    if (langEl) langEl.querySelectorAll('.js-lang button').forEach(function (b) { b.classList.toggle('on', b.dataset.l === l); });
    renderPanel();
    setPreviewLang(l);
  }
  function currentSection() { for (let i = 0; i < TABS.length; i++) if (TABS[i][0] === activeTab) return TABS[i][3]; return 'top'; }

  /* ---------- preview control ---------- */
  function refreshPreview() { try { if (frame && frame.contentWindow) frame.contentWindow.postMessage({ type: 'khsite:refresh' }, '*'); } catch (e) {} }
  // when a draft edit finishes persisting to the DB, re-fetch the preview iframe
  window.addEventListener('khsite:saved', function () { refreshPreview(); });
  function setPreviewLang(l) { try { frame.contentWindow.KH.setLang(l); } catch (e) {} }
  function scrollPreviewTo(id) {
    try {
      const w = frame.contentWindow, d = w.document;
      const elx = id && id !== 'top' ? d.getElementById(id) : null;
      const y = elx ? (elx.getBoundingClientRect().top + (w.scrollY || w.pageYOffset) - 8) : 0;
      w.scrollTo({ top: y, behavior: 'smooth' });
    } catch (e) {}
  }

  /* ---------- publish bar ---------- */
  function changeCount() {
    const d = S.draft(), l = S.live(); let n = 0;
    ['banner', 'hero', 'comforts', 'products', 'hours', 'contact'].forEach(function (k) { if (JSON.stringify(d[k]) !== JSON.stringify(l[k])) n++; });
    return n;
  }
  function updatePubbar() {
    if (!pubbarEl) return;
    const dirty = S.dirty();
    pubbarEl.classList.toggle('is-dirty', dirty);
    const n = changeCount();
    pubbarEl.querySelector('.js-pub-h').textContent = dirty ? (n + ' onderdeel' + (n === 1 ? '' : 'en') + ' gewijzigd') : 'Alles gepubliceerd';
    pubbarEl.querySelector('.js-pub-s').textContent = dirty ? 'Nog niet zichtbaar voor bezoekers — publiceer om live te zetten' : 'De site is up-to-date';
    pubbarEl.querySelector('.js-publish').disabled = !dirty;
    pubbarEl.querySelector('.js-discard').disabled = !dirty;
  }
  function publish() {
    if (!S.dirty()) return;
    var b = pubbarEl && pubbarEl.querySelector('.js-publish'); if (b) { b.disabled = true; b.textContent = '…'; }
    S.publish().then(function (res) {
      if (b) b.textContent = 'Publiceer';
      if (res && res.error) {
        KA.toast('Publiceren mislukt' + (res.error.message ? ' — ' + res.error.message : '') + '.', { type: 'err' });
      } else {
        var w = (res && res.warnings) || [];
        KA.toast('Gepubliceerd — nu live.' + (w.length ? ' (' + w.length + ' taal valt terug op NL)' : ''));
      }
      updatePubbar(); refreshPreview();
    });
  }
  function discard() {
    if (!S.dirty()) return;
    KA.confirm({ title: 'Wijzigingen verwerpen?', body: 'Alle niet-gepubliceerde aanpassingen gaan verloren. De site blijft zoals nu gepubliceerd.', confirmText: 'Verwerp', danger: true, onConfirm: function () {
      S.discard().then(function () { KA.toast('Concept verworpen.'); renderPanel(); updatePubbar(); refreshPreview(); });
    } });
  }

  /* ---------- bridge: the single barber fiche → the public site ---------- */
  KA.websiteChanged = function () { if (pubbarEl) { updatePubbar(); refreshPreview(); if (activeTab === 'barbiers') renderPanel(); } };
  // Barbiers bind to the live `barbers` table (G-14); they do NOT flow through
  // site_content, so this is a no-op kept for call-site compatibility.
  KA.syncBarbersToSite = function () {};

  /* ---------- entry ---------- */
  KA.renderWebsite = function () {
    const root = document.getElementById('v-website'); if (!root) return;
    if (!root._built) { buildShell(root); root._built = true; }
    renderPanel();
    updatePubbar();
  };
})();
