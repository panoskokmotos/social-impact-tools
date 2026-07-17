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


def _sentence(s: str) -> str:
    s = str(s).strip()
    if s and s[-1] not in ".!?;·":
        s += "."
    return s


def _lc_first(s: str) -> str:
    return s[0].lower() + s[1:] if s else s


def faq_el(e: dict) -> list[tuple[str, str]]:
    """Greek Q&A grounded in the deep article — aimed at the questions people
    actually search: how to help, what works best, where to give. Only built
    for problems with a full Greek article; returns [] otherwise."""
    d = e.get("deep")
    if not d:
        return []
    name = e["name"]
    order = {"strong": 0, "promising": 1, "debated": 2}
    pairs = list(zip(d["interventions"], e["en"]["interventions"]))
    pairs.sort(key=lambda pr: order.get(pr[1]["evidence"], 3))
    top = pairs[:2]
    top_names = ", ".join(iv["name"] for iv, _ in top)

    offer_bits = []
    for k in ("money", "time", "skills", "voice"):
        items = d["actions"].get(k) or []
        if items:
            offer_bits.append(f"Με τη/τον {OFFER_EL[k][1]} σου, {_lc_first(_sentence(items[0]))}")
    a1 = "Υπάρχει ένα συγκεκριμένο βήμα για ό,τι μπορείς να προσφέρεις. " + " ".join(offer_bits)

    a2 = "Οι προσεγγίσεις με τα ισχυρότερα στοιχεία: " + " ".join(
        f"{iv['name']}: {_sentence(iv['what'])} {_sentence(iv['cost'])}" for iv, _ in top)

    a3 = (
        f"Η Πυξίδα Αντικτύπου δεν προτείνει συγκεκριμένες οργανώσεις. Ο πιο ουσιαστικός δρόμος είναι να στηρίξεις "
        f"τις παρεμβάσεις που λειτουργούν καλύτερα εδώ ({top_names}) και να επιλέξεις οργανισμούς με βάση τη "
        f"διαφάνεια με την οποία τις υλοποιούν. Σύγκρινε τύπους οργανισμών για αυτόν τον σκοπό με τα δωρεάν "
        f"εργαλεία παραπάνω, ή δώσε χρήσιμα αντικείμενα απευθείας μέσω Givelink."
    )

    return [
        (f"Πώς μπορώ να βοηθήσω με το πρόβλημα «{name}»;", a1),
        (f"Ποιος είναι ο πιο αποτελεσματικός τρόπος να μειωθεί το πρόβλημα «{name}»;", a2),
        (f"Πού να κάνω δωρεά για το πρόβλημα «{name}»;", a3),
    ]


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


def email_capture_el(src: str) -> str:
    """Greek front-door email capture, wired to the same notify worker via
    CompassNotify.subscribeEmail. Live the moment that worker is deployed."""
    return f"""
    <div class="cx-section">
      <div class="cx-card">
        <div class="cx-section-label">✉️ Ένα παγκόσμιο πρόβλημα την εβδομάδα</div>
        <p style="color:var(--text-dim);font-size:0.9rem;margin-bottom:12px">Λάβε ένα πρόβλημα, και κάτι που πραγματικά λειτουργεί απέναντί του, στο inbox σου. Δωρεάν, μία φορά την εβδομάδα, διαγραφή όποτε θες.</p>
        <form class="cx-capture" data-src="{esc(src)}" data-ok="Έγινε — περίμενε το πρώτο σύντομα. 🌍" data-err="Δεν έγινε η εγγραφή αυτή τη στιγμή. Δοκίμασε ξανά σε λίγο." data-invalid="Αυτό το email δεν φαίνεται σωστό." style="display:flex;flex-wrap:wrap;gap:8px">
          <input type="email" required placeholder="onoma@email.com" autocomplete="email" class="cx-input" style="flex:1;min-width:200px" aria-label="Το email σου" />
          <button class="cx-btn" type="submit">Εγγραφή</button>
        </form>
        <div class="cx-capture-msg" style="margin-top:10px;font-size:0.85rem" role="status"></div>
      </div>
    </div>"""


CAPTURE_SCRIPT = """  <script src="../notify.js"></script>
  <script>
  (function(){
    function track(ev,p){try{if(window.posthog&&posthog.capture)posthog.capture('compass_'+ev,p||{})}catch(e){}try{if(window.gtag)gtag('event','compass_'+ev,p||{})}catch(e){}try{if(window.plausible)plausible('compass_'+ev,{props:p||{}})}catch(e){}}
    document.querySelectorAll('.cx-capture').forEach(function(f){
      f.addEventListener('submit',function(e){
        e.preventDefault();
        var input=f.querySelector('input[type=email]');
        var msg=f.parentNode.querySelector('.cx-capture-msg');
        var btn=f.querySelector('button');btn.disabled=true;
        Promise.resolve(window.CompassNotify?CompassNotify.subscribeEmail((input.value||'').trim()):{ok:false,reason:'server'}).then(function(r){
          if(r.ok){track('email_signup',{where:f.dataset.src});msg.textContent=f.dataset.ok;msg.style.color='var(--green)';f.style.display='none';}
          else{btn.disabled=false;msg.textContent=(r.reason==='invalid'?f.dataset.invalid:f.dataset.err);msg.style.color='var(--red)';}
        });
      });
    });
  })();
  </script>
"""


