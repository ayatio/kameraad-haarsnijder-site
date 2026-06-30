# Kameraad — Deployed-build QA (against specs)

**Date:** 2026-06-30 · **Build under test:** the live public site
<https://ayatio.github.io/kameraad-haarsnijder-site/> (static front-end on GitHub
Pages + Supabase booking via two locked-down RPCs). Walked end-to-end in a real
browser so the JS renders.

**Source-of-truth precedence (as instructed):** `FUNCTIONAL-ANALYSIS.md`
(D1–D23, FR-001…114) **wins on conflict**, then `kameraad-test-plan`,
`kameraad-admin-flows-and-feedback`, `kameraad-technical-build-analysis`.

**Scope note:** only the **public booking front-end** is deployed. The **admin**
app (`Kameraad Admin.html` + `admin-*.js`) is a local in-memory prototype, **not
deployed** to the live URL — so Part-A admin cases (AUTH/APPT/AVL/CRM/CFG/STAT/
PAT) and Part-C backend cases (MIG/ENG server/API/RBAC/GDPR/MAIL/EXP) are **not
testable on this build** and are out of scope here. This QA covers the deployed
customer surface: BOOK-*, consent/home cases, and the client-side slot engine.

---

## Resolutions applied (2026-06-30, after your decisions)

- **QA-D1 — Service catalogue → RESOLVED ("canonical 5, no kids' cut").** The site
  now **reads the `services` table** (single source): the five canonical services
  with DB names/prices/durations, localized per language; **"Kind" dropped**. The
  barber→service matrix is also read from the DB. Verified end-to-end — a booking
  persists the correct service (e.g. `haircut-beard-hotwash` €60/60min). Admin +
  DB already matched; the site was the only outlier and is now aligned.
- **QA-D2 — Booking order → RESOLVED ("keep service-first, update specs").** Site
  unchanged (Service → Barber). Updated **`FUNCTIONAL-ANALYSIS.md` §4 + FR-004**
  and **`kameraad-test-plan` BOOK-01** to Service → Barber → Slot → Details. The
  admin's manual-booking is a separate flow (empty-slot prefill) and doesn't
  conflict. All three now agree.
- **QA-F1/F2/F3** (lead time, horizon, slot grid) — applied + verified (see §B).
- **Still open:** QA-D3 (default language Leuvens vs spec NL/best-match) — minor,
  your call. Everything below is the original audit record.

---

## A · Decisions needed from you (do not guess — top of the list)

| ID | Issue | Where | Breaks / conflicts | Status |
|----|-------|-------|--------------------|--------|
| **QA-D1** | **Service catalogue mismatch.** Live site offers **Knippen €27 · Baard €18 · Knippen + Baard €40 · Kind (–12 j.) €20**. The admin prototype (`admin-data.js`), the Supabase `services` table, and the docs all use the **canonical five**: Haarsnit €40 · Haarsnit & Baard Hot Towel €60 · Haarsnit & Baardtrim €50 · Baardtrim Hot Towel €35 · Baard Glad Nat Scheren €35, **+ Everyday Walk In** (info-only). A **kids' cut exists only on the site**. One shop, two menus. | Booking step 1 (`index.html` `.bk-services`); `booking.js` `SVC_SLUG` currently *maps* the site labels onto canonical DB slugs so stored appointments are real, but the **displayed** menu, prices, and the "Kind" item are wrong. | SVC-01/05, FR-061, S-08, D11; "one catalogue" principle | **DECISION NEEDED.** Confirm the true Kameraad menu + prices, and whether a kids' cut exists. Recommended fix once confirmed: have the public site **read the `services` table** (one data source), so site + admin + DB never diverge again. I will not guess the menu. |
| **QA-D2** | **Booking order.** Site goes **Dienst → Barbier**. `FUNCTIONAL-ANALYSIS §4 / FR-020` and `BOOK-01` ("barber → service → slot → details → confirm") say **Barbier → Dienst**. **v5 flipped this deliberately:** the booking lead copy reads *"Eerst je dienst, dan de barbier die ze uitvoert, dan een moment dat past"* (i18n `book.lead`, all locales) — service-first is an intentional v5 design choice, not a slip. | Booking wizard step order (`.bk-step` = svc, barber, date, time, details). | FR-020, BOOK-01 — **and** the rule that FUNCTIONAL-ANALYSIS wins. The two instructions conflict (deliberate v5 vs winning spec). | **DECISION NEEDED.** Two ways to "not leave them disagreeing": **(a)** align the **site → barber-first** (one code change; matches the winning spec + admin/test-plan; also lets the service list filter to what that barber offers — Simar has no wet-shave, Bas no cut+beard-hot-towel); or **(b)** keep **service-first** and update **FR-020 + BOOK-01 + admin** to match. *My lean: (a)* — fewer artifacts to change and barber-specific service availability is real — but it's your call since v5 chose (b) on purpose. |
| **QA-D3** | **Default language / locale set.** Site defaults to **Leuvens**; spec (NFR-05/FR-090/092) expects bare `/` → best match, missing FR → NL. The `es` dictionary exists in `i18n.js` but is **not** exposed in the switcher (switcher = LEU/NL/EN/FR, matching your brief). | `i18n.js` `detect()` returns `'leuvens'`. | NFR-05, FR-090 (minor) | **DECISION NEEDED (minor).** Keep Leuvens as the on-brand default, or default to NL / browser-best-match per spec? (Switcher set itself is fine.) |

