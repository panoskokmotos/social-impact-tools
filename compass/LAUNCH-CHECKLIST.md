# Launch checklist — the three actions that switch everything on

Everything in this repo is built, verified, and deployed. These three actions
need Panos's accounts and take minutes each. Everything else runs itself.

## 1. Revive the AI (personalized plans + deep-dive chat, all tools)

The `ask-panos` Cloudflare worker throws on every call; the app falls back to
starter plans, so nothing dead-ends, but personalization is off.

```
npx wrangler tail ask-panos        # terminal 1, leave running
```

```
curl -sS -X POST https://ask-panos.panagiotis-kokmotoss.workers.dev/api/v1/tool \
  -H 'content-type: application/json' \
  -d '{"systemPrompt":"You are terse.","userMessage":"say hi"}'   # terminal 2
```

The real error appears in terminal 1. Almost certainly: the request body sets
`temperature` (or `top_p`, `top_k`, `budget_tokens`), which Claude Sonnet 5
rejects with a 400. Fix: delete those parameters from the worker's request
body, confirm the model string is exactly `claude-sonnet-5` (or
`claude-haiku-4-5`, cheapest), redeploy. Re-run the curl: a one-sentence
reply means every tool on the site is alive again.

## 2. Tell Google (the 53 SEO pages start earning)

Bing, DuckDuckGo, Yandex, and Ecosia are already notified automatically on
every deploy (IndexNow workflow). Google alone needs Search Console:

1. search.google.com/search-console → Add property → **URL prefix** →
   `https://tools.panoskokmotos.com/`
2. Verify with the **Google Analytics** method (the GA tag is already on
   every page — often verifies in one click). Otherwise copy the HTML-tag
   token and have it added to `index.html`'s head.
3. Sitemaps → submit `sitemap.xml`. Done.

## 3. Deploy the notify worker (email capture starts collecting)

The KV namespace id is already committed in `compass/worker/wrangler.toml`.

```
cd compass/worker
npx wrangler secret put RESEND_API_KEY   # from resend.com, domain verified
npx wrangler deploy
```

Email capture works from that moment; the daily digest needs only the Resend
key. Push notifications can wait (VAPID steps in `SETUP.md`).

## The weekly rhythm (already automated)

Every Monday a GitHub issue opens with the week's ready-to-post drafts, both
angles, EN + EL. Post one, close the issue. Test it now: repo → Actions →
"Weekly content reminder" → Run workflow. The full kit and the nonprofit
outreach template live in `compass/content-kit.md`.
