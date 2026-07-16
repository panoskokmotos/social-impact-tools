/**
 * Impact Compass — daily notification Worker (Cloudflare).
 *
 * Endpoints (POST, JSON):
 *   /email  { email, tz }        → store an email subscriber
 *   /push   { subscription }     → store a Web Push subscription
 *   /unsubscribe { email } | { endpoint }
 * Cron (see wrangler.toml) → sends the day's problem to everyone:
 *   • email via Resend      (secret RESEND_API_KEY, var FROM_EMAIL)
 *   • web push via VAPID     (secret VAPID_PRIVATE_KEY, vars VAPID_PUBLIC_KEY, VAPID_SUBJECT)
 *
 * Subscribers live in KV namespace SUBS. The day's problem is fetched
 * live from data.js so content never drifts.
 *
 * NOTE: the web-push crypto (RFC 8291 aes128gcm + RFC 8292 VAPID) is
 * implemented with Web Crypto but has not been exercised end-to-end in
 * this repo — send yourself a test after deploy. Email is the
 * guaranteed-reliable channel.
 */

const SITE = 'https://tools.panoskokmotos.com';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    try {
      if (request.method === 'POST' && url.pathname === '/email') return await addEmail(request, env);
      if (request.method === 'POST' && url.pathname === '/push') return await addPush(request, env);
      if (request.method === 'POST' && url.pathname === '/unsubscribe') return await unsub(request, env);
      if (request.method === 'GET' && url.pathname === '/test') { await runDaily(env); return json({ ok: true, ran: 'daily' }); }
      return json({ ok: false, error: 'not found' }, 404);
    } catch (e) {
      return json({ ok: false, error: String(e && e.message || e) }, 500);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDaily(env));
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

/* ── Subscriptions ──────────────────────────────────── */
async function addEmail(request, env) {
  const { email, tz } = await request.json();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || '')) return json({ ok: false, error: 'invalid email' }, 400);
  await env.SUBS.put('email:' + email.toLowerCase(), JSON.stringify({ email, tz: tz || '', at: Date.now() }));
  return json({ ok: true });
}

async function addPush(request, env) {
  const { subscription } = await request.json();
  if (!subscription || !subscription.endpoint) return json({ ok: false, error: 'invalid subscription' }, 400);
  const key = 'push:' + (await sha256hex(subscription.endpoint));
  await env.SUBS.put(key, JSON.stringify(subscription));
  return json({ ok: true });
}

async function unsub(request, env) {
  const body = await request.json();
  if (body.email) await env.SUBS.delete('email:' + String(body.email).toLowerCase());
  if (body.endpoint) await env.SUBS.delete('push:' + (await sha256hex(body.endpoint)));
  return json({ ok: true });
}

/* ── Daily send ─────────────────────────────────────── */
async function problemOfTheDay() {
  const res = await fetch(SITE + '/compass/data.js', { cf: { cacheTtl: 300 } });
  const src = await res.text();
  const list = new Function(src + '; return COMPASS_PROBLEMS;')();
  const idx = Math.floor(Date.now() / 86400000) % list.length;
  return list[idx];
}

async function runDaily(env) {
  const p = await problemOfTheDay();
  const link = `${SITE}/compass/p/${p.id}.html`;
  await Promise.all([sendEmails(env, p, link), sendPushes(env, p, link)]);
}

async function listKeys(env, prefix) {
  const out = [];
  let cursor;
  do {
    const r = await env.SUBS.list({ prefix, cursor });
    out.push(...r.keys.map(k => k.name));
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  return out;
}

/* ── Email via Resend ───────────────────────────────── */
async function sendEmails(env, p, link) {
  if (!env.RESEND_API_KEY) return;
  const keys = await listKeys(env, 'email:');
  const subject = `${p.emoji || '🧭'} Today: ${p.name}`;
  for (const k of keys) {
    const sub = JSON.parse(await env.SUBS.get(k));
    const unsubUrl = `${link}`; // link into the page; unsubscribe handled below
    const html = emailHtml(p, link, sub.email);
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: env.FROM_EMAIL || 'Impact Compass <compass@panoskokmotos.com>',
          to: [sub.email],
          subject,
          html,
        }),
      });
    } catch {}
  }
}

