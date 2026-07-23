/**
 * app.js — Impact Compass application.
 * Hash-routed SPA: #/ (home) · #/atlas · #/problem/:id · #/plan · #/journey
 * State in localStorage (compass_state_v1). AI via the ask-panos worker,
 * same protocol as tool-utils.js callWorker (stream first, JSON fallback).
 */

/* ── Config ─────────────────────────────────────────── */
const CX_WORKER = 'https://ask-panos.panagiotis-kokmotoss.workers.dev';
const CX_STREAM_URL = CX_WORKER + '/api/v1/stream';
const CX_TOOL_URL   = CX_WORKER + '/api/v1/tool';
const CX_TOOLS_SITE = 'https://tools.panoskokmotos.com';

/* ── Analytics ──────────────────────────────────────────
   One helper fans a named funnel event out to whatever tracker is
   loaded (PostHog / GA4 / Plausible). Without this, the site records
   pageviews only and the read→act→give funnel is invisible. Never
   throws — analytics must never break the app. */
function cxTrack(event, props) {
  const p = props || {};
  try { if (window.posthog && posthog.capture) posthog.capture('compass_' + event, p); } catch {}
  try { if (window.gtag) gtag('event', 'compass_' + event, p); } catch {}
  try { if (window.plausible) window.plausible('compass_' + event, { props: p }); } catch {}
}

/* ── State store ────────────────────────────────────── */
const CX_KEY = 'compass_state_v1';

function cxLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(CX_KEY) || '{}');
    return {
      // sanitize nested shapes too — corrupt state must degrade, not blank the app
      understood: (s.understood && typeof s.understood === 'object' && !Array.isArray(s.understood)) ? s.understood : {},
      plans: Array.isArray(s.plans) ? s.plans.filter(p => p && Array.isArray(p.steps)) : [],
      streak: (s.streak && typeof s.streak.count === 'number') ? s.streak : { last: '', count: 0 },
      daily: (s.daily && typeof s.daily === 'object' && !Array.isArray(s.daily)) ? s.daily : { reflected: '', nudge: false, nudged: '' },
    };
  } catch { return { understood: {}, plans: [], streak: { last: '', count: 0 } }; }
}
let cxState = cxLoad();
function cxSave() { try { localStorage.setItem(CX_KEY, JSON.stringify(cxState)); } catch {} }

function cxTouchStreak() {
  const today = new Date().toDateString();
  const s = cxState.streak;
  if (s.last === today) return;
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  s.count = (s.last === yesterday) ? s.count + 1 : 1;
  s.last = today;
  cxSave();
}

/* ── Daily ritual ───────────────────────────────────── */
function cxToday() { return new Date().toDateString(); }
function cxReflectedToday() { return cxState.daily && cxState.daily.reflected === cxToday(); }

/* Local "problem of the day" nudge. Honest scope: fires when the app is
   opened on a new day (installed PWA or tab). True scheduled background
   push needs a server (VAPID) — a deliberate follow-up, not faked here. */
function cxMaybeNudge() {
  const d = cxState.daily;
  if (!d || !d.nudge) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const today = cxToday();
  if (d.nudged === today) return;
  d.nudged = today;
  cxSave();
  const dayIdx = Math.floor(Date.now() / 86400000) % COMPASS_PROBLEMS.length;
  const p = COMPASS_PROBLEMS[dayIdx];
  const body = `${p.emoji} ${p.name}: ${p.stat}.`;
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then(reg =>
        reg.showNotification("Today's problem — Impact Compass", {
          body, icon: './icon-192.png', badge: './icon-192.png',
          tag: 'compass-daily', data: { url: './#/problem/' + p.id },
        })).catch(() => {});
    } else {
      new Notification("Today's problem — Impact Compass", { body, icon: './icon-192.png' });
    }
  } catch {}
}

async function cxToggleNudge(btn) {
  const d = cxState.daily;
  if (d.nudge) { d.nudge = false; cxSave(); btn.textContent = '🔕 Get a daily nudge'; return; }
  if (typeof Notification === 'undefined') { btn.textContent = '🔕 Not supported on this browser'; return; }
  let perm = Notification.permission;
  if (perm === 'default') { try { perm = await Notification.requestPermission(); } catch {} }
  if (perm !== 'granted') { btn.textContent = '🔕 Notifications blocked — allow in browser'; return; }
  d.nudge = true; d.nudged = ''; cxSave();
  btn.textContent = '🔔 Daily nudge on';
  cxMaybeNudge(); // confirm immediately
}

function cxStepsDone() {
  return cxState.plans.reduce((n, p) => n + p.steps.filter(st => st.done).length, 0);
}

/* ── AI client (same worker protocol as the tools suite) ── */
async function compassAI(systemPrompt, userMessage, onChunk) {
  let res;
  try {
    res = await fetch(CX_STREAM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt, userMessage }),
    });
  } catch {
    return _compassAIFallback(systemPrompt, userMessage);
  }
  if (res.status === 429) { const e = new Error('rate'); e._rate = true; throw e; }
  // Stream endpoint errored (5xx, or streaming disabled) — try the JSON route.
  if (!res.ok) return _compassAIFallback(systemPrompt, userMessage);

  let full = '';
  try {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      full += decoder.decode(value, { stream: true });
      if (onChunk) onChunk(full);
    }
  } catch {
    // stream broke mid-flight — fall through to the non-streaming route
  }
  // 200 but empty/whitespace body (streaming misconfigured, or the stream
  // broke before any text) — recover via the plain JSON endpoint
  if (!full.trim()) return _compassAIFallback(systemPrompt, userMessage);
  return full;
}

async function _compassAIFallback(systemPrompt, userMessage) {
  const res = await fetch(CX_TOOL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemPrompt, userMessage }),
  });
  if (res.status === 429) { const e = new Error('rate'); e._rate = true; throw e; }
  if (!res.ok) throw new Error('Server error: ' + res.status);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

function cxAIErrorMsg(err) {
  if (err && err._rate) return "You've been exploring a lot! Please wait a minute and try again.";
  if (!navigator.onLine) return "You're offline — the AI needs a connection, but all the Atlas content still works.";
  return 'The AI is unreachable right now. Please try again in a moment.';
}

