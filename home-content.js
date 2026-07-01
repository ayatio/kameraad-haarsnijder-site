/* ============================================================
   KAMERAAD HOMEPAGE — CMS content consumer
   Renders owner-published site content on the public homepage:
   the promo banner + the footer social links (shown iff set).
   Reads PUBLISHED from site_content_public (anon); with ?preview=1
   and an owner session it reads the DRAFT from the base table.
   Fail-safe: any error leaves the static page untouched.
   ============================================================ */
(function () {
  'use strict';
  var URL = 'https://hzvhyslujvkwqpkevahj.supabase.co';
  var KEY = 'sb_publishable_s7EpcEpv2hdZiNgufSWLlQ_xsGOifv_';
  var preview = /[?&]preview=1/.test(location.search);
  if (!window.supabase) return;
  var sb = window.supabase.createClient(URL, KEY);

  // minimal fallback so an empty DB still shows the shipped banner
  // Fallback = the site as it ships (matches admin/site-content-db.js DEFAULTS).
  var DEF = {
    banner: { active: true, l: {
      leuvens: { title: 'Zomeractie', text: 'Boek deze moand e combo en krijgt e gratis boordolie van het hois.' },
      nl: { title: 'Zomeractie', text: 'Boek deze maand een combo en krijg een gratis baardolie van het huis.' },
      en: { title: 'Summer offer', text: 'Book a combo this month and get a free beard oil on the house.' },
      fr: { title: "Offre d'été", text: 'Réservez un combo ce mois-ci et recevez une huile à barbe offerte.' },
      es: { title: 'Oferta de verano', text: 'Reserva un combo este mes y llévate un aceite de barba de la casa.' } } },
    contact: { social: { facebook: '', instagram: 'https://www.instagram.com/kameraadhaarsnijder/', tiktok: '', youtube: '' } }
  };
  function isObj(x){ return x && typeof x==='object' && !Array.isArray(x); }
  function merge(base, over){ if(!isObj(base)) return over===undefined?base:over; var o=Object.assign({},base); if(!isObj(over)) return o; Object.keys(over).forEach(function(k){ o[k]= isObj(over[k])&&isObj(base[k])?merge(base[k],over[k]):over[k]; }); return o; }
  function lang(){ return (window.KH && window.KH.lang) || 'nl'; }
  function pick(map){ if(!map) return ''; var l=lang(); if(map[l]!=null) return map[l]; if(map.nl!=null) return map.nl; for(var k in map) if(map[k]!=null) return map[k]; return ''; }

  function apply(content){
    try { renderBanner(merge(DEF.banner, content.banner)); } catch(e){}
    try { renderSocial(merge(DEF.contact, content.contact).social); } catch(e){}
  }

  function renderBanner(b){
    var existing = document.getElementById('khBanner');
    var title = b && b.l ? pick(mapField(b.l,'title')) : '';
    var text  = b && b.l ? pick(mapField(b.l,'text')) : '';
    if (!b || !b.active || !title) { if (existing) existing.remove(); return; }
    if (!existing) {
      existing = document.createElement('div');
      existing.id = 'khBanner';
      existing.setAttribute('role','region');
      existing.style.cssText = 'background:linear-gradient(90deg,#C9A24B,#E1B34B);color:#16140F;font-family:\'Hanken Grotesk\',system-ui,sans-serif;text-align:center;padding:9px 40px 9px 16px;position:relative;z-index:60;font-size:.92rem;line-height:1.35';
      var close = document.createElement('button');
      close.innerHTML = '&times;'; close.setAttribute('aria-label','Sluiten');
      close.style.cssText = 'position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:#16140F;font-size:1.2rem;cursor:pointer;line-height:1';
      close.onclick = function(){ existing.remove(); };
      existing._msg = document.createElement('span');
      existing.appendChild(existing._msg); existing.appendChild(close);
      document.body.insertBefore(existing, document.body.firstChild);
    }
    existing._msg.innerHTML = '<b>' + esc(title) + '</b>' + (text ? ' — ' + esc(text) : '');
  }
  function mapField(lset, f){ var m={}; for(var k in (lset||{})) m[k]= lset[k]? lset[k][f] : ''; return m; }

  function renderSocial(social){
    if (!social) return;
    var map = { Instagram:'instagram', Facebook:'facebook', TikTok:'tiktok', YouTube:'youtube' };
    Object.keys(map).forEach(function(label){
      var a = document.querySelector('.foot__social a[aria-label="'+label+'"]');
      if (!a) return;
      var url = social[map[label]];
      if (url) { a.href = url; a.style.display=''; }
      else { a.style.display='none'; }
    });
    var block = document.querySelector('.foot__social');
    if (block) { var any = Array.prototype.some.call(block.querySelectorAll('a'), function(a){ return a.style.display!=='none'; }); block.style.display = any ? '' : 'none'; }
  }

  function esc(s){ return (''+(s==null?'':s)).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

  function load(){
    // preview + owner session → draft; otherwise published (anon-readable view)
    var q = preview
      ? sb.from('site_content').select('key,draft,published')
      : sb.from('site_content_public').select('key,published');
    q.then(function(r){
      var rows = r.data || [];
      var content = {};
      rows.forEach(function(row){ content[row.key] = preview ? (nonEmpty(row.draft)?row.draft:row.published) : row.published; });
      apply(content);
    }).catch(function(){ apply({}); });
  }
  function nonEmpty(o){ return o && Object.keys(o).length>0; }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
  // re-render on language change so the banner/socials follow the site locale
  window.addEventListener('kh:langchange', load);
})();
