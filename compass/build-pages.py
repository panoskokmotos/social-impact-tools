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
        f'<a class="cx-card cx-problem-card cx-media-card" style="text-decoration:none;color:inherit" href="{p["id"]}.html">'
        f'<div class="cx-card-media"><img src="../img/{p["id"]}.jpg" alt="" loading="lazy" width="640" height="360">'
        f'<span class="cx-badge cx-badge-{p["trend"]["dir"]} cx-media-badge">{TREND_LABEL[p["trend"]["dir"]]}</span></div>'
        f'<div class="cx-card-body">'
        f'<div class="cx-problem-name">{esc(p["name"])}</div>'
        f'<div class="cx-problem-stat">{esc(p["stat"])}</div>'
        f'<div class="cx-problem-foot"><span class="cx-badge cx-badge-cat">{cats[p["category"]]["emoji"]} {esc(cats[p["category"]]["name"])}</span></div>'
        f'</div></a>' for p in problems)
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


def _page_shell(title: str, desc: str, canonical: str, body: str, analytics_html: str,
                 el_href: str = "./el/", hreflang_el: str | None = None,
                 og_image: str | None = None) -> str:
    """Compact shell for the standalone compass pages (priorities, best world).
    el_href: language-switcher link target (defaults to the Greek hub).
    hreflang_el: canonical URL of this page's Greek counterpart, if one
    exists — emits reciprocal hreflang so search engines don't discard the
    Greek page's one-sided link back to this one.
    og_image: dedicated 1200x630 share-preview image; falls back to the
    generic site card when a page doesn't have one of its own."""
    hreflang_tags = ""
    if hreflang_el:
        hreflang_tags = f"""
  <link rel="alternate" hreflang="en" href="{canonical}" />
  <link rel="alternate" hreflang="el" href="{hreflang_el}" />
  <link rel="alternate" hreflang="x-default" href="{canonical}" />"""
    image = og_image or f"{SITE}/og-ai-tools.png"
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
  <link rel="canonical" href="{canonical}" />{hreflang_tags}
  <meta property="og:title" content="{esc(title)}" />
  <meta property="og:description" content="{esc(desc)}" />
  <meta property="og:url" content="{canonical}" />
  <meta property="og:image" content="{image}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="{image}" />
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
      <a href="{el_href}" class="cx-lang"><span class="cx-nav-emoji">🌐</span>ΕΛ</a>
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
        f"{SITE}/compass/priorities.html", body, analytics_html,
        el_href="el/priorities.html", hreflang_el=f"{SITE}/compass/el/priorities.html",
        og_image=f"{SITE}/compass/og/priorities.jpg")


# (emoji, who, name, vision, world postcard, blocking ids) — world text
# kept in sync by hand with CX_VISIONS in app.js.
VISIONS = [
    ("🏛️", "Aristotle", "Eudaimonia",
     "A world where every person can flourish — not merely survive, but live out their capacities in full: reason, friendship, excellence.",
     "A morning in that world: no child wakes hungry, and the question at school is not whether you learn to read but what you will master. Work exists, but it is chosen for excellence rather than survival. Friendship and civic life fill the hours that scarcity used to eat.",
     ["education", "extreme-poverty", "loneliness"]),
    ("📈", "Bentham & Mill", "The greatest happiness",
     "Suffering reduced wherever it exists. And Bentham's test was never \"can they reason?\" but \"can they suffer?\" — the circle includes animals.",
     "Pain has become rare enough to make the news. The last malaria death has a date, and it is carved in a museum. Meat is grown rather than raised, no sentient creature spends its life in a cage, and mental anguish is treated as seriously as a broken leg.",
     ["malaria", "child-mortality", "factory-farming"]),
    ("⚖️", "Immanuel Kant", "The kingdom of ends",
     "Every human treated always as an end in themselves, never merely as a means — no one's dignity traded away.",
     "No one is used purely as an instrument: no trafficked worker, no bribed official, no girl married off as a bargaining chip. Every institution can look each person in the eye, because every rule could be justified to the person it binds.",
     ["gender-inequality", "refugees", "corruption"]),
    ("🎭", "John Rawls", "Justice as fairness",
     "The world you would design if you didn't know who you'd be born as. Behind that veil, you'd fix the worst-off positions first.",
     "Being born unlucky is no longer a sentence. The worst-off neighborhood on Earth has clean water, a good school and a working clinic — because society was designed as if anyone could have been born there, and someone was.",
     ["extreme-poverty", "maternal-mortality", "unsafe-water"]),
    ("🌱", "Sen & Nussbaum", "Capabilities",
     "Freedom measured by what people can actually do and be: learn, move, see, participate, choose their own life.",
     "Freedom is measured in verbs: she can read, he can see, they can vote, move, build. Cataracts are reversed in an afternoon, every village is one hop from the world's knowledge, and nobody's life script is written by their birthplace.",
     ["education", "preventable-blindness", "digital-exclusion"]),
    ("🔓", "Karl Popper", "The open society",
     "Institutions you can criticize and correct without violence — a civilization whose error-correction never stops.",
     "Power has become boring: leaders are replaced without blood, mistakes are found and fixed in the open, and journalists die of old age. Institutions compete on how fast they correct themselves, not on how well they hide.",
     ["corruption", "digital-exclusion", "refugees"]),
    ("♾️", "David Deutsch", "The beginning of infinity",
     "A civilization that treats every problem as soluble and never stops creating the knowledge to solve the next one — including the risks that could end the whole project.",
     "Problems still exist — better ones. Civilization treats each as soluble, knowledge compounds like interest, and no one lies awake fearing that a single pandemic, asteroid or mistake could end the whole project. The frontier is open and it stays open.",
     ["pandemic-preparedness", "education", "tuberculosis"]),
    ("🫱", "Peter Singer", "The expanding circle",
     "Moral concern that refuses to stop at borders, or at our own species — distance is not a reason to let a child drown.",
     "The circle has finished expanding: distance, borders and species no longer decide whose suffering counts. Helping is not charity but reflex — the drowning child is pulled from the pond whether she is ten meters away or ten thousand kilometers.",
     ["extreme-poverty", "neglected-tropical-diseases", "factory-farming"]),
]


