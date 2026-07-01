/* ============================================================
   KAMERAAD — Klantportaal "Je afspraak"
   Token-gated self-service: view + cancel an appointment.
   Reads ?token=<cancel_token>; loads via get_appointment_by_token;
   cancels via cancel_appointment_by_token (server-authoritative,
   idempotent). Late cancel (inside the cancellation window) →
   payment_due + the send-payment-due email (hard fee). In-window
   cancel → free, no charge, no fee mail.
   ============================================================ */
(function () {
  'use strict';
  var SUPABASE_URL = 'https://hzvhyslujvkwqpkevahj.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_s7EpcEpv2hdZiNgufSWLlQ_xsGOifv_';
  var TZ = 'Europe/Brussels';
  var sb = window.supabase && window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  var $ = function (id) { return document.getElementById(id); };
  function show(id) { var e = $(id); if (e) e.hidden = false; }
  function hide(id) { var e = $(id); if (e) e.hidden = true; }
  function money(c) { return '€' + (c % 100 === 0 ? c / 100 : (c / 100).toFixed(2)); }
  function fmtWhen(iso) {
    var d = new Date(iso);
    var day = d.toLocaleDateString('nl-BE', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
    var t = d.toLocaleTimeString('nl-BE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
    return day.charAt(0).toUpperCase() + day.slice(1) + ' om ' + t;
  }
  function token() {
    var p = new URLSearchParams(location.search);
    return p.get('token') || p.get('t') || '';
  }
  function fnCall(name, body) {
    return fetch(SUPABASE_URL + '/functions/v1/' + name, {
      method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).then(function (r) { return r.json(); }).catch(function () { return null; });
  }

  var A = null; // loaded appointment

  function boot() {
    if (!sb) { hide('loading'); show('notfound'); return; }
    var tok = token();
    if (!tok) { hide('loading'); show('notfound'); return; }
    sb.rpc('get_appointment_by_token', { p_token: tok }).then(function (r) {
      hide('loading');
      if (r.error || !r.data || !r.data.length) { show('notfound'); return; }
      A = r.data[0];
      render();
    }).catch(function () { hide('loading'); show('notfound'); });
  }

  function render() {
    if (A.status === 'cancelled') {
      show('cancelled');
      $('cancelledMsg').textContent = A.payment_due
        ? 'Deze afspraak werd te laat geannuleerd. Er wordt een vergoeding aangerekend — je kan die bij je volgende bezoek voldoen.'
        : 'Deze afspraak is geannuleerd. Tot een volgende keer!';
      return;
    }
    if (A.status !== 'confirmed' && A.status !== 'pending') {
      // completed / no_show — nothing to manage
      show('view'); hide('actions');
      $('greeting').textContent = 'Deze afspraak is afgerond';
      $('sub').textContent = 'Er is niets meer te wijzigen.';
    } else {
      show('view');
      $('greeting').textContent = 'Hallo ' + (A.first_name || 'kameraad');
    }
    $('fSvc').textContent = A.service_name || '';
    $('fBarber').textContent = A.barber_name || '';
    $('fWhen').textContent = fmtWhen(A.start_at);

    if (A.is_late) {
      show('warnLate');
      $('warnLate').innerHTML = 'Je annuleert <b>te laat</b> — dit valt binnen het annuleringsvenster van '
        + A.cancellation_window_hours + ' uur. Bij annuleren wordt een vergoeding van <b>' + money(A.price_cents)
        + '</b> aangerekend.';
      $('cancelBtn').textContent = 'Toch annuleren (met kosten)';
    }
  }

  function doCancel() {
    var btn = $('cancelBtn'); btn.disabled = true; btn.textContent = 'Annuleren…';
    hide('errbox');
    sb.rpc('cancel_appointment_by_token', { p_token: token() }).then(function (r) {
      if (r.error || !r.data || !r.data.ok) {
        btn.disabled = false; btn.textContent = 'Afspraak annuleren';
        show('errbox'); $('errbox').textContent = 'Annuleren mislukt. Probeer opnieuw of bel ons op +32 486 33 67 14.';
        return;
      }
      var late = !!r.data.late;
      // Fire the fee email only on a genuine late cancel; the function re-checks its own gate
      // and is idempotent (guards on an existing payment_due log row).
      var after = function () {
        hide('view');
        show('cancelled');
        $('cancelledMsg').textContent = late
          ? 'Je afspraak is geannuleerd. Omdat dit te laat was, wordt een vergoeding aangerekend — je kan die bij je volgende bezoek voldoen. Je ontvangt hierover een e-mail.'
          : 'Je afspraak is geannuleerd. Bedankt om het tijdig te laten weten — tot een volgende keer!';
      };
      if (late && !r.data.already) { fnCall('send-payment-due', { appointment_id: r.data.appointment_id }).then(after); }
      else { after(); }
    }).catch(function () {
      btn.disabled = false; btn.textContent = 'Afspraak annuleren';
      show('errbox'); $('errbox').textContent = 'Annuleren mislukt. Probeer opnieuw of bel ons op +32 486 33 67 14.';
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var b = $('cancelBtn'); if (b) b.addEventListener('click', doCancel);
    boot();
  });
})();
