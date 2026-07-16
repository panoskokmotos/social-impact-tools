# Atlas Content Notes — audit trail & maintenance guide

The Problem Atlas (`compass/data.js`) trades precision for honesty: every figure
is an approximation of published estimates, phrased as approximate, with named
sources. This file records when the content was last audited, what was
corrected, and which figures decay fastest — so honesty survives maintenance.

## Languages

- **English** — 25 problems, full articles, source of truth (`data.js`).
- **Greek** (`data.el.js`, pages at `/compass/el/`) — **all 25 problems now
  translated to full-article depth** (name, stat, trend, misconception, scale,
  causes, sufferers, interventions with costs, actions). First-pass translation;
  a native-speaker review before heavy promotion is still recommended. Regenerate
  with `python3 compass/build-el.py` after any `data.js`/`data.el.js` change.
  Adding a new problem to `data.js` means adding its Greek entry (summary +
  `deep`) to `data.el.js`, or its Greek page falls back to English gracefully.

## Audit: July 2026 (independent two-auditor fact-check)

All 25 entries were adversarially checked against the published evidence base
(World Bank, WHO, UNICEF, UNHCR, FAO, UNAIDS, ITU, IPCC, Our World in Data,
GiveWell-style analyses, major trial literature).

### Batch 1 — problems 1–13: six corrections shipped

| Problem | Correction |
|---|---|
| Extreme poverty | Retired $2.15 (2017 PPP) line → current **$3.00 (2021 PPP)**: ~800M people, ~1 in 10 (World Bank, June 2025 update) |
| Gender inequality | FGM: "over 100M" → **over 230M** girls and women alive today (UNICEF 2024) |
| Malaria | Death **rates** roughly halved 2000–2015; absolute deaths fell ~35% |
| Hunger | RUTF full treatment course ~**$100–200**/child (paste alone ≈ $50) |
| Extreme poverty | Graduation programs cost range widened to ~$300–2,000+ (six-country RCT costings) |
| Homelessness | Housing First: partial cost offsets, **approaching** neutrality only for highest-need group (not "often cost-neutral") |

Clean: child mortality, unsafe water, education, loneliness, refugees,
climate change, air pollution, factory farming.

### Batch 2 — problems 14–25

Three minor precision fixes shipped; nine entries clean, including
explicit verification of the lead-poisoning mortality figure (GBD 2021) and
the road-safety speed-to-fatality ratio (WHO).

| Problem | Correction |
|---|---|
| Maternal mortality | "1 in 40 lifetime risk" attributed to Sub-Saharan Africa as a region (worst countries are higher still), per WHO |
| Digital exclusion | "never used the internet" → "are offline" (ITU counts current non-users, not never-users) |
| Ocean health | "primary protein for 3B people" → supplies ~a fifth of animal protein for 3B+ people (FAO) |

Clean: preventable blindness, pandemic preparedness, tuberculosis,
lead poisoning, road deaths, tobacco, HIV/AIDS, neglected tropical diseases,
corruption.

## Figures that go stale fastest — re-verify roughly yearly

- **Extreme poverty**: the World Bank periodically revises the poverty line
  itself (2017→2021 PPP happened mid-2025). Check the line, not just the count.
- **Refugees & displacement**: UNHCR updates totals every June; the number has
  moved by millions per year.
- **Malaria / TB / HIV deaths**: WHO/UNAIDS annual reports; also vaccine and
  regimen rollouts (R21, BPaLM, lenacapavir) change the "what works" story.
- **Digital exclusion**: ITU updates the offline count annually; it falls.
- **Climate**: current-warming figure and trajectory language need refresh
  after each major IPCC/WMO update.
- **Tool-of-the-moment costs** (nets, cash transfers): GiveWell revises
  cost-effectiveness estimates continuously; keep "on the order of" framing.

## Editorial contract (unchanged — see also data.js header)

1. Figures hedged ("roughly", "on the order of") and never falsely precise.
2. Sources named per problem; approximations, not citations.
3. Evidence ratings: `strong` (multiple RCTs / broad consensus), `promising`
   (good but thinner), `debated` (experts disagree) — and every problem names
   at least one popular-but-overrated approach where the evidence supports it.
4. Org types, never real charity names. Acting routes through the AI for
   Social Impact tools and Givelink.
5. No guilt, no doom: agency and honesty.