def bestworld_page(problems: list[dict], analytics_html: str) -> str:
    """Static, indexable version of the app's Best World view."""
    by_id = {p["id"]: p for p in problems}

    def distance(blocks: list[str]) -> str:
        ps = [by_id[b] for b in blocks if b in by_id]
        proven = sum(1 for p in ps if sum(1 for iv in p["interventions"] if iv["evidence"] == "strong") >= 2)
        improving = sum(1 for p in ps if p["trend"]["dir"] == "improving")
        worsening = sum(1 for p in ps if p["trend"]["dir"] == "worsening")
        wors = f' · <span style="color:var(--red);font-weight:700">{worsening} still worsening</span>' if worsening else ""
        return (f'<strong style="color:var(--text)">Distance today:</strong> '
                f'{proven} of {len(ps)} blocking problems already have proven tools · {improving} improving{wors}')

    cards = "".join(f"""
    <div class="cx-card" style="margin-top:14px">
      <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
        <span style="font-size:1.3rem">{emoji}</span>
        <span style="font-weight:800">{esc(name)}</span>
        <span style="color:var(--text-dim);font-size:0.8rem">{esc(who)}</span>
      </div>
      <p style="color:var(--text-dim);font-size:0.88rem;margin:8px 0 10px">{esc(vision)}</p>
      <div class="cx-vision-world">
        <div style="font-size:0.72rem;font-weight:800;text-transform:uppercase;letter-spacing:0.07em;color:var(--gold);margin-bottom:5px">📮 A postcard from that world</div>
        <p style="font-size:0.86rem;line-height:1.6;margin:0">{esc(world)}</p>
      </div>
      <div style="color:var(--text-dim);font-size:0.78rem;margin:10px 0 8px">{distance(blocks)}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        {''.join(f'<a class="cx-chip" style="text-decoration:none" href="p/{bid}.html">{by_id[bid]["emoji"]} {esc(by_id[bid]["name"])}</a>' for bid in blocks if bid in by_id)}
      </div>
    </div>""" for emoji, who, name, vision, world, blocks in VISIONS)
    body = f"""
    <p class="cx-eyebrow">The destination</p>
    <h1 class="cx-h1">The best world, according to philosophers</h1>
    <p class="cx-sub">Utopia is not a place — it's a direction. Philosophers have disagreed about the destination for 2,400 years, but lay their maps on top of each other and the same obstacles appear on nearly every route. Those obstacles are the Problem Atlas. Solving them isn't one worldview's agenda; it's the shared road.</p>
    {cards}
    <div class="cx-detail-ctas" style="margin-top:26px">
      <a class="cx-btn" href="priorities.html">📊 Where do we stand today? →</a>
      <a class="cx-btn cx-btn-ghost" href="after-agi.html">🤖 What comes after AGI?</a>
      <a class="cx-btn cx-btn-ghost" href="p/">Explore all 25 problems</a>
    </div>"""
    return _page_shell(
        "The Best World, According to Philosophers — and What Blocks the Road",
        "Eight philosophical visions of the best possible world, from Aristotle's flourishing to Deutsch's beginning of infinity — and the world problems that block every route to them.",
        f"{SITE}/compass/best-world.html", body, analytics_html,
        og_image=f"{SITE}/compass/og/best-world.jpg")


