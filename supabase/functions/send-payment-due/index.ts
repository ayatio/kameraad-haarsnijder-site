import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Read from a Supabase Function secret — never hardcoded.
// Set it: Dashboard → Edge Functions → Secrets → RESEND_API_KEY
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM = 'Kameraad Haarsnijder <info@mail.kameraadhaarsnijder.be>';
const TZ = 'Europe/Brussels';
const SUBJECT = 'Laattijdige annulering — Kameraad Haarsnijder';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
function isSynthetic(email: string | null | undefined) {
  return !email || email === 'walk-in@kameraadhaarsnijder.be' || email.startsWith('walkin+');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { appointment_id, reason } = await req.json();
    if (!appointment_id) return json({ error: 'missing appointment_id' }, 400);

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: a, error } = await sb
      .from('appointments')
      .select('id,customer_id,start_at,status,payment_due,customers(first_name,email),services(name_nl,price_cents),barbers!appointments_barber_id_fkey(name)')
      .eq('id', appointment_id)
      .single();
    if (error || !a) return json({ error: 'not_found', detail: error }, 404);

    // Gate: chair-side (barber_cancel) always charges; customer late-cancel only inside the window.
    const { data: setting } = await sb.from('settings').select('value').eq('key', 'cancellation_window_hours').single();
    const windowH = Number((setting as any)?.value ?? 24);
    const hoursToStart = (new Date(a.start_at).getTime() - Date.now()) / 3_600_000;
    const isLate = reason === 'barber_cancel' || hoursToStart < windowH;
    if (!isLate) return json({ skipped: 'within_free_window', hoursToStart, windowH });

    const to = (a as any).customers?.email;
    const first = (a as any).customers?.first_name || '';
    const svc = (a as any).services;
    const barber = (a as any).barbers?.name || '';
    const price = svc ? '€' + (svc.price_cents % 100 === 0 ? svc.price_cents / 100 : (svc.price_cents / 100).toFixed(2)) : '';

    // Always flag payment due (idempotent).
    await sb.from('appointments').update({ payment_due: true }).eq('id', appointment_id);

    // Non-deliverable (synthetic/generic walk-in) address: flag only, no mail, no email_log send row.
    if (isSynthetic(to)) return json({ flagged: true, skipped: 'no_real_email' });

    // Idempotency: if a payment_due mail was already logged for this appointment, do not send/log again.
    const { data: prior } = await sb.from('email_log').select('id')
      .eq('appointment_id', appointment_id).eq('email_type', 'payment_due').limit(1);
    if (prior && prior.length) return json({ flagged: true, skipped: 'already_sent' });

    const dt = new Date(a.start_at);
    const dateStr = dt.toLocaleDateString('nl-BE', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
    const timeStr = dt.toLocaleTimeString('nl-BE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });

    const html = `
<div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;margin:0 auto;color:#16140F">
  <div style="background:#16140F;padding:26px 24px;text-align:center">
    <div style="color:#E8D29F;font-family:Arial,sans-serif;letter-spacing:.28em;font-size:13px;text-transform:uppercase">Kameraad Haarsnijder</div>
  </div>
  <div style="padding:30px 26px;background:#F6F1E7">
    <h1 style="font-size:23px;font-weight:500;margin:0 0 6px">Een laattijdige annulering, ${first || 'kameraad'}.</h1>
    <p style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#4A453C;margin:0 0 18px">Je afspraak werd geannuleerd binnen het annuleringsvenster van ${windowH} uur. Volgens onze voorwaarden wordt hiervoor een vergoeding aangerekend.</p>
    <table style="width:100%;font-family:Arial,sans-serif;font-size:15px;border-collapse:collapse">
      <tr><td style="padding:9px 0;color:#8A857B;width:130px">Dienst</td><td style="padding:9px 0;font-weight:600">${svc ? svc.name_nl : ''}</td></tr>
      <tr><td style="padding:9px 0;color:#8A857B">Barbier</td><td style="padding:9px 0;font-weight:600">${barber}</td></tr>
      <tr><td style="padding:9px 0;color:#8A857B">Gepland</td><td style="padding:9px 0;font-weight:600">${dateStr} om ${timeStr}</td></tr>
      <tr><td style="padding:9px 0;color:#8A857B">Te betalen</td><td style="padding:9px 0;font-weight:700;color:#9B2C2C">${price}</td></tr>
    </table>
    <p style="font-family:Arial,sans-serif;font-size:13px;line-height:1.5;color:#8A857B;margin:20px 0 0;border-top:1px solid rgba(22,20,15,.12);padding-top:16px">Je kan dit bedrag bij je volgende bezoek voldoen. Vragen? Bel ons op +32 486 33 67 14 — we helpen je graag verder.</p>
  </div>
  <div style="background:#16140F;padding:16px;text-align:center;color:#8F897C;font-family:Arial,sans-serif;font-size:12px">Kameraad Haarsnijder · Parijsstraat 29, Leuven</div>
</div>`;

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject: SUBJECT, html }),
    });
    const rj = await r.json();
    // Log every real send attempt (typed).
    await sb.from('email_log').insert({
      appointment_id, customer_id: (a as any).customer_id, email_type: 'payment_due',
      to_email: to, subject: SUBJECT, status: r.ok ? 'sent' : 'failed',
      error_message: r.ok ? null : JSON.stringify(rj),
    });
    if (!r.ok) return json({ flagged: true, error: 'resend_failed', detail: rj }, 502);
    return json({ flagged: true, sent: true, logged: true, id: rj.id, to });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
