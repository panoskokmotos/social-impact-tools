# Purpose

**Find what’s yours to do. Then do it, a little every week.**

A small, private, offline-first web app that helps people find their purpose
and then actually work on a *purpose problem* — a real-world problem worth
their time, sized to the life they have.

## How it works

1. **Discover** (~8 min) — pick up to 5 values, up to 3 problem areas that
   pull at you, up to 3 strengths, answer three optional honest questions
   (flow, anger/heartbreak, lived experience) and say how much time you have.
2. **Choose** — the app drafts an editable *purpose statement*
   (“I use teaching and writing to help get every child reading, because I
   care about fairness and growth.”) and ranks 16 curated purpose problems
   for you, each with the reasons it matched and the role your strengths
   could play.
3. **Work** — commit to one problem. You get missions at three sizes
   (an hour / a month / a year — filtered to your capacity), your own
   custom missions, a time log, a weekly-streak counter, a rotating weekly
   reflection prompt and a 90-day “is this still the right problem?” check-in.

Everything is stored in `localStorage`. No account, no server, no tracking.
Export/import a JSON backup to move devices.

## Files

| File | What it is |
| --- | --- |
| `data.js` | Content: themes, values, strengths, capacity levels, prompts, and the 16 purpose problems. Editorial rules are in its header. |
| `engine.js` | Pure logic (no DOM): theme scoring, problem ranking, purpose statement, plan building, streaks. |
| `app.js` | Hash-routed UI (`#/`, `#/discover`, `#/results`, `#/problems`, `#/problem/<id>`, `#/work`). |
| `app.css` | Styles, light + dark. |
| `sw.js` | Service worker. **Bump `CACHE_NAME` whenever any asset changes** — assets are cache-first. |
| `test.mjs` | Data-integrity + engine tests (Node's built-in runner, zero deps). |

## Run it

```sh
npm start        # serves on http://localhost:8080 (python3 http.server)
npm test         # node --test test.mjs
```

No build step and no dependencies — any static host works (GitHub Pages,
Cloudflare Pages, Netlify).

## Adding a purpose problem

Add an entry to `PROBLEMS` in `data.js`. List the **primary theme first**
(it counts in full when ranking; others count half). `goal` must finish the
sentence “I use … to help ___”. Give at least one mission at each size, roles
keyed by strength ids, approximate figures and named sources. Then run
`npm test` and bump `CACHE_NAME` in `sw.js`.

## Moving to its own repository

This folder is self-contained (all paths are relative). To split it out
with its history into a new, empty GitHub repo:

```sh
git subtree split --prefix=purpose -b purpose-only
git push git@github.com:<you>/purpose.git purpose-only:main
```

Then copy `.github/workflows/purpose-test.yml` across, dropping the
`working-directory` and `paths` lines.

## Ideas for next steps

- Optional AI coach (reflection follow-ups, rewriting the purpose statement)
  via the existing Worker used by Impact Compass.
- Accountability buddy: share a read-only progress link with a friend.
- Local opportunities: link problems to volunteering/job boards by location.
- Translations (Greek first, like Impact Compass).
