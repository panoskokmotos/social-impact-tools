# tools.panoskokmotos.com — AI for Social Impact

Standalone suite of free AI tools (Cloudflare Worker + Claude), split out of the
personal site. Static GitHub Pages site; push to publish.

Shared chrome (tool-header, analytics) is single-sourced in `partials/` — run
`python build.py` after editing a partial (`python build.py --check` in CI).
AI backend: the existing `ask-panos.*.workers.dev` Worker (CORS `*`), reused as-is;
endpoints live in `shared.js`.

## Impact Compass (`compass/`)

A standalone, installable PWA at `/compass/` — mission: increase knowledge and
understanding, reduce suffering, expand the reach of care. Self-contained
(everything path-relative, so it can move to its own domain untouched):

- `compass/data.js` — the Problem Atlas: 25 curated world problems. Editorial
  rules live in the file header: approximate figures phrased as approximate,
  named sources, evidence ratings (`strong`/`promising`/`debated`), org types
  not real charities. **Add a problem here** and the app (atlas, plan dropdown,
  counts) picks it up automatically; also add one `<li>` to the static SEO list
  in `compass/index.html`.
- `compass/app.js` — hash-routed SPA (Home / Atlas / Problem / Plan / Journey),
  localStorage state (`compass_state_v1`), AI client speaking the same Worker
  protocol as `tool-utils.js` (`/api/v1/stream` + `/api/v1/tool` fallback).
- `compass/sw.js` — app-scoped service worker. **Bump `CACHE_NAME` whenever
  app.js/app.css/data.js change** — assets are cache-first, so without a bump
  existing users keep old files.
- `compass/p/` — static, indexable page per problem (search + link previews;
  the SPA's hash routes are invisible to crawlers). Generated, committed
  output: **run `python3 compass/build-pages.py` after any data.js change** —
  it re-renders all pages and refreshes the compass block in `sitemap.xml`.
  In-app shares and the tools' `?cause=` deep links point at these pages.
- Not wired into `build.py` partials — the app has its own chrome by design.
