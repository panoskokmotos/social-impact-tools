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

4. **Conduct — become an Explorer of Purpose.** Machines can increasingly do
   the grunt work of creation; the human job is to set the North Star and
   decide what deserves to exist. In Conduct you:
   - write your **North Star** (purpose statement + “in ten years the world is
     different because…”);
   - chart an **expedition**: one specific thing that should exist, for whom,
     what changes for them, how you’ll know, and what it must never do
     (each problem offers a couple of starting ideas);
   - pass the **usefulness test** — at least 4 of 6 honest checks (“I can
     name a real person who needs this”, “I know what they do today
     instead”…) before anything gets built;
   - get **the orchestra**: ready-to-paste prompts for six AI agent roles
     (Scout, Architect, Builder, Critic, Measurer, Storyteller), each carrying
     your North Star and brief, plus the whole brief as Markdown;
   - or play it **live in the app**: Scout → Architect → Critic → Measurer →
     Storyteller run one at a time on the AI. Nothing moves on until
     the Explorer approves it; their edits and written direction are what the
     next agent receives, and re-running a step clears the ones after it.
     The Builder stays copy-paste (real building happens in a coding agent),
     and its prompt then carries every approved step;
   - optionally **Ask the Critic** — an in-app AI critique of the brief;
   - move it through Charting → Conducting → Shipped → Learning and record
     **what changed for real people**.

5. **Accountability buddy.** From *My work*, send a friend a weekly update:
   a plain-text message (for WhatsApp, Signal, email) and, on the public
   site, a **progress link** that opens a read-only page with your purpose,
   hours this week, streak, missions and recent work. You choose whether
   log notes and expeditions are included; reflections never are. The link
   carries the snapshot inside its `#fragment`, so there is no server and
   nothing is uploaded — send a fresh one each week (the app nudges you
   after 7 days).

Everything is stored in `localStorage`. No account, no server, no tracking. The
exceptions are the optional AI buttons in Conduct (Ask the Critic and the
live run), which send that expedition's brief and approved hand-offs —
never the profile, logs or reflections — to an AI:
- **inside a Claude page (Artifact)** the app asks Claude directly on the
  viewer's own account (the `sample` capability; the viewer is asked to
  allow it the first time);
- **everywhere else** it uses the AI Worker shared with Impact Compass.

## Files

| File | What it is |
| --- | --- |
| `data.js` | Content: themes, values, strengths, capacity levels, prompts, and the 16 purpose problems. Editorial rules are in its header. |
| `engine.js` | Pure logic (no DOM): theme scoring, problem ranking, purpose statement, plan building, streaks. |
| `conduct.js` | Pure logic for Conduct: usefulness gate, stages, agent role prompts, Markdown brief, critique request, and the live run (order, gating, approvals, hand-off prompts). |
| `buddy.js` | Pure logic for the accountability buddy: snapshot, link encoding, strict decoding of untrusted links, message text. |
| `app.js` | Hash-routed UI (`#/`, `#/discover`, `#/results`, `#/problems`, `#/problem/<id>`, `#/work`, `#/conduct`, `#/expedition/<id>`, `#/buddy/<snapshot>`). |
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

## Ideas for next steps

- Optional AI coach for reflections and the purpose statement.
- Local opportunities: link problems to volunteering/job boards by location.
- Translations (Greek first, like Impact Compass).
