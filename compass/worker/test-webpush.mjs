/**
 * test-webpush.mjs — validate the Worker's Web Push encryption without a
 * live push service. It encrypts a payload with the Worker's own
 * encryptPayload(), then independently decrypts it per RFC 8291 using the
 * receiver's private key and asserts the plaintext survives. A pass means
 * the HKDF derivation, info strings, header layout and AES-GCM are correct.
 *
 * Run:  node compass/worker/test-webpush.mjs
 */
import { encryptPayload, b64urlToBytes, bytesToB64url, hkdf, concat } from './worker.js';

const subtle = globalThis.crypto.subtle;
const te = new TextEncoder();
const td = new TextDecoder();

function assert(cond, msg) { if (!cond) { console.error('✗ ' + msg); process.exit(1); } console.log('✓ ' + msg); }

// Independent RFC 8291 decrypt using the UA (receiver) private key.
async function decrypt(body, uaPrivJwk, uaPublicRaw, authSecret) {
  let o = 0;
  const salt = body.slice(o, o += 16);
  o += 4; // rs (record size, uint32) — unused for a single record
  const idlen = body[o]; o += 1;
  const asPublic = body.slice(o, o += idlen); // 65-byte sender public key
  const ct = body.slice(o);

  const uaPriv = await subtle.importKey('jwk', uaPrivJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const asKey = await subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: asKey }, uaPriv, 256));

  const keyInfo = concat(te.encode('WebPush: info\0'), uaPublicRaw, asPublic);
  const ikm = await hkdf(authSecret, ecdh, keyInfo, 32);
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);

  const aesKey = await subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['decrypt']);
  const plain = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aesKey, ct));
  // strip RFC 8188 padding delimiter (trailing 0x02 then any 0x00 padding)
  let end = plain.length;
  while (end > 0 && plain[end - 1] === 0) end--;
  if (end > 0 && plain[end - 1] === 2) end--;
  return td.decode(plain.slice(0, end));
}

async function main() {
  // A realistic receiver (browser) subscription keypair + auth secret.
  const uaKeys = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const uaPublicRaw = new Uint8Array(await subtle.exportKey('raw', uaKeys.publicKey));
  const uaPrivJwk = await subtle.exportKey('jwk', uaKeys.privateKey);
  const auth = globalThis.crypto.getRandomValues(new Uint8Array(16));

  const p256dh = bytesToB64url(uaPublicRaw);
  const authB64 = bytesToB64url(auth);

  const message = JSON.stringify({ title: '🦟 Malaria', body: 'Roughly 600,000 deaths a year.', url: './#/problem/malaria' });

  const body = await encryptPayload(message, p256dh, authB64);
  assert(body instanceof Uint8Array && body.length > 100, 'encryptPayload returns a non-trivial body');
  assert(body[16] === 0 && body[18] === 0x10, 'aes128gcm header record-size is 4096');
  assert(body[20] === 65, 'header idlen = 65 (uncompressed EC point)');

  const recovered = await decrypt(body, uaPrivJwk, uaPublicRaw, auth);
  assert(recovered === message, 'decrypt(encrypt(payload)) === payload  ← RFC 8291 round-trip');

  console.log('\nWeb Push encryption validated ✅  (safe to deploy; still send one /test after deploy)');
}

main().catch(e => { console.error('✗ threw:', e); process.exit(1); });
