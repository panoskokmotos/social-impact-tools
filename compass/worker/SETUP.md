# Daily notifications — deploy guide

The Compass app already shows the email + push signup (Journey → "One
problem a day"). It talks to a small Cloudflare Worker you deploy once.
Two channels: **email** (reliable, works everywhere) and **web push**
(phones/desktop browsers). You can enable just email first.

Everything below is ~15 minutes. The client already points at
`https://compass-notify.<your-subdomain>.workers.dev` — deploy with the
name `compass-notify` and it connects automatically; otherwise edit
`NOTIFY_BASE` at the top of `compass/notify.js` and redeploy the site.

## 0. Prerequisites
- A Cloudflare account (free) and `npx wrangler login`.
- For email: a [Resend](https://resend.com) account (free tier) with your
  sending domain verified, and an API key.

## 1. Create the KV namespace
```
cd compass/worker
npx wrangler kv namespace create SUBS
```
Paste the printed `id` into `wrangler.toml` (`kv_namespaces` → `id`).

## 2. Generate your own VAPID keys (keeps the secret out of the repo)
A throwaway placeholder public key ships in `notify.js` / `wrangler.toml`.
Generate a real pair that only you hold:
```
node -e "const c=require('crypto');const{publicKey,privateKey}=c.generateKeyPairSync('ec',{namedCurve:'prime256v1'});const p=publicKey.export({type:'spki',format:'der'});const u=b=>Buffer.from(b).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');console.log('PUBLIC :',u(p.slice(p.length-65)));console.log('PRIVATE:',privateKey.export({format:'jwk'}).d)"
```
- Put **PUBLIC** into `VAPID_PUBLIC_KEY` in `wrangler.toml` **and** into
  `VAPID_PUBLIC_KEY` in `compass/notify.js` (they must match), then bump
  `CACHE_NAME` in `compass/sw.js`, commit and push the site.
- Set **PRIVATE** as a secret (never commit it):
```
npx wrangler secret put VAPID_PRIVATE_KEY      # paste the PRIVATE value
npx wrangler secret put RESEND_API_KEY         # from resend.com (email)
```
Adjust `VAPID_SUBJECT` and `FROM_EMAIL` in `wrangler.toml` to your
verified addresses.

## 3. Deploy
```
npx wrangler deploy
```
Confirm the URL is `https://compass-notify.<subdomain>.workers.dev`. If
different, update `NOTIFY_BASE` in `compass/notify.js`, run
`python3 compass/build-pages.py` is not needed (SPA only), bump the
service-worker cache in `compass/sw.js`, commit and push.

## 4. Test before trusting the cron
```
# fires the daily send immediately to all current subscribers
curl https://compass-notify.<subdomain>.workers.dev/test
```
- Sign yourself up in the app (email + "send push to this device"),
  then hit `/test` and confirm you receive both.
- **Web push note:** the payload encryption (RFC 8291 aes128gcm) is
  validated by a round-trip test — run `node compass/worker/test-webpush.mjs`
  (it encrypts then independently decrypts and confirms the plaintext). What
  that test can't cover is VAPID auth against a real push service, so still
  send yourself one `/test` after deploy. If a push fails, check the Worker
  logs (`npx wrangler tail`) — email is unaffected and is the guaranteed channel.

## 5. Done
The cron in `wrangler.toml` (`0 8 * * *` = 08:00 UTC) sends the day's
problem — fetched live from `data.js`, so it always matches the app —
to every subscriber. Dead push subscriptions (404/410) are pruned
automatically.

### Endpoints (for reference)
- `POST /email  {email, tz}`
- `POST /push   {subscription}`
- `POST /unsubscribe {email} | {endpoint}`
- `GET  /test`   — run the daily send now