---

## B · Fixed on this branch (unambiguous — values are in the specs)

| ID | Issue (was) | Fix (now) | Spec | Status |
|----|-------------|-----------|------|--------|
| **QA-F1** | **No minimum lead time.** Slots were offered right up to "now" (a 10:00 slot showed at 16:00; only the server rejected it). | Slots earlier than **now + 2 h** are hidden (`CFG.leadMin=120`). A day fully exhausted by the cutoff (late today) is dropped from availability, so "Eerstvolgende vrij" skips an empty today. | FR-013, S09-3, ENG-03; settings `min_lead_time_hours=2` | **Fix applied** |
| **QA-F2** | **No booking horizon.** Calendar navigated to any future month (verified: November 2026, 21 clickable days). | Capped at **today + 56 days**: days past the horizon are disabled and forward month-nav stops at the cap. | FR-014, S09-4, ENG-04, P-17; settings `booking_horizon_days=56` | **Fix applied** |
| **QA-F3** | **Wrong slot grid.** Start times stepped by the service duration (e.g. 30/40/45 min), not a fixed grid. | **15-minute start grid** (:00/:15/:30/:45); last start = window end − occupancy; occupancy = duration + buffer (`CFG.slotGridMin=15`, `bufferMin=0`). Verified: 10:00,10:15,…,19:30 (39 slots, 30-min svc). | FR-011/12, ENG-01/02, D6; settings `slot_increment_min=15` | **Fix applied** |

> The deployed slot engine is a **client-side placeholder**. These three fixes
> mirror the canonical `settings` seed (migration 004) as `CFG` constants in
> `index.html`. **Production must read these from the `settings` table at
> runtime (FR-008)** — flagged below.

---

## C · Verified compliant on the deployed build (no action)

| Check | Result | Spec |
|-------|--------|------|
| Both consents gate submit (24 h cancellation **and** privacy) | ✓ Confirm button disabled until both checked (`detailsOk()`); no booking otherwise | BOOK-02, FR-023/24 |
| "Geen voorkeur" resolves to a **named** barber | ✓ `resolveBarberFor()` resolves before booking; the named barber is stored | FR-016, APPT-16 |
| Walk-in stays **info-only** | ✓ Shown as a "Walk-ins welkom" badge; not in the service selector; `book_appointment` RPC rejects `is_walk_in` services server-side | D11, SVC-05, ENG-11 |
| LEU / NL / EN / FR switch | ✓ Live-switches all `data-i18n` content (verified NL/FR/EN/LEU) | P-16, FR-090 |
| Double-booking prevention | ✓ Server-side overlap guard → friendly `slot_taken` + slot refresh; no 500 | ENG-10, FR-018 |

---

## D · Flags — out of scope for a static build (backend / not deployed)

| ID | Item | Note | Spec |
|----|------|------|------|
| QA-X1 | **Confirmation email + .ics not sent.** Success copy says *"We sturen je een bevestiging"* but nothing is dispatched. | Needs the email pipeline (Resend) + backend; not present in the static build. | BOOK-01, MAIL-T1, FR-007 |
| QA-X2 | **Token pages** (cancel-in-window / too-late / reschedule / preferences) not deployed. | Exist as design (`Afspraak beheren.html`, CM); not part of the live static site. | BOOK-03/04/05/06, CM |
| QA-X3 | **Slot engine is a placeholder.** No DST handling (FR-015), no settings-table read (FR-008), buffer/lead/horizon are mirrored constants not live settings, availability/blocks are hardcoded client-side rather than from `availability` / `blocked_slots`. | Real engine = `availability.ts` on the backend; reconcile when the site is wired to it. | ENG-*, FR-008/015, D8/D10 |
| QA-X4 | **Barber roster hardcoded.** `BARBERS` in `index.html` carries `does/works/away` using the *old* service names; must be regenerated from the canonical catalogue + DB once QA-D1/D2 are decided. | Tied to QA-D1 (service names) and QA-D2 (order). | S-04, S-08 |
| QA-X5 | **Admin not deployed.** The admin prototype runs locally on in-memory state; no admin Part-A/Part-C cases are testable on the live URL. | Separate build/deploy when the backend lands. | whole admin suite |

---

## E · Run notes

- Booking verified end-to-end against Supabase: a real appointment persisted
  (correct service/duration via the DB), the slot then read as taken, and a
  re-book was rejected (`slot_taken`). Test rows cleaned up.
- Fixes QA-F1…F3 verified in-browser after applying (horizon caps at August =
  today+56; grid 15-min; soonest skips an exhausted today).
- **Blocked on you:** QA-D1 (menu) and QA-D2 (order) — once answered I will apply
  them to **one** source (recommend: site reads the `services` table) so the
  public site, admin, and DB share a single catalogue and a single step order.
