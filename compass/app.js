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
  const routes = { '': renderHome, atlas: renderAtlas, problem: renderProblem, plan: renderPlan, journey: renderJourney, priorities: renderPriorities, bestworld: renderBestWorld };
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
  const map = { home: '#/', atlas: '#/atlas', problem: '#/atlas', plan: '#/plan', journey: '#/journey', priorities: '#/atlas', bestworld: '#/' };
  document.querySelectorAll('.cx-nav a').forEach(a => {
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
      <a class="cx-card cx-today-card" href="#/priorities" style="margin-bottom:10px">
        <span class="cx-today-emoji">📊</span>
        <div>
          <div class="cx-today-name">Where does humanity stand?</div>
          <div class="cx-today-stat">All 25 problems ranked by how solved they are — where only will is missing, and where knowledge itself is.</div>
        </div>
      </a>
      <a class="cx-card cx-today-card" href="#/bestworld">
        <span class="cx-today-emoji">🏛️</span>
        <div>
          <div class="cx-today-name">Where are we trying to go?</div>
          <div class="cx-today-stat">The best world according to eight philosophers — and the problems that block every route to it.</div>
        </div>
      </a>
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
    <div class="cx-filters" id="cxFilters">
      <button class="cx-chip active" data-cat="all">All</button>
      ${Object.entries(COMPASS_CATEGORIES).map(([k, c]) =>
        `<button class="cx-chip" data-cat="${k}">${c.emoji} ${c.name}</button>`).join('')}
    </div>
    <div class="cx-atlas" id="cxAtlas"></div>
    ${cxFooter()}
  `;

  const grid = document.getElementById('cxAtlas');
  const draw = (cat) => {
    const list = COMPASS_PROBLEMS.filter(p => cat === 'all' || p.category === cat);
    grid.innerHTML = list.map(p => `
      <a class="cx-card cx-problem-card" href="#/problem/${p.id}">
        <div class="cx-problem-top">
          <span class="cx-problem-emoji">${p.emoji}</span>
          <span class="cx-badge cx-badge-${p.trend.dir}">${TREND_LABEL[p.trend.dir]}</span>
        </div>
        <div class="cx-problem-name">${esc(p.name)}</div>
        <div class="cx-problem-stat">${esc(p.stat)}</div>
        <div class="cx-problem-foot">
          <span class="cx-badge cx-badge-cat">${COMPASS_CATEGORIES[p.category].emoji} ${COMPASS_CATEGORIES[p.category].name}</span>
          ${cxState.understood[p.id] ? '<span class="cx-problem-done">✓ Understood</span>' : ''}
        </div>
      </a>`).join('');
  };
  draw('all');
  document.getElementById('cxFilters').addEventListener('click', e => {
    const btn = e.target.closest('.cx-chip');
    if (!btn) return;
    document.querySelectorAll('#cxFilters .cx-chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    draw(btn.dataset.cat);
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
    blocks: ['education', 'extreme-poverty', 'loneliness'] },
  { emoji: '📈', who: 'Bentham & Mill', name: 'The greatest happiness',
    vision: 'Suffering reduced wherever it exists. And Bentham’s test was never "can they reason?" but "can they suffer?" — the circle includes animals.',
    blocks: ['malaria', 'child-mortality', 'factory-farming'] },
  { emoji: '⚖️', who: 'Immanuel Kant', name: 'The kingdom of ends',
    vision: 'Every human treated always as an end in themselves, never merely as a means — no one’s dignity traded away.',
    blocks: ['gender-inequality', 'refugees', 'corruption'] },
  { emoji: '🎭', who: 'John Rawls', name: 'Justice as fairness',
    vision: 'The world you would design if you didn’t know who you’d be born as. Behind that veil, you’d fix the worst-off positions first.',
    blocks: ['extreme-poverty', 'maternal-mortality', 'unsafe-water'] },
  { emoji: '🌱', who: 'Sen & Nussbaum', name: 'Capabilities',
    vision: 'Freedom measured by what people can actually do and be: learn, move, see, participate, choose their own life.',
    blocks: ['education', 'preventable-blindness', 'digital-exclusion'] },
  { emoji: '🔓', who: 'Karl Popper', name: 'The open society',
    vision: 'Institutions you can criticize and correct without violence — a civilization whose error-correction never stops.',
    blocks: ['corruption', 'digital-exclusion', 'refugees'] },
  { emoji: '♾️', who: 'David Deutsch', name: 'The beginning of infinity',
    vision: 'A civilization that treats every problem as soluble and never stops creating the knowledge to solve the next one — including the risks that could end the whole project.',
    blocks: ['pandemic-preparedness', 'education', 'tuberculosis'] },
  { emoji: '🫱', who: 'Peter Singer', name: 'The expanding circle',
    vision: 'Moral concern that refuses to stop at borders, or at our own species — distance is not a reason to let a child drown.',
    blocks: ['extreme-poverty', 'neglected-tropical-diseases', 'factory-farming'] },
];

function renderBestWorld() {
  cxView().innerHTML = `
    <p class="cx-eyebrow">The destination</p>
    <h1 class="cx-h1">The best world, according to philosophers</h1>
    <p class="cx-sub">Utopia is not a place — it’s a direction. Philosophers have disagreed about the destination for 2,400 years, but lay their maps on top of each other and the same obstacles appear on nearly every route. Those obstacles are this Atlas. Solving them isn’t one worldview’s agenda; it’s the shared road.</p>
    ${CX_VISIONS.map(v => `
      <div class="cx-card" style="margin-top:14px">
        <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
          <span style="font-size:1.3rem">${v.emoji}</span>
          <span style="font-weight:800">${v.name}</span>
          <span style="color:var(--text-dim);font-size:0.8rem">${v.who}</span>
        </div>
        <p style="color:var(--text-dim);font-size:0.88rem;margin:8px 0 10px">${v.vision}</p>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${v.blocks.map(id => { const p = compassProblem(id); return p ? `<a class="cx-chip" style="text-decoration:none" href="#/problem/${p.id}">${p.emoji} ${esc(p.name)}</a>` : ''; }).join('')}
        </div>
      </div>`).join('')}
    <div class="cx-detail-ctas" style="margin-top:26px">
      <a class="cx-btn" href="#/priorities">📊 Where do we stand today? →</a>
      <a class="cx-btn cx-btn-ghost" href="#/atlas">Explore all 25 problems</a>
    </div>
    ${cxFooter()}
  `;
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

    <div class="cx-sources">Rough figures for context, drawing on: ${p.sources.map(esc).join(' · ')}. Approximations, not citations.</div>
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
  return `<div class="cx-footer">Impact Compass · built by <a href="https://panoskokmotos.com" target="_blank" rel="noopener">Panos Kokmotos</a> · sibling of the <a href="${CX_TOOLS_SITE}/" target="_blank" rel="noopener">AI for Social Impact tools</a> and <a href="https://givelink.app/en" target="_blank" rel="noopener">Givelink</a> · powered by Claude AI<br>Figures are honest approximations from public sources — verify before citing.</div>`;
}

/* ── Boot ───────────────────────────────────────────── */
window.addEventListener('hashchange', cxRoute);
document.addEventListener('DOMContentLoaded', () => {
  cxTouchStreak();
  cxRoute();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
  }
  cxMaybeNudge();
});
