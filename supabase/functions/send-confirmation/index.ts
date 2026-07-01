import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = 're_9NDD8eX4_Dbb84xKU3YLTAf7gXGPF87v2';
const FROM = 'Kameraad Haarsnijder <info@mail.kameraadhaarsnijder.be>';
const TZ = 'Europe/Brussels';
const PORTAL = 'https://ayatio.github.io/kameraad-haarsnijder-site/afspraak/';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { appointment_id } = await req.json();
    if (!appointment_id) return json({ error: 'missing appointment_id' }, 400);

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: a, error } = await sb
      .from('appointments')
      .select('id,cancel_token,start_at,status,created_at,customer_notes,customers(first_name,email),services(name_nl,price_cents,duration_min),barbers!appointments_barber_id_fkey(name)')
      .eq('id', appointment_id)
      .single();
    if (error || !a) return json({ error: 'not_found' }, 404);

    if (a.status !== 'confirmed') return json({ skipped: 'not_confirmed' });
    if (Date.now() - new Date(a.created_at).getTime() > 5 * 60 * 1000) return json({ skipped: 'too_old' });
    const to = (a as any).customers?.email;
    if (!to) return json({ skipped: 'no_email' });

    const dt = new Date(a.start_at);
    const dateStr = dt.toLocaleDateString('nl-BE', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr = dt.toLocaleTimeString('nl-BE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
    const svc = (a as any).services; const barber = (a as any).barbers?.name || '';
    const first = (a as any).customers?.first_name || '';
    const price = svc ? '€' + (svc.price_cents % 100 === 0 ? svc.price_cents / 100 : (svc.price_cents / 100).toFixed(2)) : '';
    const manageUrl = PORTAL + '?token=' + encodeURIComponent((a as any).cancel_token || '');

    const html = `
<div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;margin:0 auto;color:#16140F">
  <div style="background:#16140F;padding:26px 24px;text-align:center">
    <div style="color:#E8D29F;font-family:Arial,sans-serif;letter-spacing:.28em;font-size:13px;text-transform:uppercase">Kameraad Haarsnijder</div>
  </div>
  <div style="padding:30px 26px;background:#F6F1E7">
    <h1 style="font-size:24px;font-weight:500;margin:0 0 6px">Tot snel, ${first || 'kameraad'}.</h1>
    <p style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#4A453C;margin:0 0 22px">Je afspraak is bevestigd. We kijken ernaar uit je te zien.</p>
    <table style="width:100%;font-family:Arial,sans-serif;font-size:15px;border-collapse:collapse">
      <tr><td style="padding:9px 0;color:#8A857B;width:120px">Dienst</td><td style="padding:9px 0;font-weight:600">${svc ? svc.name_nl : ''} · ${price}</td></tr>
      <tr><td style="padding:9px 0;color:#8A857B">Barbier</td><td style="padding:9px 0;font-weight:600">${barber}</td></tr>
      <tr><td style="padding:9px 0;color:#8A857B">Wanneer</td><td style="padding:9px 0;font-weight:600">${dateStr} om ${timeStr}</td></tr>
      <tr><td style="padding:9px 0;color:#8A857B">Waar</td><td style="padding:9px 0">Parijsstraat 29, Leuven</td></tr>
    </table>
    <div style="margin-top:22px"><a href="${manageUrl}" style="display:inline-block;background:#16140F;color:#E8D29F;font-family:Arial,sans-serif;text-decoration:none;padding:12px 22px;border-radius:4px;font-size:14px">Beheer of annuleer je afspraak</a></div>
    <p style="font-family:Arial,sans-serif;font-size:13px;line-height:1.5;color:#8A857B;margin:18px 0 0;border-top:1px solid rgba(22,20,15,.12);padding-top:16px">Verhinderd? Annuleer kosteloos tot 24 uur op voorhand via de knop hierboven. Daarna brengt een annulering kosten mee. Walk-ins blijven altijd welkom.</p>
  </div>
  <div style="background:#16140F;padding:16px;text-align:center;color:#8F897C;font-family:Arial,sans-serif;font-size:12px">Kameraad Haarsnijder · Parijsstraat 29, Leuven</div>
</div>`;

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject: 'Je afspraak bij Kameraad Haarsnijder is bevestigd', html }),
    });
    const rj = await r.json();
    if (!r.ok) return json({ error: 'resend_failed', detail: rj }, 502);
    // Log the confirmation send (typed).
    await sb.from('email_log').insert({
      appointment_id: a.id, customer_id: (a as any).customer_id ?? null, email_type: 'confirmation',
      to_email: to, subject: 'Je afspraak bij Kameraad Haarsnijder is bevestigd', status: 'sent',
    });
    return json({ sent: true, id: rj.id, to });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
