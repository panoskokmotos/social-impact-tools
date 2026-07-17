#!/usr/bin/env python3
"""build-pages.py — generate static, indexable pages for every Atlas problem.

The Compass app is a hash-routed SPA, so search engines see one URL for all
25 problems. This script renders each problem from data.js into its own
crawlable page at compass/p/<id>.html — unique title, description, OG tags
and JSON-LD — multiplying the Atlas's reach through search and link previews.
Each page funnels into the app and deep-links the suite tools with the cause
prefilled (the tools read ?<fieldId>=<value> via initShareableURL).

Run after any data.js content change:  python3 compass/build-pages.py
Also refreshes the compass block in sitemap.xml (between marker comments).
Committed output, no deploy-time build — same model as the root build.py.
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
OUT = COMPASS / "p"
SITE = "https://tools.panoskokmotos.com"
TODAY = date.today().isoformat()

TREND_LABEL = {"improving": "↗ Improving", "worsening": "↘ Worsening", "mixed": "↔ Mixed"}
EVIDENCE_LABEL = {"strong": "Strong evidence", "promising": "Promising", "debated": "Debated"}
OFFER_META = {"money": ("💶", "money"), "time": ("⏰", "time"), "skills": ("🛠️", "skills"), "voice": ("📣", "voice")}


def load_problems() -> tuple[list[dict], dict, dict]:
    dump = subprocess.run(
        ["node", "-e",
         "const fs=require('fs');"
         "const a=fs.readFileSync(process.argv[1],'utf8');"
         "const b=fs.readFileSync(process.argv[2],'utf8');"
         "const r=new Function(a+';'+b+'; return {COMPASS_PROBLEMS, COMPASS_CATEGORIES, COMPASS_DONOW};')();"
         "console.log(JSON.stringify(r));",
         str(COMPASS / "data.js"), str(COMPASS / "data-actions.js")],
        capture_output=True, text=True, check=True)
    data = json.loads(dump.stdout)
    return data["COMPASS_PROBLEMS"], data["COMPASS_CATEGORIES"], data["COMPASS_DONOW"]


def esc(s: str) -> str:
    return html.escape(str(s), quote=True)


def _sentence(s: str) -> str:
    s = str(s).strip()
    if s and s[-1] not in ".!?":
        s += "."
    return s


def _lc_first(s: str) -> str:
    return s[0].lower() + s[1:] if s else s


def faq(p: dict, donow: list[dict]) -> list[tuple[str, str]]:
    """Build 3 grounded Q&A from the curated on-page data, aimed at the
    high-intent questions people actually search: how to help, what works
    best, where to give. No new facts — just reframing what's already here."""
    name = p["name"]
    order = {"strong": 0, "promising": 1, "debated": 2}
    ivs = sorted(p["interventions"], key=lambda iv: order.get(iv["evidence"], 3))
    top = ivs[:2]
    top_names = ", ".join(iv["name"] for iv in top)

    offer_bits = []
    for k in ("money", "time", "skills", "voice"):
        items = p["actions"].get(k) or []
        if items:
            offer_bits.append(f"With your {OFFER_META[k][1]}, {_lc_first(_sentence(items[0]))}")
    a1 = "There's a concrete step for whatever you can offer. " + " ".join(offer_bits)

    a2 = "The approaches with the strongest evidence: " + " ".join(
        f"{iv['name']}: {_sentence(iv['what'])} {_sentence(iv['cost'])}" for iv in top)

    if donow:
        orgs = ", ".join(d["org"] for d in donow)
        a3 = (
            f"Vetted examples for {name.lower()}: {orgs} — chosen for evidence and transparency, and not "
            f"the only good options. The higher-leverage path is to back the interventions that work best "
            f"here ({top_names}) and to choose organizations by how transparently they deliver them. You can "
            f"also compare organization types with the free tools linked above, or give useful items directly "
            f"through Givelink."
        )
    else:
        a3 = (
            f"Impact Compass doesn't rank individual charities for this problem. The higher-leverage path is "
            f"to back the interventions that work best here ({top_names}) and to choose organizations by how "
            f"transparently they deliver them. Compare organization types for this cause with the free tools "
            f"linked above, or give useful items directly through Givelink."
        )

    return [
        (f"How can I help with {name.lower()}?", a1),
        (f"What is the most effective way to reduce {name.lower()}?", a2),
        (f"Where should I donate to help with {name.lower()}?", a3),
    ]