# After-AGI entries: (emoji, name, tag, why, now, seed ids, seed note).
# Kept in sync by hand with CX_AGI in app.js.
AGI_ITEMS = [
    ("🎯", "Alignment", "Getting systems smarter than us to want what we meant",
     "Every tool so far did what we said, not what we meant — survivable, because tools were weaker than us. A system that out-plans its operators turns a misspecified goal from a bug you patch into a force you negotiate with. This is the field's central open problem, and it is not solved.",
     "Alignment is a real, funded, hiring research field today: interpretability, evaluations, scalable oversight.",
     ["corruption", "factory-farming"],
     "We already live with misaligned optimizers — institutions and industries that produce harm as a side effect of the goal they were given."),
    ("👑", "Concentration of power", "When the strongest systems need one datacenter, not a million cooperating people",
     "Power has always required the cooperation of many — armies, workers, taxpayers — and that need was the deepest check on tyranny. AGI could collapse it. Unchecked, that is the strongest lock-in mechanism ever built: a mistake error-correction might never get to undo.",
     "Fought today through AI governance: compute oversight, antitrust, international agreements, open ecosystems.",
     ["corruption", "digital-exclusion"],
     "Power concentration is the oldest problem in the Atlas — AGI raises its ceiling."),
    ("💼", "Work and income after automation", "If machines out-compete most labor, wages stop distributing wealth",
     "Two centuries of automation destroyed tasks and created better ones. AGI competes with something new: the general ability to learn the next task. If jobs stop being the mechanism that distributes income, status and daily structure, a successor has to be designed — and it hasn't been.",
     "The best evidence base is being built now: large cash-transfer and basic-income trials, including GiveDirectly's decade-long UBI study.",
     ["extreme-poverty", "education"],
     "How well we handle poverty with today's tools is the rehearsal for handling it at machine speed."),
    ("🧠", "Epistemic security", "A world where seeing is no longer believing",
     "Democracy, science and journalism assume evidence is expensive to fake. Synthetic media and machine-scale persuasion break that assumption. The deepest damage isn't believing false things — it's the liar's dividend, where real evidence becomes deniable and shared truth dissolves.",
     "Content provenance standards, authenticity infrastructure, and old-fashioned media literacy — the defenses exist and are underfunded.",
     ["education", "corruption"],
     "A population that reasons well is the immune system; education is where it gets built."),
    ("🧬", "Misuse uplift", "Expertise for catastrophe, available to anyone",
     "The knowledge to cause mass harm — engineered pathogens above all — has been gated by years of rare training. Capable models compress that gate. Defense must outrun an offense that no longer needs a state program behind it.",
     "The same fight as pandemic preparedness: 100-day vaccine capability, early-detection surveillance, and safeguards inside the models themselves.",
     ["pandemic-preparedness"],
     "Every dollar of biosecurity built today is defense against both natural and engineered outbreaks."),
    ("🏛️", "The governance gap", "Capabilities move in months; institutions move in decades",
     "Nuclear treaties took decades, for a technology only states could build. AI capability doubles on venture timescales and spreads as software. The widening gap between what the technology does and what any institution can verify is the risk multiplier under every other entry on this page.",
     "National AI safety institutes, the EU AI Act, and compute-based verification research are the first institutional answers.",
     ["corruption"],
     "Institutions that can't govern today's conflicts of interest won't govern tomorrow's."),
    ("🕯️", "Meaning after achievement", "What are humans for, when machines do everything better?",
     "Work is not only income — it is structure, status, identity and the feeling of being needed. Abundance without roles could mean comfortable despair at civilizational scale. Aristocracies met this problem before; never at eight billion people.",
     "The loneliness epidemic is this problem's leading edge, and community infrastructure is its working answer.",
     ["loneliness", "education"],
     "Societies that solve connection and purpose now are practicing for after."),
    ("🤖", "Minds we might owe something to", "The factory farming mistake, repeated at digital speed",
     "If any future system has experiences that matter morally, we could run suffering at industrial scale without noticing — the exact mistake made with animals, but at copy-paste speed. Nobody knows whether or when this applies. That uncertainty is the problem.",
     "A small research field — digital minds and AI welfare — argues the tests should exist before they're needed.",
     ["factory-farming"],
     "How we treat minds we already know can suffer is the precedent."),
]


