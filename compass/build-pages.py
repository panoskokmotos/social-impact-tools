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


def load_problems() -> tuple[list[dict], dict]:
    dump = subprocess.run(
        ["node", "-e",
         "const s=require('fs').readFileSync(process.argv[1],'utf8');"
         "const r=new Function(s+'; return {COMPASS_PROBLEMS, COMPASS_CATEGORIES};')();"
         "console.log(JSON.stringify(r));",
         str(COMPASS / "data.js")],
        capture_output=True, text=True, check=True)
    data = json.loads(dump.stdout)
    return data["COMPASS_PROBLEMS"], data["COMPASS_CATEGORIES"]


def esc(s: str) -> str:
    return html.escape(str(s), quote=True)


def _sentence(s: str) -> str:
    s = str(s).strip()
    if s and s[-1] not in ".!?":
        s += "."
    return s


def _lc_first(s: str) -> str:
    return s[0].lower() + s[1:] if s else s


def faq(p: dict) -> list[tuple[str, str]]:
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

    a3 = (
        f"Impact Compass doesn't name individual charities. The higher-leverage path is to back the "
        f"interventions that work best here ({top_names}) and to choose organizations by how transparently "
        f"they deliver them. Compare organization types for this cause with the free tools linked above, or "
        f"give useful items directly through Givelink."
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


def page(p: dict, cats: dict, prev_p: dict, next_p: dict, analytics_html: str) -> str:
    cat = cats[p["category"]]
    url = f"{SITE}/compass/p/{p['id']}.html"
    title = f"How to Help With {p['name']}: What Works and Where to Give"
    desc = f"{p['stat']}. See what evidence says actually reduces {p['name'].lower()}, the most effective interventions with honest costs, and where to focus your money, time, or skills to help."
    u = p["understand"]

    share_text = f"{p['emoji']} {p['name']}: {p['stat']}. See what actually works:"
    su, st = quote(url), quote(share_text)
    stu = quote(share_text + " " + url)
    share_html = f"""
    <div class="cx-section">
      <div class="cx-section-label">📣 Share this</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        <a class="cx-chip" href="https://twitter.com/intent/tweet?text={st}&amp;url={su}" target="_blank" rel="noopener">𝕏 Post</a>
        <a class="cx-chip" href="https://wa.me/?text={stu}" target="_blank" rel="noopener">💬 WhatsApp</a>
        <a class="cx-chip" href="https://www.linkedin.com/sharing/share-offsite/?url={su}" target="_blank" rel="noopener">in LinkedIn</a>
        <a class="cx-chip" href="https://www.facebook.com/sharer/sharer.php?u={su}" target="_blank" rel="noopener">f Facebook</a>
      </div>
    </div>"""

    qa = faq(p)
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
    <div class="cx-footer">Impact Compass · built by <a href="https://panoskokmotos.com">Panos Kokmotos</a> · powered by Claude AI</div>
  </main>
{CAPTURE_SCRIPT}</body>
</html>
"""


def update_sitemap(problems: list[dict]) -> None:
    sm = ROOT / "sitemap.xml"
    text = sm.read_text()
    block = "\n".join(
        [f"  <url><loc>{SITE}/compass/p/</loc><lastmod>{TODAY}</lastmod><changefreq>monthly</changefreq></url>"] +
        [f"  <url><loc>{SITE}/compass/p/{p['id']}.html</loc><lastmod>{TODAY}</lastmod><changefreq>monthly</changefreq></url>"
         for p in problems])
    wrapped = f"  <!-- compass-pages:start (generated by compass/build-pages.py) -->\n{block}\n  <!-- compass-pages:end -->"
    if "compass-pages:start" in text:
        text = re.sub(r"  <!-- compass-pages:start[\s\S]*?compass-pages:end -->", wrapped, text)
    else:
        text = text.replace("</urlset>", wrapped + "\n</urlset>")
    sm.write_text(text)


def main() -> None:
    problems, cats = load_problems()
    a = analytics()
    OUT.mkdir(exist_ok=True)
    for i, p in enumerate(problems):
        prev_p = problems[i - 1]
        next_p = problems[(i + 1) % len(problems)]
        (OUT / f"{p['id']}.html").write_text(page(p, cats, prev_p, next_p, a))
    (OUT / "index.html").write_text(index_page(problems, cats, a))
    update_sitemap(problems)
    print(f"generated {len(problems)} problem pages + index, sitemap updated")


if __name__ == "__main__":
    main()