def analytics() -> str:
    """Reuse the exact analytics snippets from the app shell."""
    shell = (COMPASS / "index.html").read_text()
    m = re.search(r"(<!-- Google tag \(gtag\.js\) -->[\s\S]*?person_profiles: \"identified_only\"\s*\}\);\s*</script>)", shell)
    return m.group(1) if m else ""


def email_capture(src: str) -> str:
    """Front-door email capture. Reuses the app's CompassNotify.subscribeEmail
    (same notify worker), so it goes live the moment that worker is deployed
    and degrades gracefully with a clear message until then."""
    return f"""
    <div class="cx-section">
      <div class="cx-card">
        <div class="cx-section-label">✉️ One world problem a week</div>
        <p style="color:var(--text-dim);font-size:0.9rem;margin-bottom:12px">Get one problem, and one thing that actually works against it, in your inbox. Free, once a week, unsubscribe anytime.</p>
        <form class="cx-capture" data-src="{esc(src)}" data-ok="You're in — look out for the first one soon. 🌍" data-err="Couldn't sign you up just now. Please try again in a moment." data-invalid="That email doesn't look right." style="display:flex;flex-wrap:wrap;gap:8px">
          <input type="email" required placeholder="you@example.com" autocomplete="email" class="cx-input" style="flex:1;min-width:200px" aria-label="Your email" />
          <button class="cx-btn" type="submit">Subscribe</button>
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


def donow_block(dn: list[dict], title: str, disclaimer: str, what_key: str = "what") -> str:
    """Render the curated 'Do this now' examples; empty string when none."""
    if not dn:
        return ""
    items = "".join(
        f'<div class="cx-act-item">→ <a href="{d["url"]}" target="_blank" rel="noopener"><strong>{esc(d["org"])}</strong></a> — '
        f'{esc(d[what_key])} <span class="cx-badge cx-badge-{d["evidence"]}">{EVIDENCE_LABEL[d["evidence"]]}</span></div>'
        for d in dn)
    return f"""
          <div class="cx-act-group">
            <div class="cx-act-title">{title}</div>
            {items}
            <div style="color:var(--text-dim);font-size:0.7rem;margin-top:6px">{disclaimer}</div>
          </div>"""


def page(p: dict, cats: dict, prev_p: dict, next_p: dict, analytics_html: str, dn: list[dict]) -> str:
    cat = cats[p["category"]]
    url = f"{SITE}/compass/p/{p['id']}.html"
    title = f"How to Help With {p['name']}: What Works and Where to Give"
    desc = f"{p['stat']}. See what evidence says actually reduces {p['name'].lower()}, the most effective interventions with honest costs, and where to focus your money, time, or skills to help."
    u = p["understand"]

    share_text = f"{p['emoji']} {p['name']}: {p['stat']}. See what actually works:"
    st = quote(share_text)
    # Attributed per network so analytics show which share loop carries.
    def _sh(net: str) -> str:
        return quote(f"{url}?utm_source=share&utm_medium={net}")
    stu = quote(f"{share_text} {url}?utm_source=share&utm_medium=whatsapp")
    share_html = f"""
    <div class="cx-section">
      <div class="cx-section-label">📣 Share this</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        <a class="cx-chip" href="https://twitter.com/intent/tweet?text={st}&amp;url={_sh('x')}" target="_blank" rel="noopener">𝕏 Post</a>
        <a class="cx-chip" href="https://wa.me/?text={stu}" target="_blank" rel="noopener">💬 WhatsApp</a>
        <a class="cx-chip" href="https://www.linkedin.com/sharing/share-offsite/?url={_sh('linkedin')}" target="_blank" rel="noopener">in LinkedIn</a>
        <a class="cx-chip" href="https://www.facebook.com/sharer/sharer.php?u={_sh('facebook')}" target="_blank" rel="noopener">f Facebook</a>
      </div>
    </div>"""

    donow_html = donow_block(
        dn, "🎯 Do this now",
        "Examples chosen for evidence and transparency — not the only good options. No affiliation, no payment.")

    qa = faq(p, dn)
    faq_html = "\n".join(
        f'        <div class="cx-fact"><div class="cx-fact-k">{esc(q)}</div><div class="cx-fact-v">{esc(a)}</div></div>'
        for q, a in qa)
    faq_jsonld = json.dumps({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {"@type": "Question", "name": q,
             "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in qa],
    }, indent=2)

    interventions = "\n".join(f"""
        <div class="cx-card cx-iv-card">
          <div class="cx-iv-top"><span class="cx-iv-name">{esc(iv['name'])}</span>
            <span class="cx-badge cx-badge-{iv['evidence']}">{EVIDENCE_LABEL[iv['evidence']]}</span></div>
          <div class="cx-iv-what">{esc(iv['what'])}</div>
          <div class="cx-iv-cost"><strong>Cost &amp; effect:</strong> {esc(iv['cost'])}</div>
        </div>""" for iv in p["interventions"])

    act_groups = "\n".join(f"""
          <div class="cx-act-group">
            <div class="cx-act-title">{OFFER_META[k][0]} With your {OFFER_META[k][1]}</div>
            {''.join(f'<div class="cx-act-item">{esc(a)}</div>' for a in items)}
          </div>""" for k, items in p["actions"].items() if items)

    cause_q = quote(p["name"])
    jsonld = json.dumps({
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": title,
        "description": p["stat"],
        "url": url,
        "author": {"@type": "Person", "name": "Panos Kokmotos", "url": "https://panoskokmotos.com"},
        "isPartOf": {"@type": "WebApplication", "name": "Impact Compass", "url": f"{SITE}/compass/"},
    }, indent=2)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="upgrade-insecure-requests" />
  {analytics_html}
  <title>{esc(title)}</title>
  <meta name="description" content="{esc(desc)}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="../app.css" />
  <link rel="icon" href="../icon.svg" type="image/svg+xml" />
  <meta name="theme-color" content="#0a0f1e" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <link rel="canonical" href="{url}" />
  <link rel="alternate" hreflang="en" href="{url}" />
  <link rel="alternate" hreflang="el" href="{SITE}/compass/el/{p['id']}.html" />
  <link rel="alternate" hreflang="x-default" href="{url}" />
  <meta property="og:title" content="{esc(p['emoji'] + ' ' + p['name'] + ' — Impact Compass')}" />
  <meta property="og:description" content="{esc(p['stat'])}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="{url}" />
  <meta property="og:image" content="{SITE}/compass/og/{p['id']}.jpg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="{SITE}/compass/og/{p['id']}.jpg" />
  <meta name="twitter:creator" content="@panoskokmotoss" />
  <script type="application/ld+json">
{jsonld}
</script>
  <script type="application/ld+json">
{faq_jsonld}
</script>
</head>
<body>
  <header class="cx-topbar">
    <a class="cx-brand" href="../">
      <img src="../icon.svg" alt="" width="30" height="30" />
      <span>Impact Compass<span class="cx-brand-sub">Understand · Reduce suffering · Care</span></span>
    </a>
    <nav class="cx-nav" aria-label="Site navigation">
      <a href="../"><span class="cx-nav-emoji">🧭</span>App</a>
      <a href="./"><span class="cx-nav-emoji">🗺️</span>All problems</a>
      <a href="{SITE}/compass/el/{p['id']}.html" class="cx-lang"><span class="cx-nav-emoji">🌐</span>ΕΛ</a>
    </nav>
  </header>
  <main class="cx-main">
    <div style="font-size:0.78rem;margin-bottom:14px"><a href="{SITE}/compass/el/{p['id']}.html" style="color:var(--text-dim)">🌐 Ελληνικά</a></div>
    <div class="cx-detail-head">
      <span class="cx-detail-emoji">{p['emoji']}</span>
      <div>
        <h1 class="cx-h1" style="font-size:clamp(1.4rem,4vw,2rem)">{esc(p['name'])}</h1>
        <div class="cx-detail-stat">{esc(p['stat'])}</div>
        <div class="cx-detail-badges">
          <span class="cx-badge cx-badge-{p['trend']['dir']}">{TREND_LABEL[p['trend']['dir']]}</span>
          <span class="cx-badge cx-badge-cat">{cat['emoji']} {esc(cat['name'])}</span>
        </div>
      </div>
    </div>

    <div class="cx-section">
      <div class="cx-section-label">🧠 Understand</div>
      <div class="cx-card">
        <div class="cx-fact"><div class="cx-fact-k">The trend</div><div class="cx-fact-v">{esc(p['trend']['text'])}</div></div>
        <div class="cx-fact"><div class="cx-fact-k">The scale</div><div class="cx-fact-v">{esc(u['scale'])}</div></div>
        <div class="cx-fact"><div class="cx-fact-k">Root causes</div><div class="cx-fact-v">{esc(u['causes'])}</div></div>
        <div class="cx-fact"><div class="cx-fact-k">Who suffers most</div><div class="cx-fact-v">{esc(u['sufferers'])}</div></div>
        <div class="cx-fact cx-fact-mis" style="margin-bottom:0"><div class="cx-fact-k">Common misconception</div><div class="cx-fact-v">{esc(u['misconception'])}</div></div>
      </div>
    </div>

    <div class="cx-section">
      <div class="cx-section-label">⚡ What actually works</div>
      <div class="cx-iv">{interventions}</div>
    </div>

    <div class="cx-section">
      <div class="cx-section-label">🧭 Act</div>
      <div class="cx-card">
        {donow_html}
        {act_groups}
        <div style="color:var(--text-dim);font-size:0.78rem;margin-top:6px">
          Act now: <a href="{SITE}/charity-comparison-engine.html?cause={cause_q}" target="_blank" rel="noopener">compare org types for this cause</a> ·
          <a href="{SITE}/volunteer-match.html?causes={cause_q}" target="_blank" rel="noopener">find a volunteer role</a> ·
          <a href="{SITE}/what-would-x-do.html" target="_blank" rel="noopener">see what $X does</a> ·
          <a href="https://givelink.app/en" target="_blank" rel="noopener">give items via Givelink</a>
        </div>
      </div>
    </div>

    <div class="cx-detail-ctas">
      <a class="cx-btn" href="../#/problem/{p['id']}">🧭 Explore this in the app — AI deep-dive &amp; action plan</a>
    </div>
{share_html}
    <div class="cx-section">
      <div class="cx-section-label">❓ Questions people ask</div>
      <div class="cx-card">
{faq_html}
      </div>
    </div>
{email_capture('problem')}
    <div class="cx-sources">Rough figures for context, drawing on: {esc(' · '.join(p['sources']))}. Approximations, not citations. Last reviewed {TODAY}.</div>

    <details class="cx-card" style="margin-top:22px">
      <summary style="cursor:pointer;font-weight:800;font-size:0.86rem">📎 Embed this problem card on your site — free</summary>
      <p style="color:var(--text-dim);font-size:0.8rem;margin:10px 0 8px">Paste this snippet anywhere. It renders a live card for this problem linking back here. Drop the <code>?problem=…</code> part to rotate a different problem every day.</p>
      <textarea readonly onclick="this.select()" style="width:100%;min-height:74px;background:var(--bg-raise);color:var(--text);border:1px solid var(--border);border-radius:10px;padding:10px;font-family:monospace;font-size:0.72rem">&lt;iframe src="{SITE}/compass/embed.html?problem={p['id']}" width="100%" height="330" style="max-width:480px;border:0" title="Impact Compass — {esc(p['name'])}" loading="lazy"&gt;&lt;/iframe&gt;</textarea>
    </details>

    <nav class="cx-detail-ctas" aria-label="More problems" style="margin-top:26px">
      <a class="cx-btn cx-btn-ghost" href="{prev_p['id']}.html">← {prev_p['emoji']} {esc(prev_p['name'])}</a>
      <a class="cx-btn cx-btn-ghost" href="{next_p['id']}.html">{next_p['emoji']} {esc(next_p['name'])} →</a>
    </nav>

    <div class="cx-footer">Impact Compass · built by <a href="https://panoskokmotos.com">Panos Kokmotos</a> · part of the <a href="{SITE}/">AI for Social Impact tools</a> and a sibling of <a href="https://givelink.app/en">Givelink</a> · powered by Claude AI</div>
  </main>
{CAPTURE_SCRIPT}</body>
</html>
"""