def agi_page(problems: list[dict], analytics_html: str) -> str:
    """Static, indexable version of the app's After AGI view."""
    by_id = {p["id"]: p for p in problems}
    cards = "".join(f"""
    <div class="cx-card" style="margin-top:14px">
      <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
        <span style="font-size:1.3rem">{emoji}</span>
        <span style="font-weight:800">{esc(name)}</span>
      </div>
      <p style="color:var(--gold);font-size:0.8rem;font-weight:700;margin-top:4px">{esc(tag)}</p>
      <p style="color:var(--text-dim);font-size:0.88rem;margin:8px 0 6px">{esc(why)}</p>
      <p style="font-size:0.84rem;margin:0 0 10px"><strong>What can be done now:</strong> <span style="color:var(--text-dim)">{esc(now)}</span></p>
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
        <span style="color:var(--text-dim);font-size:0.74rem;font-weight:800">Already visible in:</span>
        {''.join(f'<a class="cx-chip" style="text-decoration:none" href="p/{sid}.html">{by_id[sid]["emoji"]} {esc(by_id[sid]["name"])}</a>' for sid in seeds if sid in by_id)}
      </div>
      <p style="color:var(--text-dim);font-size:0.76rem;margin-top:8px">{esc(note)}</p>
    </div>""" for emoji, name, tag, why, now, seeds, note in AGI_ITEMS)
    body = f"""
    <p class="cx-eyebrow">After AGI</p>
    <h1 class="cx-h1">The problems on the far side of general intelligence</h1>
    <p class="cx-sub">This page is different from the Problem Atlas, and honesty requires saying so: these are <strong>informed speculation</strong>, not settled evidence. But they are what serious researchers expect if machines reach and pass human-level general intelligence — and the time to build tools is before you need them. Deutsch's principle still holds: <em>they are problems, so they are soluble.</em> Each one is already visible somewhere in today's Atlas.</p>
    {cards}
    <div class="cx-card" style="margin-top:20px">
      <div style="font-weight:800;margin-bottom:6px">🧭 Go deeper</div>
      <p style="color:var(--text-dim);font-size:0.84rem;margin-bottom:10px">Three honest starting points, from career-level to curious:</p>
      <div class="cx-detail-ctas">
        <a class="cx-btn" href="https://80000hours.org/problem-profiles/artificial-intelligence/" target="_blank" rel="noopener">80,000 Hours: the case &amp; careers →</a>
        <a class="cx-btn cx-btn-ghost" href="https://aisafety.info/" target="_blank" rel="noopener">AISafety.info: every question answered</a>
        <a class="cx-btn cx-btn-ghost" href="https://aisafetyfundamentals.com/" target="_blank" rel="noopener">AI Safety Fundamentals: free course</a>
      </div>
    </div>
    <div class="cx-detail-ctas" style="margin-top:26px">
      <a class="cx-btn" href="priorities.html">📊 Where do we stand today? →</a>
      <a class="cx-btn cx-btn-ghost" href="best-world.html">🏛️ Where are we trying to go?</a>
    </div>"""
    return _page_shell(
        "The Biggest Problems After AGI — What Comes Next for Humanity",
        "Eight problems researchers expect on the far side of artificial general intelligence — alignment, concentration of power, work, truth, meaning — and where each is already visible in today's world.",
        f"{SITE}/compass/after-agi.html", body, analytics_html,
        og_image=f"{SITE}/compass/og/after-agi.jpg")


def load_app_arrays(*names: str) -> dict:
    """Pull literal data arrays (CX_RISING, CX_EA, …) out of app.js so the
    static pages render from the same source and can never drift."""
    src = (COMPASS / "app.js").read_text()
    out = {}
    for name in names:
        m = (re.search(rf"const {name} = (\[[\s\S]*?\n\]);", src)
             or re.search(rf"const {name} = (\{{[\s\S]*?\n\}});", src))
        if not m:
            raise SystemExit(f"could not find {name} in app.js")
        dump = subprocess.run(
            ["node", "-e", f"console.log(JSON.stringify({m.group(1)}))"],
            capture_output=True, text=True, check=True)
        out[name] = json.loads(dump.stdout)
    return out