function emailHtml(p, link, email) {
  return `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;background:#0e1530;color:#e9edf8;border-radius:16px;padding:28px">
    <div style="font-size:0.7rem;letter-spacing:0.14em;text-transform:uppercase;color:#e9b64a;font-weight:800">Today's problem · Impact Compass</div>
    <h1 style="font-size:1.5rem;margin:8px 0">${p.emoji || ''} ${p.name}</h1>
    <p style="color:#9aa7c7;font-size:0.95rem">${p.stat}.</p>
    <div style="border-left:3px solid #e9b64a;background:rgba(233,182,74,0.10);padding:10px 14px;border-radius:0 10px 10px 0;font-size:0.9rem;margin:14px 0">${(p.understand && p.understand.misconception) || ''}</div>
    <a href="${link}" style="display:inline-block;background:#e9b64a;color:#221703;font-weight:800;text-decoration:none;padding:12px 22px;border-radius:12px">Understand it & act →</a>
    <p style="color:#5a6684;font-size:0.72rem;margin-top:22px">You get one problem a day from Impact Compass. <a href="${SITE}/compass/#/journey" style="color:#5a6684">Manage</a> · reply STOP to unsubscribe (${email}).</p>
  </div>`;
}

/* ── Web Push (VAPID + aes128gcm, RFC 8291/8292) ─────── */
async function sendPushes(env, p, link) {
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY) return;
  const keys = await listKeys(env, 'push:');
  const payload = JSON.stringify({
    title: `${p.emoji || '🧭'} ${p.name}`,
    body: p.stat + '.',
    url: `./#/problem/${p.id}`,
  });
  for (const k of keys) {
    const sub = JSON.parse(await env.SUBS.get(k));
    try {
      const res = await sendWebPush(sub, payload, env);
      if (res.status === 404 || res.status === 410) await env.SUBS.delete(k); // gone
    } catch {}
  }
}

async function sendWebPush(sub, payloadStr, env) {
  const endpoint = new URL(sub.endpoint);
  const ttl = 86400;
  const jwt = await vapidJwt(endpoint.origin, env);
  const body = await encryptPayload(payloadStr, sub.keys.p256dh, sub.keys.auth);
  return fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'TTL': String(ttl),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'Authorization': `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
    },
    body,
  });
}

/* base64url helpers */
function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/'); s += '='.repeat((4 - s.length % 4) % 4);
  const bin = atob(s); const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a;
}
function bytesToB64url(bytes) {
  let bin = ''; const a = new Uint8Array(bytes);
  for (let i = 0; i < a.length; i++) bin += String.fromCharCode(a[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function concat(...arrs) {
  let len = 0; arrs.forEach(a => len += a.length);
  const out = new Uint8Array(len); let o = 0;
  arrs.forEach(a => { out.set(a, o); o += a.length; }); return out;
}

async function vapidJwt(audience, env) {
  const header = bytesToB64url(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = bytesToB64url(new TextEncoder().encode(JSON.stringify({
    aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || 'mailto:panos@givelink.app',
  })));
  const unsigned = header + '.' + payload;
  // private key JWK from the base64url 'd'; x/y from the public application key
  const pub = b64urlToBytes(env.VAPID_PUBLIC_KEY); // 0x04||X(32)||Y(32)
  const jwk = {
    kty: 'EC', crv: 'P-256', d: env.VAPID_PRIVATE_KEY,
    x: bytesToB64url(pub.slice(1, 33)), y: bytesToB64url(pub.slice(33, 65)), ext: true,
  };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned));
  return unsigned + '.' + bytesToB64url(new Uint8Array(sig)); // Web Crypto returns raw r||s (JOSE)
}

async function encryptPayload(plaintextStr, p256dhB64, authB64) {
  const uaPublic = b64urlToBytes(p256dhB64); // 65 bytes
  const authSecret = b64urlToBytes(authB64);  // 16 bytes
  const plaintext = new TextEncoder().encode(plaintextStr);

  // ephemeral (application server) ECDH keypair
  const asKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey)); // 65 bytes

  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256));

  const salt = crypto.getRandomValues(new Uint8Array(16));

  // IKM = HKDF(salt=auth, ikm=ecdh, info="WebPush: info\0"||ua||as, 32)
  const keyInfo = concat(new TextEncoder().encode('WebPush: info\0'), uaPublic, asPublicRaw);
  const ikm = await hkdf(authSecret, ecdh, keyInfo, 32);

  const cek = await hkdf(salt, ikm, new TextEncoder().encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, new TextEncoder().encode('Content-Encoding: nonce\0'), 12);

  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const record = concat(plaintext, new Uint8Array([2])); // 0x02 = last-record delimiter (padding)
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, record));

  // aes128gcm header: salt(16) | rs(uint32=4096) | idlen(1)=65 | as_public(65)
  const rs = new Uint8Array([0, 0, 0x10, 0]); // 4096
  const header = concat(salt, rs, new Uint8Array([asPublicRaw.length]), asPublicRaw);
  return concat(header, ct);
}

async function hkdf(salt, ikm, info, len) {
  const base = await crypto.subtle.importKey('raw', ikm, { name: 'HKDF' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, base, len * 8);
  return new Uint8Array(bits);
}

async function sha256hex(str) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