def index_page(problems: list[dict], cats: dict, analytics_html: str) -> str:
    items = "\n".join(
        f'<a class="cx-card cx-problem-card" style="text-decoration:none;color:inherit" href="{p["id"]}.html">'
        f'<div class="cx-problem-top"><span class="cx-problem-emoji">{p["emoji"]}</span>'
        f'<span class="cx-badge cx-badge-{p["trend"]["dir"]}">{TREND_LABEL[p["trend"]["dir"]]}</span></div>'
        f'<div class="cx-problem-name">{esc(p["name"])}</div>'
        f'<div class="cx-problem-stat">{esc(p["stat"])}</div>'
        f'<div class="cx-problem-foot"><span class="cx-badge cx-badge-cat">{cats[p["category"]]["emoji"]} {esc(cats[p["category"]]["name"])}</span></div>'
        f'</a>' for p in problems)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="upgrade-insecure-requests" />
  {analytics_html}
  <title>The Problem Atlas — {len(problems)} of the world's biggest problems, explained honestly</title>
  <meta name="description" content="{len(problems)} major world problems: their scale, root causes, evidence-rated interventions with honest costs, and concrete ways to help. Part of Impact Compass." />
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="../app.css" />
  <link rel="icon" href="../icon.svg" type="image/svg+xml" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="{SITE}/compass/p/" />
  <meta property="og:title" content="🗺️ The Problem Atlas — Impact Compass" />
  <meta property="og:description" content="{len(problems)} major world problems explained honestly, with what actually works against them." />
  <meta property="og:url" content="{SITE}/compass/p/" />
  <meta property="og:image" content="{SITE}/og-ai-tools.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