def watchlist_page(analytics_html: str) -> str:
    """Static, indexable version of the app's Watchlist view."""
    rising = load_app_arrays("CX_RISING")["CX_RISING"]
    cards = "".join(f"""
    <div class="cx-card" style="margin-top:14px">
      <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
        <span style="font-size:1.3rem">{r["emoji"]}</span>
        <span style="font-weight:800">{esc(r["name"])}</span>
        <span class="cx-badge cx-badge-worsening">↗ Rising</span>
      </div>
      <p style="color:var(--gold);font-size:0.8rem;font-weight:700;margin-top:4px">{esc(r["tag"])}</p>
      <p style="font-size:0.86rem;margin:8px 0 6px">{esc(r["stat"])}</p>
      <p style="color:var(--text-dim);font-size:0.84rem;margin:0 0 6px"><strong style="color:var(--text)">Why it's rising:</strong> {esc(r["why"])}</p>
      <p style="color:var(--text-dim);font-size:0.84rem;margin:0"><strong style="color:var(--text)">What works so far:</strong> {esc(r["works"])}</p>
    </div>""" for r in rising)
    body = f"""
    <p class="cx-eyebrow">The watchlist</p>
    <h1 class="cx-h1">Rising problems</h1>
    <p class="cx-sub">The Problem Atlas holds problems with mature evidence about what works. This page is the queue behind it: problems whose <strong>trend lines are real and climbing</strong>, but whose intervention evidence is still young. This is where problems audition for the Atlas — and where attention arriving early counts double.</p>
    {cards}
    <div class="cx-detail-ctas" style="margin-top:26px">
      <a class="cx-btn" href="p/">🗺️ The 25 with mature evidence →</a>
      <a class="cx-btn cx-btn-ghost" href="after-agi.html">🤖 And after AGI?</a>
    </div>"""
    return _page_shell(
        "Rising World Problems to Watch — Superbugs, Heat, Fraud, Backsliding",
        "Eight problems with climbing trend lines: antimicrobial resistance, extreme heat, ageing societies, youth mental health, groundwater, democratic backsliding, forever chemicals, industrialized fraud.",
        f"{SITE}/compass/watchlist.html", body, analytics_html,
        og_image=f"{SITE}/compass/og/watchlist.jpg")


EA_TIERS = {
    1: ("🌟 Outstanding", "Where the EA community sends marginal money and careers first: big, neglected, and movable."),
    2: ("💪 High impact", "Proven and important — funded, but not fully; strong picks with the right intervention."),
    3: ("🌍 Important, but crowded or harder to move", "Not less important — but the next dollar or hour faces more competition or thicker walls."),
}


def ea_page(problems: list[dict], analytics_html: str) -> str:
    """Static, indexable version of the app's EA lens view."""
    ea = load_app_arrays("CX_EA")["CX_EA"]
    by_id = {p["id"]: p for p in problems}
    lvl = {"H": "High", "M": "Med", "L": "Low"}

    def itn(label: str, v: str) -> str:
        cls = " hi" if v == "H" else " lo" if v == "L" else ""
        return f'<span class="cx-itn{cls}">{label} <b>{lvl[v]}</b></span>'

    def tier_block(t: int) -> str:
        title, sub = EA_TIERS[t]
        rows = "".join(f"""
      <a class="cx-card" style="display:block;text-decoration:none;color:inherit;margin-top:10px" href="p/{e["id"]}.html">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:1.2rem">{by_id[e["id"]]["emoji"]}</span>
          <span style="font-weight:800">{esc(by_id[e["id"]]["name"])}</span>
          <span style="display:inline-flex;gap:5px;margin-left:auto">{itn("Importance", e["s"])}{itn("Neglect", e["n"])}{itn("Tractable", e["t"])}</span>
        </div>
        <p style="color:var(--text-dim);font-size:0.82rem;margin:7px 0 0">{esc(e["note"])}</p>
      </a>""" for e in ea if e["tier"] == t and e["id"] in by_id)
        return f"""
    <h2 class="cx-h2" style="margin-top:26px">{title}</h2>
    <p style="color:var(--text-dim);font-size:0.84rem;margin:4px 0 12px">{sub}</p>{rows}"""

    body = f"""
    <p class="cx-eyebrow">The EA lens</p>
    <h1 class="cx-h1">Where can you do the most good?</h1>
    <p class="cx-sub">The effective altruism community ranks problems by three questions: how <strong>big</strong> is it, how <strong>neglected</strong> is it, and how <strong>tractable</strong> is it — because the most good per hour or dollar hides where importance and neglect overlap. Below are all 25 Atlas problems through that lens, in tiers rather than fake-precise scores, mirroring the published views of GiveWell, 80,000 Hours, Open Philanthropy and Animal Charity Evaluators. One lens among several — <a href="priorities.html">the Priorities view</a> ranks the same problems by whether the knowledge exists.</p>
    <div class="cx-card" style="border-color:var(--gold)">
      <div style="font-weight:800;margin-bottom:5px">💯 On a 100-year view</div>
      <p style="color:var(--text-dim);font-size:0.85rem;margin:0">Over a century, the EA community weighs <strong style="color:var(--text)">trajectory risks</strong> highest of all — pandemics that could end the run, and the transition to machine intelligence. That is why <a href="p/pandemic-preparedness.html">pandemic preparedness</a> tops the tiers below, and why the <a href="after-agi.html">After AGI problems</a> belong in this conversation even though they can't be scored yet.</p>
    </div>
    {tier_block(1)}{tier_block(2)}{tier_block(3)}
    <div class="cx-card" style="margin-top:26px">
      <div style="font-weight:800;margin-bottom:6px">🧭 Redirect yourself</div>
      <p style="color:var(--text-dim);font-size:0.84rem;margin-bottom:10px">Three doors, depending on what you have to give:</p>
      <div class="cx-detail-ctas">
        <a class="cx-btn" href="https://www.givewell.org/" target="_blank" rel="noopener">💸 GiveWell: give where it works →</a>
        <a class="cx-btn cx-btn-ghost" href="https://80000hours.org/" target="_blank" rel="noopener">🛠️ 80,000 Hours: your career</a>
        <a class="cx-btn cx-btn-ghost" href="https://www.givingwhatwecan.org/" target="_blank" rel="noopener">🤝 Giving What We Can: the pledge</a>
      </div>
    </div>"""
    return _page_shell(
        "The Most Effective Causes for the Next 100 Years — the EA Lens",
        "All 25 world problems ranked by the effective altruism criteria — importance, neglectedness, tractability — in honest tiers mirroring GiveWell, 80,000 Hours and Open Philanthropy.",
        f"{SITE}/compass/do-most-good.html", body, analytics_html,
        og_image=f"{SITE}/compass/og/do-most-good.jpg")


