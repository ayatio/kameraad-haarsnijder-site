/* ============================================================
   Kameraad Admin — in-memory data model (demo state)
   Everything the prototype mutates lives here on window.KA.state.
   Edits/creates/deletes write here, then screens re-render → changes
   are visible everywhere ("closed loop").
   ============================================================ */
(function () {
  const KA = (window.KA = window.KA || {});

  // canonical "today" for the demo
  KA.today = new Date(2026, 5, 30); // Tue 30 June 2026
  KA.agendaOpenMin = 600;           // 10:00 — agenda rail starts here
  KA.pxPerHour = 56;

  const initials = (KA.initials = (n) =>
    n.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase());

  const services = [
    { id: 'sv-cut', name: 'Haarsnit', color: '#E8B84B', dur: 40, price: 40, active: true, walkin: false, order: 1,
      desc: { nl: 'Klassieke knipbeurt met afwerking.', en: 'Classic cut, finished.', fr: 'Coupe classique, finitions comprises.' } },
    { id: 'sv-cutbeardhot', name: 'Haarsnit & Baard Hot Towel', color: '#3D9970', dur: 60, price: 60, active: true, walkin: false, order: 2,
      desc: { nl: 'Knippen plus hot-towel baardverzorging.', en: 'Cut plus hot-towel beard.', fr: 'Coupe + barbe serviette chaude.' } },
    { id: 'sv-cuttrim', name: 'Haarsnit & Baardtrim', color: '#F39C12', dur: 50, price: 50, active: true, walkin: false, order: 3,
      desc: { nl: 'Knippen plus baard bijwerken.', en: 'Cut plus beard trim.', fr: 'Coupe + taille de barbe.' } },
    { id: 'sv-beardhot', name: 'Baardtrim Hot Towel', color: '#3498DB', dur: 35, price: 35, active: true, walkin: false, order: 4,
      desc: { nl: 'Baard bijwerken met hot towel.', en: 'Beard trim, hot towel.', fr: 'Taille de barbe, serviette chaude.' } },
    { id: 'sv-shave', name: 'Baard Glad Nat Scheren', color: '#E74C8B', dur: 35, price: 35, active: true, walkin: false, order: 5,
      desc: { nl: 'Traditioneel nat scheren.', en: 'Traditional wet shave.', fr: 'Rasage traditionnel.' } },
    { id: 'sv-walkin', name: 'Everyday Walk In', color: '#C9A24B', dur: 0, price: 0, active: true, walkin: true, order: 6,
      desc: { nl: 'Loop binnen zonder afspraak — info, niet boekbaar.', en: 'Walk in without an appointment — info only.', fr: 'Entrez sans rendez-vous — info.' } },
  ];

  const barbers = [
    { id: 'b-avraz', name: 'Avraz', photo: 'assets/team-avraz.jpg', slug: 'avraz', active: true, order: 1,
      bio: { nl: 'Oprichter. Strakke fades en klassieke coupes.', en: 'Founder. Sharp fades, classic cuts.', fr: 'Fondateur. Dégradés nets.' },
      services: ['sv-cut', 'sv-cutbeardhot', 'sv-cuttrim', 'sv-beardhot', 'sv-shave'] },
    { id: 'b-adil', name: 'Adil', photo: 'assets/team-adil.jpg', slug: 'adil', active: true, order: 2,
      bio: { nl: 'Detailwerk en baardverzorging.', en: 'Detail work and beards.', fr: 'Travail de précision et barbes.' },
      services: ['sv-cut', 'sv-cutbeardhot', 'sv-cuttrim', 'sv-beardhot', 'sv-shave'] },
    { id: 'b-simar', name: 'Simar', photo: 'assets/team-simar.jpg', slug: 'simar', active: true, order: 3,
      bio: { nl: 'Snelle, propere coupes.', en: 'Fast, clean cuts.', fr: 'Coupes rapides et propres.' },
      services: ['sv-cut', 'sv-cutbeardhot', 'sv-cuttrim', 'sv-beardhot'] },
    { id: 'b-bas', name: 'Bas', photo: 'assets/team-bas.jpg', slug: 'bas', active: true, order: 4,
      bio: { nl: 'Klassiek nat scheren is zijn ding.', en: 'Wet shaves are his thing.', fr: 'Le rasage est sa spécialité.' },
      services: ['sv-cut', 'sv-cuttrim', 'sv-beardhot', 'sv-shave'] },
  ];

  // weekly hours per barber: [mon..sun], each = array of {s,e} windows (empty = closed)
  const fullWeek = () => [[], [{ s: '10:00', e: '14:00' }, { s: '15:00', e: '20:00' }], [{ s: '10:00', e: '20:00' }], [{ s: '10:00', e: '20:00' }], [{ s: '10:00', e: '20:00' }], [{ s: '10:00', e: '20:00' }], [{ s: '10:00', e: '18:00' }]];
  barbers.forEach((b) => (b.hours = fullWeek()));

  const customers = [
    { id: 'c-tom', name: 'Tom Verbeke', email: 'tom.verbeke@gmail.com', phone: '+32 478 12 34 56', since: 2023, visits: 14, noshows: 0,
      optins: { reminders: true, rebook: false, marketing: false },
      notes: [{ id: 'n1', text: 'Houdt van een strakke fade, korte babbel.', author: 'Adil', date: '12 mei 2026' }],
      history: [
        { id: 'h1', date: '28 jun', service: 'sv-cut', barber: 'b-adil', status: 'completed', rating: 'up', reason: '' },
        { id: 'h2', date: '31 mei', service: 'sv-cuttrim', barber: 'b-adil', status: 'completed', rating: 'up', reason: '' },
        { id: 'h3', date: '2 mei', service: 'sv-cut', barber: 'b-avraz', status: 'completed', rating: null, reason: '' },
      ] },
    { id: 'c-karim', name: 'Karim El Amrani', email: 'karim.elamrani@outlook.com', phone: '+32 471 88 22 19', since: 2024, visits: 8, noshows: 1,
      optins: { reminders: true, rebook: false, marketing: true },
      notes: [], history: [
        { id: 'h1', date: '23 jun', service: 'sv-cutbeardhot', barber: 'b-avraz', status: 'completed', rating: 'down', reason: 'te lang gewacht' },
        { id: 'h2', date: '20 mei', service: 'sv-cut', barber: 'b-avraz', status: 'noshow', rating: null, reason: '' },
      ] },
    { id: 'c-mehdi', name: 'Mehdi Ben Ali', email: 'mehdi.benali@gmail.com', phone: '+32 495 55 11 02', since: 2022, visits: 22, noshows: 2,
      optins: { reminders: true, rebook: true, marketing: true },
      notes: [{ id: 'n1', text: 'Vaste klant. Altijd combo cut + trim.', author: 'Bas', date: '3 jun 2026' }],
      history: [{ id: 'h1', date: 'vandaag', service: 'sv-cuttrim', barber: 'b-bas', status: 'completed', rating: 'up', reason: '' }] },
    { id: 'c-jens', name: 'Jens Peeters', email: 'jens.peeters@telenet.be', phone: '+32 486 70 43 91', since: 2025, visits: 5, noshows: 0,
      optins: { reminders: false, rebook: false, marketing: false }, notes: [],
      history: [{ id: 'h1', date: 'vandaag', service: 'sv-beardhot', barber: 'b-simar', status: 'completed', rating: null, reason: '' }] },
    { id: 'c-wout', name: 'Wout Claes', email: 'wout.claes@gmail.com', phone: '+32 477 21 65 38', since: 2025, visits: 3, noshows: 0,
      optins: { reminders: true, rebook: false, marketing: false }, notes: [], history: [] },
    { id: 'c-dries', name: 'Dries Maes', email: 'dries.maes@hotmail.com', phone: '+32 499 03 77 14', since: 2026, visits: 1, noshows: 1,
      optins: { reminders: false, rebook: false, marketing: true }, notes: [], history: [] },
  ];

  // today's appointments (also drive the Vandaag table + Agenda lanes)
  const appts = [
    { id: 'a1', start: '10:00', dur: 40, cust: 'c-tom', sv: 'sv-cut', barber: 'b-adil', status: 'confirmed', rating: null, reason: '', pref: false },
    { id: 'a2', start: '10:45', dur: 60, cust: 'c-karim', sv: 'sv-cutbeardhot', barber: 'b-avraz', status: 'confirmed', rating: null, reason: '', pref: false },
    { id: 'a3', start: '11:30', dur: 50, cust: 'c-mehdi', sv: 'sv-cuttrim', barber: 'b-bas', status: 'completed', rating: 'up', reason: '', pref: false },
    { id: 'a4', start: '13:00', dur: 35, cust: 'c-jens', sv: 'sv-beardhot', barber: 'b-simar', status: 'completed', rating: null, reason: '', pref: false },
    { id: 'a5', start: '14:30', dur: 40, cust: 'c-wout', sv: 'sv-cut', barber: 'b-adil', status: 'noshow', rating: null, reason: '', pref: false },
    { id: 'a6', start: '15:15', dur: 35, cust: 'c-lucas', sv: 'sv-shave', barber: 'b-avraz', status: 'confirmed', rating: null, reason: '', pref: false, custName: 'Lucas Janssens' },
    { id: 'a7', start: '16:45', dur: 50, cust: 'c-dries', sv: 'sv-cuttrim', barber: 'b-bas', status: 'confirmed', rating: null, reason: '', pref: true },
    { id: 'a8', start: '17:30', dur: 40, cust: 'c-sofiane', sv: 'sv-cut', barber: 'b-simar', status: 'confirmed', rating: null, reason: '', pref: false, custName: 'Sofiane Haddad' },
  ];

  const blocks = [
    { id: 'bl-pauze', label: 'Pauze', who: 'b-adil', day: '2026-06-30', start: '12:00', end: '13:00', allday: false },
    { id: 'bl1', label: 'Nationale feestdag', who: 'all', day: '2026-07-21', start: '', end: '', allday: true, range: '21 jul 2026 · hele dag' },
    { id: 'bl2', label: 'Verlof', who: 'b-adil', day: '2026-08-04', start: '', end: '', allday: true, range: '4 – 11 aug 2026' },
    { id: 'bl3', label: 'O.L.V. Hemelvaart', who: 'all', day: '2026-08-15', start: '', end: '', allday: true, range: '15 aug 2026 · hele dag' },
  ];

  const admins = [
    { id: 'ad-avraz', name: 'Avraz', email: 'avraz@kameraadhaarsnijder.be', role: 'owner', linked: 'b-avraz', last: 'nu', status: 'active' },
    { id: 'ad-adil', name: 'Adil', email: 'adil@kameraadhaarsnijder.be', role: 'barber', linked: 'b-adil', last: 'vandaag 09:12', status: 'active' },
    { id: 'ad-simar', name: 'Simar', email: 'simar@kameraadhaarsnijder.be', role: 'barber', linked: 'b-simar', last: 'gisteren', status: 'active' },
    { id: 'ad-bas', name: 'Bas', email: 'bas@kameraadhaarsnijder.be', role: 'barber', linked: 'b-bas', last: '—', status: 'invited' },
  ];

  KA.state = {
    role: 'owner',          // RBAC demo — 'owner' | 'barber'
    currentBarber: 'b-avraz',
    services, barbers, customers, appts, blocks, admins,
    settings: { cancelWindow: 24, buffer: 0, leadTime: 2, horizon: 56, interval: 15, rebook: 5 },
    banner: {
      active: true,
      nl: { title: 'Zomeractie', text: 'Boek deze maand een combo en krijg een gratis baardolie van het huis.' },
      en: { title: 'Summer offer', text: 'Book a combo this month and get a free beard oil on the house.' },
      fr: { title: "Offre d'été", text: 'Réservez un combo ce mois-ci et recevez une huile à barbe offerte.' },
    },
    shopHours: [[], [{ s: '10:00', e: '20:00' }], [{ s: '10:00', e: '20:00' }], [{ s: '10:00', e: '20:00' }], [{ s: '10:00', e: '20:00' }], [{ s: '10:00', e: '20:00' }], []],
    closedLabels: ['Gesloten', '', '', '', '', '', 'Check Instagram'],
  };

  // ---- lookups ----
  KA.barber = (id) => KA.state.barbers.find((b) => b.id === id);
  KA.service = (id) => KA.state.services.find((s) => s.id === id);
  KA.customer = (id) => KA.state.customers.find((c) => c.id === id);
  KA.admin = (id) => KA.state.admins.find((a) => a.id === id);
  KA.barbersSorted = () => [...KA.state.barbers].sort((a, b) => a.order - b.order);
  KA.activeServices = () => KA.state.services.filter((s) => s.active && !s.walkin).sort((a, b) => a.order - b.order);
  KA.apptCustName = (a) => (a.custName || (KA.customer(a.cust) ? KA.customer(a.cust).name : a.cust));
  KA.euro = (n) => '€' + n;
  KA.toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  KA.fromMin = (min) => String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');

  // feedback aggregate over today's appts (+ histories) — for stats tile
  KA.feedbackStats = () => {
    let up = 0, down = 0; const reasons = {};
    KA.state.appts.forEach((a) => { if (a.rating === 'up') up++; if (a.rating === 'down') { down++; if (a.reason) reasons[a.reason] = (reasons[a.reason] || 0) + 1; } });
    KA.state.customers.forEach((c) => c.history.forEach((h) => { if (h.rating === 'up') up++; if (h.rating === 'down') { down++; if (h.reason) reasons[h.reason] = (reasons[h.reason] || 0) + 1; } }));
    const total = up + down;
    return { up, down, total, pct: total ? Math.round((up / total) * 100) : null, reasons };
  };

  KA.uid = (p) => p + '-' + Math.random().toString(36).slice(2, 8);
  KA.DAYS = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];
  KA.DAYS_SHORT = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
  KA.MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
  KA.FB_CHIPS = ['te druk', 'te laat', 'niet tevreden met de coupe', 'andere'];
})();