</head>
<body>
  <header class="cx-topbar">
    <a class="cx-brand" href="../">
      <img src="../icon.svg" alt="" width="30" height="30" />
      <span>Impact Compass<span class="cx-brand-sub">Understand · Reduce suffering · Care</span></span>
    </a>
    <nav class="cx-nav"><a href="../"><span class="cx-nav-emoji">🧭</span>App</a><a href="{SITE}/compass/el/" class="cx-lang"><span class="cx-nav-emoji">🌐</span>ΕΛ</a></nav>
  </header>
  <main class="cx-main">
    <p class="cx-eyebrow">The Problem Atlas</p>
    <h1 class="cx-h1">{len(problems)} problems worth understanding</h1>
    <p class="cx-sub">Each entry: the honest scale, root causes, who suffers, a misconception corrected, evidence-rated interventions, and concrete ways to help.</p>
{email_capture('atlas-hub')}
    <div class="cx-atlas" style="margin-top:22px">{items}</div>
    <p class="cx-sub" style="margin-top:26px;text-align:center">Run a site? <a href="{SITE}/compass/for-nonprofits.html">Add a live problem card to it, free.</a></p>
    <div class="cx-footer">Impact Compass · built by <a href="https://panoskokmotos.com">Panos Kokmotos</a> · powered by Claude AI</div>
  </main>
{CAPTURE_SCRIPT}</body>
</html>
"""


def _page_shell(title: str, desc: str, canonical: str, body: str, analytics_html: str) -> str:
    """Compact shell for the standalone compass pages (priorities, best world)."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="upgrade-insecure-requests" />
  {analytics_html}
  <title>{esc(title)}</title>
  <meta name="description" content="{esc(desc)}" />
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="./app.css" />
  <link rel="icon" href="./icon.svg" type="image/svg+xml" />
  <meta name="theme-color" content="#0a0f1e" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <link rel="canonical" href="{canonical}" />
  <meta property="og:title" content="{esc(title)}" />
  <meta property="og:description" content="{esc(desc)}" />
  <meta property="og:url" content="{canonical}" />
  <meta property="og:image" content="{SITE}/og-ai-tools.png" />
  <meta name="twitter:card" content="summary_large_image" />
