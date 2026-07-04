# tools.panoskokmotos.com — AI for Social Impact

Standalone suite of free AI tools (Cloudflare Worker + Claude), split out of the
personal site. Static GitHub Pages site; push to publish.

Shared chrome (tool-header, analytics) is single-sourced in `partials/` — run
`python build.py` after editing a partial (`python build.py --check` in CI).
AI backend: the existing `ask-panos.*.workers.dev` Worker (CORS `*`), reused as-is;
endpoints live in `shared.js`.