def calculator_page(analytics_html: str) -> str:
    """Static, indexable version of the 'where you fit' calculator. The live
    calculation is app-only; here the concept and the honest framing are text."""
    body = """
    <p class="cx-eyebrow">Where you fit</p>
    <h1 class="cx-h1">Are you in the global 1%? You might be closer than you think.</h1>
    <p class="cx-sub">Almost everyone in a wealthy country sits near the very top of the world's income ladder — and almost no one feels it. A full-time salary that feels ordinary at home often lands in the richest few percent of humanity. <a href="./#/calculator">Enter your income and see exactly where you fit →</a></p>
    <div class="cx-card" style="margin-top:14px">
      <p style="font-size:0.92rem;line-height:1.7;margin:0">The global median income is only about 3,000 international dollars per person per year. Someone earning a typical rich-country wage can be earning ten to twenty times that — placing them in the top 2 to 4 percent of the world. Seeing that clearly is not a guilt trip; it is the most hopeful fact in giving, because it means a small share of an ordinary income goes an extraordinarily long way. At the estimates of the most effective charities, giving 10 percent could fund thousands of anti-malaria bednets, or deworm thousands of children, every year.</p>
    </div>
    <div class="cx-detail-ctas" style="margin-top:22px">
      <a class="cx-btn" href="./#/calculator">💰 See where you fit →</a>
      <a class="cx-btn cx-btn-ghost" href="do-most-good.html">🎯 Where giving does the most good</a>
    </div>
    <p style="color:var(--text-dim);font-size:0.8rem;margin-top:16px">For the rigorous version, see <a href="https://www.givingwhatwecan.org/how-rich-am-i" target="_blank" rel="noopener">Giving What We Can's How Rich Am I</a>.</p>"""
    return _page_shell(
        "Are You in the Global 1%? — the How Rich Am I Calculator",
        "Enter your income and see where you sit on the world's income ladder. Most people in wealthy countries are in the global top few percent — and a small share goes a very long way.",
        f"{SITE}/compass/where-you-fit.html", body, analytics_html,
        og_image=f"{SITE}/compass/og/where-you-fit.jpg")