</head>
<body>
  <header class="cx-topbar">
    <a class="cx-brand" href="./">
      <img src="./icon.svg" alt="" width="30" height="30" />
      <span>Impact Compass<span class="cx-brand-sub">Understand · Reduce suffering · Care</span></span>
    </a>
    <nav class="cx-nav" aria-label="Site navigation">
      <a href="./"><span class="cx-nav-emoji">🧭</span>App</a>
      <a href="./p/"><span class="cx-nav-emoji">🗺️</span>All problems</a>
      <a href="./el/" class="cx-lang"><span class="cx-nav-emoji">🌐</span>ΕΛ</a>
    </nav>
  </header>
  <main class="cx-main">
{body}
    <div class="cx-footer">Impact Compass · built by <a href="https://panoskokmotos.com">Panos Kokmotos</a> · part of the <a href="{SITE}/">AI for Social Impact tools</a> and a sibling of <a href="https://givelink.app/en">Givelink</a> · powered by Claude AI</div>
  </main>
</body>
</html>
"""


def _rank_card(p: dict, strong: int, total: int) -> str:
    pct = round(strong / total * 100)
    return (
        f'<a class="cx-card cx-problem-card" style="text-decoration:none;color:inherit" href="p/{p["id"]}.html">'
        f'<div class="cx-problem-top"><span class="cx-problem-emoji">{p["emoji"]}</span>'
        f'<span class="cx-badge cx-badge-{p["trend"]["dir"]}">{TREND_LABEL[p["trend"]["dir"]]}</span></div>'
        f'<div class="cx-problem-name">{esc(p["name"])}</div>'
        f'<div class="cx-problem-stat">{esc(p["stat"])}</div>'
        f'<div style="display:flex;justify-content:space-between;font-size:0.68rem;color:var(--text-dim);margin:8px 0 4px"><span>Proven tools</span><span>{strong}/{total}</span></div>'
        f'<div style="height:5px;border-radius:99px;background:var(--surface-2);overflow:hidden"><div style="height:100%;width:{pct}%;background:var(--gold)"></div></div>'
        f'</a>')


def priorities_page(problems: list[dict], analytics_html: str) -> str:
    """Static, indexable version of the app's Priorities view."""
    buckets: dict[str, list] = {"known": [], "partial": [], "frontier": []}
    for p in problems:
        strong = sum(1 for iv in p["interventions"] if iv["evidence"] == "strong")
        key = "known" if strong >= 2 else "partial" if strong == 1 else "frontier"
        buckets[key].append((p, strong))
    trend_rank = {"worsening": 0, "mixed": 1, "improving": 2}
    for lst in buckets.values():
        lst.sort(key=lambda t: trend_rank[t[0]["trend"]["dir"]])
    META = {
        "known": ("✅ Solution known — the gap is will, not knowledge",
                  "Humanity already has proven tools against these. What's missing is funding and attention, which makes them the fastest wins on Earth."),
        "partial": ("🧩 Partly solved — strong leads, open gaps",
                    "At least one proven tool exists, but key pieces of the solution are still being worked out."),
        "frontier": ("🔬 Knowledge frontier — solutions still to be created",
                     "No fully proven playbook yet. Progress here means creating new knowledge: research, experiments, better institutions."),
    }
    sections = "".join(f"""
    <div class="cx-section">
      <div class="cx-section-label">{META[k][0]}</div>
      <p style="color:var(--text-dim);font-size:0.85rem;margin:-4px 0 12px">{META[k][1]}</p>
      <div class="cx-atlas">{''.join(_rank_card(p, s, len(p['interventions'])) for p, s in buckets[k])}</div>
    </div>""" for k in ("known", "partial", "frontier"))
    body = f"""
    <p class="cx-eyebrow">Priorities</p>
    <h1 class="cx-h1">The world's biggest problems, ranked by how solvable they are</h1>
    <p class="cx-sub">Sorted with David Deutsch's optimism principle: <em>problems are soluble</em> — anything not forbidden by the laws of nature is achievable, given the right knowledge. So the honest question for each problem is whether the knowledge already exists. Where it does, only will and money stand between us and the win. Within each group, the worsening problems come first.</p>
    {sections}
    <div class="cx-detail-ctas" style="margin-top:26px">
      <a class="cx-btn" href="best-world.html">🏛️ Where are we trying to go? →</a>
      <a class="cx-btn cx-btn-ghost" href="./#/priorities">Open this in the app</a>
    </div>"""
    return _page_shell(
        "The World's Biggest Problems, Ranked by How Solvable They Are",
        "25 major world problems sorted by whether humanity already knows how to solve them — proven tools, partial solutions, and the knowledge frontier. Based on evidence-rated interventions.",
        f"{SITE}/compass/priorities.html", body, analytics_html)


