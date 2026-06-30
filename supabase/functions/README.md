# Kameraad — Supabase backend (edge functions + cron)

Canonical source for these functions lives in the Supabase project
`kameraad-staging` (ref `hzvhyslujvkwqpkevahj`). Retrieve/edit via the
Supabase dashboard → Edge Functions, or `supabase functions download <slug>`.

## Edge functions

| Function | Trigger | What it does |
|----------|---------|--------------|
| `send-confirmation` | Called from `booking.js` after a public booking | Branded NL confirmation email (Resend). Skips if not freshly-confirmed or no email. |
| `send-payment-due` | Called from the barber console on chair-side cancel (`reason:'barber_cancel'`), and intended for customer late-cancels (`reason` omitted → only charges if inside the cancellation window) | Flags `appointments.payment_due=true` and emails the customer that a late-cancellation fee applies. Skips email for the generic/synthetic walk-in addresses (still flags). |
| `eod-reminder` | `pg_cron` job `eod-reminder-daily`, `0 18 * * *` UTC (≈20:00 Brussels) | Finds today's unresolved appointments (status `pending`/`confirmed`) per barber and emails each barber their list; **Adil** is CC'd on every reminder (and gets a manager summary if he has none of his own). Accepts `{test_to}` to redirect all mail to one address for testing. |

All three embed `barbers!appointments_barber_id_fkey(name)` explicitly — there are
two FKs from `appointments` to `barbers` (`barber_id` + `resolved_by`), so a bare
`barbers(name)` embed is ambiguous and fails.

## Secrets / config
- `RESEND_API_KEY` — currently inlined (demo). **Rotate** and move to a function secret.
- `FROM` — `onboarding@resend.dev` until `mail.kameraadhaarsnijder.be` is verified in
  Resend; then switch to `afspraak@mail.kameraadhaarsnijder.be`. Until verified, mail
  only reaches the Resend account owner's address (admin@ayat.services).

## Cron
`eod-reminder-daily` (schema `cron.job`) posts to the `eod-reminder` function via
`pg_net`. Re-create with the migration `schedule_eod_reminder_cron`.

## Barber console logins (Supabase Auth, role=barber)
Provisioned by migration `barber_console_foundation`. Console at `/barber/`.
- adil@kameraadhaarsnijder.be / Kameraad!Adil-2026
- avraz@kameraadhaarsnijder.be / Kameraad!Avraz-2026
- simar@kameraadhaarsnijder.be / Kameraad!Simar-2026
- bas@kameraadhaarsnijder.be / Kameraad!Bas-2026
