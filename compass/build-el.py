#!/usr/bin/env python3
"""build-el.py — generate the Greek (Ελληνικά) edition of the Atlas.

Reads data.js (structure + language-neutral fields) and data.el.js (Greek
overrides), and renders a Greek hub + one Greek page per problem under
compass/el/. Greek pages are self-contained, indexable, hreflang-linked
with their English counterparts, and funnel into the interactive app and
the prefilled tools. Run after data.js or data.el.js changes:

    python3 compass/build-el.py

Refreshes the compass-el block in sitemap.xml between marker comments.
"""
from __future__ import annotations

import html
import json
import re
import subprocess
from datetime import date
from pathlib import Path
from urllib.parse import quote

COMPASS = Path(__file__).resolve().parent
ROOT = COMPASS.parent
OUT = COMPASS / "el"
SITE = "https://tools.panoskokmotos.com"
TODAY = date.today().isoformat()


def load() -> tuple[list[dict], dict, dict]:
    dump = subprocess.run(
        ["node", "-e",
         "const fs=require('fs');"
         "const a=fs.readFileSync(process.argv[1],'utf8');"
         "const b=fs.readFileSync(process.argv[2],'utf8');"
         "const r=new Function(a+';'+b+'; return {COMPASS_PROBLEMS, COMPASS_CATEGORIES, COMPASS_EL};')();"
         "console.log(JSON.stringify(r));",
         str(COMPASS / "data.js"), str(COMPASS / "data.el.js")],
        capture_output=True, text=True, check=True)
    d = json.loads(dump.stdout)
    return d["COMPASS_PROBLEMS"], d["COMPASS_CATEGORIES"], d["COMPASS_EL"]


def esc(s: str) -> str:
    return html.escape(str(s), quote=True)


def analytics() -> str:
    shell = (COMPASS / "index.html").read_text()
    m = re.search(r"(<!-- Google tag \(gtag\.js\) -->[\s\S]*?person_profiles: \"identified_only\"\s*\}\);\s*</script>)", shell)
    return m.group(1) if m else ""


def el(p: dict, over: dict) -> dict:
    """Merge Greek overrides onto a problem."""
    o = over["problems"].get(p["id"], {})
    deep = over.get("deep", {}).get(p["id"])
    return {
        "id": p["id"], "emoji": p["emoji"], "category": p["category"],
        "dir": p["trend"]["dir"],
        "name": o.get("name", p["name"]),
        "stat": o.get("stat", p["stat"]),
        "trend": o.get("trend", p["trend"]["text"]),
        "misconception": o.get("misconception", p["understand"]["misconception"]),
        "en_name": p["name"],
        "deep": deep,                    # full Greek article, or None
        "en": p,                         # English source for evidence labels
    }


EVIDENCE_EL = {"strong": "Ισχυρά στοιχεία", "promising": "Πολλά υποσχόμενο", "debated": "Υπό συζήτηση"}
OFFER_EL = {"money": ("💶", "χρήματα"), "time": ("⏰", "χρόνο"), "skills": ("🛠️", "δεξιότητες"), "voice": ("📣", "φωνή")}


def deep_sections(e: dict) -> str:
    """Full-article Greek body (Understand / What works / Act)."""
    d, en = e["deep"], e["en"]
    understand = f"""
    <div class="cx-section">
      <div class="cx-section-label">🧠 Κατανόησε</div>
      <div class="cx-card">
        <div class="cx-fact"><div class="cx-fact-k">Η τάση</div><div class="cx-fact-v">{esc(e['trend'])}</div></div>
        <div class="cx-fact"><div class="cx-fact-k">Το μέγεθος</div><div class="cx-fact-v">{esc(d['scale'])}</div></div>
        <div class="cx-fact"><div class="cx-fact-k">Βαθύτερες αιτίες</div><div class="cx-fact-v">{esc(d['causes'])}</div></div>
        <div class="cx-fact"><div class="cx-fact-k">Ποιοι υποφέρουν περισσότερο</div><div class="cx-fact-v">{esc(d['sufferers'])}</div></div>
        <div class="cx-fact cx-fact-mis" style="margin-bottom:0"><div class="cx-fact-k">Κοινή παρανόηση</div><div class="cx-fact-v">{esc(e['misconception'])}</div></div>
      </div>
    </div>"""
    ivs = "\n".join(f"""
        <div class="cx-card cx-iv-card">
          <div class="cx-iv-top"><span class="cx-iv-name">{esc(iv['name'])}</span>
            <span class="cx-badge cx-badge-{en_iv['evidence']}">{EVIDENCE_EL[en_iv['evidence']]}</span></div>
          <div class="cx-iv-what">{esc(iv['what'])}</div>
          <div class="cx-iv-cost"><strong>Κόστος &amp; αποτέλεσμα:</strong> {esc(iv['cost'])}</div>
        </div>""" for iv, en_iv in zip(d["interventions"], en["interventions"]))
    works = f"""
    <div class="cx-section">
      <div class="cx-section-label">⚡ Τι πραγματικά λειτουργεί</div>
      <div class="cx-iv">{ivs}</div>
    </div>"""
    groups = "\n".join(f"""
          <div class="cx-act-group">
            <div class="cx-act-title">{OFFER_EL[k][0]} Με τη/τον {OFFER_EL[k][1]} σου</div>
            {''.join(f'<div class="cx-act-item">{esc(a)}</div>' for a in items)}
          </div>""" for k, items in d["actions"].items() if items)
    return understand + works + f"""
    <div class="cx-section">
      <div class="cx-section-label">🧭 Δράσε</div>
      <div class="cx-card">{groups}</div>
    </div>"""