VISIONS = [
    ("🏛️", "Aristotle", "Eudaimonia",
     "A world where every person can flourish — not merely survive, but live out their capacities in full: reason, friendship, excellence.",
     ["education", "extreme-poverty", "loneliness"]),
    ("📈", "Bentham & Mill", "The greatest happiness",
     "Suffering reduced wherever it exists. And Bentham's test was never \"can they reason?\" but \"can they suffer?\" — the circle includes animals.",
     ["malaria", "child-mortality", "factory-farming"]),
    ("⚖️", "Immanuel Kant", "The kingdom of ends",
     "Every human treated always as an end in themselves, never merely as a means — no one's dignity traded away.",
     ["gender-inequality", "refugees", "corruption"]),
    ("🎭", "John Rawls", "Justice as fairness",
     "The world you would design if you didn't know who you'd be born as. Behind that veil, you'd fix the worst-off positions first.",
     ["extreme-poverty", "maternal-mortality", "unsafe-water"]),
    ("🌱", "Sen & Nussbaum", "Capabilities",
     "Freedom measured by what people can actually do and be: learn, move, see, participate, choose their own life.",
     ["education", "preventable-blindness", "digital-exclusion"]),
    ("🔓", "Karl Popper", "The open society",
     "Institutions you can criticize and correct without violence — a civilization whose error-correction never stops.",
     ["corruption", "digital-exclusion", "refugees"]),
    ("♾️", "David Deutsch", "The beginning of infinity",
     "A civilization that treats every problem as soluble and never stops creating the knowledge to solve the next one — including the risks that could end the whole project.",
     ["pandemic-preparedness", "education", "tuberculosis"]),
    ("🫱", "Peter Singer", "The expanding circle",
     "Moral concern that refuses to stop at borders, or at our own species — distance is not a reason to let a child drown.",
     ["extreme-poverty", "neglected-tropical-diseases", "factory-farming"]),
]


