# Architecture — AI for Social Impact (tools.panoskokmotos.com)

Free, open, no-account tools that help real people solve real problems: donors
give better, volunteers find their place, nonprofits work smarter — and, with
the Crisis Resource Finder, people in need reach verified help. This document
is the map: what exists, the principles that keep it safe and useful, and
where it goes next.

## Impact thesis

Most "AI for good" tools fail people in one of three ways: they require an
account, they cost money, or they hallucinate exactly when accuracy matters
most. This suite takes the opposite bet:

- **Zero friction.** Static pages, no signup, no paywall, instant. A person in
  crisis or a case worker mid-call can use every tool in under a minute.
- **Distribution through nonprofits.** Every tool is embeddable (iframe
  snippets for HTML/WordPress/Wix/Webflow) and printable, so nonprofits are
  the channel: a shelter embeds the finder on its site, a case worker pins the
  printed hotline one-pager to the office board. GitHub Pages sends no
  `X-Frame-Options` header — embedding working is load-bearing; don't add one.
- **AI for judgment, verified data for facts.** The model is good at
  understanding a messy human situation; it is not allowed to be the source of
  a phone number. See the data layer principle below.

## Platform map

```
Browser (static HTML on GitHub Pages, domain: tools.panoskokmotos.com)
 ├─ shared.js        endpoints + markdown renderer + notify helper (single source)
 ├─ tool-utils.js    tool framework: callWorker (streaming + fallback), loading/
 │                   error/result UI, example chips, share/embed/related/usage
 │                   widgets, autosave, offline result restore, voice input
 ├─ chat.js          "Ask Panos" site-wide chat widget
 ├─ style.css        global styles (CSS custom props, dark theme)
 ├─ sw.js            service worker: precache all pages + data, network-first
 │                   HTML, cache-first assets, never caches Worker API calls
 ├─ partials/        single source for shared chrome (nav, footer, tool-header,
 │                   gtag, plausible, posthog) — synced into pages by build.py
 └─ data/            versioned, human-verified datasets (crisis-resources.json)

Cloudflare Worker (ask-panos.*.workers.dev) — shared AI backend
 ├─ POST /api/v1/tool    {systemPrompt, userMessage} → {result}
 ├─ POST /api/v1/stream  same request → streamed text (preferred path)
 ├─ POST /api/v2/tool    "Go Deeper" enhanced route
 ├─ POST /notify         fire-and-forget usage pings (client-visible secret,
 │                       rate-limited server-side)
 └─ GET  /api/charity-search   charity autocomplete
```

There is no build step to deploy — pages are committed fully rendered and
served as-is. `python build.py` syncs the shared chrome from `partials/` into
every page's `<!-- include:X -->` markers; `python build.py --check` guards CI.

## The data layer principle (why the Crisis Resource Finder is different)

Twelve of the thirteen tools are pure AI: the model's text *is* the product,
and a wrong sentence costs nothing. Crisis routing is different — a wrong
hotline digit is actively harmful. So the finder splits responsibilities:

- **AI triages.** It reads the situation, returns strict JSON — category tags,
  urgency, country, plain-language guidance — and is contractually forbidden
  (in the system prompt) from emitting any phone number, URL, or contact
  detail. The client regex-strips anything phone- or URL-shaped from its text
  anyway, and never renders raw model output on parse failure.
- **The dataset answers.** Every contact shown comes from
  `data/crisis-resources.json`: versioned, reviewable line-by-line in PRs,
  with `verified_date` and `source` **mandatory on every entry**. The page
  renders cards from this file only.
- **Offline keeps working.** The dataset is precached by sw.js, so hotlines
  stay browsable with no connection — phone lines don't need internet.

This is the template for any future tool where facts must be right (benefit
eligibility, legal deadlines, medical services): AI understands, curated open
data answers.

## Tool roadmap

**Now shipping**
- Crisis Resource Finder v1: AI triage + verified US/Greece/international
  dataset, offline category browser, printable one-pager, quick exit, no
  persistence of anything typed.

**Near term**
- Grow the dataset via community PRs — the schema already carries
  `scope.state` for US state-level programs (state DV coalitions, state SNAP
  lines, county 211 nuances). Each PR must cite the official source.
- Dedicated widget mode for the finder (`?embed=1`: hide chrome, tighter
  layout) so nonprofit sites can embed just the resource flow.
- Greek i18n for the finder UI (the dataset already includes Greek lines);
  then a shared i18n pattern for the rest of the suite.

**Longer term**
- Serve `crisis-resources.json` from the Worker as an open CORS API with ETag
  caching, so other nonprofit apps can build on the verified dataset — the
  dataset becomes the product.
- Partnerships: 211s, mutual-aid networks, and shelters both consuming the
  widget and feeding verified entries back.
- Migrate the two legacy tools (`what-would-x-do.html`,
  `why-should-i-give.html`) that still bypass `callWorker` onto the shared
  framework, so backend changes stay one-file.

## Contributing a resource (the integrity contract)

1. Add an entry to `data/crisis-resources.json` following the existing shape.
2. `source` must be the **official** site of the operating organization or a
   government page — never an aggregator, news article, or Wikipedia.
3. `verified_date` is the date **you actually checked** the number on that
   official source — not the commit date.
4. Prefer `null` over guesses: a missing `hours` field is safe; a wrong one
   is not. (Example: Trans Lifeline's hours change often, so the entry says
   to check their site instead of asserting a schedule.)
5. Validate before committing:
   `python -m json.tool data/crisis-resources.json > /dev/null`
   and confirm every entry's `categories` exist in the top-level `categories`
   list.

## Measurement — counting impact, not vanity

The metric that matters is **`crisis_resource_click`** (PostHog): a person saw
a verified resource and tapped call/chat/website. Properties are limited to
`{resource_id, category, urgency}` — never the situation text, never
identity. `crisis_triage_done` counts completed triages. Standard page
analytics (GA4/Plausible/PostHog) cover the rest of the suite.

Privacy rules for the finder are absolute: no autosave of inputs (its form
deliberately does not use the framework's `toolForm` id), no results history,
no situation text in URLs, analytics, or logs.

## Safety principles (crisis contexts)

1. **Emergency numbers are static HTML** — the 911/112/988 banner is hardcoded
   at the top of the page and survives JS failure, offline mode, and AI outage.
2. **AI never sources a contact.** Prompt contract + client-side sanitizer +
   no-raw-output fallback to the manual category picker.
3. **Nothing typed is stored**, anywhere, ever.
4. **Offline-first for hotlines** — the dataset ships in the service-worker
   precache; bump `CACHE_NAME` in sw.js whenever the precache list changes or
   returning visitors will silently miss it.
5. **Quick exit** for domestic-violence contexts (`location.replace`, so the
   page also drops out of back-button history).
6. **Plain language, mobile-first, tel: links** — the target user is stressed,
   on a phone, possibly on a bad connection.