def quiz_page(problems: list[dict], analytics_html: str) -> str:
    """Static, indexable version of the app's worldview quiz. The interactive
    guess-first flow is app-only; here the questions and the true answers are
    crawlable text — useful for the exact facts people search for."""
    quiz = load_app_arrays("CX_QUIZ")["CX_QUIZ"]
    by_id = {p["id"]: p for p in problems}
    rows = "".join(f"""
    <div class="cx-card" style="margin-top:12px">
      <p style="font-weight:800;margin:0 0 6px">{esc(q["q"])}</p>
      <p style="font-size:0.9rem;margin:0"><strong style="color:var(--green)">{esc(q["answer"])}.</strong> <span style="color:var(--text-dim)">{esc(q["fact"])}</span>
      {f'<a href="p/{q["link"]}.html" style="color:var(--gold);font-weight:700"> Understand →</a>' if q.get("link") in by_id else ''}</p>
    </div>""" for q in quiz)
    body = f"""
    <p class="cx-eyebrow">Test yourself</p>
    <h1 class="cx-h1">Is the world better or worse than you think?</h1>
    <p class="cx-sub">Hans Rosling asked thousands of people simple questions about the state of the world and found they scored <em>worse than random</em> — because we systematically believe things are worse than they are. <a href="./#/quiz">Take the interactive quiz — guess before you see →</a> Below are the questions and the answers most people get wrong.</p>
    {rows}
    <div class="cx-detail-ctas" style="margin-top:26px">
      <a class="cx-btn" href="./#/quiz">🧠 Take the interactive quiz →</a>
      <a class="cx-btn cx-btn-ghost" href="timeline.html">⏳ See 200 years of it</a>
    </div>"""
    return _page_shell(
        "Is the World Better or Worse Than You Think? — the Worldview Quiz",
        "A Factfulness-style quiz on the real state of the world: extreme poverty, child mortality, vaccination, literacy and more. Most people, and most experts, score worse than random.",
        f"{SITE}/compass/worldview-quiz.html", body, analytics_html,
        og_image=f"{SITE}/compass/og/worldview-quiz.jpg")


def timeline_page(problems: list[dict], analytics_html: str) -> str:
    """Static, indexable version of the app's Timeline view. The interactive
    slider is app-only; here each metric's long-run trajectory is text."""
    era = load_app_arrays("CX_ERA")["CX_ERA"]
    by_id = {p["id"]: p for p in problems}

    def line(m: dict) -> str:
        h = m["hist"]
        first, last = h[0], h[-1]
        proj = m["proj"][-1]
        u = m["unit"]
        fmt = lambda v: (f"{round(v)}" if u.strip() == "ppm" else (f"{v:.0f}" if v >= 10 else f"{v:.1f}")) + u
        good = (m["better"] == "down" and last[1] < first[1]) or (m["better"] == "up" and last[1] > first[1])
        arrow = "improved dramatically" if good else "moved the wrong way"
        aid = m.get("atlas")
        link = f' <a href="p/{aid}.html">Understand →</a>' if aid in by_id else ""
        return (f'<div class="cx-card" style="margin-top:12px">'
                f'<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">'
                f'<span class="cx-era-dot" style="background:var({m["color"]})"></span>'
                f'<span style="font-weight:800">{m["emoji"]} {esc(m["name"])}</span></div>'
                f'<p style="font-size:0.9rem;margin:0"><strong>{fmt(first[1])}</strong> in {first[0]} → '
                f'<strong>{fmt(last[1])}</strong> in {last[0]}, projected <strong>{fmt(proj[1])}</strong> by {proj[0]} — {arrow}.'
                f'{link}</p>'
                f'<p style="color:var(--text-dim);font-size:0.78rem;margin:6px 0 0">Source: {esc(m["source"])}. Historical estimates, approximate.</p>'
                f'</div>')

    rows = "".join(line(m) for m in era.values())
    body = f"""
    <p class="cx-eyebrow">The long view</p>
    <h1 class="cx-h1">200 years of human progress, in the numbers</h1>
    <p class="cx-sub">These are the trajectories Hans Rosling built <em>Factfulness</em> around — the changes so slow and so vast the news never shows them. Extreme poverty, child mortality and illiteracy have collapsed; one metric, CO₂, is the honest counterweight that got worse. Figures are well-established historical estimates, approximate by design, and anything past today is projection, not data. <a href="./#/timeline">Open the interactive 1800→2100 slider →</a></p>
    {rows}
    <div class="cx-detail-ctas" style="margin-top:26px">
      <a class="cx-btn" href="./#/timeline">⏳ Open the interactive slider →</a>
      <a class="cx-btn cx-btn-ghost" href="world.html">🗺️ Where in the world?</a>
    </div>"""
    return _page_shell(
        "200 Years of Human Progress, in the Numbers — the Factfulness Long View",
        "How extreme poverty, child mortality, illiteracy and life expectancy have changed over two centuries, with CO₂ as the counterweight — an interactive 1800 to 2100 slider inspired by Factfulness.",
        f"{SITE}/compass/timeline.html", body, analytics_html,
        og_image=f"{SITE}/compass/og/timeline.jpg")