/* ── Tiny renderer helpers ──────────────────────────── */
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function md(text) {
  return esc(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
}
const TREND_LABEL = { improving: '↗ Improving', worsening: '↘ Worsening', mixed: '↔ Mixed' };

/* Verifiability — every figure should be checkable. Each problem points at
   Our World in Data's charts for its topic; the search endpoint always
   resolves, so a "verify" link is never itself a dead end. */
const CX_VERIFY_Q = {
  'extreme-poverty': 'extreme poverty', 'malaria': 'malaria', 'child-mortality': 'child mortality',
  'hunger': 'hunger undernourishment', 'unsafe-water': 'clean water sanitation', 'education': 'literacy education',
  'loneliness': 'loneliness', 'homelessness': 'homelessness', 'refugees': 'refugees displacement',
  'climate-change': 'CO2 emissions temperature', 'air-pollution': 'air pollution deaths', 'gender-inequality': 'gender inequality',
  'factory-farming': 'animal welfare meat production', 'preventable-blindness': 'blindness vision loss',
  'pandemic-preparedness': 'pandemics', 'tuberculosis': 'tuberculosis', 'lead-poisoning': 'lead exposure',
  'maternal-mortality': 'maternal mortality', 'road-deaths': 'road deaths traffic', 'tobacco': 'smoking tobacco',
  'hiv-aids': 'HIV AIDS', 'neglected-tropical-diseases': 'neglected tropical diseases', 'digital-exclusion': 'internet access',
  'corruption': 'corruption', 'ocean-health': 'overfishing plastic ocean',
};
function cxVerifyUrl(id, name) {
  return 'https://ourworldindata.org/search?q=' + encodeURIComponent(CX_VERIFY_Q[id] || name || '');
}
const EVIDENCE_LABEL = { strong: 'Strong evidence', promising: 'Promising', debated: 'Debated' };
const OFFER_META = {
  money:  { emoji: '💶', label: 'Money' },
  time:   { emoji: '⏰', label: 'Time' },
  skills: { emoji: '🛠️', label: 'Skills' },
  voice:  { emoji: '📣', label: 'Voice' },
};
// Curated "do this now" examples (data-actions.js); [] when none curated.
function cxDonow(id) {
  return (typeof COMPASS_DONOW !== 'undefined' && COMPASS_DONOW[id]) || [];
}

/* ── Router ─────────────────────────────────────────── */
const cxView = () => document.getElementById('view');

function cxRoute() {
  cxTouchStreak(); // idempotent per day; installed PWAs resume for days without reloading
  const hash = location.hash.replace(/^#\/?/, '');
  const [seg, arg] = hash.split('/');
  const routes = { '': renderHome, atlas: renderAtlas, problem: renderProblem, plan: renderPlan, journey: renderJourney, priorities: renderPriorities, bestworld: renderBestWorld, agi: renderAgi, watchlist: renderWatchlist, ea: renderEA, world: renderWorld, timeline: renderTimeline, quiz: renderQuiz, calculator: renderCalc, truth: renderTruth };
  const fn = routes[seg] || renderHome;
  let a;
  try { a = arg ? decodeURIComponent(arg.split('?')[0]) : undefined; } catch { a = undefined; }
  const v = cxView();
  // toggle only the fade class via classList so the container's own
  // cx-main class (max-width, centering, padding) is never stripped
  v.classList.remove('cx-fade');
  fn(a);
  void v.offsetWidth; // reflow so the fade replays on every route
  v.classList.add('cx-fade');
  cxNavActive(seg || 'home');
  window.scrollTo(0, 0);
  // Move focus to the new view so screen readers announce navigations
  cxView().setAttribute('tabindex', '-1');
  cxView().focus({ preventScroll: true });
}

function cxNavActive(seg) {
  const map = { home: '#/', atlas: '#/atlas', problem: '#/atlas', plan: '#/plan', journey: '#/journey', priorities: '#/priorities', bestworld: '#/bestworld', agi: '#/agi', watchlist: '#/watchlist', ea: '#/ea', world: '#/world', timeline: '#/timeline', quiz: '#/quiz', calculator: '#/calculator', truth: '#/truth' };
  document.querySelectorAll('.cx-nav a, .cx-subnav a').forEach(a => {
    const active = a.getAttribute('href') === (map[seg] || '#/');
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

/* ── Views ──────────────────────────────────────────── */

function renderHome() {
  const understood = Object.keys(cxState.understood).length;
  const dayIdx = Math.floor(Date.now() / 86400000) % COMPASS_PROBLEMS.length;
  const today = COMPASS_PROBLEMS[dayIdx];
  cxView().innerHTML = `
    <div class="cx-hero">
      <p class="cx-eyebrow">A compass for a hurting, improvable world</p>
      <h1 class="cx-h1">Understand the world.<br><span>Reduce suffering.</span><br>Expand your circle of care.</h1>
      <p class="cx-sub">${COMPASS_PROBLEMS.length} of humanity's biggest problems — what they really are, what the evidence says actually works against them, and a concrete path for <em>you</em> to help, whatever you have to offer.</p>
      <div class="cx-hero-ctas">
        <a class="cx-btn" href="#/atlas">🗺️ Explore the Atlas</a>
        <a class="cx-btn cx-btn-ghost" href="#/priorities">📊 Where do we stand?</a>
        <a class="cx-btn cx-btn-ghost" href="#/plan">Build my action plan</a>
      </div>
    </div>

    <div class="cx-mission">
      <div class="cx-card"><span class="cx-mission-emoji">🧠</span><div class="cx-mission-title">Increase understanding</div><div class="cx-mission-desc">Curated, honest knowledge on each problem — scale, causes, and the misconceptions that mislead us.</div></div>
      <div class="cx-card"><span class="cx-mission-emoji">⚡</span><div class="cx-mission-title">Reduce suffering</div><div class="cx-mission-desc">Only what evidence supports: interventions rated by strength, with honest cost-per-outcome.</div></div>
      <div class="cx-card"><span class="cx-mission-emoji">🫂</span><div class="cx-mission-title">Expand care</div><div class="cx-mission-desc">Turn understanding into action with your money, time, skills, or voice — and make it a habit.</div></div>
    </div>

    <div class="cx-today">
      <h2 class="cx-h2">Find your bearings</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(255px,1fr));gap:10px">
        <a class="cx-card cx-today-card" href="#/quiz">
          <span class="cx-today-emoji">🧠</span>
          <div>
            <div class="cx-today-name">Is the world better than you think?</div>
            <div class="cx-today-stat">Guess before you see. Twelve questions most people, and most experts, get worse than a chimp.</div>
          </div>
        </a>
        <a class="cx-card cx-today-card" href="#/world">
          <span class="cx-today-emoji">🗺️</span>
          <div>
            <div class="cx-today-name">Where in the world?</div>
            <div class="cx-today-stat">An interactive map: pick a problem, see which regions it concentrates in and which way the trend is moving.</div>
          </div>
        </a>
        <a class="cx-card cx-today-card" href="#/timeline">
          <span class="cx-today-emoji">⏳</span>
          <div>
            <div class="cx-today-name">200 years in one slider</div>
            <div class="cx-today-stat">Drag from 1800 to 2100 and watch poverty, child mortality and literacy move. The Rosling long view.</div>
          </div>
        </a>
        <a class="cx-card cx-today-card" href="#/calculator">
          <span class="cx-today-emoji">💰</span>
          <div>
            <div class="cx-today-name">Where do you fit?</div>
            <div class="cx-today-stat">You're almost certainly in the global top few percent. See where you sit, and what a tenth of it can do.</div>
          </div>
        </a>
        <a class="cx-card cx-today-card" href="#/priorities">
          <span class="cx-today-emoji">📊</span>
          <div>
            <div class="cx-today-name">Where does humanity stand?</div>
            <div class="cx-today-stat">All 25 problems ranked by how solved they are — where only will is missing, and where knowledge itself is.</div>
          </div>
        </a>
        <a class="cx-card cx-today-card" href="#/ea">
          <span class="cx-today-emoji">🎯</span>
          <div>
            <div class="cx-today-name">Where can you do the most good?</div>
            <div class="cx-today-stat">The EA lens on all 25: importance, neglectedness, tractability — tiered for the next hundred years.</div>
          </div>
        </a>
        <a class="cx-card cx-today-card" href="#/bestworld">
          <span class="cx-today-emoji">🏛️</span>
          <div>
            <div class="cx-today-name">Where are we trying to go?</div>
            <div class="cx-today-stat">Eight philosophers' best worlds, a postcard from each — and how far today measurably is from them.</div>
          </div>
        </a>
        <a class="cx-card cx-today-card" href="#/watchlist">
          <span class="cx-today-emoji">📡</span>
          <div>
            <div class="cx-today-name">What's rising next?</div>
            <div class="cx-today-stat">Eight problems climbing toward the Atlas — superbugs, heat, scam factories, falling trust.</div>
          </div>
        </a>
        <a class="cx-card cx-today-card" href="#/agi">
          <span class="cx-today-emoji">🤖</span>
          <div>
            <div class="cx-today-name">What comes after AGI?</div>
            <div class="cx-today-stat">The problems waiting on the far side of general intelligence — speculative by nature, too big to ignore.</div>
          </div>
        </a>
      </div>
    </div>

    <div class="cx-today">
      <h2 class="cx-h2">Today's problem</h2>
      <a class="cx-card cx-today-card" href="#/problem/${today.id}">
        <span class="cx-today-emoji">${today.emoji}</span>
        <div>
          <div class="cx-today-name">${esc(today.name)}</div>
          <div class="cx-today-stat">${esc(today.stat)}</div>
        </div>
      </a>
      <div class="cx-detail-ctas" style="margin-top:10px">
        <button class="cx-btn ${cxReflectedToday() ? 'cx-understood done' : 'cx-btn-ghost'}" id="cxReflect">${cxReflectedToday() ? '✓ Reflected today — see you tomorrow' : '🕯️ I reflected on this today'}</button>
        <button class="cx-btn cx-btn-ghost" id="cxNudge">${cxState.daily.nudge ? '🔔 Daily nudge on' : '🔕 Get a daily nudge'}</button>
      </div>
      <p style="color:var(--text-dim);font-size:0.76rem;margin-top:8px">A new problem surfaces every day. Small, steady attention is how care compounds.</p>
    </div>

    <div class="cx-pulse">
      <div class="cx-card"><div class="cx-pulse-num">${understood}<span style="font-size:0.9rem;color:var(--text-dim)">/${COMPASS_PROBLEMS.length}</span></div><div class="cx-pulse-label">Understood</div></div>
      <div class="cx-card"><div class="cx-pulse-num">${cxStepsDone()}</div><div class="cx-pulse-label">Steps done</div></div>
      <div class="cx-card"><div class="cx-pulse-num">${cxState.plans.length}</div><div class="cx-pulse-label">Plans</div></div>
      <div class="cx-card"><div class="cx-pulse-num">${cxState.streak.count}🔥</div><div class="cx-pulse-label">Day streak</div></div>
    </div>
    ${cxFooter()}
  `;

  const reflectBtn = document.getElementById('cxReflect');
  reflectBtn.addEventListener('click', function () {
    if (cxReflectedToday()) return;
    cxState.daily.reflected = cxToday();
    cxSave();
    this.className = 'cx-btn cx-understood done';
    this.textContent = '✓ Reflected today — see you tomorrow';
  });
  document.getElementById('cxNudge').addEventListener('click', function () { cxToggleNudge(this); });
}

function renderAtlas() {
  cxView().innerHTML = `
    <p class="cx-eyebrow">The Problem Atlas</p>
    <h1 class="cx-h1">${COMPASS_PROBLEMS.length} problems worth understanding</h1>
    <p class="cx-sub">Each entry is curated from well-established evidence. Figures are approximate by design — honesty over precision. <a href="#/priorities">See them ranked by how solved they are →</a></p>
    <div class="cx-atlas-controls">
      <div class="cx-filters" id="cxFilters">
        <button class="cx-chip active" data-cat="all">All</button>
        ${Object.entries(COMPASS_CATEGORIES).map(([k, c]) =>
          `<button class="cx-chip" data-cat="${k}">${c.emoji} ${c.name}</button>`).join('')}
      </div>
      <label class="cx-sort-select">
        <span aria-hidden="true">⇅</span>
        <select id="cxSortSel" aria-label="Sort problems">
          <option value="default">Curated order</option>
          <option value="worsening">Getting worse first</option>
          <option value="improving">Improving first</option>
          <option value="proven">Most proven tools</option>
        </select>
      </label>
    </div>
    <div class="cx-atlas" id="cxAtlas"></div>
    ${cxFooter()}
  `;

  const grid = document.getElementById('cxAtlas');
  const trendRank = { worsening: 0, mixed: 1, improving: 2 };
  const provenCount = p => p.interventions.filter(iv => iv.evidence === 'strong').length;
  let curCat = 'all';
  let curSort = localStorage.getItem('compass_atlas_sort') || 'default';
  const draw = () => {
    let list = COMPASS_PROBLEMS.filter(p => curCat === 'all' || p.category === curCat);
    if (curSort === 'worsening') list = [...list].sort((a, b) => trendRank[a.trend.dir] - trendRank[b.trend.dir]);
    else if (curSort === 'improving') list = [...list].sort((a, b) => trendRank[b.trend.dir] - trendRank[a.trend.dir]);
    else if (curSort === 'proven') list = [...list].sort((a, b) => provenCount(b) - provenCount(a));
    grid.innerHTML = list.map(p => `
      <a class="cx-card cx-problem-card cx-media-card" href="#/problem/${p.id}">
        <div class="cx-card-media">
          <img src="img/${p.id}.jpg" alt="" loading="lazy" width="640" height="360">
          <span class="cx-badge cx-badge-${p.trend.dir} cx-media-badge">${TREND_LABEL[p.trend.dir]}</span>
        </div>
        <div class="cx-card-body">
          <div class="cx-problem-name">${esc(p.name)}</div>
          <div class="cx-problem-stat">${esc(p.stat)}</div>
          <div class="cx-problem-foot">
            <span class="cx-badge cx-badge-cat">${COMPASS_CATEGORIES[p.category].emoji} ${COMPASS_CATEGORIES[p.category].name}</span>
            ${curSort === 'proven' ? `<span class="cx-proven-count">${provenCount(p)} proven</span>` : ''}
            ${cxState.understood[p.id] ? '<span class="cx-problem-done">✓ Understood</span>' : ''}
          </div>
        </div>
      </a>`).join('');
  };
  const sortSel = document.getElementById('cxSortSel');
  sortSel.value = curSort;
  draw();
  document.getElementById('cxFilters').addEventListener('click', e => {
    const btn = e.target.closest('.cx-chip');
    if (!btn) return;
    document.querySelectorAll('#cxFilters .cx-chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    curCat = btn.dataset.cat;
    draw();
  });
  sortSel.addEventListener('change', () => {
    curSort = sortSel.value;
    localStorage.setItem('compass_atlas_sort', curSort);
    cxTrack('atlas_sort', { sort: curSort });
    draw();
  });
}

/* Priorities view — David Deutsch's optimism principle as a sorting lens:
   problems are soluble, and every evil is at bottom a lack of knowledge.
   So the question per problem is whether the knowledge already exists.
   Computed from the evidence ratings the Atlas already carries; within
   each bucket the worsening problems surface first. */
function renderPriorities() {
  const buckets = { known: [], partial: [], frontier: [] };
  COMPASS_PROBLEMS.forEach(p => {
    const strong = p.interventions.filter(iv => iv.evidence === 'strong').length;
    buckets[strong >= 2 ? 'known' : strong === 1 ? 'partial' : 'frontier'].push(p);
  });
  const trendRank = { worsening: 0, mixed: 1, improving: 2 };
  Object.values(buckets).forEach(list => list.sort((a, b) => trendRank[a.trend.dir] - trendRank[b.trend.dir]));

  const META = {
    known: {
      title: '✅ Solution known — the gap is will, not knowledge',
      desc: 'Humanity already has proven tools against these. What’s missing is funding and attention, which makes them the fastest wins on Earth.',
    },
    partial: {
      title: '🧩 Partly solved — strong leads, open gaps',
      desc: 'At least one proven tool exists, but key pieces of the solution are still being worked out.',
    },
    frontier: {
      title: '🔬 Knowledge frontier — solutions still to be created',
      desc: 'No fully proven playbook yet. Progress here means creating new knowledge: research, experiments, better institutions.',
    },
  };

  const section = key => {
    const list = buckets[key];
    if (!list.length) return '';
    return `
      <div class="cx-section">
        <div class="cx-section-label">${META[key].title}</div>
        <p style="color:var(--text-dim);font-size:0.85rem;margin:-4px 0 12px">${META[key].desc}</p>
        <div class="cx-atlas">
          ${list.map(p => {
            const strong = p.interventions.filter(iv => iv.evidence === 'strong').length;
            const pct = Math.round(strong / p.interventions.length * 100);
            return `
            <a class="cx-card cx-problem-card" href="#/problem/${p.id}">
              <div class="cx-problem-top">
                <span class="cx-problem-emoji">${p.emoji}</span>
                <span class="cx-badge cx-badge-${p.trend.dir}">${TREND_LABEL[p.trend.dir]}</span>
              </div>
              <div class="cx-problem-name">${esc(p.name)}</div>
              <div class="cx-problem-stat">${esc(p.stat)}</div>
              <div class="cx-problem-foot" style="display:block">
                <div style="display:flex;justify-content:space-between;font-size:0.68rem;color:var(--text-dim);margin-bottom:4px">
                  <span>Proven tools</span><span>${strong}/${p.interventions.length}</span>
                </div>
                <div style="height:5px;border-radius:99px;background:var(--surface-2);overflow:hidden">
                  <div style="height:100%;width:${pct}%;border-radius:99px;background:var(--gold)"></div>
                </div>
                ${cxState.understood[p.id] ? '<span class="cx-problem-done" style="display:inline-block;margin-top:6px">✓ Understood</span>' : ''}
              </div>
            </a>`;
          }).join('')}
        </div>
      </div>`;
  };

  cxView().innerHTML = `
    <p class="cx-eyebrow">Priorities</p>
    <h1 class="cx-h1">Where does humanity stand?</h1>
    <p class="cx-sub">Sorted with David Deutsch’s optimism principle: <em>problems are soluble</em> — anything not forbidden by the laws of nature is achievable, given the right knowledge. Every evil is, at bottom, a lack of knowledge. So the honest question for each problem is: <strong>does the knowledge already exist?</strong> Where it does, only will and money stand between us and the win. Within each group, the worsening problems come first.</p>
    ${section('known')}
    ${section('partial')}
    ${section('frontier')}
    <div class="cx-detail-ctas" style="margin-top:26px">
      <a class="cx-btn" href="#/bestworld">🏛️ Where are we trying to go? →</a>
      <a class="cx-btn cx-btn-ghost" href="#/ea">🎯 The EA lens</a>
      <a class="cx-btn cx-btn-ghost" href="#/atlas">Browse by category</a>
    </div>
    ${cxFooter()}
  `;
}

/* Best World view — utopia as a direction, not a place. Philosophers
   disagree about the destination; their maps overlap on what blocks the
   road. That overlap is the Atlas. */
const CX_VISIONS = [
  { emoji: '🏛️', who: 'Aristotle', name: 'Eudaimonia',
    vision: 'A world where every person can flourish — not merely survive, but live out their capacities in full: reason, friendship, excellence.',
    world: 'A morning in that world: no child wakes hungry, and the question at school is not whether you learn to read but what you will master. Work exists, but it is chosen for excellence rather than survival. Friendship and civic life fill the hours that scarcity used to eat.',
    blocks: ['education', 'extreme-poverty', 'loneliness'] },
  { emoji: '📈', who: 'Bentham & Mill', name: 'The greatest happiness',
    vision: 'Suffering reduced wherever it exists. And Bentham’s test was never "can they reason?" but "can they suffer?" — the circle includes animals.',
    world: 'Pain has become rare enough to make the news. The last malaria death has a date, and it is carved in a museum. Meat is grown rather than raised, no sentient creature spends its life in a cage, and mental anguish is treated as seriously as a broken leg.',
    blocks: ['malaria', 'child-mortality', 'factory-farming'] },
  { emoji: '⚖️', who: 'Immanuel Kant', name: 'The kingdom of ends',
    vision: 'Every human treated always as an end in themselves, never merely as a means — no one’s dignity traded away.',
    world: 'No one is used purely as an instrument: no trafficked worker, no bribed official, no girl married off as a bargaining chip. Every institution can look each person in the eye, because every rule could be justified to the person it binds.',
    blocks: ['gender-inequality', 'refugees', 'corruption'] },
  { emoji: '🎭', who: 'John Rawls', name: 'Justice as fairness',
    vision: 'The world you would design if you didn’t know who you’d be born as. Behind that veil, you’d fix the worst-off positions first.',
    world: 'Being born unlucky is no longer a sentence. The worst-off neighborhood on Earth has clean water, a good school and a working clinic — because society was designed as if anyone could have been born there, and someone was.',
    blocks: ['extreme-poverty', 'maternal-mortality', 'unsafe-water'] },
  { emoji: '🌱', who: 'Sen & Nussbaum', name: 'Capabilities',
    vision: 'Freedom measured by what people can actually do and be: learn, move, see, participate, choose their own life.',
    world: 'Freedom is measured in verbs: she can read, he can see, they can vote, move, build. Cataracts are reversed in an afternoon, every village is one hop from the world’s knowledge, and nobody’s life script is written by their birthplace.',
    blocks: ['education', 'preventable-blindness', 'digital-exclusion'] },
  { emoji: '🔓', who: 'Karl Popper', name: 'The open society',
    vision: 'Institutions you can criticize and correct without violence — a civilization whose error-correction never stops.',
    world: 'Power has become boring: leaders are replaced without blood, mistakes are found and fixed in the open, and journalists die of old age. Institutions compete on how fast they correct themselves, not on how well they hide.',
    blocks: ['corruption', 'digital-exclusion', 'refugees'] },
  { emoji: '♾️', who: 'David Deutsch', name: 'The beginning of infinity',
    vision: 'A civilization that treats every problem as soluble and never stops creating the knowledge to solve the next one — including the risks that could end the whole project.',
    world: 'Problems still exist — better ones. Civilization treats each as soluble, knowledge compounds like interest, and no one lies awake fearing that a single pandemic, asteroid or mistake could end the whole project. The frontier is open and it stays open.',
    blocks: ['pandemic-preparedness', 'education', 'tuberculosis'] },
  { emoji: '🫱', who: 'Peter Singer', name: 'The expanding circle',
    vision: 'Moral concern that refuses to stop at borders, or at our own species — distance is not a reason to let a child drown.',
    world: 'The circle has finished expanding: distance, borders and species no longer decide whose suffering counts. Helping is not charity but reflex — the drowning child is pulled from the pond whether she is ten meters away or ten thousand kilometers.',
    blocks: ['extreme-poverty', 'neglected-tropical-diseases', 'factory-farming'] },
];

/* Distance-to-vision readout, computed live from the Atlas: of a vision's
   blocking problems, how many already have proven tools (≥2 strong-evidence
   interventions) and how many are still worsening. The honest version of a
   future simulation — not a prediction, a measurement of the gap. */
function cxVisionDistance(blocks) {
  const ps = blocks.map(compassProblem).filter(Boolean);
  const proven = ps.filter(p => p.interventions.filter(iv => iv.evidence === 'strong').length >= 2).length;
  const worsening = ps.filter(p => p.trend.dir === 'worsening').length;
  const improving = ps.filter(p => p.trend.dir === 'improving').length;
  return { total: ps.length, proven, worsening, improving };
}

function renderBestWorld() {
  cxView().innerHTML = `
    <p class="cx-eyebrow">The destination</p>
    <h1 class="cx-h1">The best world, according to philosophers</h1>
    <p class="cx-sub">Utopia is not a place — it’s a direction. Philosophers have disagreed about the destination for 2,400 years, but lay their maps on top of each other and the same obstacles appear on nearly every route. Those obstacles are this Atlas. Solving them isn’t one worldview’s agenda; it’s the shared road.</p>
    ${CX_VISIONS.map(v => {
      const d = cxVisionDistance(v.blocks);
      return `
      <div class="cx-card" style="margin-top:14px">
        <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
          <span style="font-size:1.3rem">${v.emoji}</span>
          <span style="font-weight:800">${v.name}</span>
          <span style="color:var(--text-dim);font-size:0.8rem">${v.who}</span>
        </div>
        <p style="color:var(--text-dim);font-size:0.88rem;margin:8px 0 10px">${v.vision}</p>
        <div class="cx-vision-world">
          <div style="font-size:0.72rem;font-weight:800;text-transform:uppercase;letter-spacing:0.07em;color:var(--gold);margin-bottom:5px">📮 A postcard from that world</div>
          <p style="font-size:0.86rem;line-height:1.6;margin:0">${v.world}</p>
        </div>
        <div style="color:var(--text-dim);font-size:0.78rem;margin:10px 0 8px">
          <strong style="color:var(--text)">Distance today:</strong>
          ${d.proven} of ${d.total} blocking problems already have proven tools
          · ${d.improving} improving${d.worsening ? ` · <span style="color:var(--red);font-weight:700">${d.worsening} still worsening</span>` : ''}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${v.blocks.map(id => { const p = compassProblem(id); return p ? `<a class="cx-chip" style="text-decoration:none" href="#/problem/${p.id}">${p.emoji} ${esc(p.name)}</a>` : ''; }).join('')}
        </div>
      </div>`; }).join('')}
    <div class="cx-detail-ctas" style="margin-top:26px">
      <a class="cx-btn" href="#/priorities">📊 Where do we stand today? →</a>
      <a class="cx-btn cx-btn-ghost" href="#/agi">🤖 What comes after AGI?</a>
      <a class="cx-btn cx-btn-ghost" href="#/atlas">Explore all 25 problems</a>
    </div>
    ${cxFooter()}
  `;
}

/* After AGI view — the problems expected on the far side of general
   intelligence. Unlike the Atlas this is informed speculation, not settled
   evidence, and the page says so. Each entry links back to the Atlas
   problem where its earliest version is already visible today. */
const CX_AGI = [
  { emoji: '🎯', name: 'Alignment', tag: 'Getting systems smarter than us to want what we meant',
    why: 'Every tool so far did what we said, not what we meant — survivable, because tools were weaker than us. A system that out-plans its operators turns a misspecified goal from a bug you patch into a force you negotiate with. This is the field’s central open problem, and it is not solved.',
    now: 'Alignment is a real, funded, hiring research field today: interpretability, evaluations, scalable oversight.',
    seeds: ['corruption', 'factory-farming'],
    seedNote: 'We already live with misaligned optimizers — institutions and industries that produce harm as a side effect of the goal they were given.' },
  { emoji: '👑', name: 'Concentration of power', tag: 'When the strongest systems need one datacenter, not a million cooperating people',
    why: 'Power has always required the cooperation of many — armies, workers, taxpayers — and that need was the deepest check on tyranny. AGI could collapse it. Unchecked, that is the strongest lock-in mechanism ever built: a mistake error-correction might never get to undo.',
    now: 'Fought today through AI governance: compute oversight, antitrust, international agreements, open ecosystems.',
    seeds: ['corruption', 'digital-exclusion'],
    seedNote: 'Power concentration is the oldest problem in the Atlas — AGI raises its ceiling.' },
  { emoji: '💼', name: 'Work and income after automation', tag: 'If machines out-compete most labor, wages stop distributing wealth',
    why: 'Two centuries of automation destroyed tasks and created better ones. AGI competes with something new: the general ability to learn the next task. If jobs stop being the mechanism that distributes income, status and daily structure, a successor has to be designed — and it hasn’t been.',
    now: 'The best evidence base is being built now: large cash-transfer and basic-income trials, including GiveDirectly’s decade-long UBI study.',
    seeds: ['extreme-poverty', 'education'],
    seedNote: 'How well we handle poverty with today’s tools is the rehearsal for handling it at machine speed.' },
  { emoji: '🧠', name: 'Epistemic security', tag: 'A world where seeing is no longer believing',
    why: 'Democracy, science and journalism assume evidence is expensive to fake. Synthetic media and machine-scale persuasion break that assumption. The deepest damage isn’t believing false things — it’s the liar’s dividend, where real evidence becomes deniable and shared truth dissolves.',
    now: 'Content provenance standards, authenticity infrastructure, and old-fashioned media literacy — the defenses exist and are underfunded.',
    seeds: ['education', 'corruption'],
    seedNote: 'A population that reasons well is the immune system; education is where it gets built.' },
  { emoji: '🧬', name: 'Misuse uplift', tag: 'Expertise for catastrophe, available to anyone',
    why: 'The knowledge to cause mass harm — engineered pathogens above all — has been gated by years of rare training. Capable models compress that gate. Defense must outrun an offense that no longer needs a state program behind it.',
    now: 'The same fight as pandemic preparedness: 100-day vaccine capability, early-detection surveillance, and safeguards inside the models themselves.',
    seeds: ['pandemic-preparedness'],
    seedNote: 'Every dollar of biosecurity built today is defense against both natural and engineered outbreaks.' },
  { emoji: '🏛️', name: 'The governance gap', tag: 'Capabilities move in months; institutions move in decades',
    why: 'Nuclear treaties took decades, for a technology only states could build. AI capability doubles on venture timescales and spreads as software. The widening gap between what the technology does and what any institution can verify is the risk multiplier under every other entry on this page.',
    now: 'National AI safety institutes, the EU AI Act, and compute-based verification research are the first institutional answers.',
    seeds: ['corruption'],
    seedNote: 'Institutions that can’t govern today’s conflicts of interest won’t govern tomorrow’s.' },
  { emoji: '🕯️', name: 'Meaning after achievement', tag: 'What are humans for, when machines do everything better?',
    why: 'Work is not only income — it is structure, status, identity and the feeling of being needed. Abundance without roles could mean comfortable despair at civilizational scale. Aristocracies met this problem before; never at eight billion people.',
    now: 'The loneliness epidemic is this problem’s leading edge, and community infrastructure is its working answer.',
    seeds: ['loneliness', 'education'],
    seedNote: 'Societies that solve connection and purpose now are practicing for after.' },
  { emoji: '🤖', name: 'Minds we might owe something to', tag: 'The factory farming mistake, repeated at digital speed',
    why: 'If any future system has experiences that matter morally, we could run suffering at industrial scale without noticing — the exact mistake made with animals, but at copy-paste speed. Nobody knows whether or when this applies. That uncertainty is the problem.',
    now: 'A small research field — digital minds and AI welfare — argues the tests should exist before they’re needed.',
    seeds: ['factory-farming'],
    seedNote: 'How we treat minds we already know can suffer is the precedent.' },
];

function renderAgi() {
  cxView().innerHTML = `
    <p class="cx-eyebrow">After AGI</p>
    <h1 class="cx-h1">The problems on the far side of general intelligence</h1>
    <p class="cx-sub">This page is different from the Atlas, and honesty requires saying so: these are <strong>informed speculation</strong>, not settled evidence. But they are what serious researchers expect if machines reach and pass human-level general intelligence — and the time to build tools is before you need them. Deutsch’s principle still holds: <em>they are problems, so they are soluble.</em> Each one is already visible somewhere in today’s Atlas.</p>
    ${CX_AGI.map(a => `
      <div class="cx-card" style="margin-top:14px">
        <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
          <span style="font-size:1.3rem">${a.emoji}</span>
          <span style="font-weight:800">${a.name}</span>
        </div>
        <p style="color:var(--gold);font-size:0.8rem;font-weight:700;margin-top:4px">${a.tag}</p>
        <p style="color:var(--text-dim);font-size:0.88rem;margin:8px 0 6px">${a.why}</p>
        <p style="font-size:0.84rem;margin:0 0 10px"><strong>What can be done now:</strong> <span style="color:var(--text-dim)">${a.now}</span></p>
        <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
          <span style="color:var(--text-dim);font-size:0.74rem;font-weight:800">Already visible in:</span>
          ${a.seeds.map(id => { const p = compassProblem(id); return p ? `<a class="cx-chip" style="text-decoration:none" href="#/problem/${p.id}">${p.emoji} ${esc(p.name)}</a>` : ''; }).join('')}
        </div>
        <p style="color:var(--text-dim);font-size:0.76rem;margin-top:8px">${a.seedNote}</p>
      </div>`).join('')}
    <div class="cx-card" style="margin-top:20px">
      <div style="font-weight:800;margin-bottom:6px">🧭 Go deeper</div>
      <p style="color:var(--text-dim);font-size:0.84rem;margin-bottom:10px">Three honest starting points, from career-level to curious:</p>
      <div class="cx-detail-ctas">
        <a class="cx-btn" data-agi-out="80000hours" href="https://80000hours.org/problem-profiles/artificial-intelligence/" target="_blank" rel="noopener">80,000 Hours: the case & careers →</a>
        <a class="cx-btn cx-btn-ghost" data-agi-out="aisafety-info" href="https://aisafety.info/" target="_blank" rel="noopener">AISafety.info: every question answered</a>
        <a class="cx-btn cx-btn-ghost" data-agi-out="bluedot" href="https://aisafetyfundamentals.com/" target="_blank" rel="noopener">AI Safety Fundamentals: free course</a>
      </div>
    </div>
    <div class="cx-detail-ctas" style="margin-top:26px">
      <a class="cx-btn" href="#/priorities">📊 Where do we stand today? →</a>
      <a class="cx-btn cx-btn-ghost" href="#/bestworld">🏛️ Where are we trying to go?</a>
    </div>
    ${cxFooter()}
  `;
  cxView().querySelectorAll('[data-agi-out]').forEach(el =>
    el.addEventListener('click', () => cxTrack('outbound_agi_click', { dest: el.dataset.agiOut })));
}

/* Watchlist view — rising problems that are climbing toward the Atlas.
   Real, measurable trends, but the intervention evidence is younger than
   the Atlas standard. This is where problems audition for entry. */
const CX_RISING = [
  { emoji: '🦠', name: 'Antimicrobial resistance', tag: 'Superbugs outrunning our antibiotics',
    stat: 'Drug-resistant infections directly kill over 1.1 million people a year, projected to near 1.9 million by 2050.',
    why: 'Antibiotics are overused in humans and farm animals while the pipeline of new ones has thinned to a trickle — resistance compounds, discovery doesn’t.',
    works: 'Stewardship programs, incentive schemes for new antibiotics, vaccines that prevent the infection in the first place, and clean water cutting infection loads.' },
  { emoji: '🌡️', name: 'Extreme heat', tag: 'The deadliest weather, and the fastest-growing',
    stat: 'Heat already contributes to roughly half a million deaths a year — more than floods, storms and hurricanes combined.',
    why: 'Every fraction of a degree adds exposure, and the populations aging fastest live in the regions heating fastest.',
    works: 'Heat action plans, early-warning systems, cool roofs and shaded cities — cheap, proven, and adopted by only a fraction of at-risk cities.' },
  { emoji: '🧓', name: 'Ageing societies', tag: 'Pension pyramids meeting population columns',
    stat: 'By 2050 one person in six on Earth will be over 65, and two-thirds of countries are already below replacement fertility.',
    why: 'Care systems, pensions and labor markets were designed for young populations that no longer exist — the math breaks slowly, then suddenly.',
    works: 'Healthspan research, care-workforce investment, later-life work redesign, and family support policies with honest evidence about what moves fertility (little does).' },
  { emoji: '📱', name: 'Youth mental health', tag: 'The steepest curve on any health chart',
    stat: 'Anxiety and depression among adolescents have climbed sharply since the early 2010s; suicide is a leading cause of death for ages 15–29.',
    why: 'Causes are contested — phones, isolation, economic anxiety — but the curve itself is not, and treatment systems were undersized before it began.',
    works: 'School-based therapy programs, closing the treatment gap, and honest research on the social-media question instead of culture war.' },
  { emoji: '💧', name: 'Groundwater depletion', tag: 'Invisible until the wells fail',
    stat: 'The aquifers behind roughly 40% of irrigated food are dropping, many at accelerating rates.',
    why: 'Water underground is unmetered, unpriced and politically untouchable — so it is mined like a free resource until it isn’t there.',
    works: 'Metering and fair pricing, drip irrigation, managed recharge, and crop choices that match the water that actually falls.' },
  { emoji: '🗳️', name: 'Democratic backsliding', tag: 'More people autocratizing than democratizing',
    stat: 'Global freedom has declined for 18 consecutive years; most of humanity now lives under autocratic or autocratizing rule.',
    why: 'The playbook — capture courts, starve media, keep elections as theater — travels between countries faster than the defenses do.',
    works: 'Independent journalism, election infrastructure, anti-corruption enforcement — the same tools as the Atlas corruption entry, deployed earlier.' },
  { emoji: '🧪', name: 'Forever chemicals', tag: 'PFAS and microplastics, everywhere at once',
    stat: 'Rainwater worldwide now exceeds proposed safe limits for PFOA; microplastics turn up in blood, placentas and Antarctic snow.',
    why: 'The chemicals were designed not to break down, so every year of production is permanent — exposure only ratchets up.',
    works: 'Restricting non-essential uses (the EU is moving), safer substitution, and destruction tech for the worst-contaminated sites.' },
  { emoji: '💸', name: 'Industrialized fraud', tag: 'Scam factories running on trafficked labor',
    stat: 'Online fraud now steals an estimated $1 trillion a year, run partly from compounds where hundreds of thousands are held in forced labor.',
    why: 'AI tools make every scam cheaper, more fluent and more personal, while enforcement stops at every border the money crosses.',
    works: 'Financial chokepoints, platform takedowns, cross-border enforcement, and freeing the trafficked workers the industry runs on.' },
];

function renderWatchlist() {
  cxView().innerHTML = `
    <p class="cx-eyebrow">The watchlist</p>
    <h1 class="cx-h1">Rising problems</h1>
    <p class="cx-sub">The Atlas holds problems with mature evidence about what works. This page is the queue behind it: problems whose <strong>trend lines are real and climbing</strong>, but whose intervention evidence is still young. This is where problems audition for the Atlas — and where attention arriving early counts double.</p>
    ${CX_RISING.map(r => `
      <div class="cx-card" style="margin-top:14px">
        <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
          <span style="font-size:1.3rem">${r.emoji}</span>
          <span style="font-weight:800">${r.name}</span>
          <span class="cx-badge cx-badge-worsening">↗ Rising</span>
        </div>
        <p style="color:var(--gold);font-size:0.8rem;font-weight:700;margin-top:4px">${r.tag}</p>
        <p style="font-size:0.86rem;margin:8px 0 6px">${r.stat}</p>
        <p style="color:var(--text-dim);font-size:0.84rem;margin:0 0 6px"><strong style="color:var(--text)">Why it’s rising:</strong> ${r.why}</p>
        <p style="color:var(--text-dim);font-size:0.84rem;margin:0"><strong style="color:var(--text)">What works so far:</strong> ${r.works}</p>
      </div>`).join('')}
    <div class="cx-detail-ctas" style="margin-top:26px">
      <a class="cx-btn" href="#/atlas">🗺️ The 25 with mature evidence →</a>
      <a class="cx-btn cx-btn-ghost" href="#/agi">🤖 And after AGI?</a>
    </div>
    ${cxFooter()}
  `;
}

/* EA lens view — the 25 Atlas problems through the effective altruism
   community's framework: importance × neglectedness × tractability, on a
   century view. Ratings are tiers, not scores: they mirror the published
   positions of GiveWell, 80,000 Hours, Open Philanthropy and ACE rather
   than inventing numeric precision the data can't support. */
const CX_EA = [
  { id: 'pandemic-preparedness', tier: 1, s: 'H', n: 'H', t: 'M', note: 'On a century view one engineered or natural pandemic can dominate everything else, and preparedness stays badly underfunded between crises.' },
  { id: 'malaria', tier: 1, s: 'H', n: 'M', t: 'H', note: 'GiveWell’s longest-standing top cause: enormous burden, proven $5 nets, still short of money every year.' },
  { id: 'factory-farming', tier: 1, s: 'H', n: 'H', t: 'M', note: 'Tens of billions of sentient animals against a few hundred million dollars of advocacy — the largest suffering-per-dollar-of-attention gap on this list.' },
  { id: 'lead-poisoning', tier: 1, s: 'H', n: 'H', t: 'H', note: 'One in three children affected, whole countries without testing, and regulation that is cheap and permanent once passed.' },
  { id: 'neglected-tropical-diseases', tier: 1, s: 'M', n: 'H', t: 'H', note: 'The word neglected is in the name: deworming and elimination cost cents per person treated.' },
  { id: 'child-mortality', tier: 1, s: 'H', n: 'M', t: 'H', note: 'Vaccine incentives and oral rehydration remain among the cheapest lives saved anywhere in the world.' },
  { id: 'tuberculosis', tier: 2, s: 'H', n: 'M', t: 'M', note: 'The biggest infectious killer receives a fraction of HIV’s funding; finding the missing cases is the tractable gap.' },
  { id: 'unsafe-water', tier: 2, s: 'H', n: 'M', t: 'H', note: 'Chlorination at the water source is one of the best-evidenced child-survival buys of the last decade.' },
  { id: 'hunger', tier: 2, s: 'H', n: 'M', t: 'H', note: 'Fortification and therapeutic feeding are proven — the missing ingredient is delivery funding, not knowledge.' },
  { id: 'extreme-poverty', tier: 2, s: 'H', n: 'M', t: 'H', note: 'Direct cash is the benchmark every other intervention has to beat, and it scales almost without limit.' },
  { id: 'maternal-mortality', tier: 2, s: 'M', n: 'H', t: 'H', note: 'Most of these deaths have been preventable since the 1950s; a fistula repair restores a life for a few hundred dollars.' },
  { id: 'preventable-blindness', tier: 2, s: 'M', n: 'M', t: 'H', note: 'A $30–$100 surgery with instant, visible results — tractability is the star.' },
  { id: 'tobacco', tier: 2, s: 'H', n: 'H', t: 'H', note: 'Tobacco taxation is arguably the most cost-effective health policy known; industry opposition, not knowledge, is the barrier.' },
  { id: 'road-deaths', tier: 2, s: 'M', n: 'H', t: 'M', note: '1.2 million deaths a year attract almost no philanthropy, and the policy playbook (helmets, speed, drink-driving) is proven.' },
  { id: 'air-pollution', tier: 2, s: 'H', n: 'M', t: 'M', note: 'Kills millions yearly, but funding crowds toward carbon and leaves clean-air advocacy lean.' },
  { id: 'hiv-aids', tier: 2, s: 'M', n: 'L', t: 'M', note: 'Huge burden, but the least neglected disease here — the marginal dollar often goes further elsewhere.' },
  { id: 'corruption', tier: 2, s: 'H', n: 'M', t: 'L', note: 'Upstream of nearly everything and chronically hard to move; investigative journalism is the tractable edge.' },
  { id: 'climate-change', tier: 3, s: 'H', n: 'L', t: 'M', note: 'Enormous stakes and the least neglected problem on the list — EA money targets overlooked corners like advanced clean energy advocacy.' },
  { id: 'education', tier: 3, s: 'H', n: 'L', t: 'M', note: 'Vast scale and heavy funding; the evidence-based approaches (teaching at the right level) are only now displacing what doesn’t work.' },
  { id: 'gender-inequality', tier: 3, s: 'H', n: 'M', t: 'M', note: 'Immense scale; the best marginal buys — girls’ education, ending child marriage — are strong, the broader space is crowded.' },
  { id: 'refugees', tier: 3, s: 'M', n: 'M', t: 'L', note: 'The bottleneck is political will, not caring — tractability for outside money is the constraint.' },
  { id: 'homelessness', tier: 3, s: 'M', n: 'L', t: 'M', note: 'Housing First works, but cost per person helped runs orders of magnitude above global-health buys.' },
  { id: 'loneliness', tier: 3, s: 'M', n: 'H', t: 'L', note: 'Rising and under-researched — scalable interventions are still being figured out.' },
  { id: 'digital-exclusion', tier: 3, s: 'M', n: 'M', t: 'M', note: 'Improving fast on its own as connectivity spreads; the marginal dollar adds less than the trend does.' },
  { id: 'ocean-health', tier: 3, s: 'M', n: 'M', t: 'L', note: 'Policy wins are real but slow, and scale is hard to price against direct suffering averted.' },
];

const CX_EA_TIERS = {
  1: { title: '🌟 Outstanding', sub: 'Where the EA community sends marginal money and careers first: big, neglected, and movable.' },
  2: { title: '💪 High impact', sub: 'Proven and important — funded, but not fully; strong picks with the right intervention.' },
  3: { title: '🌍 Important, but crowded or harder to move', sub: 'Not less important — but the next dollar or hour faces more competition or thicker walls.' },
};

function renderEA() {
  const lvl = { H: 'High', M: 'Med', L: 'Low' };
  const itn = (label, v) => `<span class="cx-itn ${v === 'H' ? 'hi' : v === 'L' ? 'lo' : ''}">${label} <b>${lvl[v]}</b></span>`;
  const tierBlock = t => `
    <h2 class="cx-h2" style="margin-top:26px">${CX_EA_TIERS[t].title}</h2>
    <p style="color:var(--text-dim);font-size:0.84rem;margin:4px 0 12px">${CX_EA_TIERS[t].sub}</p>
    ${CX_EA.filter(e => e.tier === t).map(e => {
      const p = compassProblem(e.id);
      if (!p) return '';
      return `
      <a class="cx-card" style="display:block;text-decoration:none;color:inherit;margin-top:10px" href="#/problem/${p.id}">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:1.2rem">${p.emoji}</span>
          <span style="font-weight:800">${esc(p.name)}</span>
          <span style="display:inline-flex;gap:5px;margin-left:auto">${itn('Importance', e.s)}${itn('Neglect', e.n)}${itn('Tractable', e.t)}</span>
        </div>
        <p style="color:var(--text-dim);font-size:0.82rem;margin:7px 0 0">${e.note}</p>
      </a>`; }).join('')}`;
  cxView().innerHTML = `
    <p class="cx-eyebrow">The EA lens</p>
    <h1 class="cx-h1">Where can you do the most good?</h1>
    <p class="cx-sub">The effective altruism community ranks problems by three questions: how <strong>big</strong> is it, how <strong>neglected</strong> is it, and how <strong>tractable</strong> is it — because the most good per hour or dollar hides where importance and neglect overlap. Below are all 25 Atlas problems through that lens, in tiers rather than fake-precise scores, mirroring the published views of GiveWell, 80,000 Hours, Open Philanthropy and Animal Charity Evaluators. One lens among several — <a href="#/priorities">the Priorities view</a> ranks the same problems by whether the knowledge exists.</p>
    <div class="cx-card" style="border-color:var(--gold)">
      <div style="font-weight:800;margin-bottom:5px">💯 On a 100-year view</div>
      <p style="color:var(--text-dim);font-size:0.85rem;margin:0">Over a century, the EA community weighs <strong style="color:var(--text)">trajectory risks</strong> highest of all — pandemics that could end the run, and the transition to machine intelligence. That is why <a href="#/problem/pandemic-preparedness">pandemic preparedness</a> tops the tiers below, and why the <a href="#/agi">After AGI problems</a> belong in this conversation even though they can’t be scored yet.</p>
    </div>
    ${tierBlock(1)}${tierBlock(2)}${tierBlock(3)}
    <div class="cx-card" style="margin-top:26px">
      <div style="font-weight:800;margin-bottom:6px">🧭 Redirect yourself</div>
      <p style="color:var(--text-dim);font-size:0.84rem;margin-bottom:10px">Three doors, depending on what you have to give:</p>
      <div class="cx-detail-ctas">
        <a class="cx-btn" data-ea-out="givewell" href="https://www.givewell.org/" target="_blank" rel="noopener">💸 GiveWell: give where it works →</a>
        <a class="cx-btn cx-btn-ghost" data-ea-out="80000hours" href="https://80000hours.org/" target="_blank" rel="noopener">🛠️ 80,000 Hours: your career</a>
        <a class="cx-btn cx-btn-ghost" data-ea-out="gwwc" href="https://www.givingwhatwecan.org/" target="_blank" rel="noopener">🤝 Giving What We Can: the pledge</a>
      </div>
    </div>
    ${cxFooter()}
  `;
  cxView().querySelectorAll('[data-ea-out]').forEach(el =>
    el.addEventListener('click', () => cxTrack('outbound_ea_click', { dest: el.dataset.eaOut })));
}

/* Truth / provenance view — the commitment that underwrites everything else.
   The mission is to increase knowledge and reduce suffering; that only works
   if the knowledge is true, so this page says how we try to keep it true and
   how anyone can check. */
function renderTruth() {
  cxView().innerHTML = `
    <p class="cx-eyebrow">How we know</p>
    <h1 class="cx-h1">The commitment to truth</h1>
    <p class="cx-sub">This whole project rests on one bet: that understanding the world honestly is how we reduce its suffering. That only holds if the understanding is <em>true</em>. So here is how these figures are made, where they come from, and how you can check every one of them yourself.</p>

    <div class="cx-card" style="margin-top:14px">
      <div style="font-weight:800;margin-bottom:6px">🎯 Honesty over precision</div>
      <p style="color:var(--text-dim);font-size:0.9rem;line-height:1.7;margin:0">Every number here is a rounded, honest approximation, not a citation. "Roughly 600,000 malaria deaths a year" is truer to the state of knowledge than a false-precise "618,347", because the real figure carries uncertainty that a precise number hides. Where sources genuinely disagree, we say so. We would rather be roughly right than precisely wrong.</p>
    </div>
    <div class="cx-card" style="margin-top:12px">
      <div style="font-weight:800;margin-bottom:6px">🔎 Everything is verifiable</div>
      <p style="color:var(--text-dim);font-size:0.9rem;line-height:1.7;margin:0 0 8px">Each problem links straight to Our World in Data's charts for its topic, so you never have to take our word for it. The core long-run figures draw on the same public sources researchers use:</p>
      <p style="font-size:0.86rem;line-height:1.8;margin:0">Our World in Data · the World Bank · the World Health Organization · the UN (Population Division, IGME, UNESCO, UNHCR) · Gapminder · GiveWell and ACE for cost-effectiveness · NOAA for the climate record.</p>
    </div>
    <div class="cx-card" style="margin-top:12px">
      <div style="font-weight:800;margin-bottom:6px">🧭 Where we are careful to say "we don't know"</div>
      <p style="color:var(--text-dim);font-size:0.9rem;line-height:1.7;margin:0">Projections past today are drawn dashed and labelled as forecasts, never facts. Problems without honest data say so rather than inventing it. The <a href="#/agi">After AGI</a> page is explicitly informed speculation. The <a href="#/world">world map</a> shades by region, not fabricated country numbers. Refusing to overclaim is part of telling the truth.</p>
    </div>
    <div class="cx-card" style="margin-top:12px;border-color:var(--gold)">
      <div style="font-weight:800;margin-bottom:6px">🛰️ The road to live data</div>
      <p style="color:var(--text-dim);font-size:0.9rem;line-height:1.7;margin:0">Today these figures are reviewed and updated by hand. The next step is to have the headline numbers refresh themselves from Our World in Data on a schedule, with the date of the latest figure shown in the open. Truth isn't a state you reach once; it's a practice you keep. That work is underway.</p>
    </div>
    <p style="color:var(--text-dim);font-size:0.82rem;margin-top:16px">Found something that looks wrong? That's the most useful thing you can send. Tell <a href="https://panoskokmotos.com" target="_blank" rel="noopener">Panos</a>, and it gets fixed.</p>
    <div class="cx-detail-ctas" style="margin-top:14px">
      <a class="cx-btn" href="#/atlas">Explore the Atlas →</a>
      <a class="cx-btn cx-btn-ghost" href="#/timeline">⏳ See the long record</a>
    </div>
    ${cxFooter()}
  `;
}

/* "Where you fit in the world" — Rosling's Dollar Street idea as a calculator:
   most people in rich countries have no idea they are globally rich. The
   income-distribution anchors are approximate individual PPP figures from the
   global distribution (World Bank / Our World in Data); the impact figures are
   order-of-magnitude GiveWell estimates. Both are honestly flagged, and we
   link to the rigorous version rather than pretend to out-do it. */
const CX_DIST = [
  [10, 650], [20, 1000], [30, 1500], [40, 2200], [50, 3000], [60, 4200],
  [70, 6000], [80, 9500], [85, 13000], [90, 19000], [93, 26000], [95, 33000],
  [97, 46000], [99, 75000], [99.9, 180000],
];
const CX_GLOBAL_MEDIAN = 3000; // int-$ PPP per person per year, approx
const CX_FX = { USD: 1, EUR: 1.08, GBP: 1.27 };

function cxIncomePercentile(usd) {
  if (usd <= CX_DIST[0][1]) return Math.max(1, CX_DIST[0][0] * (usd / CX_DIST[0][1]));
  for (let i = 1; i < CX_DIST.length; i++) {
    if (usd <= CX_DIST[i][1]) {
      const [p0, v0] = CX_DIST[i - 1], [p1, v1] = CX_DIST[i];
      const t = (Math.log(usd) - Math.log(v0)) / (Math.log(v1) - Math.log(v0));
      return p0 + (p1 - p0) * t;
    }
  }
  return 99.95;
}

function renderCalc() {
  cxView().innerHTML = `
    <p class="cx-eyebrow">Where you fit</p>
    <h1 class="cx-h1">You are probably richer than you think</h1>
    <p class="cx-sub">Almost everyone in a wealthy country is, by global standards, near the very top — and almost no one feels it. Enter your income and see where you actually sit on the world’s ladder, and what a small share of it can honestly do. Figures are approximate and PPP-adjusted; this is a perspective tool, not a tax return.</p>
    <div class="cx-card">
      <div class="cx-calc-form">
        <label class="cx-calc-field">
          <span>Your annual income, after tax</span>
          <div class="cx-calc-inrow">
            <select id="cxCalcCur" aria-label="Currency">${Object.keys(CX_FX).map(c => `<option value="${c}">${c}</option>`).join('')}</select>
            <input type="number" id="cxCalcInc" inputmode="numeric" placeholder="e.g. 35000" aria-label="Annual income">
          </div>
        </label>
        <label class="cx-calc-field">
          <span>People it supports (household size)</span>
          <input type="number" id="cxCalcHh" value="1" min="1" max="20" aria-label="Household size">
        </label>
        <button class="cx-btn" id="cxCalcGo">See where I fit →</button>
      </div>
    </div>
    <div id="cxCalcOut"></div>
    <p style="color:var(--text-dim);font-size:0.76rem;margin-top:16px">Method: your income is divided across your household, converted to international dollars and compared with an approximate global income distribution (World Bank, Our World in Data). Impact figures are order-of-magnitude estimates from GiveWell. For a rigorous version, see <a href="https://www.givingwhatwecan.org/how-rich-am-i" target="_blank" rel="noopener" data-calc-out="gwwc">Giving What We Can’s How Rich Am I →</a></p>
    ${cxFooter()}
  `;

  const out = document.getElementById('cxCalcOut');
  const calc = () => {
    const cur = document.getElementById('cxCalcCur').value;
    const raw = parseFloat(document.getElementById('cxCalcInc').value);
    const hh = Math.max(1, parseInt(document.getElementById('cxCalcHh').value, 10) || 1);
    if (!raw || raw <= 0) { out.innerHTML = ''; return; }
    const usdPerPerson = (raw / CX_FX[cur]) / hh;
    const pct = cxIncomePercentile(usdPerPerson);
    const richerThan = Math.min(99.9, pct);
    const topPct = Math.max(0.1, 100 - pct);
    const mult = usdPerPerson / CX_GLOBAL_MEDIAN;
    const give = raw * 0.10; // 10% in their currency
    const giveUsd = give / CX_FX[cur];
    const nets = Math.round(giveUsd / 5);
    const dewormed = Math.round(giveUsd / 1);
    const lifeYears = giveUsd > 0 ? 5000 / giveUsd : Infinity;
    const fmtMoney = n => Math.round(n).toLocaleString();
    const topLabel = topPct < 1 ? topPct.toFixed(1) : Math.round(topPct);
    cxTrack('calc_result', { top: topLabel });
    out.innerHTML = `
      <div class="cx-card" style="margin-top:14px;text-align:center;border-color:var(--gold)">
        <p style="color:var(--text-dim);font-size:0.8rem;font-weight:800;text-transform:uppercase;letter-spacing:0.06em">You are in the richest</p>
        <div style="font-size:3rem;font-weight:800;letter-spacing:-0.03em;color:var(--gold);line-height:1.05">${topLabel}%</div>
        <p style="font-weight:700;margin-top:2px">of people on Earth</p>
        <div class="cx-calc-bar"><div class="cx-calc-fill" style="width:${richerThan.toFixed(1)}%"></div><div class="cx-calc-marker" style="left:${richerThan.toFixed(1)}%"></div></div>
        <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--text-dim);font-weight:700"><span>poorest</span><span>richest</span></div>
        <p style="font-size:0.9rem;margin-top:12px">You earn about <strong>${mult >= 2 ? Math.round(mult) + '×' : mult.toFixed(1) + '×'}</strong> the global median income per person.</p>
      </div>
      <div class="cx-card" style="margin-top:12px">
        <div style="font-weight:800;margin-bottom:8px">💛 What a tenth of it could honestly do</div>
        <p style="color:var(--text-dim);font-size:0.88rem;margin:0 0 10px">Giving 10% — about <strong style="color:var(--text)">${cur} ${fmtMoney(give)}</strong> a year — could, at GiveWell’s estimates for the most effective charities, fund roughly:</p>
        <div class="cx-calc-stats">
          <div class="cx-calc-stat"><div class="cx-calc-num">${nets.toLocaleString()}</div><div class="cx-calc-lab">🛏️ anti-malaria bednets a year</div></div>
          <div class="cx-calc-stat"><div class="cx-calc-num">${dewormed.toLocaleString()}</div><div class="cx-calc-lab">🪱 children dewormed a year</div></div>
          <div class="cx-calc-stat"><div class="cx-calc-num">${lifeYears <= 1 ? '1+/yr' : '~' + Math.round(lifeYears) + ' yrs'}</div><div class="cx-calc-lab">🕯️ ${lifeYears <= 1 ? 'lives saved a year' : 'to save a life, sustained'}</div></div>
        </div>
        <p style="color:var(--text-dim);font-size:0.76rem;margin:10px 0 0">Order-of-magnitude estimates, not promises — but the point stands: a small share of a rich-world income goes an extraordinarily long way.</p>
        <div class="cx-detail-ctas" style="margin-top:14px">
          <a class="cx-btn" data-calc-out="givewell" href="https://www.givewell.org/" target="_blank" rel="noopener">Give where it works →</a>
          <a class="cx-btn cx-btn-ghost" href="#/ea">🎯 Which problems most?</a>
        </div>
      </div>`;
    out.querySelectorAll('[data-calc-out]').forEach(el =>
      el.addEventListener('click', () => cxTrack('outbound_calc_click', { dest: el.dataset.calcOut })));
  };
  document.getElementById('cxCalcGo').addEventListener('click', calc);
  document.getElementById('cxCalcInc').addEventListener('keydown', e => { if (e.key === 'Enter') calc(); });
  cxView().querySelectorAll('[data-calc-out]').forEach(el =>
    el.addEventListener('click', () => cxTrack('outbound_calc_click', { dest: el.dataset.calcOut })));
}

/* Worldview quiz — Rosling's core device: guess before you see. Almost every
   answer is "better than people think", because the systematic bias is
   pessimism; CO₂ is the honest exception, to prove the quiz isn't just
   cheerleading. Every fact is a well-established figure, linked to where you
   can dig in. */
const CX_QUIZ = [
  { q: 'In the last 20 years, the share of the world living in extreme poverty has…',
    opts: ['Almost doubled', 'Stayed about the same', 'Almost halved'], answer: 'Almost halved',
    fact: 'In 2000 about 29% of the world lived in extreme poverty. Today it is around 9% — one of the fastest improvements in human history.', link: 'extreme-poverty' },
  { q: "How many of the world's one-year-olds are vaccinated against at least one disease?",
    opts: ['About 2 in 10', 'About 5 in 10', 'About 8 in 10'], answer: 'About 8 in 10',
    fact: 'About 86% of the world’s one-year-olds have had at least one vaccination — a quiet triumph most people badly underestimate.', link: 'child-mortality' },
  { q: 'Since 1800, the share of children who die before their fifth birthday has gone from about…',
    opts: ['1 in 5, to 1 in 10', 'Stayed near 1 in 3', 'Over 4 in 10, to under 1 in 25'], answer: 'Over 4 in 10, to under 1 in 25',
    fact: 'In 1800 roughly 43% of children died before age five. Today it is under 4% worldwide.', link: 'child-mortality' },
  { q: 'What is global average life expectancy today?',
    opts: ['About 55 years', 'About 65 years', 'About 73 years'], answer: 'About 73 years',
    fact: 'Global life expectancy is about 73 years, up from around 30 in 1800.', link: 'child-mortality' },
  { q: 'Over the last 100 years, annual deaths from natural disasters have…',
    opts: ['Roughly doubled', 'Stayed about the same', 'Fallen by more than half'], answer: 'Fallen by more than half',
    fact: 'Deaths from natural disasters have fallen by roughly 75% or more over the last century — thanks to early warning and sturdier infrastructure — even as populations grew.', link: 'climate-change' },
  { q: "What share of the world's adults can read?",
    opts: ['About 60%', 'About 75%', 'About 87%'], answer: 'About 87%',
    fact: 'About 87% of adults worldwide can read, up from around 10% two centuries ago.', link: 'education' },
  { q: 'The number of people living in extreme poverty since 1990 has…',
    opts: ['Risen', 'Stayed flat', 'Fallen by more than a billion'], answer: 'Fallen by more than a billion',
    fact: 'It fell from about 1.9 billion in 1990 to under 700 million today — while world population grew by more than 2.5 billion.', link: 'extreme-poverty' },
  { q: 'What share of the world has access to electricity today?',
    opts: ['About 50%', 'About 70%', 'About 90%'], answer: 'About 90%',
    fact: 'About 90% of the world now has electricity, up from around 71% in 1990.', link: 'digital-exclusion' },
  { q: 'Compared with pre-industrial times, atmospheric CO₂ has…',
    opts: ['Barely changed', 'Risen about 20%', 'Risen about 50%'], answer: 'Risen about 50%',
    fact: 'CO₂ has risen from about 280 ppm before industrialisation to over 420 today — roughly a 50% increase. This is the one that genuinely got worse.', link: 'climate-change' },
  { q: 'What share of primary-school-age girls are NOT in school worldwide?',
    opts: ['About 40%', 'About 20%', 'Under 10%'], answer: 'Under 10%',
    fact: 'More than 90% of primary-age girls are now in school, near parity with boys — though gaps remain in the poorest regions.', link: 'gender-inequality' },
  { q: 'Since 1970, the share of people who are undernourished has…',
    opts: ['Risen', 'Stayed the same', 'Fallen substantially'], answer: 'Fallen substantially',
    fact: 'It fell from around 28% in 1970 to under 10%, though it has ticked back up recently with conflict and COVID.', link: 'hunger' },
  { q: 'New HIV infections per year, since their 1990s peak, have…',
    opts: ['Risen', 'Stayed the same', 'Fallen by more than half'], answer: 'Fallen by more than half',
    fact: 'New HIV infections have fallen roughly 60% from their mid-1990s peak, thanks to treatment and prevention.', link: 'hiv-aids' },
];

function cxShuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function renderQuiz() {
  const qs = CX_QUIZ.map(q => ({ ...q, opts: cxShuffle(q.opts) }));
  let idx = 0, score = 0, answered = false;

  cxView().innerHTML = `
    <p class="cx-eyebrow">Test yourself</p>
    <h1 class="cx-h1">Is the world better or worse than you think?</h1>
    <p class="cx-sub">Hans Rosling asked thousands of people simple questions about the world, and found they scored <em>worse than random</em> — because we systematically believe things are worse than they are. Guess first on each, then see the answer. No peeking: the guessing is the point.</p>
    <div id="cxQuizBody"></div>
    ${cxFooter()}
  `;
  const body = document.getElementById('cxQuizBody');

  const drawQ = () => {
    answered = false;
    const q = qs[idx];
    body.innerHTML = `
      <div style="color:var(--text-dim);font-size:0.78rem;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px">Question ${idx + 1} of ${qs.length} · score ${score}</div>
      <div class="cx-card">
        <p style="font-weight:800;font-size:1.05rem;line-height:1.4;margin-bottom:14px">${esc(q.q)}</p>
        <div class="cx-quiz-opts" id="cxQuizOpts">
          ${q.opts.map(o => `<button class="cx-quiz-opt" data-o="${esc(o)}">${esc(o)}</button>`).join('')}
        </div>
        <div id="cxQuizReveal"></div>
      </div>`;
    document.getElementById('cxQuizOpts').addEventListener('click', e => {
      const btn = e.target.closest('.cx-quiz-opt');
      if (!btn || answered) return;
      answered = true;
      const chosen = btn.dataset.o;
      const correct = chosen === q.answer;
      if (correct) score++;
      document.querySelectorAll('#cxQuizOpts .cx-quiz-opt').forEach(b => {
        b.disabled = true;
        if (b.dataset.o === q.answer) b.classList.add('right');
        else if (b.dataset.o === chosen) b.classList.add('wrong');
      });
      cxTrack('quiz_answer', { q: idx, correct });
      const p = compassProblem(q.link);
      document.getElementById('cxQuizReveal').innerHTML = `
        <div class="cx-quiz-reveal">
          <p style="font-weight:800;margin-bottom:6px">${correct ? '✅ Right' : '❌ Not quite'}</p>
          <p style="font-size:0.9rem;line-height:1.6;margin:0">${esc(q.fact)}</p>
          ${p ? `<a href="#/problem/${p.id}" class="cx-quiz-link">${p.emoji} Understand ${esc(p.name)} →</a>` : ''}
        </div>
        <button class="cx-btn" id="cxQuizNext" style="margin-top:14px">${idx < qs.length - 1 ? 'Next question →' : 'See my score →'}</button>`;
      document.getElementById('cxQuizNext').addEventListener('click', () => {
        if (idx < qs.length - 1) { idx++; drawQ(); } else drawResult();
      });
    });
  };

  const drawResult = () => {
    const pct = Math.round(score / qs.length * 100);
    const beatChimp = pct > 33;
    const shareUrl = `${CX_TOOLS_SITE}/compass/worldview-quiz.html`;
    const shareText = `I scored ${score}/${qs.length} on the state of the world. Most people do worse than a chimp picking at random. Test yourself:`;
    const enc = s => encodeURIComponent(s);
    cxTrack('quiz_complete', { score, pct });
    body.innerHTML = `
      <div class="cx-card" style="text-align:center;border-color:var(--gold)">
        <div style="font-size:3rem;font-weight:800;letter-spacing:-0.03em">${score}<span style="color:var(--text-dim);font-size:1.6rem">/${qs.length}</span></div>
        <p style="font-weight:800;margin:4px 0 10px">${pct}% correct</p>
        <p style="color:var(--text-dim);font-size:0.9rem;line-height:1.6;margin:0 auto;max-width:440px">
          A chimpanzee picking answers at random scores about 33%. ${beatChimp
            ? 'You beat the chimp — most well-educated people don’t, because the news trains us to expect the worst.'
            : 'Like most people, you scored around or below random — not because you’re uninformed, but because the news systematically teaches us the world is worse than it is.'}
          The truth is that on almost everything that can be measured, humanity is doing far better than we feel.</p>
      </div>
      <div class="cx-share-row" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:16px">
        <a class="cx-chip" target="_blank" rel="noopener" data-net="x" href="https://twitter.com/intent/tweet?text=${enc(shareText)}&url=${enc(shareUrl + '?utm_source=share&utm_medium=quiz')}">𝕏 Share my score</a>
        <a class="cx-chip" target="_blank" rel="noopener" data-net="whatsapp" href="https://wa.me/?text=${enc(shareText + ' ' + shareUrl + '?utm_source=share&utm_medium=quiz')}">💬 WhatsApp</a>
        <a class="cx-chip" target="_blank" rel="noopener" data-net="linkedin" href="https://www.linkedin.com/sharing/share-offsite/?url=${enc(shareUrl + '?utm_source=share&utm_medium=quiz')}">in LinkedIn</a>
      </div>
      <div class="cx-detail-ctas" style="margin-top:18px">
        <button class="cx-btn cx-btn-ghost" id="cxQuizRetry">↻ Try again</button>
        <a class="cx-btn cx-btn-ghost" href="#/timeline">⏳ See 200 years of it</a>
        <a class="cx-btn cx-btn-ghost" href="#/atlas">🗺️ Explore the problems</a>
      </div>`;
    body.querySelectorAll('.cx-chip[data-net]').forEach(a =>
      a.addEventListener('click', () => cxTrack('share_click', { network: a.dataset.net, where: 'quiz' })));
    document.getElementById('cxQuizRetry').addEventListener('click', () => { idx = 0; score = 0; drawQ(); });
  };

  drawQ();
}

/* Timeline view — the long view, Rosling-style: drag from 1800 to 2100 and
   watch the metrics move. Historical values are well-established estimates
   (Our World in Data, Gapminder, UN, World Bank), approximate by design and
   interpolated between anchor points. Everything past the present year is
   projection, drawn dashed and labelled, never dressed up as data. One
   metric — CO₂ — is the honest counterweight: the thing that got worse. */
const CX_ERA_PRESENT = 2024;
const CX_ERA_SPAN = [1800, 2100];
const CX_ERA = {
  poverty: {
    emoji: '🌾', name: 'In extreme poverty', unit: '%', better: 'down', color: '--gold',
    yMin: 0, yMax: 100, atlas: 'extreme-poverty',
    surprise: 'Most people guess this barely moved. It collapsed.',
    hist: [[1800, 88], [1820, 84], [1900, 72], [1950, 58], [1981, 44], [1990, 38], [2000, 29], [2010, 16], [2015, 10], [2024, 9]],
    proj: [[2024, 9], [2030, 7]],
    source: 'Our World in Data (Moatsos), World Bank',
  },
  childmort: {
    emoji: '👶', name: 'Children dying before age 5', unit: '%', better: 'down', color: '--blue',
    yMin: 0, yMax: 50, atlas: 'child-mortality',
    surprise: 'In 1800, nearly half of all children died. Today it is under one in twenty-five.',
    hist: [[1800, 43], [1900, 36], [1950, 22], [1970, 14], [1990, 9.3], [2000, 7.6], [2010, 5.2], [2020, 3.9], [2024, 3.6]],
    proj: [[2024, 3.6], [2030, 3.1]],
    source: 'Gapminder, UN IGME',
  },
  literacy: {
    emoji: '📖', name: 'Adults who can read', unit: '%', better: 'up', color: '--green',
    yMin: 0, yMax: 100, atlas: 'education',
    surprise: 'Two centuries ago, nine in ten adults could not read. Now nine in ten can.',
    hist: [[1800, 11], [1820, 12], [1900, 21], [1950, 36], [1970, 56], [1990, 75], [2000, 81], [2020, 87], [2024, 87]],
    proj: [[2024, 87], [2030, 90]],
    source: 'Our World in Data, UNESCO',
  },
  lifeexp: {
    emoji: '🎂', name: 'Global life expectancy', unit: ' yrs', better: 'up', color: '--violet',
    yMin: 20, yMax: 90, atlas: 'child-mortality',
    surprise: 'A person born in 1800 could expect about 30 years. A child born today, more than 70.',
    hist: [[1800, 29], [1900, 32], [1950, 46], [1970, 58], [1990, 64], [2000, 67], [2013, 71], [2019, 73], [2021, 71], [2024, 73]],
    proj: [[2024, 73], [2050, 77], [2100, 82]],
    source: 'Our World in Data, UN WPP',
  },
  co2: {
    emoji: '🏭', name: 'CO₂ in the atmosphere', unit: ' ppm', better: 'down', color: '--red',
    yMin: 260, yMax: 500, atlas: 'climate-change',
    surprise: 'This is the counterweight — the one thing on this page that got dramatically worse.',
    hist: [[1800, 283], [1900, 296], [1950, 311], [1980, 339], [1990, 354], [2000, 369], [2010, 389], [2024, 422]],
    proj: [[2024, 422], [2050, 475]],
    projNote: 'The future here is a fork, not a line: current policies point up, deep cuts bend it back down. This one is still ours to decide.',
    source: 'Ice cores + Mauna Loa (NOAA)',
  },
};

function cxEraSeries(m) { return m.hist.concat(m.proj.slice(1)); }
function cxEraRange(m) { const s = cxEraSeries(m); return [s[0][0], s[s.length - 1][0]]; }
function cxEraInterp(m, year) {
  const s = cxEraSeries(m);
  if (year <= s[0][0]) return s[0][1];
  if (year >= s[s.length - 1][0]) return s[s.length - 1][1];
  for (let i = 1; i < s.length; i++) {
    if (year <= s[i][0]) {
      const [y0, v0] = s[i - 1], [y1, v1] = s[i];
      return v0 + (v1 - v0) * (year - y0) / (y1 - y0);
    }
  }
  return s[s.length - 1][1];
}

function renderTimeline() {
  const keys = Object.keys(CX_ERA);
  let curKey = 'childmort';
  let curYear = CX_ERA_PRESENT;
  let playing = null;

  cxView().innerHTML = `
    <p class="cx-eyebrow">The long view</p>
    <h1 class="cx-h1">200 years, in one slider</h1>
    <p class="cx-sub">Drag from 1800 to today, and on toward 2100. These are the trajectories Hans Rosling built <em>Factfulness</em> around: the changes so slow and so vast that the news never shows them. Figures are well-established historical estimates, approximate by design. Everything past ${CX_ERA_PRESENT} is <strong>projection, drawn dashed</strong> — a forecast, never fact.</p>
    <div class="cx-era-pills" id="cxEraPills">
      ${keys.map(k => `<button class="cx-era-pill" data-k="${k}"><span class="cx-era-dot" style="background:var(${CX_ERA[k].color})"></span>${CX_ERA[k].emoji} ${esc(CX_ERA[k].name)}</button>`).join('')}
    </div>
    <div id="cxEraReadout"></div>
    <div id="cxEraChartWrap"></div>
    <input type="range" class="cx-era-slider" id="cxEraSlider" min="${CX_ERA_SPAN[0]}" max="${CX_ERA_SPAN[1]}" step="1" value="${curYear}" aria-label="Year">
    <div class="cx-era-scale" id="cxEraScale"></div>
    <div class="cx-detail-ctas" style="margin-top:14px">
      <button class="cx-btn cx-era-play" id="cxEraPlay">▶ Play</button>
      <a class="cx-btn cx-btn-ghost" id="cxEraAtlas" href="#/atlas">Understand this problem →</a>
    </div>
    <p style="color:var(--text-dim);font-size:0.76rem;margin-top:18px">Sources vary by metric: Our World in Data, Gapminder, the UN, the World Bank and NOAA. Values between marked years are interpolated; exact levels (especially before 1950) are debated, but the shape of each trajectory is not. <span id="cxLiveStamp"></span> <a href="#/truth">How we know →</a></p>
    ${cxFooter()}
  `;

  const chartWrap = document.getElementById('cxEraChartWrap');
  const readout = document.getElementById('cxEraReadout');
  const slider = document.getElementById('cxEraSlider');
  const scale = document.getElementById('cxEraScale');
  const atlasLink = document.getElementById('cxEraAtlas');

  const W = 640, H = 300, PL = 44, PR = 16, PT = 16, PB = 30;
  // Each metric spans exactly its own real data — no fabricated years past
  // where the sources actually stop — so the marker always rides the line.
  const rangeOf = () => cxEraRange(CX_ERA[curKey]);
  const xOf = y => { const [a, z] = rangeOf(); return PL + (y - a) / (z - a) * (W - PL - PR); };
  const yOf = (v, m) => PT + (1 - (v - m.yMin) / (m.yMax - m.yMin)) * (H - PT - PB);

  const drawChart = () => {
    const m = CX_ERA[curKey];
    const [xa, xz] = rangeOf();
    const col = `var(${m.color})`;
    const pts = arr => arr.map(([y, v]) => `${xOf(y).toFixed(1)},${yOf(v, m).toFixed(1)}`).join(' ');
    const histPts = pts(m.hist);
    const projPts = pts(m.proj);
    const areaBase = yOf(m.yMin, m).toFixed(1);
    const areaPts = `${xOf(m.hist[0][0]).toFixed(1)},${areaBase} ${histPts} ${xOf(m.hist[m.hist.length - 1][0]).toFixed(1)},${areaBase}`;
    // y gridlines: 3 ticks
    const ticks = [m.yMin, (m.yMin + m.yMax) / 2, m.yMax];
    const grid = ticks.map(t => {
      const yy = yOf(t, m).toFixed(1);
      const lab = m.unit.includes('ppm') ? Math.round(t) : (Number.isInteger(t) ? t : t.toFixed(0));
      return `<line class="cx-era-grid" x1="${PL}" y1="${yy}" x2="${W - PR}" y2="${yy}"/><text class="cx-era-axis" x="${PL - 6}" y="${yy}" text-anchor="end" dominant-baseline="middle">${lab}</text>`;
    }).join('');
    const nowX = xOf(CX_ERA_PRESENT).toFixed(1);
    const mv = cxEraInterp(m, curYear);
    const mx = xOf(curYear).toFixed(1), my = yOf(mv, m).toFixed(1);
    // x ticks: start, present, end, plus round centuries strictly inside
    const xt = [xa, xz].concat([1900, 2000, 2050].filter(t => t > xa + 12 && t < xz - 12 && t !== CX_ERA_PRESENT));
    const xticks = [...new Set(xt)].map(t =>
      `<text class="cx-era-axis" x="${xOf(t).toFixed(1)}" y="${H - 8}" text-anchor="middle">${t}</text>`).join('');
    chartWrap.innerHTML = `
      <svg class="cx-era-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(m.name)} from ${CX_ERA_SPAN[0]} to ${CX_ERA_SPAN[1]}">
        ${grid}${xticks}
        <line class="cx-era-nowline" x1="${nowX}" y1="${PT}" x2="${nowX}" y2="${H - PB}"/>
        <text class="cx-era-axis" x="${nowX}" y="${PT - 4}" text-anchor="middle" style="fill:var(--text-dim)">today</text>
        <polygon class="cx-era-area" points="${areaPts}" style="fill:${col}"/>
        <polyline class="cx-era-line" points="${histPts}" style="stroke:${col}"/>
        <polyline class="cx-era-line proj" points="${projPts}" style="stroke:${col}"/>
        <line class="cx-era-crosshair" x1="${mx}" y1="${PT}" x2="${mx}" y2="${H - PB}"/>
        <circle class="cx-era-marker" cx="${mx}" cy="${my}" r="6" style="fill:${col}"/>
      </svg>`;
  };

  const fmtVal = (m, v) => (m.unit.includes('ppm') ? Math.round(v) : (v >= 10 ? v.toFixed(0) : v.toFixed(1))) + m.unit;

  const drawReadout = () => {
    const m = CX_ERA[curKey];
    const v = cxEraInterp(m, curYear);
    const isProj = curYear > CX_ERA_PRESENT;
    const start = m.hist[0], startV = start[1];
    const dir = v < startV ? 'down' : 'up';
    const goodNow = (m.better === 'down' && v < startV) || (m.better === 'up' && v > startV);
    readout.innerHTML = `
      <div class="cx-era-readout">
        <span class="cx-era-year">${curYear}</span>
        <span class="cx-era-val" style="color:var(${m.color})">${fmtVal(m, v)}</span>
        ${isProj ? '<span class="cx-era-proj-tag">Projection</span>' : ''}
      </div>
      <p style="color:var(--text-dim);font-size:0.9rem;margin:0 0 4px">${esc(m.emoji + ' ' + m.name)} · ${dir === 'down' ? 'down' : 'up'} from ${fmtVal(m, startV)} in ${start[0]}
        <span style="color:var(${goodNow ? '--green' : '--red'});font-weight:800">${goodNow ? '↘ the right way' : '↗ the wrong way'}</span></p>
      ${curYear === CX_ERA_PRESENT && m.surprise ? `<p style="font-size:0.86rem;margin:6px 0 0"><strong>${esc(m.surprise)}</strong></p>` : ''}
      ${isProj && m.projNote ? `<p style="color:var(--text-dim);font-size:0.82rem;margin:6px 0 0">🔀 ${esc(m.projNote)}</p>` : ''}`;
  };

  const refresh = () => { drawReadout(); drawChart(); };

  // Point the slider and scale at the current metric's real data range,
  // clamping the year into it (default to today when today is in range).
  const applyRange = () => {
    const [a, z] = rangeOf();
    slider.min = a; slider.max = z;
    curYear = Math.min(z, Math.max(a, curYear));
    slider.value = curYear;
    scale.innerHTML = `<span>${a}</span><span>today</span><span>${z}</span>`;
  };

  const setYear = (y) => { const [a, z] = rangeOf(); curYear = Math.min(z, Math.max(a, Math.round(y))); slider.value = curYear; refresh(); };
  const stop = () => { if (playing) { clearInterval(playing); playing = null; document.getElementById('cxEraPlay').textContent = '▶ Play'; } };

  slider.addEventListener('input', () => { stop(); curYear = +slider.value; refresh(); });

  document.getElementById('cxEraPills').addEventListener('click', e => {
    const btn = e.target.closest('.cx-era-pill');
    if (!btn) return;
    stop();
    curKey = btn.dataset.k;
    document.querySelectorAll('#cxEraPills .cx-era-pill').forEach(p => {
      const on = p.dataset.k === curKey;
      p.classList.toggle('active', on);
      p.style.color = on ? `var(${CX_ERA[curKey].color})` : '';
    });
    atlasLink.href = `#/problem/${CX_ERA[curKey].atlas}`;
    cxTrack('timeline_metric', { metric: curKey });
    applyRange();
    refresh();
  });

  document.getElementById('cxEraPlay').addEventListener('click', function () {
    if (playing) { stop(); return; }
    const [a, z] = rangeOf();
    if (curYear >= z) setYear(a);
    this.textContent = '⏸ Pause';
    cxTrack('timeline_play', { metric: curKey });
    playing = setInterval(() => {
      const [, end] = rangeOf();
      if (curYear >= end) { stop(); return; }
      setYear(Math.min(end, curYear + 2));
    }, 55);
  });

  // init
  document.querySelector(`#cxEraPills .cx-era-pill[data-k="${curKey}"]`).classList.add('active');
  document.querySelector(`#cxEraPills .cx-era-pill[data-k="${curKey}"]`).style.color = `var(${CX_ERA[curKey].color})`;
  atlasLink.href = `#/problem/${CX_ERA[curKey].atlas}`;
  applyRange();
  refresh();

  // Freshness stamp — reads the data file the refresh workflow keeps current.
  fetch('./live-data.json').then(r => r.json()).then(d => {
    const el = document.getElementById('cxLiveStamp');
    if (el && d && d.updated) {
      const auto = /world in data/i.test(d.source || '');
      el.textContent = `${auto ? '🛰️ Latest figures auto-refreshed' : '🔎 Latest figures reviewed'} ${d.updated}.`;
    }
  }).catch(() => {});
}

/* World view — where each problem concentrates, at the honest granularity
   of world regions (not fabricated per-country numbers). Intensities are
   0–3 buckets grounded in well-established regional facts, and each entry
   carries the one honest line the shading is standing in for. Problems
   that are genuinely universal say so rather than pretending to localize.
   Inspired by Hans Rosling's Factfulness: pair "where" with "which way it's
   trending", so the map never reads as static doom. */
const CX_GEO = {
  'extreme-poverty': { universal: false, fact: "Extreme poverty is now majority sub-Saharan African — the region holds around 60% of the world's extreme poor, a share that keeps rising as poverty falls almost everywhere else.", r: { ssa: 3, sas: 2, lac: 1, mena: 1, eap: 1 } },
  'malaria': { universal: false, fact: "About 95% of malaria deaths are in sub-Saharan Africa, most of them children under five.", r: { ssa: 3, sas: 1, eap: 1, lac: 1 } },
  'child-mortality': { universal: false, fact: "Sub-Saharan Africa and South Asia carry the great majority of under-five deaths, though both have fallen sharply since 1990.", r: { ssa: 3, sas: 2, mena: 1, lac: 1, eap: 1 } },
  'hunger': { universal: false, fact: "Undernourishment concentrates in sub-Saharan Africa and South Asia, with conflict driving acute hunger across parts of the Middle East and the Sahel.", r: { ssa: 3, sas: 2, mena: 2, eap: 1, lac: 1 } },
  'unsafe-water': { universal: false, fact: "The largest gaps in safe water and sanitation are in sub-Saharan Africa, followed by South Asia.", r: { ssa: 3, sas: 2, eap: 1, mena: 1, lac: 1 } },
  'education': { universal: false, fact: "Learning poverty — being unable to read a simple text by age 10 — reaches its highest levels in sub-Saharan Africa and South Asia.", r: { ssa: 3, sas: 2, mena: 1, lac: 1, eap: 1 } },
  'loneliness': { universal: true, fact: "Loneliness is genuinely global and rising — best measured in wealthy regions, but far from confined to them. This is a problem the map can't honestly localize.", r: { eca: 2, nam: 2, eap: 2, lac: 1, sas: 1, mena: 1, ssa: 1 } },
  'homelessness': { universal: true, fact: "Homelessness exists in every region; its forms differ — visible street homelessness in rich cities, informal settlements elsewhere — and the data is patchy, so the map shows presence, not precision.", r: { nam: 2, eca: 2, lac: 2, ssa: 2, sas: 2, eap: 2, mena: 1 } },
  'refugees': { universal: false, fact: "Forced displacement tracks conflict — the Middle East, sub-Saharan Africa, and, from Venezuela, Latin America — and most refugees are hosted by neighbouring low- and middle-income countries.", r: { mena: 3, ssa: 3, sas: 2, lac: 2, eca: 1, eap: 1 } },
  'climate-change': { universal: false, fact: "Emissions come mostly from wealthy and fast-growing economies, but the sharpest impacts fall on South Asia, sub-Saharan Africa and low-lying coastal and Pacific nations that emitted least.", r: { sas: 3, ssa: 3, mena: 2, eap: 2, lac: 2, nam: 1, eca: 1 } },
  'air-pollution': { universal: false, fact: "The deadliest air is in South Asia and parts of East Asia and the Middle East, where the world's most polluted cities are clustered.", r: { sas: 3, eap: 2, mena: 2, ssa: 2, lac: 1, eca: 1, nam: 1 } },
  'gender-inequality': { universal: false, fact: "The widest gaps in economic and political participation are in the Middle East, North Africa and South Asia — though every region still has ground to cover.", r: { mena: 3, sas: 3, ssa: 2, eap: 1, lac: 1, eca: 1, nam: 1 } },
  'factory-farming': { universal: false, fact: "Industrial animal agriculture is largest by volume in East Asia, North America and Europe, and expanding fastest across Latin America and Asia.", r: { eap: 3, nam: 2, eca: 2, lac: 2, sas: 1, mena: 1, ssa: 1 } },
  'preventable-blindness': { universal: false, fact: "Most avoidable blindness — cataracts and trachoma — is in sub-Saharan Africa and South Asia, where surgery and treatment are scarcest.", r: { ssa: 3, sas: 3, eap: 1, mena: 1, lac: 1 } },
  'pandemic-preparedness': { universal: true, fact: "Pandemic risk is global by definition — a pathogen anywhere is a threat everywhere — with emergence hotspots where dense human, livestock and wildlife contact overlap.", r: { eap: 2, ssa: 2, sas: 2, lac: 1, mena: 1, eca: 1, nam: 1 } },
  'tuberculosis': { universal: false, fact: "Most TB is in South and East Asia, with sub-Saharan Africa carrying the heaviest toll relative to population.", r: { sas: 3, eap: 2, ssa: 2, mena: 1, lac: 1, eca: 1 } },
  'lead-poisoning': { universal: false, fact: "The heaviest childhood lead exposure runs across South Asia, Africa and other low- and middle-income regions — from informal battery recycling, adulterated spices and old paint.", r: { sas: 3, ssa: 2, eap: 2, mena: 2, lac: 2, eca: 1, nam: 1 } },
  'maternal-mortality': { universal: false, fact: "Roughly 70% of maternal deaths are in sub-Saharan Africa, followed by South Asia; nearly all are preventable with skilled care.", r: { ssa: 3, sas: 2, mena: 1, lac: 1, eap: 1 } },
  'road-deaths': { universal: false, fact: "Road-death rates are highest in sub-Saharan Africa and across low- and middle-income countries, which bear over 90% of the toll with far fewer vehicles.", r: { ssa: 3, sas: 2, eap: 2, mena: 2, lac: 2, eca: 1, nam: 1 } },
  'tobacco': { universal: false, fact: "Most of the world's smokers live in East and South Asia — China alone is about a third — with the epidemic shifting toward lower-income countries as richer ones quit.", r: { eap: 3, sas: 2, eca: 2, mena: 2, ssa: 1, lac: 1, nam: 1 } },
  'hiv-aids': { universal: false, fact: "About two-thirds of people living with HIV are in sub-Saharan Africa, concentrated in the east and south of the continent.", r: { ssa: 3, lac: 1, sas: 1, eap: 1, mena: 1, eca: 1, nam: 1 } },
  'neglected-tropical-diseases': { universal: false, fact: "NTDs cluster in the tropics — sub-Saharan Africa carries about 40% of the burden, with more across South and Southeast Asia and parts of Latin America.", r: { ssa: 3, sas: 2, eap: 2, lac: 1, mena: 1 } },
  'digital-exclusion': { universal: false, fact: "The largest offline populations are in sub-Saharan Africa and South Asia — though connectivity is spreading here faster than almost any other trend on this map.", r: { ssa: 3, sas: 2, mena: 1, eap: 1, lac: 1 } },
  'corruption': { universal: false, fact: "Public-sector corruption scores worst across much of sub-Saharan Africa, the Middle East, Central Asia and parts of Latin America — but grand corruption often routes through the wealthy financial centres that score 'clean'.", r: { ssa: 2, mena: 2, sas: 2, lac: 2, eap: 2, eca: 1 } },
  'ocean-health': { universal: true, fact: "Ocean decline is a global-commons problem — warming and acidification are everywhere — while the largest plastic inputs come from fast-growing coastal economies in Asia.", r: { eap: 2, sas: 2, lac: 1, ssa: 1, mena: 1, nam: 1, eca: 1 } },
};

const CX_GEO_RAMP = ['#333a52', '#8a6d2e', '#cf9a34', '#f4bd4e']; // 0→3
const CX_GEO_LABEL = ['Low / little data', 'Moderate', 'High', 'Most concentrated'];
let cxWorldMapData = null; // cached fetch of world-map.json

function cxRegionProblems(region) {
  // Reverse lookup: problems weighing heaviest on a region, strongest first.
  return Object.keys(CX_GEO)
    .map(id => ({ id, w: CX_GEO[id].r[region] || 0 }))
    .filter(x => x.w >= 2)
    .sort((a, b) => b.w - a.w);
}

function renderWorld() {
  const ids = Object.keys(CX_GEO);
  const start = 'malaria';
  cxView().innerHTML = `
    <p class="cx-eyebrow">The world map</p>
    <h1 class="cx-h1">Where in the world?</h1>
    <p class="cx-sub">Pick a problem and see where it concentrates — shaded by world <strong>region</strong>, not by fabricated country numbers, and paired with which way the trend is moving. Some problems are genuinely universal and say so. Inspired by Hans Rosling's <em>Factfulness</em>: the point is not where things are bad, but where they are bad <em>and getting better</em>.</p>
    <label class="cx-sort-select" style="margin-bottom:14px">
      <span aria-hidden="true">🔎</span>
      <select id="cxGeoSel" aria-label="Choose a problem to map">
        ${ids.map(id => { const p = compassProblem(id); return p ? `<option value="${id}"${id === start ? ' selected' : ''}>${p.emoji} ${esc(p.name)}</option>` : ''; }).join('')}
      </select>
    </label>
    <div class="cx-map-wrap">
      <div class="cx-map-stage" id="cxMapStage"><div class="cx-map-loading">Loading map…</div></div>
      <div class="cx-map-legend" id="cxMapLegend"></div>
    </div>
    <div id="cxGeoInfo"></div>
    <div class="cx-detail-ctas" style="margin-top:24px">
      <a class="cx-btn" href="#/priorities">📊 Ranked by how solved →</a>
      <a class="cx-btn cx-btn-ghost" href="#/ea">🎯 Where to help most</a>
    </div>
    ${cxFooter()}
  `;

  const stage = document.getElementById('cxMapStage');
  const legend = document.getElementById('cxMapLegend');
  const info = document.getElementById('cxGeoInfo');
  const sel = document.getElementById('cxGeoSel');

  legend.innerHTML = CX_GEO_RAMP.map((c, i) =>
    `<span class="cx-legend-item"><span class="cx-legend-swatch" style="background:${c}"></span>${CX_GEO_LABEL[i]}</span>`).join('');

  const paint = () => {
    const id = sel.value;
    const geo = CX_GEO[id];
    const p = compassProblem(id);
    const svg = stage.querySelector('svg');
    if (svg) {
      svg.querySelectorAll('path[data-region]').forEach(path => {
        const lvl = geo.r[path.dataset.region] || 0;
        path.setAttribute('fill', CX_GEO_RAMP[lvl]);
        path.classList.remove('cx-region-active');
      });
    }
    const regionsHit = cxWorldMapData
      ? Object.entries(cxWorldMapData.regions).map(([k, v]) => ({ k, name: v.name, lvl: geo.r[k] || 0 }))
          .sort((a, b) => b.lvl - a.lvl)
      : [];
    info.innerHTML = `
      <div class="cx-card" style="margin-top:14px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
          <span style="font-size:1.3rem">${p.emoji}</span>
          <span style="font-weight:800">${esc(p.name)}</span>
          <span class="cx-badge cx-badge-${p.trend.dir}">${TREND_LABEL[p.trend.dir]}</span>
          ${geo.universal ? '<span class="cx-badge" style="background:var(--surface-2);color:var(--text-dim)">🌍 Largely universal</span>' : ''}
        </div>
        <p style="font-size:0.9rem;line-height:1.6;margin:0 0 10px">${esc(geo.fact)}</p>
        ${regionsHit.filter(r => r.lvl >= 1).length ? `<div style="display:flex;flex-wrap:wrap;gap:6px">${regionsHit.filter(r => r.lvl >= 1).map(r =>
          `<span class="cx-itn ${r.lvl >= 3 ? 'hi' : ''}"><span class="cx-legend-swatch" style="background:${CX_GEO_RAMP[r.lvl]}"></span>${esc(r.name)}</span>`).join('')}</div>` : ''}
        <a href="#/problem/${p.id}" class="cx-btn cx-btn-ghost" style="margin-top:12px">Understand ${esc(p.name)} →</a>
      </div>`;
  };

  const showRegion = (region) => {
    const svg = stage.querySelector('svg');
    if (svg) svg.querySelectorAll('path[data-region]').forEach(path =>
      path.classList.toggle('cx-region-active', path.dataset.region === region));
    const name = cxWorldMapData.regions[region].name;
    const probs = cxRegionProblems(region);
    info.innerHTML = `
      <div class="cx-card" style="margin-top:14px;border-color:var(--gold)">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span style="font-size:1.2rem">📍</span><span style="font-weight:800">${esc(name)}</span>
        </div>
        <p style="color:var(--text-dim);font-size:0.85rem;margin:0 0 10px">The problems weighing heaviest here:</p>
        <div style="display:flex;flex-direction:column;gap:7px">
          ${probs.map(x => { const p = compassProblem(x.id); return `
            <a href="#/problem/${x.id}" class="cx-geo-row">
              <span>${p.emoji} ${esc(p.name)}</span>
              <span class="cx-badge cx-badge-${p.trend.dir}">${TREND_LABEL[p.trend.dir]}</span>
            </a>`; }).join('')}
        </div>
        <button class="cx-btn cx-btn-ghost" id="cxGeoBack" style="margin-top:12px">← Back to the mapped problem</button>
      </div>`;
    document.getElementById('cxGeoBack').addEventListener('click', paint);
    cxTrack('world_region_select', { region });
  };

  const buildSvg = () => {
    const d = cxWorldMapData;
    const paths = d.countries.map(c =>
      `<path d="${c.d}" data-region="${c.r}" class="cx-region"></path>`).join('');
    stage.innerHTML = `<svg viewBox="${d.viewBox}" class="cx-worldmap" role="img" aria-label="World map shaded by region">${paths}</svg>`;
    const svg = stage.querySelector('svg');
    svg.addEventListener('click', e => {
      const path = e.target.closest('path[data-region]');
      if (path) showRegion(path.dataset.region);
    });
    paint();
  };

  sel.addEventListener('change', () => { paint(); cxTrack('world_problem_select', { problem: sel.value }); });

  if (cxWorldMapData) {
    buildSvg();
  } else {
    fetch('./world-map.json').then(r => r.json()).then(data => {
      cxWorldMapData = data;
      // guard against the user having navigated away mid-fetch
      if (document.getElementById('cxMapStage') === stage) buildSvg();
    }).catch(() => {
      stage.innerHTML = '<div class="cx-map-loading">The map could not load. The regional facts still work below.</div>';
      paint();
    });
  }
}

function renderProblem(id) {
  const p = compassProblem(id);
  // replace, not assign — assigning pushes a history entry and traps Back
  if (!p) { location.replace('#/atlas'); return; }
  cxTrack('problem_view', { problem: p.id });
  const done = !!cxState.understood[p.id];
  const u = p.understand;
  // Share-intent targets: the static page carries this problem's OG card,
  // so each network pulls the right preview when the link is shared. Every
  // URL is attributed per network so the funnel shows which loop carries.
  const shareUrl = `${CX_TOOLS_SITE}/compass/p/${p.id}.html`;
  const shareText = `${p.emoji} ${p.name}: ${p.stat}. See what actually works:`;
  const _sh = net => encodeURIComponent(`${shareUrl}?utm_source=share&utm_medium=${net}`);
  const _st = encodeURIComponent(shareText);
  const _stu = net => encodeURIComponent(`${shareText} ${shareUrl}?utm_source=share&utm_medium=${net}`);

  cxView().innerHTML = `
    <a class="cx-back" href="#/atlas">← Atlas</a>
    <div class="cx-detail-head">
      <span class="cx-detail-emoji">${p.emoji}</span>
      <div>
        <h1 class="cx-h1" style="font-size:clamp(1.4rem,4vw,2rem)">${esc(p.name)}</h1>
        <div class="cx-detail-stat">${esc(p.stat)}</div>
        <div class="cx-detail-badges">
          <span class="cx-badge cx-badge-${p.trend.dir}">${TREND_LABEL[p.trend.dir]}</span>
          <span class="cx-badge cx-badge-cat">${COMPASS_CATEGORIES[p.category].emoji} ${COMPASS_CATEGORIES[p.category].name}</span>
        </div>
      </div>
    </div>

    <div class="cx-section">
      <div class="cx-section-label">🧠 Understand</div>
      <div class="cx-card">
        <div class="cx-fact"><div class="cx-fact-k">The trend</div><div class="cx-fact-v">${esc(p.trend.text)}</div></div>
        <div class="cx-fact"><div class="cx-fact-k">The scale</div><div class="cx-fact-v">${esc(u.scale)}</div></div>
        <div class="cx-fact"><div class="cx-fact-k">Root causes</div><div class="cx-fact-v">${esc(u.causes)}</div></div>
        <div class="cx-fact"><div class="cx-fact-k">Who suffers most</div><div class="cx-fact-v">${esc(u.sufferers)}</div></div>
        <div class="cx-fact cx-fact-mis" style="margin-bottom:0"><div class="cx-fact-k">Common misconception</div><div class="cx-fact-v">${esc(u.misconception)}</div></div>
      </div>
    </div>

    <div class="cx-section">
      <div class="cx-section-label">⚡ What actually works</div>
      <div class="cx-iv">
        ${p.interventions.map(iv => `
          <div class="cx-card cx-iv-card">
            <div class="cx-iv-top">
              <span class="cx-iv-name">${esc(iv.name)}</span>
              <span class="cx-badge cx-badge-${iv.evidence}">${EVIDENCE_LABEL[iv.evidence]}</span>
            </div>
            <div class="cx-iv-what">${esc(iv.what)}</div>
            <div class="cx-iv-cost"><strong>Cost & effect:</strong> ${esc(iv.cost)}</div>
          </div>`).join('')}
      </div>
    </div>

    <div class="cx-section">
      <div class="cx-section-label">🧭 Act</div>
      <div class="cx-card">
        ${cxDonow(p.id).length ? `
        <div class="cx-act-group" id="cxDonow">
          <div class="cx-act-title">🎯 Do this now</div>
          ${cxDonow(p.id).map(d => `<div class="cx-act-item">→ <a href="${d.url}" target="_blank" rel="noopener" data-donow="${esc(d.org)}"><strong>${esc(d.org)}</strong></a> — ${esc(d.what)} <span class="cx-badge cx-badge-${d.evidence}">${EVIDENCE_LABEL[d.evidence]}</span></div>`).join('')}
          <div style="color:var(--text-dim);font-size:0.7rem;margin-top:6px">Examples chosen for evidence and transparency — not the only good options. No affiliation, no payment.</div>
        </div>` : ''}
        ${Object.entries(p.actions).map(([k, items]) => items.length ? `
          <div class="cx-act-group">
            <div class="cx-act-title">${OFFER_META[k].emoji} With your ${OFFER_META[k].label.toLowerCase()}</div>
            ${items.map(a => `<div class="cx-act-item">${esc(a)}</div>`).join('')}
          </div>` : '').join('')}
        <div style="color:var(--text-dim);font-size:0.78rem;margin-top:6px" id="cxActLinks">
          Act now: <a href="${CX_TOOLS_SITE}/charity-comparison-engine.html?cause=${encodeURIComponent(p.name)}" target="_blank" rel="noopener" data-out="tool" data-tool="charity-comparison">compare org types for this cause</a> ·
          <a href="${CX_TOOLS_SITE}/volunteer-match.html?causes=${encodeURIComponent(p.name)}" target="_blank" rel="noopener" data-out="tool" data-tool="volunteer-match">find a volunteer role</a> ·
          <a href="${CX_TOOLS_SITE}/what-would-x-do.html" target="_blank" rel="noopener" data-out="tool" data-tool="what-would-x-do">see what $X does</a> ·
          <a href="https://givelink.app/en" target="_blank" rel="noopener" data-out="givelink">Givelink</a>
        </div>
      </div>
    </div>

    <div class="cx-detail-ctas">
      <button class="cx-btn cx-understood ${done ? 'done' : ''}" id="cxUnderstood">${done ? '✓ Understood' : '✓ I understand this now'}</button>
      <a class="cx-btn cx-btn-ghost" href="#/plan/${p.id}">Build my action plan →</a>
      <button class="cx-btn cx-btn-ghost" id="cxShareProblem">📤 Share</button>
    </div>

    <div class="cx-share-row" id="cxShareRow" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:2px">
      <a class="cx-chip" data-net="x" href="https://twitter.com/intent/tweet?text=${_st}&url=${_sh('x')}" target="_blank" rel="noopener">𝕏 Post</a>
      <a class="cx-chip" data-net="whatsapp" href="https://wa.me/?text=${_stu('whatsapp')}" target="_blank" rel="noopener">💬 WhatsApp</a>
      <a class="cx-chip" data-net="linkedin" href="https://www.linkedin.com/sharing/share-offsite/?url=${_sh('linkedin')}" target="_blank" rel="noopener">in LinkedIn</a>
      <a class="cx-chip" data-net="facebook" href="https://www.facebook.com/sharer/sharer.php?u=${_sh('facebook')}" target="_blank" rel="noopener">f Facebook</a>
    </div>

    <div class="cx-section">
      <div class="cx-section-label">💬 Go deeper with AI</div>
      <div class="cx-chat" id="cxChat">
        <div class="cx-chat-log" id="cxChatLog"></div>
        <div class="cx-chat-suggest" id="cxSuggest">
          <button class="cx-chip" data-q="Why hasn't this been solved already?">Why isn't this solved?</button>
          <button class="cx-chip" data-q="Steelman the strongest disagreements experts have about how to fix this.">Where do experts disagree?</button>
          <button class="cx-chip" data-q="What would the world look like in 2050 if we got this right?">What if we get it right?</button>
        </div>
        <form class="cx-chat-form" id="cxChatForm">
          <input class="cx-input" id="cxChatInput" placeholder="Ask anything about ${esc(p.name.toLowerCase())}…" autocomplete="off" />
          <button class="cx-btn" type="submit" id="cxChatSend">Ask</button>
        </form>
        <div class="cx-loading" id="cxChatLoading"><div class="cx-spinner"></div><span>Thinking…</span></div>
        <div class="cx-error" id="cxChatError"></div>
      </div>
    </div>

    <div class="cx-sources">Rough figures for context, drawing on: ${p.sources.map(esc).join(' · ')}. Approximations, not citations.
      <a href="${cxVerifyUrl(p.id, p.name)}" target="_blank" rel="noopener" class="cx-verify" data-verify="${p.id}">🔎 Explore &amp; verify the data →</a>
      <a href="#/truth" class="cx-verify">How we know</a></div>
    ${cxFooter()}
  `;

  document.getElementById('cxUnderstood').addEventListener('click', function () {
    if (cxState.understood[p.id]) return;
    cxState.understood[p.id] = Date.now();
    cxSave();
    cxTrack('understood', { problem: p.id });
    // Update in place — a full re-render would wipe an in-progress AI chat.
    this.classList.add('done');
    this.textContent = '✓ Understood';
    // The moment of pride is the moment understanding spreads: mark the
    // milestone, invite the pass-on, and point at the next problem.
    const count = Object.keys(cxState.understood).length;
    const total = COMPASS_PROBLEMS.length;
    const next = COMPASS_PROBLEMS.find(x => !cxState.understood[x.id]);
    const headline =
      count === 1 ? '🎉 Your first problem understood.' :
      count === 5 ? `🌍 ${count} of ${total} understood — you already know more than most.` :
      count === 10 ? `🗺️ ${count} of ${total} — you're building a real map of the world.` :
      count === total ? `🏆 All ${total} understood. That knowledge is rare — use it.` :
      `✨ ${count} of ${total} understood.`;
    const moment = document.createElement('div');
    moment.className = 'cx-card cx-moment';
    moment.style.cssText = 'margin-top:12px;border-color:var(--gold)';
    moment.innerHTML = `
      <div style="font-weight:800;margin-bottom:4px">${headline}</div>
      <div style="color:var(--text-dim);font-size:0.85rem;margin-bottom:10px">Understanding counts double when it becomes one small act. Pick one:</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        <a class="cx-chip" style="text-decoration:none" data-commit="plan" href="#/plan/${p.id}">⏱️ Start my 15-minute plan</a>
        <a class="cx-chip" style="text-decoration:none" data-commit="money" href="${CX_TOOLS_SITE}/what-would-x-do.html" target="_blank" rel="noopener">💶 See what my money would do</a>
        <button class="cx-chip" data-commit="share">📣 Tell one person</button>
        <button class="cx-chip" data-commit="remind">🔔 Remind me daily</button>
      </div>
      ${next ? `<div style="margin-top:10px;font-size:0.8rem"><a href="#/problem/${next.id}" style="color:var(--text-dim)">or keep exploring: ${next.emoji} ${esc(next.name)} →</a></div>` : ''}
    `;
    this.closest('.cx-detail-ctas').insertAdjacentElement('afterend', moment);
    // The commitment is the point: a chosen act, however small, is what
    // turns a reader into a participant. Track which acts people choose.
    moment.addEventListener('click', e => {
      const el = e.target.closest('[data-commit]');
      if (!el) return;
      cxTrack('commit_choice', { problem: p.id, choice: el.dataset.commit });
      if (el.dataset.commit === 'share') document.getElementById('cxShareProblem').click();
      if (el.dataset.commit === 'remind') cxToggleNudge(el);
    });
    cxTrack('milestone_shown', { count });
  });

  document.getElementById('cxShareProblem').addEventListener('click', async function () {
    cxTrack('share_click', { problem: p.id, where: 'problem', network: 'native' });
    // share the static page — per-problem title/preview, opens without JS
    const url = shareUrl + '?utm_source=share&utm_medium=native';
    const text = `${p.emoji} ${p.name}: ${p.stat}. Understand it and see what actually works:`;
    try {
      if (navigator.share) { await navigator.share({ title: 'Impact Compass — ' + p.name, text, url }); return; }
      await navigator.clipboard.writeText(text + ' ' + url);
      this.textContent = '✓ Copied';
      setTimeout(() => { this.textContent = '📤 Share'; }, 1600);
    } catch {}
  });

  // Outbound clicks to the tools suite and Givelink — the "give" end of the
  // funnel. Delegated so a single listener covers all four links.
  document.getElementById('cxActLinks').addEventListener('click', e => {
    const a = e.target.closest('a[data-out]');
    if (!a) return;
    if (a.dataset.out === 'givelink') cxTrack('outbound_givelink_click', { problem: p.id, where: 'problem' });
    else cxTrack('outbound_tool_click', { problem: p.id, tool: a.dataset.tool });
  });

  document.getElementById('cxShareRow').addEventListener('click', e => {
    const a = e.target.closest('a[data-net]');
    if (a) cxTrack('share_click', { problem: p.id, where: 'problem', network: a.dataset.net });
  });

  // The deepest point of the funnel: a click through to a real organization.
  const donowEl = document.getElementById('cxDonow');
  if (donowEl) donowEl.addEventListener('click', e => {
    const a = e.target.closest('a[data-donow]');
    if (a) cxTrack('outbound_donow_click', { problem: p.id, org: a.dataset.donow });
  });

  cxView().querySelectorAll('[data-verify]').forEach(el =>
    el.addEventListener('click', () => cxTrack('verify_click', { problem: el.dataset.verify })));

  initProblemChat(p);
}

/* Per-problem AI chat, curated data passed as grounding context */
function initProblemChat(p) {
  const log = document.getElementById('cxChatLog');
  const form = document.getElementById('cxChatForm');
  const input = document.getElementById('cxChatInput');
  const send = document.getElementById('cxChatSend');
  const loading = document.getElementById('cxChatLoading');
  const errBox = document.getElementById('cxChatError');
  const history = [];

  const systemPrompt = `You are the deep-dive guide inside Impact Compass, an app whose mission is to increase knowledge and understanding, reduce suffering, and expand the reach of care across humanity. The user is exploring one problem: ${p.name}.

Grounding context (curated by the app — build on it, don't contradict it without saying why):
Scale: ${p.understand.scale}
Causes: ${p.understand.causes}
Who suffers: ${p.understand.sufferers}
What works: ${p.interventions.map(iv => `${iv.name} (${iv.evidence}): ${iv.cost}`).join(' | ')}

Rules: be warm, clear, honest and non-preachy. Use approximate, well-established figures ("roughly", "on the order of") and never invent precise statistics. Be candid about uncertainty and expert disagreement. ${cxDonow(p.id).length ? `You may name these vetted example organizations where genuinely relevant: ${cxDonow(p.id).map(d => d.org).join(', ')}. Beyond those, describe org types rather than naming other specific charities.` : 'Never name specific real charities — describe org types.'} No guilt-tripping, no doom; agency and honesty. Keep answers under 250 words unless asked to go deeper. If asked something unrelated to ${p.name}, briefly answer if it serves understanding of world problems, otherwise gently steer back.`;

  async function ask(q) {
    if (!q) return;
    cxTrack('ai_ask', { problem: p.id });
    errBox.classList.remove('visible');
    log.insertAdjacentHTML('beforeend', `<div class="cx-msg cx-msg-user">${esc(q)}</div>`);
    log.insertAdjacentHTML('beforeend', `<div class="cx-msg cx-msg-ai streaming"></div>`);
    const aiEl = log.lastElementChild;
    input.value = '';
    send.disabled = true;
    loading.classList.add('visible');

    const context = history.slice(-3).map(h => `Q: ${h.q}\nA: ${h.a}`).join('\n\n');
    const userMessage = (context ? `Earlier in this conversation:\n${context}\n\n` : '') + `Question: ${q}`;

    try {
      const text = await compassAI(systemPrompt, userMessage, partial => {
        loading.classList.remove('visible');
        aiEl.innerHTML = md(partial);
      });
      aiEl.innerHTML = md(text);
      history.push({ q, a: text });
    } catch (err) {
      aiEl.remove();
      errBox.textContent = cxAIErrorMsg(err);
      errBox.classList.add('visible');
    } finally {
      aiEl.classList.remove('streaming');
      send.disabled = false;
      loading.classList.remove('visible');
      aiEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  form.addEventListener('submit', e => { e.preventDefault(); ask(input.value.trim()); });
  document.getElementById('cxSuggest').addEventListener('click', e => {
    const btn = e.target.closest('.cx-chip');
    if (btn) ask(btn.dataset.q);
  });
}

function renderPlan(preselect) {
  const options = COMPASS_PROBLEMS.map(p =>
    `<option value="${p.id}" ${p.id === preselect ? 'selected' : ''}>${p.emoji} ${esc(p.name)}</option>`).join('');

  cxView().innerHTML = `
    <p class="cx-eyebrow">From understanding to action</p>
    <h1 class="cx-h1">Build your action plan</h1>
    <p class="cx-sub">Pick a problem and tell the Compass what you can offer. The AI turns it into concrete steps you can check off — the first one doable today.</p>

    <div class="cx-card" style="margin-top:22px">
      <form id="cxPlanForm">
        <div class="cx-form-field">
          <label class="cx-label" for="cxPlanProblem">Problem</label>
          <select class="cx-input" id="cxPlanProblem" style="width:100%">${options}</select>
        </div>
        <div class="cx-form-field">
          <label class="cx-label">What can you offer? <small>— pick any</small></label>
          <div class="cx-offer-chips" id="cxPlanOffers">
            ${Object.entries(OFFER_META).map(([k, o]) =>
              `<button type="button" class="cx-chip" data-offer="${k}">${o.emoji} ${o.label}</button>`).join('')}
          </div>
        </div>
        <div class="cx-form-field">
          <label class="cx-label" for="cxPlanTime">Time per week</label>
          <select class="cx-input" id="cxPlanTime" style="width:100%">
            <option value="15">~15 minutes</option>
            <option value="60" selected>~1 hour</option>
            <option value="180">3+ hours</option>
          </select>
        </div>
        <button class="cx-btn" type="submit" id="cxPlanSubmit">🧭 Generate my plan</button>
      </form>
      <div class="cx-loading" id="cxPlanLoading"><div class="cx-spinner"></div><span>Charting your steps…</span></div>
      <div class="cx-error" id="cxPlanError"></div>
    </div>

    <div class="cx-section">
      <div class="cx-section-label">📋 Your plans</div>
      <div id="cxPlans"></div>
    </div>
    ${cxFooter()}
  `;

  drawPlans();

  document.getElementById('cxPlanOffers').addEventListener('click', e => {
    const btn = e.target.closest('.cx-chip');
    if (btn) btn.classList.toggle('active');
  });

  document.getElementById('cxPlanForm').addEventListener('submit', async e => {
    e.preventDefault();
    const problemId = document.getElementById('cxPlanProblem').value;
    const p = compassProblem(problemId);
    const offers = Array.from(document.querySelectorAll('#cxPlanOffers .cx-chip.active')).map(b => b.dataset.offer);
    const minutes = document.getElementById('cxPlanTime').value;
    const btn = document.getElementById('cxPlanSubmit');
    const loading = document.getElementById('cxPlanLoading');
    const errBox = document.getElementById('cxPlanError');

    btn.disabled = true;
    loading.classList.add('visible');
    errBox.classList.remove('visible');

    const systemPrompt = `You create personal action plans inside Impact Compass, an app for turning understanding of world problems into compassionate action.

Return ONLY a numbered list of 5 to 8 steps, one per line, formatted exactly like:
1. [step]
2. [step]
No intro, no outro, no headings. Each step must be concrete and checkable (a real action, not a vague intention). Step 1 must be doable today in under 15 minutes. Scale ambition to the user's weekly time. Match steps to what they offered (money/time/skills/voice); if they offered nothing, cover gentle first steps across all four. Where natural, reference by name the free tools "What Would $X Do?", Charity Comparison Engine, Volunteer Match, "What Can I Donate?", or the Givelink platform for in-kind giving. ${cxDonow(problemId).length ? `You may name these vetted example organizations: ${cxDonow(problemId).map(d => d.org).join(', ')}. Beyond those, describe org types rather than naming other specific charities.` : 'Never name specific real charities — describe org types.'} Warm, practical, zero guilt.

The problem: ${p.name}. ${p.understand.scale}
What works: ${p.interventions.map(iv => `${iv.name} (${iv.evidence} evidence)`).join(', ')}.`;

    const userMessage = `Build my personal plan against ${p.name}.
I can offer: ${offers.length ? offers.join(', ') : 'not sure yet'}
Time per week: about ${minutes} minutes`;

    try {
      const text = await compassAI(systemPrompt, userMessage);
      const steps = text.split('\n')
        .map(l => l.trim())
        .filter(l => /^\d+[.)]\s+/.test(l))
        .map(l => ({ text: l.replace(/^\d+[.)]\s+/, ''), done: false }));
      if (!steps.length) throw new Error('empty plan');
      cxState.plans.unshift({
        id: 'plan_' + Date.now(),
        problemId, offers, minutes,
        createdAt: Date.now(),
        steps,
      });
      cxSave();
      cxTrack('plan_generated', { problem: problemId, offers: offers.join(',') || 'none', minutes, steps: steps.length });
      drawPlans();
      document.getElementById('cxPlans').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      // Never dead-end the act path: fall back to an Atlas-built starter plan.
      const steps = cxFallbackPlan(p, offers, +minutes);
      cxState.plans.unshift({
        id: 'plan_' + Date.now(),
        problemId, offers, minutes,
        createdAt: Date.now(),
        steps, fallback: true,
      });
      cxSave();
      cxTrack('plan_generated', { problem: problemId, offers: offers.join(',') || 'none', minutes, steps: steps.length, fallback: true });
      drawPlans();
      errBox.textContent = 'The AI is unreachable right now, so this starter plan was built from the Atlas evidence instead. Regenerate later for a personalized one.';
      errBox.classList.add('visible');
      document.getElementById('cxPlans').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } finally {
      btn.disabled = false;
      loading.classList.remove('visible');
    }
  });
}

/* Evidence-based starter plan, no AI required. Built from the problem's
   curated actions and vetted orgs so the act path works even when the
   worker is down — a reader should never hit a dead end. */
function cxFallbackPlan(p, offers, minutes) {
  const steps = [];
  steps.push(`Spend 15 minutes with the ${p.name} page: read the Understand section and mark it understood.`);
  const wants = offers.length ? offers : ['money', 'time', 'skills', 'voice'];
  const perOffer = minutes >= 180 ? 2 : 1;
  wants.forEach(k => (p.actions[k] || []).slice(0, perOffer).forEach(a => steps.push(a)));
  const dn = cxDonow(p.id);
  if (dn.length) steps.push(`Visit ${dn[0].org} (${dn[0].url.replace('https://', '').replace('www.', '')}) and decide whether their work deserves your support.`);
  steps.push(`Tell one person what you learned about ${p.name} this week.`);
  return steps.slice(0, 8).map(text => ({ text, done: false }));
}

function drawPlans() {
  const wrap = document.getElementById('cxPlans');
  if (!wrap) return;
  if (!cxState.plans.length) {
    wrap.innerHTML = `<div class="cx-card cx-empty"><span class="cx-empty-emoji">🧭</span>No plans yet. Generate your first one above — the first step will be doable today.</div>`;
    return;
  }
  wrap.innerHTML = cxState.plans.map(plan => {
    const p = compassProblem(plan.problemId);
    const doneCount = plan.steps.filter(s => s.done).length;
    const complete = plan.steps.length > 0 && doneCount === plan.steps.length;
    // Completing a plan is the product's proudest moment — celebrate it and
    // invite the pass-on right there, with attributed links.
    let celebration = '';
    if (complete && p) {
      const cUrl = `${CX_TOOLS_SITE}/compass/p/${p.id}.html`;
      const cText = `I just completed my ${plan.steps.length}-step action plan against ${p.name} on Impact Compass. 🧭 Build yours:`;
      const cs = net => encodeURIComponent(`${cUrl}?utm_source=share&utm_medium=${net}&utm_campaign=plan_complete`);
      celebration = `
        <div class="cx-plan-complete" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
          <div style="font-weight:800">🎉 Plan complete — that's real action against ${esc(p.name)}.</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">
            <a class="cx-chip" data-plan-share="x" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(cText)}&url=${cs('x')}" target="_blank" rel="noopener">𝕏 Share it</a>
            <a class="cx-chip" data-plan-share="whatsapp" href="https://wa.me/?text=${encodeURIComponent(cText + ' ')}${cs('whatsapp')}" target="_blank" rel="noopener">💬 WhatsApp</a>
            <a class="cx-chip" style="text-decoration:none" href="#/atlas">Understand another →</a>
          </div>
        </div>`;
    }
    return `
      <div class="cx-card cx-plan-card" data-plan="${plan.id}">
        <div class="cx-plan-head">
          <span style="font-size:1.4rem">${p ? p.emoji : '🧭'}</span>
          <div class="cx-plan-title">${p ? esc(p.name) : 'Plan'}
            <div class="cx-plan-meta">${doneCount}/${plan.steps.length} done · ${new Date(plan.createdAt).toLocaleDateString()}${plan.fallback ? ' · ⚡ starter plan' : ''}</div>
          </div>
          <button class="cx-plan-del" data-del="${plan.id}">Remove</button>
        </div>
        ${plan.steps.map((s, i) => `
          <label class="cx-step ${s.done ? 'done' : ''}">
            <input type="checkbox" data-step="${i}" ${s.done ? 'checked' : ''} />
            <span>${esc(s.text)}</span>
          </label>`).join('')}
        ${celebration}
      </div>`;
  }).join('');

  wrap.querySelectorAll('[data-plan-share]').forEach(a => {
    a.addEventListener('click', () => {
      const planId = a.closest('[data-plan]').dataset.plan;
      const plan = cxState.plans.find(pl => pl.id === planId);
      cxTrack('share_click', { where: 'plan_complete', network: a.dataset.planShare, problem: plan && plan.problemId });
    });
  });

  wrap.querySelectorAll('input[data-step]').forEach(cb => {
    cb.addEventListener('change', () => {
      const planId = cb.closest('[data-plan]').dataset.plan;
      const plan = cxState.plans.find(pl => pl.id === planId);
      if (!plan) return;
      plan.steps[+cb.dataset.step].done = cb.checked;
      // Fire plan_completed exactly once, the first time every step is done.
      if (!plan.completedAt && plan.steps.length && plan.steps.every(s => s.done)) {
        plan.completedAt = Date.now();
        cxTrack('plan_completed', { problem: plan.problemId, steps: plan.steps.length });
      }
      cxSave();
      drawPlans();
    });
  });
  wrap.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Remove this plan?')) return;
      cxState.plans = cxState.plans.filter(pl => pl.id !== btn.dataset.del);
      cxSave();
      drawPlans();
    });
  });
}

function renderJourney() {
  const ids = Object.keys(cxState.understood);
  const total = COMPASS_PROBLEMS.length;
  const pct = Math.round(ids.length / total * 100);

  cxView().innerHTML = `
    <p class="cx-eyebrow">Your journey</p>
    <h1 class="cx-h1">The compass remembers</h1>
    <p class="cx-sub">Understanding you've built, action you've taken, and the habit that carries both.</p>

    <div class="cx-journey-grid">
      <div class="cx-card" style="text-align:center"><div class="cx-pulse-num">${ids.length}/${total}</div><div class="cx-pulse-label">Problems understood</div></div>
      <div class="cx-card" style="text-align:center"><div class="cx-pulse-num">${cxStepsDone()}</div><div class="cx-pulse-label">Steps completed</div></div>
      <div class="cx-card" style="text-align:center"><div class="cx-pulse-num">${cxState.plans.length}</div><div class="cx-pulse-label">Active plans</div></div>
      <div class="cx-card" style="text-align:center"><div class="cx-pulse-num">${cxState.streak.count}🔥</div><div class="cx-pulse-label">Day streak</div></div>
    </div>

    <div class="cx-card">
      <div class="cx-ring-wrap">
        <svg width="86" height="86" viewBox="0 0 86 86" aria-hidden="true">
          <circle cx="43" cy="43" r="37" fill="none" stroke="var(--surface-2)" stroke-width="9"/>
          <circle cx="43" cy="43" r="37" fill="none" stroke="var(--gold)" stroke-width="9" stroke-linecap="round"
            stroke-dasharray="${(232.4 * pct / 100).toFixed(1)} 232.4" transform="rotate(-90 43 43)"/>
          <text x="43" y="49" text-anchor="middle" fill="var(--text)" font-size="17" font-weight="800" font-family="inherit">${pct}%</text>
        </svg>
        <div>
          <div style="font-weight:800">Atlas explored</div>
          <div style="color:var(--text-dim);font-size:0.85rem">${
            ids.length === 0 ? 'Open any problem in the Atlas and mark it understood when it clicks.' :
            ids.length === total ? '🎉 You\'ve understood the whole Atlas. That knowledge is rare — use it.' :
            `${total - ids.length} problems left to understand.`}</div>
          <div class="cx-understood-list">
            ${ids.map(id => { const p = compassProblem(id); return p ? `<a class="cx-chip" style="text-decoration:none" href="#/problem/${p.id}">${p.emoji} ${esc(p.name)}</a>` : ''; }).join('')}
          </div>
        </div>
      </div>
    </div>

    <div class="cx-detail-ctas">
      <button class="cx-btn cx-btn-ghost" id="cxShare">📤 Share my journey</button>
      <a class="cx-btn" href="#/atlas">Keep exploring →</a>
    </div>

    <div class="cx-section">
      <div class="cx-section-label">🔔 One problem a day</div>
      <div class="cx-card">
        <p style="color:var(--text-dim);font-size:0.9rem;margin-bottom:14px">Get the day's problem delivered — a small, steady way to keep the world in view. Pick either or both.</p>
        <form class="cx-chat-form" id="cxEmailForm" style="margin-bottom:10px">
          <input class="cx-input" id="cxEmailInput" type="email" placeholder="you@example.com" autocomplete="email" value="${esc(window.CompassNotify ? CompassNotify.emailSubscribed() : '')}" />
          <button class="cx-btn" type="submit" id="cxEmailBtn">✉️ Email me daily</button>
        </form>
        <button class="cx-btn cx-btn-ghost" id="cxPushBtn">${window.CompassNotify && CompassNotify.pushSubscribed() ? '🔔 Push on this device: on' : '📲 Send push to this device'}</button>
        <div class="cx-error" id="cxNotifyMsg" style="margin-top:10px"></div>
        <p style="color:var(--text-dim);font-size:0.72rem;margin-top:10px">Free, one message a day, unsubscribe anytime. Your email is used only for this.</p>
      </div>
    </div>
    ${cxFooter()}
  `;

  cxWireDailyDelivery();

  document.getElementById('cxShare').addEventListener('click', async () => {
    cxTrack('share_click', { where: 'journey', network: 'native' });
    const text = `I'm using Impact Compass to understand the world's biggest problems and act on them — ${ids.length}/${total} problems understood, ${cxStepsDone()} action steps done. 🧭`;
    const url = location.origin + location.pathname + '?utm_source=share&utm_medium=journey';
    try {
      if (navigator.share) { await navigator.share({ title: 'Impact Compass', text, url }); return; }
      await navigator.clipboard.writeText(text + ' ' + url);
      const btn = document.getElementById('cxShare');
      btn.textContent = '✓ Copied';
      setTimeout(() => { btn.textContent = '📤 Share my journey'; }, 1600);
    } catch {}
  });
}

function cxWireDailyDelivery() {
  const msg = document.getElementById('cxNotifyMsg');
  const show = (t, ok) => { msg.textContent = t; msg.style.color = ok ? 'var(--green)' : 'var(--red)'; msg.classList.add('visible'); };
  const REASON = {
    invalid: 'That email doesn\'t look right.',
    denied: 'Notifications are blocked — allow them in your browser settings.',
    unsupported: 'This browser doesn\'t support push. Try the email option.',
    offline: 'Daily delivery isn\'t reachable yet — please try again later.',
    server: 'Daily delivery isn\'t reachable yet — please try again later.',
  };

  const emailForm = document.getElementById('cxEmailForm');
  emailForm.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('cxEmailBtn');
    const val = document.getElementById('cxEmailInput').value.trim();
    btn.disabled = true; btn.textContent = 'Signing up…';
    const r = await CompassNotify.subscribeEmail(val);
    btn.disabled = false;
    if (r.ok) { cxTrack('email_signup', { where: 'journey' }); btn.textContent = '✓ You\'re signed up'; show('You\'ll get one problem a day by email. 🌍', true); }
    else { btn.textContent = '✉️ Email me daily'; show(REASON[r.reason] || REASON.server, false); }
  });

  document.getElementById('cxPushBtn').addEventListener('click', async function () {
    this.disabled = true; const prev = this.textContent; this.textContent = 'Enabling…';
    const r = await CompassNotify.subscribePush();
    this.disabled = false;
    if (r.ok) { cxTrack('push_signup', { where: 'journey' }); this.textContent = '🔔 Push on this device: on'; show('This device will get the day\'s problem. 📲', true); }
    else { this.textContent = prev; show(REASON[r.reason] || REASON.server, false); }
  });
}

