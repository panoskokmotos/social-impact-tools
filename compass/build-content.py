#!/usr/bin/env python3
"""build-content.py — generate a ready-to-post content kit from the Atlas.

Distribution is a channel you work weekly, not a feature you ship once. This
produces a durable, regenerable batch of short posts (one problem, one
misconception people believe, one thing that actually works, one link) in
English and Greek, straight from the curated data so every figure is accurate.
Panos posts them to LinkedIn, the Givelink email list, and Greek communities.

    python3 compass/build-content.py     # writes compass/content-kit.md

Regenerate whenever the Atlas data changes; edit the batch size below.
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

COMPASS = Path(__file__).resolve().parent
SITE = "https://tools.panoskokmotos.com"
BATCH = 25  # how many problems to draft this round (full Atlas)


def load():
    dump = subprocess.run(
        ["node", "-e",
         "const fs=require('fs');"
         "const a=fs.readFileSync(process.argv[1],'utf8');"
         "const b=fs.readFileSync(process.argv[2],'utf8');"
         "const r=new Function(a+';'+b+'; return {COMPASS_PROBLEMS, COMPASS_EL};')();"
         "console.log(JSON.stringify(r));",
         str(COMPASS / "data.js"), str(COMPASS / "data.el.js")],
        capture_output=True, text=True, check=True)
    d = json.loads(dump.stdout)
    return d["COMPASS_PROBLEMS"], d["COMPASS_EL"]


def first_sentence(s: str) -> str:
    s = str(s).strip()
    for sep in (". ", "· ", "; "):
        if sep in s:
            return s.split(sep)[0].strip().rstrip(".") + "."
    return s if s.endswith((".", "!", "?")) else s + "."


def top_intervention(p: dict) -> dict:
    order = {"strong": 0, "promising": 1, "debated": 2}
    return sorted(p["interventions"], key=lambda iv: order.get(iv["evidence"], 3))[0]


def en_post(p: dict) -> str:
    iv = top_intervention(p)
    link = f"{SITE}/compass/p/{p['id']}.html"
    return (
        f"{p['emoji']} {p['name']}: {p['stat']}\n\n"
        f"A common misconception: {p['understand']['misconception']}\n\n"
        f"What the evidence actually points to: {iv['name']} — {first_sentence(iv['what'])} {first_sentence(iv['cost'])}\n\n"
        f"Understand it in three minutes, and see concrete ways to help:\n{link}"
    )


def en_trend_post(p: dict) -> str:
    """Short second angle: where the trend stands. Hope or urgency, honestly."""
    link = f"{SITE}/compass/p/{p['id']}.html"
    return (
        f"{p['emoji']} Where {p['name'].lower()} stands right now: {p['trend']['text']}\n\n"
        f"The scale: {p['stat']}.\n\n"
        f"What the evidence says actually works, and what you can do:\n{link}"
    )


def el_trend_post(p: dict, over: dict) -> str | None:
    o = over["problems"].get(p["id"], {})
    if not over.get("deep", {}).get(p["id"]):
        return None
    name = o.get("name", p["name"])
    stat = o.get("stat", p["stat"])
    trend = o.get("trend", p["trend"]["text"])
    link = f"{SITE}/compass/el/{p['id']}.html"
    return (
        f"{p['emoji']} Πού βρίσκεται σήμερα το πρόβλημα «{name}»: {trend}\n\n"
        f"Το μέγεθος: {stat}.\n\n"
        f"Τι δείχνουν τα στοιχεία ότι πραγματικά λειτουργεί, και τι μπορείς να κάνεις:\n{link}"
    )


def el_post(p: dict, over: dict) -> str | None:
    o = over["problems"].get(p["id"], {})
    deep = over.get("deep", {}).get(p["id"])
    if not deep:
        return None
    name = o.get("name", p["name"])
    stat = o.get("stat", p["stat"])
    mis = o.get("misconception", p["understand"]["misconception"])
    # top Greek intervention aligned by index with the English evidence order
    order = {"strong": 0, "promising": 1, "debated": 2}
    pairs = sorted(zip(deep["interventions"], p["interventions"]),
                   key=lambda pr: order.get(pr[1]["evidence"], 3))
    iv = pairs[0][0]
    link = f"{SITE}/compass/el/{p['id']}.html"
    return (
        f"{p['emoji']} {name}: {stat}\n\n"
        f"Μια συνηθισμένη παρανόηση: {mis}\n\n"
        f"Τι δείχνουν πραγματικά τα στοιχεία: {iv['name']} — {first_sentence(iv['what'])} {first_sentence(iv['cost'])}\n\n"
        f"Κατάλαβέ το σε τρία λεπτά, και δες συγκεκριμένους τρόπους να βοηθήσεις:\n{link}"
    )


OUTREACH = f"""## Outreach template — inviting a site to embed a problem card

Short, warm, no pressure. Personalize the first line to their work.

> Subject: a free, self-updating world-problem card for your site
>
> Hi {{name}},
>
> I built a small free tool that might fit your site. It's a live card on any
> of twenty-five world problems, the honest scale, the trend, and a link to
> what the evidence says actually works. It updates itself, costs nothing,
> needs no account, and drops no cookies on your visitors.
>
> One line of HTML, a preview, and the snippets are here:
> {SITE}/compass/for-nonprofits.html
>
> If it's useful, wonderful. If not, no worries at all.
>
> Panos
"""


def main() -> None:
    problems, over = load()
    batch = problems[:BATCH]
    out = ["# Impact Compass — content kit (full Atlas)",
           "",
           "Ready-to-post drafts straight from the Atlas, so every figure is accurate. "
           "Two angles per problem, in English and Greek. Angle A: one misconception "
           "people believe, one thing that actually works, one link. Angle B: a short "
           "where-the-trend-stands post. Alternate them week to week on LinkedIn, the "
           "Givelink email list, and Greek communities — one problem a week covers half "
           "a year per angle. Edit freely, the facts are the load-bearing part.",
           "",
           OUTREACH,
           "",
           "---",
           "",
           "## English drafts — Angle A (myth → what works)",
           ""]
    for p in batch:
        out.append(f"### {p['emoji']} {p['name']}\n")
        out.append("```")
        out.append(en_post(p))
        out.append("```\n")

    out.append("---\n")
    out.append("## English drafts — Angle B (where the trend stands)\n")
    for p in batch:
        out.append(f"### {p['emoji']} {p['name']}\n")
        out.append("```")
        out.append(en_trend_post(p))
        out.append("```\n")

    out.append("---\n")
    out.append("## Greek drafts — Angle A (Ελληνικά, παρανόηση → τι λειτουργεί)\n")
    for p in batch:
        post = el_post(p, over)
        if not post:
            continue
        o = over["problems"].get(p["id"], {})
        out.append(f"### {p['emoji']} {o.get('name', p['name'])}\n")
        out.append("```")
        out.append(post)
        out.append("```\n")

    out.append("---\n")
    out.append("## Greek drafts — Angle B (Ελληνικά, πού βρίσκεται η τάση)\n")
    for p in batch:
        post = el_trend_post(p, over)
        if not post:
            continue
        o = over["problems"].get(p["id"], {})
        out.append(f"### {p['emoji']} {o.get('name', p['name'])}\n")
        out.append("```")
        out.append(post)
        out.append("```\n")

    (COMPASS / "content-kit.md").write_text("\n".join(out), encoding="utf-8")
    print(f"wrote compass/content-kit.md — {len(batch)} problems, 2 angles, EN + EL")


if __name__ == "__main__":
    main()