def bestworld_page(problems: list[dict], analytics_html: str) -> str:
    """Static, indexable version of the app's Best World view."""
    by_id = {p["id"]: p for p in problems}
    cards = "".join(f"""
    <div class="cx-card" style="margin-top:14px">
      <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
        <span style="font-size:1.3rem">{emoji}</span>
        <span style="font-weight:800">{esc(name)}</span>
        <span style="color:var(--text-dim);font-size:0.8rem">{esc(who)}</span>
      </div>
      <p style="color:var(--text-dim);font-size:0.88rem;margin:8px 0 10px">{esc(vision)}</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        {''.join(f'<a class="cx-chip" style="text-decoration:none" href="p/{bid}.html">{by_id[bid]["emoji"]} {esc(by_id[bid]["name"])}</a>' for bid in blocks if bid in by_id)}
      </div>
    </div>""" for emoji, who, name, vision, blocks in VISIONS)
    body = f"""
    <p class="cx-eyebrow">The destination</p>
    <h1 class="cx-h1">The best world, according to philosophers</h1>
    <p class="cx-sub">Utopia is not a place — it's a direction. Philosophers have disagreed about the destination for 2,400 years, but lay their maps on top of each other and the same obstacles appear on nearly every route. Those obstacles are the Problem Atlas. Solving them isn't one worldview's agenda; it's the shared road.</p>
    {cards}
    <div class="cx-detail-ctas" style="margin-top:26px">
      <a class="cx-btn" href="priorities.html">📊 Where do we stand today? →</a>
      <a class="cx-btn cx-btn-ghost" href="p/">Explore all 25 problems</a>
    </div>"""
    return _page_shell(
        "The Best World, According to Philosophers — and What Blocks the Road",
        "Eight philosophical visions of the best possible world, from Aristotle's flourishing to Deutsch's beginning of infinity — and the world problems that block every route to them.",
        f"{SITE}/compass/best-world.html", body, analytics_html)


