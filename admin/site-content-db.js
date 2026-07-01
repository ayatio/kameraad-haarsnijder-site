/* ============================================================
   Kameraad Admin — Supabase-backed content store (window.KHSite)
   Drop-in replacement for the prototype's localStorage KHSite:
   SAME API (draft/live/get/update/publish/discard/dirty/pick/LANGS)
   but persists to the `site_content` table (draft/published JSONB
   per section) via the owner session, and publishes through the
   publish_site_content()/discard_site_content() RPCs.
   Only the six CONTENT sections live here; Diensten/Barbiers bind
   to the live services/barbers tables (G-14), handled in the editor.
   ============================================================ */
(function () {
  'use strict';
  var URL = 'https://hzvhyslujvkwqpkevahj.supabase.co';
  var KEY = 'sb_publishable_s7EpcEpv2hdZiNgufSWLlQ_xsGOifv_';
  var LANGS = ['leuvens', 'nl', 'en', 'fr', 'es'];
  var SECTIONS = ['banner', 'hero', 'comforts', 'products', 'hours', 'contact'];
  function L(s) { return { leuvens: s, nl: s, en: s, fr: s, es: s }; }

  // Fallback content = the site as it ships. The DB holds only overrides.
  var DEFAULTS = {
    banner: { active: true, l: {
      leuvens: { title: 'Zomeractie', text: 'Boek deze moand e combo en krijgt e gratis boordolie van het hois.' },
      nl: { title: 'Zomeractie', text: 'Boek deze maand een combo en krijg een gratis baardolie van het huis.' },
      en: { title: 'Summer offer', text: 'Book a combo this month and get a free beard oil on the house.' },
      fr: { title: "Offre d'été", text: 'Réservez un combo ce mois-ci et recevez une huile à barbe offerte.' },
      es: { title: 'Oferta de verano', text: 'Reserva un combo este mes y llévate un aceite de barba de la casa.' } } },
    hero: { img: 'assets/chair-street.jpg', imgTablet: '', imgMobile: '', l: {
      leuvens: { eyebrow: 'Haarsnijder & barbier · Parijsstraat, Leuven · sinds 2014', title: '<span class="accent">Stille</span> klas.<br />Echt mêesterschap.' },
      nl: { eyebrow: 'Haarsnijder & barbier · Parijsstraat, Leuven · sinds 2014', title: '<span class="accent">Stille</span> klasse.<br />Tijdloos vakmanschap.' },
      en: { eyebrow: 'Barber & shave · Parijsstraat, Leuven · since 2014', title: '<span class="accent">Quiet</span> class.<br />Timeless craft.' },
      fr: { eyebrow: 'Barbier & rasage · Parijsstraat, Louvain · depuis 2014', title: '<span class="accent">Classe</span> discrète.<br />Savoir-faire intemporel.' },
      es: { eyebrow: 'Barbero & afeitado · Parijsstraat, Lovaina · desde 2014', title: '<span class="accent">Clase</span> serena.<br />Oficio atemporal.' } } },
    comforts: { l: {
      leuvens: { title: 'Het hois <em>trakteert</em>', lead: 'Goa zitte, blijf efkes. E vers jatteke kaffe, e vingerke whiskey of rum, de gazet van vandoog — bij Kameraad meugde vertroge.' },
      nl: { title: 'Het huis <em>trakteert</em>', lead: 'Ga zitten, blijf even. Een vers jatteke kaffe, een vinger whiskey of rum, de krant van vandaag — bij Kameraad mag je vertragen, met of zonder afspraak.' },
      en: { title: 'The house <em>treats you</em>', lead: 'Sit down, stay a while. A fresh cup of coffee, a finger of whiskey or rum, today’s paper — at Kameraad you’re allowed to slow down.' },
      fr: { title: 'La maison <em>vous régale</em>', lead: 'Asseyez-vous, restez un moment. Un café frais, un doigt de whiskey ou de rhum, le journal du jour — chez Kameraad, on a le droit de ralentir.' },
      es: { title: 'La casa <em>invita</em>', lead: 'Siéntate, quédate un rato. Un café recién hecho, un dedo de whiskey o ron, el periódico de hoy — en Kameraad puedes ir más despacio.' } },
      items: [
        { id: 'koffie', slot: 'comfort-koffie', img: '', l: { leuvens: { name: 'Jatteke kaffe', meta: 'vers gezet' }, nl: { name: 'Jatteke kaffe', meta: 'vers gezet' }, en: { name: 'Cup of coffee', meta: 'freshly brewed' }, fr: { name: 'Tasse de café', meta: 'fraîchement préparé' }, es: { name: 'Taza de café', meta: 'recién hecho' } } },
        { id: 'whiskey', slot: 'comfort-whiskey', img: '', l: { leuvens: { name: 'Whiskey', meta: 'e vingerke, puur' }, nl: { name: 'Whiskey', meta: 'een vinger, neat' }, en: { name: 'Whiskey', meta: 'a finger, neat' }, fr: { name: 'Whiskey', meta: 'un doigt, sec' }, es: { name: 'Whiskey', meta: 'un dedo, solo' } } },
        { id: 'rum', slot: 'comfort-rum', img: '', l: { leuvens: { name: 'Rum', meta: 'veu de liefhebber' }, nl: { name: 'Rum', meta: 'voor de liefhebber' }, en: { name: 'Rum', meta: 'for the connoisseur' }, fr: { name: 'Rhum', meta: 'pour les amateurs' }, es: { name: 'Ron', meta: 'para el aficionado' } } },
        { id: 'kranten', slot: 'comfort-kranten', img: '', l: { leuvens: { name: 'Gazette', meta: 'de dag bijgeproot' }, nl: { name: 'Kranten', meta: 'de dag bijgepraat' }, en: { name: 'Newspapers', meta: 'caught up on the day' }, fr: { name: 'Journaux', meta: 'au fait de l’actu' }, es: { name: 'Periódicos', meta: 'al día' } } },
        { id: 'scheerschuim', slot: 'comfort-scheerschuim', img: '', l: { leuvens: { name: 'Warm scheerschoim', meta: 'de echte scheerbeurt' }, nl: { name: 'Warm scheerschuim', meta: 'de echte scheerbeurt' }, en: { name: 'Warm shaving foam', meta: 'the real shave' }, fr: { name: 'Mousse à raser chaude', meta: 'le vrai rasage' }, es: { name: 'Espuma caliente', meta: 'el afeitado de verdad' } } }
      ] },
    products: { l: {
      leuvens: { eyebrow: 'Spul — 02', title: 'Alleen wa werkt', intro: 'We gebruike en verkoêpe e zorgvuldig gekoze selectie — Reuzel, Layrite en klassiek barbierspul.' },
      nl: { eyebrow: 'Producten — 02', title: 'Alleen wat werkt', intro: 'We gebruiken en verkopen een zorgvuldig samengestelde selectie — Reuzel, Layrite en klassieke barbierproducten. Gekozen om hun prestatie, niet om de hype.' },
      en: { eyebrow: 'Products — 02', title: 'Only what works', intro: 'We use and sell a carefully curated selection — Reuzel, Layrite and classic barber products. Chosen for performance, not hype.' },
      fr: { eyebrow: 'Produits — 02', title: 'Seulement ce qui marche', intro: 'Nous utilisons et vendons une sélection soignée — Reuzel, Layrite et des produits de barbier classiques.' },
      es: { eyebrow: 'Productos — 02', title: 'Solo lo que funciona', intro: 'Usamos y vendemos una selección cuidada — Reuzel, Layrite y productos clásicos de barbería.' } },
      items: [
        { id: 'p1', img: 'assets/gallery-products.jpg', tall: false, name: L('Layrite Deluxe'), meta: L('Cement Clay · matte hold') },
        { id: 'p2', img: 'assets/gallery-reuzel.jpg', tall: true, name: L('Reuzel Pomade'), meta: L('Pink & Blue · high shine') },
        { id: 'p3', img: 'assets/ig-adil3.jpg', tall: false, name: { leuvens: 'Lokaal ambacht', nl: 'Lokale ambacht', en: 'Local craft', fr: 'Artisanat local', es: 'Oficio local' }, meta: L('Haarsnijder & Barbier · Leuven') },
        { id: 'p4', img: 'assets/gallery-oldschool.jpg', tall: true, name: { leuvens: 'De stoel', nl: 'De stoel', en: 'The chair', fr: 'Le fauteuil', es: 'La silla' }, meta: { leuvens: 'Ga zitte & ontspant', nl: 'Ga zitten & ontspan', en: 'Take a seat & relax', fr: 'Asseyez-vous & détendez-vous', es: 'Toma asiento y relájate' } }
      ] },
    hours: { days: [
      { closed: true, open: '10:00', close: '20:00' }, { closed: false, open: '10:00', close: '20:00' }, { closed: false, open: '10:00', close: '20:00' },
      { closed: false, open: '10:00', close: '20:00' }, { closed: false, open: '10:00', close: '20:00' }, { closed: false, open: '10:00', close: '20:00' }, { closed: false, open: '10:00', close: '20:00' } ],
      l: { leuvens: { holidays_k: 'Feestdoge', holidays_v: 'checkt Instagram' }, nl: { holidays_k: 'Feestdagen', holidays_v: 'check Instagram' }, en: { holidays_k: 'Holidays', holidays_v: 'check Instagram' }, fr: { holidays_k: 'Jours fériés', holidays_v: 'voir Instagram' }, es: { holidays_k: 'Festivos', holidays_v: 'ver Instagram' } } },
    contact: {
      addr: ['Parijsstraat 29', '3000 Leuven', 'België'], phone: '+32 486 33 67 14', email: 'info@kameraadhaarsnijder.be',
      footerImg: 'assets/footer-adil.jpg',
      social: { facebook: 'https://www.facebook.com/kameraadhaarsnijder', instagram: 'https://www.instagram.com/kameraadhaarsnijder/', tiktok: 'https://www.tiktok.com/@kameraadhaarsnijder', youtube: 'https://www.youtube.com/@kameraadhaarsnijder' },
      l: {
        leuvens: { pitch: 'Boek a momentsje. Komt binne in e plek woe de tij vertroogt en de details tellen.' },
        nl: { pitch: 'Boek je moment. Stap binnen in een plek waar de tijd vertraagt en details ertoe doen.' },
        en: { pitch: 'Book your moment. Step into a place where time slows down and details matter.' },
        fr: { pitch: 'Réservez votre moment. Entrez dans un lieu où le temps ralentit et où les détails comptent.' },
        es: { pitch: 'Reserva tu momento. Entra en un lugar donde el tiempo se ralentiza y los detalles importan.' } } }
  };

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function merge(base, over) {
    if (!isObj(base)) return over === undefined ? base : over;
    var out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    if (!isObj(over)) return out;
    Object.keys(over).forEach(function (k) {
      if (Array.isArray(over[k])) out[k] = over[k].slice();
      else if (isObj(over[k]) && isObj(base[k])) out[k] = merge(base[k], over[k]);
      else out[k] = over[k];
    });
    return out;
  }
  function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function nonEmpty(o) { return o && Object.keys(o).length > 0; }

  var sb = window.supabase ? window.supabase.createClient(URL, KEY) : null;
  var previewMode = /[?&]preview=1/.test(location.search);

  var _pub = {};    // key -> published section object (overrides)
  var _draft = {};  // key -> draft section object (overrides)
  var _loaded = false;

  function assemble(layer) {
    // merge DEFAULTS with the per-section override layer
    var out = clone(DEFAULTS);
    SECTIONS.forEach(function (k) { if (nonEmpty(layer[k])) out[k] = merge(DEFAULTS[k], layer[k]); });
    return out;
  }

  var KHSite = {
    LANGS: LANGS, DEFAULTS: DEFAULTS, previewMode: previewMode, ready: false,

    load: function (cb) {
      if (!sb) { if (cb) cb(); return; }
      sb.from('site_content').select('key,draft,published').then(function (r) {
        (r.data || []).forEach(function (row) { _pub[row.key] = row.published || {}; _draft[row.key] = row.draft || {}; });
        _loaded = true; KHSite.ready = true; KHSite.refresh(); if (cb) cb();
      });
    },
    live: function () { return assemble(_pub); },
    draft: function () { return assemble(_draft); },
    get: function () { return previewMode ? this.draft() : this.live(); },

    dirty: function () { return JSON.stringify(this.draft()) !== JSON.stringify(this.live()); },

    // set a nested value by path; path[0] is the section key
    update: function (path, value) {
      var sec = path[0];
      if (SECTIONS.indexOf(sec) < 0) return;             // services/barbers handled elsewhere (G-14)
      if (!nonEmpty(_draft[sec])) _draft[sec] = clone(this.draft()[sec]) || {};
      var node = _draft[sec];
      for (var i = 1; i < path.length - 1; i++) {
        var k = path[i];
        if (!isObj(node[k]) && !Array.isArray(node[k])) node[k] = {};
        node = node[k];
      }
      if (path.length === 1) _draft[sec] = value;         // whole-section replace
      else node[path[path.length - 1]] = value;
      this._persist(sec);
      this.refresh();
    },

    _persistTimers: {},
    _persist: function (sec) {
      var self = this;
      clearTimeout(this._persistTimers[sec]);
      this._persistTimers[sec] = setTimeout(function () {
        if (!sb) return;
        sb.from('site_content').update({ draft: _draft[sec] || {} }).eq('key', sec).then(function (r) {
          if (r.error) { if (window.KA && KA.toast) KA.toast('Opslaan mislukt — probeer opnieuw.', { type: 'err' }); return; }
          try { window.dispatchEvent(new Event('khsite:saved')); } catch (e) {}   // draft persisted → refresh preview
        });
      }, 260);
    },

    // Force any pending debounced draft-writes to the DB now, and resolve when done.
    _flush: function () {
      var self = this, pending = [];
      Object.keys(this._persistTimers).forEach(function (sec) {
        clearTimeout(self._persistTimers[sec]); delete self._persistTimers[sec];
        if (sb) pending.push(sb.from('site_content').update({ draft: _draft[sec] || {} }).eq('key', sec));
      });
      return Promise.all(pending);
    },
    // Returns {warnings} on success or {error}. Flushes drafts FIRST so the RPC
    // promotes the latest edit, not a debounced-but-unsaved one. No optimistic
    // promote — _pub is only updated after the RPC actually succeeds.
    publish: function () {
      var self = this;
      if (!sb) { SECTIONS.forEach(function (k) { _pub[k] = clone(_draft[k]) || {}; }); self.refresh(); return Promise.resolve({}); }
      return this._flush().then(function () {
        return sb.rpc('publish_site_content').then(function (r) {
          if (r.error) { self.load(); return { error: r.error }; }
          SECTIONS.forEach(function (k) { _pub[k] = clone(_draft[k]) || {}; });
          self.refresh();
          var warns = (r.data || []).reduce(function (a, x) { return a.concat(x.warnings || []); }, []);
          return { warnings: warns };
        }, function (e) { self.load(); return { error: e }; });
      });
    },
    discard: function () {
      var self = this;
      // drop pending draft-writes so they can't re-dirty after the reset
      Object.keys(this._persistTimers).forEach(function (s) { clearTimeout(self._persistTimers[s]); delete self._persistTimers[s]; });
      if (!sb) { SECTIONS.forEach(function (k) { _draft[k] = clone(_pub[k]) || {}; }); self.refresh(); return Promise.resolve(); }
      return sb.rpc('discard_site_content').then(function () { return self.load(); });
    },

    pick: function (map, lang) {
      if (!map) return '';
      lang = lang || (window.KH && window.KH.lang) || 'nl';
      if (map[lang] != null) return map[lang];
      if (map.nl != null) return map.nl;
      for (var k in map) if (map[k] != null) return map[k];
      return '';
    },
    refresh: function () { try { window.dispatchEvent(new Event('khsite:change')); } catch (e) {} }
  };

  window.KHSite = KHSite;
  KHSite.load();
})();
