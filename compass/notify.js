/**
 * notify.js — client for daily "problem of the day" delivery.
 *
 * Two channels, both handled by a small Cloudflare Worker you deploy
 * (see compass/worker/SETUP.md):
 *   • Email digest  — POST an address to the Worker's /email endpoint
 *   • Web push      — subscribe this device/browser and POST to /push
 *
 * Until the Worker is deployed the calls fail gracefully and the UI says
 * so; the moment it's live (at NOTIFY_BASE) the feature works with no
 * client change. The Worker's cron sends one notification per day.
 */
(function () {
  // After deploying the Worker, set this to its URL (or keep the name below).
  var NOTIFY_BASE = 'https://compass-notify.panagiotis-kokmotoss.workers.dev';
  // VAPID public key (applicationServerKey) — pairs with the private key
  // you set as a Worker secret. Safe to be public.
  var VAPID_PUBLIC_KEY = 'BLSXOCS4Igt3Dif9hGeKNeKdcgznMnRlTFiwQafvp8S_CnK6Ky1M6Sk8OWwBzmKzAJHg8igvAiNlSHguXK7vUqA';

  function urlB64ToUint8(base64) {
    var pad = '='.repeat((4 - base64.length % 4) % 4);
    var b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(b64);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function post(path, body) {
    return fetch(NOTIFY_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  // Email digest. Resolves {ok:true} | {ok:false, reason}
  async function subscribeEmail(email) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, reason: 'invalid' };
    try {
      var r = await post('/email', { email: email, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || '' });
      if (r.ok) { localStorage.setItem('compass_email_sub', email); return { ok: true }; }
      return { ok: false, reason: 'server' };
    } catch { return { ok: false, reason: 'offline' }; }
  }

  // Web push for this device. Resolves {ok:true} | {ok:false, reason}
  async function subscribePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return { ok: false, reason: 'unsupported' };
    if (typeof Notification === 'undefined') return { ok: false, reason: 'unsupported' };
    var perm = Notification.permission;
    if (perm === 'default') { try { perm = await Notification.requestPermission(); } catch {} }
    if (perm !== 'granted') return { ok: false, reason: 'denied' };
    try {
      var reg = await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8(VAPID_PUBLIC_KEY),
        });
      }
      var r = await post('/push', { subscription: sub });
      if (r.ok) { localStorage.setItem('compass_push_sub', '1'); return { ok: true }; }
      return { ok: false, reason: 'server' };
    } catch (e) { return { ok: false, reason: 'offline' }; }
  }

  window.CompassNotify = {
    subscribeEmail: subscribeEmail,
    subscribePush: subscribePush,
    emailSubscribed: function () { return localStorage.getItem('compass_email_sub') || ''; },
    pushSubscribed: function () { return localStorage.getItem('compass_push_sub') === '1'; },
  };
})();