def update_sitemap(problems: list[dict]) -> None:
    sm = ROOT / "sitemap.xml"
    text = sm.read_text()
    block = "\n".join(
        [f"  <url><loc>{SITE}/compass/p/</loc><lastmod>{TODAY}</lastmod><changefreq>monthly</changefreq></url>",
         f"  <url><loc>{SITE}/compass/priorities.html</loc><lastmod>{TODAY}</lastmod><changefreq>monthly</changefreq></url>",
         f"  <url><loc>{SITE}/compass/best-world.html</loc><lastmod>{TODAY}</lastmod><changefreq>monthly</changefreq></url>"] +
        [f"  <url><loc>{SITE}/compass/p/{p['id']}.html</loc><lastmod>{TODAY}</lastmod><changefreq>monthly</changefreq></url>"
         for p in problems])
    wrapped = f"  <!-- compass-pages:start (generated by compass/build-pages.py) -->\n{block}\n  <!-- compass-pages:end -->"
    if "compass-pages:start" in text:
        text = re.sub(r"  <!-- compass-pages:start[\s\S]*?compass-pages:end -->", wrapped, text)
    else:
        text = text.replace("</urlset>", wrapped + "\n</urlset>")
    sm.write_text(text)


def main() -> None:
    problems, cats, donow = load_problems()
    a = analytics()
    OUT.mkdir(exist_ok=True)
    for i, p in enumerate(problems):
        prev_p = problems[i - 1]
        next_p = problems[(i + 1) % len(problems)]
        (OUT / f"{p['id']}.html").write_text(page(p, cats, prev_p, next_p, a, donow.get(p["id"], [])))
    (OUT / "index.html").write_text(index_page(problems, cats, a))
    (COMPASS / "priorities.html").write_text(priorities_page(problems, a))
    (COMPASS / "best-world.html").write_text(bestworld_page(problems, a))
    update_sitemap(problems)
    print(f"generated {len(problems)} problem pages + index + priorities + best-world, sitemap updated")


if __name__ == "__main__":
    main()