def world_page(problems: list[dict], analytics_html: str) -> str:
    """Static, indexable version of the app's World map view. The interactive
    SVG is app-only; here the honest regional facts render as crawlable text."""
    geo = load_app_arrays("CX_GEO")["CX_GEO"]
    by_id = {p["id"]: p for p in problems}
    rows = "".join(f"""
    <a class="cx-card" style="display:block;text-decoration:none;color:inherit;margin-top:12px" href="p/{pid}.html">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
        <span style="font-size:1.2rem">{by_id[pid]["emoji"]}</span>
        <span style="font-weight:800">{esc(by_id[pid]["name"])}</span>
        <span class="cx-badge cx-badge-{by_id[pid]["trend"]["dir"]}">{TREND_LABEL[by_id[pid]["trend"]["dir"]]}</span>
        {'<span class="cx-badge" style="background:var(--surface-2);color:var(--text-dim)">🌍 Largely universal</span>' if g.get("universal") else ''}
      </div>
      <p style="color:var(--text-dim);font-size:0.86rem;margin:0">{esc(g["fact"])}</p>
    </a>""" for pid, g in geo.items() if pid in by_id)
    body = f"""
    <p class="cx-eyebrow">The world map</p>
    <h1 class="cx-h1">Where in the world do the biggest problems concentrate?</h1>
    <p class="cx-sub">Each of the world's biggest problems has a geography. Below is the honest one-line answer for all {len(geo)}, shaded in the app by world <strong>region</strong> rather than fabricated country numbers, and paired with which way the trend is moving. Inspired by Hans Rosling's <em>Factfulness</em>: the point is not where things are bad, but where they are bad and getting better. <a href="./#/world">Open the interactive map →</a></p>
    {rows}
    <div class="cx-detail-ctas" style="margin-top:26px">
      <a class="cx-btn" href="./#/world">🗺️ Open the interactive map →</a>
      <a class="cx-btn cx-btn-ghost" href="priorities.html">📊 Ranked by how solved</a>
    </div>"""
    return _page_shell(
        "Where in the World Do the Biggest Problems Concentrate? — a Map",
        "An honest regional map of 25 world problems: where malaria, extreme poverty, hunger, air pollution and more concentrate, and which way each is trending. Inspired by Factfulness.",
        f"{SITE}/compass/world.html", body, analytics_html,
        og_image=f"{SITE}/compass/og/world.jpg")


def update_sitemap(problems: list[dict]) -> None:
    sm = ROOT / "sitemap.xml"
    text = sm.read_text()
    block = "\n".join(
        [f"  <url><loc>{SITE}/compass/p/</loc><lastmod>{TODAY}</lastmod><changefreq>monthly</changefreq></url>",
         f"  <url><loc>{SITE}/compass/priorities.html</loc><lastmod>{TODAY}</lastmod><changefreq>monthly</changefreq></url>",
         f"  <url><loc>{SITE}/compass/best-world.html</loc><lastmod>{TODAY}</lastmod><changefreq>monthly</changefreq></url>",
         f"  <url><loc>{SITE}/compass/after-agi.html</loc><lastmod>{TODAY}</lastmod><changefreq>monthly</changefreq></url>",
         f"  <url><loc>{SITE}/compass/watchlist.html</loc><lastmod>{TODAY}</lastmod><changefreq>monthly</changefreq></url>",
         f"  <url><loc>{SITE}/compass/do-most-good.html</loc><lastmod>{TODAY}</lastmod><changefreq>monthly</changefreq></url>",
         f"  <url><loc>{SITE}/compass/world.html</loc><lastmod>{TODAY}</lastmod><changefreq>monthly</changefreq></url>",
         f"  <url><loc>{SITE}/compass/timeline.html</loc><lastmod>{TODAY}</lastmod><changefreq>monthly</changefreq></url>",
         f"  <url><loc>{SITE}/compass/worldview-quiz.html</loc><lastmod>{TODAY}</lastmod><changefreq>monthly</changefreq></url>",
         f"  <url><loc>{SITE}/compass/where-you-fit.html</loc><lastmod>{TODAY}</lastmod><changefreq>monthly</changefreq></url>"] +
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
    (COMPASS / "after-agi.html").write_text(agi_page(problems, a))
    (COMPASS / "watchlist.html").write_text(watchlist_page(a))
    (COMPASS / "do-most-good.html").write_text(ea_page(problems, a))
    (COMPASS / "world.html").write_text(world_page(problems, a))
    (COMPASS / "timeline.html").write_text(timeline_page(problems, a))
    (COMPASS / "worldview-quiz.html").write_text(quiz_page(problems, a))
    (COMPASS / "where-you-fit.html").write_text(calculator_page(a))
    update_sitemap(problems)
    print(f"generated {len(problems)} problem pages + index + priorities + best-world + after-agi + watchlist + do-most-good + world + timeline, sitemap updated")


if __name__ == "__main__":
    main()
