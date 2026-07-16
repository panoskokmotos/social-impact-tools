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

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    full += decoder.decode(value, { stream: true });
    if (onChunk) onChunk(full);
  }
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

/* ── Router ─────────────────────────────────────────── */
const cxView = () => document.getElementById('view');

function cxRoute() {
  cxTouchStreak(); // idempotent per day; installed PWAs resume for days without reloading
  const hash = location.hash.replace(/^#\/?/, '');
  const [seg, arg] = hash.split('/');
  const routes = { '': renderHome, atlas: renderAtlas, problem: renderProblem, plan: renderPlan, journey: renderJourney };
  const fn = routes[seg] || renderHome;
  let a;
  try { a = arg ? decodeURIComponent(arg.split('?')[0]) : undefined; } catch { a = undefined; }
  cxView().className = '';
  fn(a);
  // reflow with the class actually removed, so the fade replays on every route
  void cxView().offsetWidth;
  cxView().className = 'cx-fade';
  cxNavActive(seg || 'home');
  window.scrollTo(0, 0);
}

function cxNavActive(seg) {
  const map = { home: '#/', atlas: '#/atlas', problem: '#/atlas', plan: '#/plan', journey: '#/journey' };
  document.querySelectorAll('.cx-nav a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === (map[seg] || '#/'));
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
        <a class="cx-btn cx-btn-ghost" href="#/plan">Build my action plan</a>
      </div>
    </div>

    <div class="cx-mission">
      <div class="cx-card"><span class="cx-mission-emoji">🧠</span><div class="cx-mission-title">Increase understanding</div><div class="cx-mission-desc">Curated, honest knowledge on each problem — scale, causes, and the misconceptions that mislead us.</div></div>
      <div class="cx-card"><span class="cx-mission-emoji">⚡</span><div class="cx-mission-title">Reduce suffering</div><div class="cx-mission-desc">Only what evidence supports: interventions rated by strength, with honest cost-per-outcome.</div></div>
      <div class="cx-card"><span class="cx-mission-emoji">🫂</span><div class="cx-mission-title">Expand care</div><div class="cx-mission-desc">Turn understanding into action with your money, time, skills, or voice — and make it a habit.</div></div>
    </div>

    <div class="cx-today">
      <h2 class="cx-h2">Today's problem</h2>
      <div class="cx-card cx-today-card" onclick="location.hash='#/problem/${today.id}'">
        <span class="cx-today-emoji">${today.emoji}</span>
        <div>
          <div class="cx-today-name">${esc(today.name)}</div>
          <div class="cx-today-stat">${esc(today.stat)}</div>
        </div>
      </div>
    </div>

    <div class="cx-pulse">
      <div class="cx-card"><div class="cx-pulse-num">${understood}<span style="font-size:0.9rem;color:var(--text-dim)">/${COMPASS_PROBLEMS.length}</span></div><div class="cx-pulse-label">Understood</div></div>
      <div class="cx-card"><div class="cx-pulse-num">${cxStepsDone()}</div><div class="cx-pulse-label">Steps done</div></div>
      <div class="cx-card"><div class="cx-pulse-num">${cxState.plans.length}</div><div class="cx-pulse-label">Plans</div></div>
      <div class="cx-card"><div class="cx-pulse-num">${cxState.streak.count}🔥</div><div class="cx-pulse-label">Day streak</div></div>
    </div>
    ${cxFooter()}
  `;
}

function renderAtlas() {
  cxView().innerHTML = `
    <p class="cx-eyebrow">The Problem Atlas</p>
    <h1 class="cx-h1">${COMPASS_PROBLEMS.length} problems worth understanding</h1>
    <p class="cx-sub">Each entry is curated from well-established evidence. Figures are approximate by design — honesty over precision.</p>
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
      <div class="cx-card cx-problem-card" onclick="location.hash='#/problem/${p.id}'">
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
      </div>`).join('');
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

function renderProblem(id) {
  const p = compassProblem(id);
  // replace, not assign — assigning pushes a history entry and traps Back
  if (!p) { location.replace('#/atlas'); return; }
  const done = !!cxState.understood[p.id];
  const u = p.understand;

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
        ${Object.entries(p.actions).map(([k, items]) => items.length ? `
          <div class="cx-act-group">
            <div class="cx-act-title">${OFFER_META[k].emoji} With your ${OFFER_META[k].label.toLowerCase()}</div>
            ${items.map(a => `<div class="cx-act-item">${esc(a)}</div>`).join('')}
          </div>` : '').join('')}
        <div style="color:var(--text-dim);font-size:0.78rem;margin-top:6px">
          Companion tools: <a href="${CX_TOOLS_SITE}/what-would-x-do.html" target="_blank" rel="noopener">"What Would $X Do?"</a> ·
          <a href="${CX_TOOLS_SITE}/charity-comparison-engine.html" target="_blank" rel="noopener">Charity Comparison</a> ·
          <a href="${CX_TOOLS_SITE}/volunteer-match.html" target="_blank" rel="noopener">Volunteer Match</a> ·
          <a href="https://givelink.app/en" target="_blank" rel="noopener">Givelink</a>
        </div>
      </div>
    </div>

    <div class="cx-detail-ctas">
      <button class="cx-btn cx-understood ${done ? 'done' : ''}" id="cxUnderstood">${done ? '✓ Understood' : '✓ I understand this now'}</button>
      <a class="cx-btn cx-btn-ghost" href="#/plan/${p.id}">Build my action plan →</a>
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
    // Update in place — a full re-render would wipe an in-progress AI chat.
    this.classList.add('done');
    this.textContent = '✓ Understood';
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

Rules: be warm, clear, honest and non-preachy. Use approximate, well-established figures ("roughly", "on the order of") and never invent precise statistics. Be candid about uncertainty and expert disagreement. Never name specific real charities — describe org types. No guilt-tripping, no doom; agency and honesty. Keep answers under 250 words unless asked to go deeper. If asked something unrelated to ${p.name}, briefly answer if it serves understanding of world problems, otherwise gently steer back.`;

  async function ask(q) {
    if (!q) return;
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
No intro, no outro, no headings. Each step must be concrete and checkable (a real action, not a vague intention). Step 1 must be doable today in under 15 minutes. Scale ambition to the user's weekly time. Match steps to what they offered (money/time/skills/voice); if they offered nothing, cover gentle first steps across all four. Where natural, reference by name the free tools "What Would $X Do?", Charity Comparison Engine, Volunteer Match, "What Can I Donate?", or the Givelink platform for in-kind giving. Never name specific real charities — describe org types. Warm, practical, zero guilt.

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
      drawPlans();
      document.getElementById('cxPlans').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      errBox.textContent = cxAIErrorMsg(err);
      errBox.classList.add('visible');
    } finally {
      btn.disabled = false;
      loading.classList.remove('visible');
    }
  });
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
    return `
      <div class="cx-card cx-plan-card" data-plan="${plan.id}">
        <div class="cx-plan-head">
          <span style="font-size:1.4rem">${p ? p.emoji : '🧭'}</span>
          <div class="cx-plan-title">${p ? esc(p.name) : 'Plan'}
            <div class="cx-plan-meta">${doneCount}/${plan.steps.length} done · ${new Date(plan.createdAt).toLocaleDateString()}</div>
          </div>
          <button class="cx-plan-del" data-del="${plan.id}">Remove</button>
        </div>
        ${plan.steps.map((s, i) => `
          <label class="cx-step ${s.done ? 'done' : ''}">
            <input type="checkbox" data-step="${i}" ${s.done ? 'checked' : ''} />
            <span>${esc(s.text)}</span>
          </label>`).join('')}
      </div>`;
  }).join('');

  wrap.querySelectorAll('input[data-step]').forEach(cb => {
    cb.addEventListener('change', () => {
      const planId = cb.closest('[data-plan]').dataset.plan;
      const plan = cxState.plans.find(pl => pl.id === planId);
      if (!plan) return;
      plan.steps[+cb.dataset.step].done = cb.checked;
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
    ${cxFooter()}
  `;

  document.getElementById('cxShare').addEventListener('click', async () => {
    const text = `I'm using Impact Compass to understand the world's biggest problems and act on them — ${ids.length}/${total} problems understood, ${cxStepsDone()} action steps done. 🧭`;
    const url = location.origin + location.pathname;
    try {
      if (navigator.share) { await navigator.share({ title: 'Impact Compass', text, url }); return; }
      await navigator.clipboard.writeText(text + ' ' + url);
      const btn = document.getElementById('cxShare');
      btn.textContent = '✓ Copied';
      setTimeout(() => { btn.textContent = '📤 Share my journey'; }, 1600);
    } catch {}
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
});