def head(title: str, desc: str, canonical: str, en_alt: str, og_title: str, analytics_html: str, extra_head: str = "") -> str:
    return f"""<!DOCTYPE html>
<html lang="el">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="upgrade-insecure-requests" />
  {analytics_html}
  <title>{esc(title)}</title>
  <meta name="description" content="{esc(desc)}" />
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
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
  {extra_head}
</head>
<body>
  <header class="cx-topbar">
    <a class="cx-brand" href="./">
      <img src="../icon.svg" alt="" width="30" height="30" />
      <span>Πυξίδα Αντικτύπου<span class="cx-brand-sub">Κατανόησε · Μείωσε τον πόνο · Νοιάξου</span></span>
    </a>
    <nav class="cx-nav" aria-label="Πλοήγηση">
      <a href="./"><span class="cx-nav-emoji">🗺️</span>Άτλας</a>
      <a href="../"><span class="cx-nav-emoji">🧭</span>Εφαρμογή</a>
      <a href="{en_alt}" class="cx-lang"><span class="cx-nav-emoji">🌐</span>EN</a>
    </nav>
  </header>
"""


def problem_page(e: dict, cats: dict, over: dict, prev_e: dict, next_e: dict, analytics_html: str) -> str:
    url = f"{SITE}/compass/el/{e['id']}.html"
    en_alt = f"{SITE}/compass/p/{e['id']}.html"
    title = f"{e['name']}: πώς να βοηθήσεις και πού να κάνεις δωρεά"
    desc = f"{e['stat']}. Δες τι πραγματικά μειώνει το πρόβλημα, τις πιο αποτελεσματικές παρεμβάσεις με ειλικρινές κόστος, και πού να εστιάσεις τα χρήματα, τον χρόνο ή τις δεξιότητές σου."
    cat = cats[e["category"]]
    cat_el = over["categories"][e["category"]]
    cause_q = quote(e["en_name"])  # tools match on the English cause name

    share_text = f"{e['emoji']} {e['name']}: {e['stat']}. Δες τι πραγματικά λειτουργεί:"
    st = quote(share_text)
    # Attributed per network so analytics show which share loop carries.
    def _sh(net: str) -> str:
        return quote(f"{url}?utm_source=share&utm_medium={net}")
    stu = quote(f"{share_text} {url}?utm_source=share&utm_medium=whatsapp")
    share_html = f"""
    <div class="cx-section">
      <div class="cx-section-label">📣 Μοιράσου το</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        <a class="cx-chip" href="https://twitter.com/intent/tweet?text={st}&amp;url={_sh('x')}" target="_blank" rel="noopener">𝕏 Post</a>
        <a class="cx-chip" href="https://wa.me/?text={stu}" target="_blank" rel="noopener">💬 WhatsApp</a>
        <a class="cx-chip" href="https://www.linkedin.com/sharing/share-offsite/?url={_sh('linkedin')}" target="_blank" rel="noopener">in LinkedIn</a>
        <a class="cx-chip" href="https://www.facebook.com/sharer/sharer.php?u={_sh('facebook')}" target="_blank" rel="noopener">f Facebook</a>
      </div>
    </div>"""

    qa = faq_el(e)
    faq_section = ""
    extra_head = ""
    if qa:
        rows = "\n".join(
            f'        <div class="cx-fact"><div class="cx-fact-k">{esc(q)}</div><div class="cx-fact-v">{esc(a)}</div></div>'
            for q, a in qa)
        faq_section = f"""
    <div class="cx-section">
      <div class="cx-section-label">❓ Ερωτήσεις που κάνουν οι άνθρωποι</div>
      <div class="cx-card">
{rows}
      </div>
    </div>"""
        faq_jsonld = json.dumps({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
                {"@type": "Question", "name": q,
                 "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in qa],
        }, ensure_ascii=False, indent=2)
        extra_head = f'<script type="application/ld+json">\n{faq_jsonld}\n</script>'

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

    return head(title, desc, url, en_alt, f"{e['emoji']} {e['name']} — Πυξίδα Αντικτύπου", analytics_html, extra_head) + f"""
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
{share_html}
{faq_section}
{email_capture_el('problem')}
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
{CAPTURE_SCRIPT}</body>
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
{email_capture_el('atlas-hub')}
    <div class="cx-atlas" style="margin-top:22px">{cards}</div>
    <div class="cx-footer">Πυξίδα Αντικτύπου · από τον <a href="https://panoskokmotos.com">Πάνο Κοκμοτό</a> · με τη δύναμη του Claude AI</div>
  </main>
{CAPTURE_SCRIPT}</body>
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