function cxFooter() {
  return `<div class="cx-footer">Impact Compass · built by <a href="https://panoskokmotos.com" target="_blank" rel="noopener">Panos Kokmotos</a> · sibling of the <a href="${CX_TOOLS_SITE}/" target="_blank" rel="noopener">AI for Social Impact tools</a> and <a href="https://givelink.app/en" target="_blank" rel="noopener">Givelink</a> · powered by Claude AI<br>Figures are honest approximations from public sources — <a href="#/truth">how we know</a>.</div>`;
}

/* ── Boot ───────────────────────────────────────────── */
window.addEventListener('hashchange', cxRoute);
document.addEventListener('DOMContentLoaded', () => {
  cxTouchStreak();
  cxRoute();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).then(reg => {
      // Installed PWAs can live for days without a navigation, so also
      // check for a new version whenever the app returns to the foreground.
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) reg.update().catch(() => {});
      });
    }).catch(() => {});
    // When a new worker takes over (skipWaiting + claim), reload once so
    // users get the new version immediately instead of on their next
    // visit. hadController guards the very first install, where claim()
    // also fires controllerchange but nothing stale is on screen.
    const hadController = !!navigator.serviceWorker.controller;
    let cxSwReloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || cxSwReloaded) return;
      cxSwReloaded = true;
      location.reload();
    });
  }
  cxMaybeNudge();
});
