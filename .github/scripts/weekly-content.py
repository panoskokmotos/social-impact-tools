#!/usr/bin/env python3
"""Compose this week's ready-to-post content as a GitHub issue body.

Runs in the weekly-content workflow every Monday: picks the week's problem
by ISO week number (rotating through all 25), reuses the generators in
compass/build-content.py so every figure comes from the Atlas data, and
writes /tmp/title.txt + /tmp/body.md for `gh issue create`.
"""
import datetime
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location("bc", "compass/build-content.py")
bc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bc)

problems, over = bc.load()
week = datetime.date.today().isocalendar()[1]
p = problems[week % len(problems)]
o = over["problems"].get(p["id"], {})
name_el = o.get("name", p["name"])

sections = [
    f"This week's problem: **{p['emoji']} {p['name']}** ({name_el})",
    "",
    "Five minutes: pick one draft below, post it to LinkedIn or the Givelink "
    "list, and one to a Greek community. Alternate angles week to week. "
    f"Page: https://tools.panoskokmotos.com/compass/p/{p['id']}.html",
    "",
    "## English — Angle A (myth → what works)",
    "```", bc.en_post(p), "```",
    "",
    "## English — Angle B (where the trend stands)",
    "```", bc.en_trend_post(p), "```",
]
el_a = bc.el_post(p, over)
el_b = bc.el_trend_post(p, over)
if el_a:
    sections += ["", "## Ελληνικά — Angle A", "```", el_a, "```"]
if el_b:
    sections += ["", "## Ελληνικά — Angle B", "```", el_b, "```"]
sections += [
    "",
    "---",
    "Also worth one send: the embed pitch to a nonprofit "
    "(template in `compass/content-kit.md`). Close this issue once posted.",
]

Path("/tmp/title.txt").write_text(
    f"📣 Week {week}: post {p['emoji']} {p['name']}", encoding="utf-8")
Path("/tmp/body.md").write_text("\n".join(sections), encoding="utf-8")
print(f"composed week {week}: {p['id']}")