def head(title: str, desc: str, canonical: str, en_alt: str, og_title: str, analytics_html: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="el">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="upgrade-insecure-requests" />
  {analytics_html}
  <title>{esc(title)}</title>
  <meta name="description" content="{esc(desc)}" />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="../app.css" />
  <link rel="icon" href="../icon.svg" type="image/svg+xml" />
  <meta name="theme-color" content="#0a0f1e" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <link rel="canonical" href="{canonical}" />
  <link rel="alternate" hreflang="el" href="{canonical}" />
  <link rel="alternate" hreflang="en" href="{en_alt}" />
  <link rel="alternate" hreflang="x-default" href="{en_alt}" />
  <meta property="og:title" content="{esc(og_title)}" />
  <meta property="og:description" content="{esc(desc)}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="{canonical}" />
  <meta property="og:image" content="{SITE}/og-ai-tools.png" />
  <meta property="og:locale" content="el_GR" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="{SITE}/og-ai-tools.png" />
</head>
<body>
  <header class="cx-topbar">
    <a class="cx-brand" href="./">
      <img src="../icon.svg" alt="" width="30" height="30" />
      <span>Πυξίδα Αντικτύπου<span class="cx-brand-sub">Κατανόησε · Μείωσε τον πόνο · Νοιάξου</span></span>
    </a>
    <nav class="cx-nav" aria-label="Πλοήγηση">
      <a href="./"><span class="cx-nav-emoji">🗺️</span>Όλα τα προβλήματα</a>
      <a href="../"><span class="cx-nav-emoji">🧭</span>Εφαρμογή</a>
    </nav>
  </header>
"""


def problem_page(e: dict, cats: dict, over: dict, prev_e: dict, next_e: dict, analytics_html: str) -> str:
    url = f"{SITE}/compass/el/{e['id']}.html"
    en_alt = f"{SITE}/compass/p/{e['id']}.html"
    title = f"{e['name']} — το μέγεθος, οι αιτίες και τι πραγματικά βοηθά"
    desc = f"{e['stat']}. Κατανόησε το πρόβλημα και δες πώς μπορείς να βοηθήσεις."
    cat = cats[e["category"]]
    cat_el = over["categories"][e["category"]]
    cause_q = quote(e["en_name"])  # tools match on the English cause name

    if e["deep"]:
        body = deep_sections(e)
    else:
        body = f"""
    <div class="cx-section">
      <div class="cx-section-label">📈 Η τάση</div>
      <div class="cx-card"><div class="cx-fact-v">{esc(e['trend'])}</div></div>
    </div>
    <div class="cx-section">
      <div class="cx-section-label">🧠 Μια κοινή παρανόηση</div>
      <div class="cx-card cx-fact-mis"><div class="cx-fact-v">{esc(e['misconception'])}</div></div>
    </div>"""

    return head(title, desc, url, en_alt, f"{e['emoji']} {e['name']} — Πυξίδα Αντικτύπου", analytics_html) + f"""
  <main class="cx-main">
    <div style="font-size:0.78rem;margin-bottom:14px"><a href="{en_alt}" style="color:var(--text-dim)">🌐 English</a></div>
    <div class="cx-detail-head">
      <span class="cx-detail-emoji">{e['emoji']}</span>
      <div>
        <h1 class="cx-h1" style="font-size:clamp(1.4rem,4vw,2rem)">{esc(e['name'])}</h1>
        <div class="cx-detail-stat">{esc(e['stat'])}</div>
        <div class="cx-detail-badges">
          <span class="cx-badge cx-badge-{e['dir']}">{esc(over['trend'][e['dir']])}</span>
          <span class="cx-badge cx-badge-cat">{cat['emoji']} {esc(cat_el)}</span>
        </div>
      </div>
    </div>
{body}
    <div class="cx-section">
      <div class="cx-section-label">🧭 Δράσε τώρα & πήγαινε βαθύτερα</div>
      <div class="cx-card">
        <div class="cx-detail-ctas">
          <a class="cx-btn" href="../#/problem/{e['id']}">🧭 Συνομιλία AI & σχέδιο δράσης στην εφαρμογή →</a>
        </div>
        <div style="color:var(--text-dim);font-size:0.78rem;margin-top:12px">
          Δράσε: <a href="{SITE}/charity-comparison-engine.html?cause={cause_q}" target="_blank" rel="noopener">σύγκρινε τύπους οργανισμών</a> ·
          <a href="{SITE}/volunteer-match.html?causes={cause_q}" target="_blank" rel="noopener">βρες εθελοντικό ρόλο</a> ·
          <a href="https://givelink.app" target="_blank" rel="noopener">δώσε μέσω Givelink</a>
        </div>
      </div>
    </div>

    <nav class="cx-detail-ctas" aria-label="Περισσότερα" style="margin-top:26px">
      <a class="cx-btn cx-btn-ghost" href="{prev_e['id']}.html">← {prev_e['emoji']} {esc(prev_e['name'])}</a>
      <a class="cx-btn cx-btn-ghost" href="{next_e['id']}.html">{next_e['emoji']} {esc(next_e['name'])} →</a>
    </nav>

    <div class="cx-sources" style="margin-top:22px">Οι αριθμοί είναι κατά προσέγγιση, από δημόσιες πηγές. Πρώτη μετάφραση — υπό αναθεώρηση.</div>
    <div class="cx-footer">Πυξίδα Αντικτύπου · από τον <a href="https://panoskokmotos.com">Πάνο Κοκμοτό</a> · μέρος των <a href="{SITE}/">εργαλείων AI for Social Impact</a> · με τη δύναμη του Claude AI</div>
  </main>
</body>
</html>
"""


def hub_page(items: list[dict], cats: dict, over: dict, analytics_html: str) -> str:
    cards = "\n".join(
        f'<a class="cx-card cx-problem-card" style="text-decoration:none;color:inherit" href="{e["id"]}.html">'
        f'<div class="cx-problem-top"><span class="cx-problem-emoji">{e["emoji"]}</span>'
        f'<span class="cx-badge cx-badge-{e["dir"]}">{esc(over["trend"][e["dir"]])}</span></div>'
        f'<div class="cx-problem-name">{esc(e["name"])}</div>'
        f'<div class="cx-problem-stat">{esc(e["stat"])}</div>'
        f'<div class="cx-problem-foot"><span class="cx-badge cx-badge-cat">{cats[e["category"]]["emoji"]} {esc(over["categories"][e["category"]])}</span></div>'
        f'</a>' for e in items)
    url = f"{SITE}/compass/el/"
    en_alt = f"{SITE}/compass/p/"
    return head(
        f"Ο Άτλας των Προβλημάτων — {len(items)} από τα μεγαλύτερα προβλήματα του κόσμου",
        f"{len(items)} μεγάλα παγκόσμια προβλήματα: το μέγεθός τους, μια κοινή παρανόηση, και πώς μπορείς να βοηθήσεις. Μέρος της Πυξίδας Αντικτύπου.",
        url, en_alt, "🗺️ Ο Άτλας των Προβλημάτων — Πυξίδα Αντικτύπου", analytics_html) + f"""
  <main class="cx-main">
    <div style="font-size:0.78rem;margin-bottom:14px"><a href="{en_alt}" style="color:var(--text-dim)">🌐 English</a></div>
    <p class="cx-eyebrow">Ο Άτλας των Προβλημάτων</p>
    <h1 class="cx-h1">{len(items)} προβλήματα που αξίζει να καταλάβεις</h1>
    <p class="cx-sub">Για κάθε ένα: το πραγματικό του μέγεθος, η τάση, μια κοινή παρανόηση που διορθώνεται, και δρόμοι για να βοηθήσεις. Πλήρης ανάλυση και AI στην εφαρμογή.</p>
    <div class="cx-atlas" style="margin-top:22px">{cards}</div>
    <div class="cx-footer">Πυξίδα Αντικτύπου · από τον <a href="https://panoskokmotos.com">Πάνο Κοκμοτό</a> · με τη δύναμη του Claude AI</div>
  </main>
</body>
</html>
"""


def update_sitemap(items: list[dict]) -> None:
    sm = ROOT / "sitemap.xml"
    text = sm.read_text()
    block = "\n".join(
        [f"  <url><loc>{SITE}/compass/el/</loc><lastmod>{TODAY}</lastmod><changefreq>monthly</changefreq></url>"] +
        [f"  <url><loc>{SITE}/compass/el/{e['id']}.html</loc><lastmod>{TODAY}</lastmod><changefreq>monthly</changefreq></url>"
         for e in items])
    wrapped = f"  <!-- compass-el:start (generated by compass/build-el.py) -->\n{block}\n  <!-- compass-el:end -->"
    if "compass-el:start" in text:
        text = re.sub(r"  <!-- compass-el:start[\s\S]*?compass-el:end -->", wrapped, text)
    else:
        text = text.replace("</urlset>", wrapped + "\n</urlset>")
    sm.write_text(text)


def main() -> None:
    problems, cats, over = load()
    a = analytics()
    OUT.mkdir(exist_ok=True)
    es = [el(p, over) for p in problems]
    for i, e in enumerate(es):
        (OUT / f"{e['id']}.html").write_text(problem_page(e, cats, over, es[i - 1], es[(i + 1) % len(es)], a))
    (OUT / "index.html").write_text(hub_page(es, cats, over, a))
    update_sitemap(es)
    print(f"generated {len(es)} Greek pages + hub, sitemap updated")


if __name__ == "__main__":
    main()
