/**
 * app.js — hash-routed UI for Purpose. State lives in localStorage only;
 * nothing leaves the device.
 *
 * Routes: #/  #/discover  #/results  #/problems  #/problem/<id>  #/work
 */
import { THEMES, VALUES, STRENGTHS, CAPACITY, PROMPTS, PROBLEMS } from './data.js';
import {
  rankProblems, purposeStatement, buildPlan, totalMinutes, weekStreak, daysSince, themeScores,
} from './engine.js';

const KEY = 'purpose_state_v1';
const LIMITS = { values: 5, themes: 3, strengths: 3 };
const LEVEL_NAMES = { hour: 'This week · about an hour', month: 'This month', year: 'This year' };
const REFLECTIONS = [
  'What gave you energy this week — and what drained it?',
  'Who did your work actually reach? What changed for them?',
  'What would you do differently if you started this project again today?',
  'What is the smallest next step you are avoiding?',
  'Who could you bring along with you?',
  'Is this still the right problem for you? What would make you switch?',
];

const emptyProfile = () => ({ values: [], themes: [], strengths: [], capacity: '', answers: {} });
let state = load();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.profile) return s;
  } catch { /* storage unavailable or corrupt — start fresh */ }
  return { profile: emptyProfile(), step: 0, statement: '', project: null };
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode: keep in memory */ }
}

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const problemById = (id) => PROBLEMS.find((p) => p.id === id);
const hasProfile = () => state.profile.values.length || state.profile.themes.length || state.profile.strengths.length;
const dots = (n) => '●'.repeat(n) + '○'.repeat(3 - n);

// ---------- router ----------
function route() {
  const [, name = '', arg] = location.hash.replace(/^#/, '').split('/');
  const view = { '': home, discover, results, problems, problem, work }[name] || home;
  $('#app').innerHTML = view(arg);
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#/${name}`));
  bind[name]?.(arg);
  window.scrollTo(0, 0);
  $('#app').focus({ preventScroll: true });
}
window.addEventListener('hashchange', route);
const go = (h) => { if (location.hash === h) route(); else location.hash = h; };

// ---------- views ----------
function home() {
  const p = state.project && problemById(state.project.problemId);
  return `
  <section class="hero">
    <p class="eyebrow">Purpose</p>
    <h1>Find what’s yours to do.<br>Then do it, a little every week.</h1>
    <p class="lead">Purpose isn’t found by thinking alone. It’s found where what you care about, what you’re good at and what the world needs actually meet — and then built by showing up.</p>
    <div class="actions">
      ${p ? `<a class="btn primary" href="#/work">Continue: ${esc(p.emoji)} ${esc(p.name)}</a>` : ''}
      <a class="btn ${p ? '' : 'primary'}" href="#/discover">${hasProfile() ? 'Revisit discovery' : 'Start discovery · ~8 min'}</a>
      <a class="btn" href="#/problems">Browse purpose problems</a>
    </div>
  </section>
  <section class="steps3">
    <div><span>1</span><h3>Discover</h3><p>Values, the problems that move you, your strengths and how much time you have.</p></div>
    <div><span>2</span><h3>Choose</h3><p>Get matched to real “purpose problems” — with the reasons, and the role you could play.</p></div>
    <div><span>3</span><h3>Work</h3><p>Missions sized to your life, a simple time log, weekly reflection and a 90-day check-in.</p></div>
  </section>
  <p class="fine">Private by design: everything stays in this browser. No account, no tracking.</p>`;
}

const STEPS = ['values', 'themes', 'strengths', 'answers', 'capacity'];
function discover() {
  const step = Math.min(state.step || 0, STEPS.length - 1);
  const pr = state.profile;
  const head = (title, sub) => `
    <div class="progress" aria-label="Step ${step + 1} of ${STEPS.length}">${STEPS.map((_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>
    <h2>${title}</h2><p class="lead">${sub}</p>`;
  let body = '';
  const chips = (kind, items, label) => `<div class="chips" data-kind="${kind}">${items.map((it) => `
      <button type="button" class="chip ${pr[kind].includes(it.id) ? 'on' : ''}" data-id="${it.id}" aria-pressed="${pr[kind].includes(it.id)}">
        ${it.emoji ? `<span aria-hidden="true">${it.emoji}</span> ` : ''}<b>${esc(it.name)}</b>${it.hint ? `<small>${esc(it.hint)}</small>` : ''}
      </button>`).join('')}</div>
      <p class="count">${pr[kind].length} / ${LIMITS[kind]} ${label}</p>`;

  if (STEPS[step] === 'values') {
    body = head('What do you value most?', `Pick up to ${LIMITS.values}. Go with your gut — you can change these later.`)
      + chips('values', VALUES, 'chosen');
  } else if (STEPS[step] === 'themes') {
    body = head('Which problems pull at you?', `Pick up to ${LIMITS.themes} areas you’d be proud to have helped with.`)
      + chips('themes', Object.entries(THEMES).map(([id, t]) => ({ id, ...t })), 'chosen');
  } else if (STEPS[step] === 'strengths') {
    body = head('What are you good at?', `Pick up to ${LIMITS.strengths} — things people come to you for, or that feel easy to you and hard to others.`)
      + chips('strengths', STRENGTHS, 'chosen');
  } else if (STEPS[step] === 'answers') {
    body = head('Three honest questions', 'Optional, but they sharpen your matches. A sentence each is plenty.')
      + PROMPTS.map((q) => `<label class="field"><span>${esc(q.q)}</span>
        <textarea data-answer="${q.id}" rows="2" placeholder="${esc(q.ph)}">${esc(pr.answers[q.id] || '')}</textarea></label>`).join('');
  } else {
    body = head('How much can you give right now?', 'Be realistic. A small thing done every week beats a big plan abandoned.')
      + `<div class="chips single" data-kind="capacity">${CAPACITY.map((c) => `
        <button type="button" class="chip ${pr.capacity === c.id ? 'on' : ''}" data-id="${c.id}" aria-pressed="${pr.capacity === c.id}"><b>${esc(c.name)}</b></button>`).join('')}</div>`;
  }
  return `<section class="card">${body}
    <div class="actions between">
      <button class="btn" id="back" ${step === 0 ? 'disabled' : ''}>Back</button>
      <button class="btn primary" id="next">${step === STEPS.length - 1 ? 'See my matches' : 'Next'}</button>
    </div></section>`;
}

function results() {
  if (!hasProfile()) return `<section class="card"><h2>No profile yet</h2><p>Start with discovery to get your matches.</p><a class="btn primary" href="#/discover">Start discovery</a></section>`;
  const ranked = rankProblems(state.profile);
  const top = ranked.slice(0, 3);
  if (!state.statement) { state.statement = purposeStatement(state.profile, top[0]); save(); }
  const { scores } = themeScores(state.profile);
  const themeBars = Object.entries(scores).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = Math.max(1, ...themeBars.map(([, s]) => s));
  return `
  <section class="card">
    <p class="eyebrow">Your purpose statement — draft</p>
    <textarea id="statement" class="statement" rows="3" aria-label="Purpose statement">${esc(state.statement)}</textarea>
    <p class="fine">This is a first draft written from your answers. Rewrite it until it sounds like you. <button class="link" id="regen">Regenerate</button></p>
  </section>
  ${themeBars.length ? `<section class="card"><h3>Where your energy points</h3>
    <div class="bars">${themeBars.map(([t, s]) => `<div class="bar"><span>${THEMES[t].emoji} ${esc(THEMES[t].name)}</span><i style="--w:${(s / max) * 100}%"></i></div>`).join('')}</div></section>` : ''}
  <h2 class="section-title">Your top purpose problems</h2>
  <div class="grid">${top.map((r, i) => matchCard(r, i === 0)).join('')}</div>
  <p class="center"><a href="#/problems">See all ${PROBLEMS.length} problems, ranked for you →</a></p>`;
}

function matchCard(r, best) {
  const p = r.problem;
  return `<article class="card match ${best ? 'best' : ''}">
    ${best ? '<p class="eyebrow">Strongest match</p>' : ''}
    <h3><span aria-hidden="true">${p.emoji}</span> ${esc(p.name)}</h3>
    <p>${esc(p.why)}</p>
    ${r.reasons.length ? `<ul class="reasons">${r.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${r.roles.length ? `<p class="role"><b>Your role could be:</b> ${esc(r.roles[0].text)}</p>` : ''}
    <div class="actions"><a class="btn primary" href="#/problem/${p.id}">Explore</a></div>
  </article>`;
}

function problems() {
  const ranked = hasProfile() ? rankProblems(state.profile) : PROBLEMS.map((p) => ({ problem: p, reasons: [], roles: [] }));
  return `<h2>Purpose problems</h2>
  <p class="lead">${hasProfile() ? 'Ranked by how well they match you.' : 'Big, real problems with a way in at every size. Do discovery to rank them for you.'}</p>
  <div class="filters" role="group" aria-label="Filter by theme">
    <button class="chip small on" data-theme="">All</button>
    ${Object.entries(THEMES).map(([id, t]) => `<button class="chip small" data-theme="${id}">${t.emoji} ${esc(t.name)}</button>`).join('')}
  </div>
  <div class="list">${ranked.map((r) => `
    <a class="row" href="#/problem/${r.problem.id}" data-themes="${r.problem.themes.join(' ')}">
      <span class="emoji" aria-hidden="true">${r.problem.emoji}</span>
      <span><b>${esc(r.problem.name)}</b><small>${esc(r.reasons[0] || r.problem.themes.map((t) => THEMES[t].name).join(' · '))}</small></span>
    </a>`).join('')}</div>`;
}

function problem(id) {
  const p = problemById(id);
  if (!p) return `<section class="card"><h2>Not found</h2><a href="#/problems">Back to all problems</a></section>`;
  const mine = new Set(state.profile.strengths);
  const isCurrent = state.project?.problemId === p.id;
  return `<a class="back" href="#/problems">← All problems</a>
  <section class="card">
    <h1><span aria-hidden="true">${p.emoji}</span> ${esc(p.name)}</h1>
    <p class="tags">${p.themes.map((t) => `<span>${THEMES[t].emoji} ${esc(THEMES[t].name)}</span>`).join('')}</p>
    <p class="lead">${esc(p.why)}</p>
    <dl class="ratings">
      <div><dt>Scale</dt><dd title="${p.rating.scale}/3">${dots(p.rating.scale)}</dd></div>
      <div><dt>Neglect</dt><dd title="${p.rating.neglect}/3">${dots(p.rating.neglect)}</dd></div>
      <div><dt>Solvable</dt><dd title="${p.rating.solvable}/3">${dots(p.rating.solvable)}</dd></div>
    </dl>
    <p class="fine">Figures are approximate. Sources: ${p.sources.map(esc).join(', ')}. Ratings are coarse editorial judgements.</p>
  </section>
  <section class="card"><h3>Roles you could play</h3>
    <ul class="roles">${Object.entries(p.roles).map(([s, text]) => `
      <li class="${mine.has(s) ? 'mine' : ''}"><b>${esc(STRENGTHS.find((x) => x.id === s).name)}${mine.has(s) ? ' · your strength' : ''}</b><span>${esc(text)}</span></li>`).join('')}</ul>
  </section>
  <section class="card"><h3>Ways in, at every size</h3>
    ${['hour', 'month', 'year'].map((l) => `<h4>${LEVEL_NAMES[l]}</h4><ul>${p.missions[l].map((m) => `<li>${esc(m)}</li>`).join('')}</ul>`).join('')}
  </section>
  <div class="actions center">
    ${isCurrent ? '<a class="btn primary" href="#/work">Go to my work</a>' : `<button class="btn primary" id="choose" data-id="${p.id}">Make this my purpose problem</button>`}
  </div>`;
}

function work() {
  const pj = state.project;
  if (!pj) return `<section class="card"><h2>No purpose problem yet</h2>
    <p>Pick one problem to work on. You can always switch — but commit to one at a time.</p>
    <div class="actions"><a class="btn primary" href="#/${hasProfile() ? 'results' : 'discover'}">${hasProfile() ? 'See my matches' : 'Start discovery'}</a><a class="btn" href="#/problems">Browse problems</a></div></section>`;
  const p = problemById(pj.problemId);
  const done = pj.missions.filter((m) => m.done).length;
  const mins = totalMinutes(pj.log);
  const streak = weekStreak(pj.log);
  const days = daysSince(pj.started);
  const prompt = REFLECTIONS[Math.floor(days / 7) % REFLECTIONS.length];
  const today = new Date().toISOString().slice(0, 10);
  return `
  <section class="card statement-card">
    <p class="eyebrow">My purpose</p>
    <p class="statement-text">${esc(state.statement || purposeStatement(state.profile))}</p>
    <p class="fine">Working on <a href="#/problem/${p.id}">${p.emoji} ${esc(p.name)}</a> since ${new Date(pj.started).toLocaleDateString()}</p>
  </section>
  ${days >= 90 && !pj.checkedIn90 ? `<section class="card notice"><h3>90-day check-in</h3>
    <p>You’ve been at this for ${days} days. Is it still the right problem? Does your purpose statement still ring true?</p>
    <div class="actions"><button class="btn primary" id="keep">Yes — keep going</button><a class="btn" href="#/results">Revisit my matches</a></div></section>` : ''}
  <section class="stats">
    <div><b>${(mins / 60).toFixed(mins % 60 ? 1 : 0)}</b><span>hours given</span></div>
    <div><b>${streak}</b><span>week streak</span></div>
    <div><b>${done}/${pj.missions.length}</b><span>missions done</span></div>
  </section>
  <section class="card"><h3>Missions</h3>
    ${['hour', 'month', 'year'].filter((l) => pj.missions.some((m) => m.level === l)).map((l) => `
      <h4>${LEVEL_NAMES[l]}</h4>
      <ul class="checklist">${pj.missions.filter((m) => m.level === l).map((m) => `
        <li><label><input type="checkbox" data-mission="${esc(m.id)}" ${m.done ? 'checked' : ''}><span>${esc(m.text)}</span></label></li>`).join('')}</ul>`).join('')}
    <form id="add-mission" class="inline"><input name="text" placeholder="Add your own mission…" aria-label="Add your own mission" required><button class="btn">Add</button></form>
  </section>
  <section class="card"><h3>Log time</h3>
    <form id="log" class="log-form">
      <label><span>Date</span><input type="date" name="date" value="${today}" max="${today}" required></label>
      <label><span>Minutes</span><input type="number" name="minutes" min="5" step="5" value="60" required></label>
      <label class="wide"><span>What did you do?</span><input name="note" placeholder="e.g. tutored two kids at the library" maxlength="200"></label>
      <button class="btn primary">Log it</button>
    </form>
    ${pj.log.length ? `<ul class="log">${pj.log.slice().reverse().slice(0, 12).map((e) => `
      <li><time>${esc(e.date)}</time><b>${e.minutes} min</b><span>${esc(e.note || '')}</span></li>`).join('')}</ul>` : '<p class="fine">Nothing logged yet. Your first hour is the hardest one.</p>'}
  </section>
  <section class="card"><h3>This week’s reflection</h3>
    <p class="prompt">${esc(prompt)}</p>
    <form id="reflect"><textarea name="text" rows="3" aria-label="Reflection" required></textarea><button class="btn">Save reflection</button></form>
    ${pj.reflections.length ? `<details><summary>Past reflections (${pj.reflections.length})</summary><ul class="log">${pj.reflections.slice().reverse().map((r) => `
      <li><time>${esc(r.date)}</time><span><i>${esc(r.prompt)}</i><br>${esc(r.text)}</span></li>`).join('')}</ul></details>` : ''}
  </section>
  <section class="card"><h3>Your data</h3>
    <p class="fine">Everything lives in this browser. Export a backup or move it to another device.</p>
    <div class="actions">
      <button class="btn" id="export">Export backup</button>
      <label class="btn">Import backup<input type="file" id="import" accept="application/json" hidden></label>
      <button class="btn danger" id="reset">Start over</button>
    </div>
  </section>`;
}

// ---------- behaviour ----------
const bind = {
  discover() {
    const pr = state.profile;
    document.querySelectorAll('.chips').forEach((box) => box.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip'); if (!btn) return;
      const kind = box.dataset.kind; const id = btn.dataset.id;
      if (kind === 'capacity') { pr.capacity = id; }
      else {
        const list = pr[kind];
        const i = list.indexOf(id);
        if (i >= 0) list.splice(i, 1);
        else if (list.length < LIMITS[kind]) list.push(id);
        else { flash(`You can pick up to ${LIMITS[kind]} — unselect one first.`); return; }
      }
      save(); route();
    }));
    document.querySelectorAll('[data-answer]').forEach((ta) => ta.addEventListener('input', () => {
      pr.answers[ta.dataset.answer] = ta.value; save();
    }));
    $('#back').onclick = () => { state.step = Math.max(0, state.step - 1); save(); route(); };
    $('#next').onclick = () => {
      if (state.step >= STEPS.length - 1) {
        if (!pr.capacity) { flash('Pick one option so missions fit your life.'); return; }
        state.statement = ''; save(); go('#/results'); return;
      }
      state.step++; save(); route();
    };
  },
  results() {
    const ta = $('#statement'); if (!ta) return;
    ta.addEventListener('input', () => { state.statement = ta.value; save(); });
    $('#regen').onclick = () => { state.statement = purposeStatement(state.profile, rankProblems(state.profile)[0]); save(); route(); };
  },
  problems() {
    const filters = $('.filters');
    filters.addEventListener('click', (e) => {
      const b = e.target.closest('[data-theme]'); if (!b) return;
      filters.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b));
      document.querySelectorAll('.row').forEach((r) => {
        r.hidden = !!b.dataset.theme && !r.dataset.themes.split(' ').includes(b.dataset.theme);
      });
    });
  },
  problem() {
    const btn = $('#choose'); if (!btn) return;
    btn.onclick = () => {
      if (state.project && !confirm('Switch your purpose problem? Your current project and its log are kept in your history (included in backups); missions start fresh.')) return;
      const p = problemById(btn.dataset.id);
      const past = state.project ? [...(state.history || []), { ...state.project, ended: new Date().toISOString() }] : state.history;
      state.history = past;
      state.project = { problemId: p.id, started: new Date().toISOString(), missions: buildPlan(p, state.profile), log: [], reflections: [] };
      if (!state.statement) state.statement = purposeStatement(state.profile, { problem: p });
      save(); go('#/work');
    };
  },
  work() {
    const pj = state.project; if (!pj) return;
    document.querySelectorAll('[data-mission]').forEach((cb) => cb.addEventListener('change', () => {
      const m = pj.missions.find((x) => x.id === cb.dataset.mission);
      if (m) { m.done = cb.checked; save(); route(); if (cb.checked) flash('Nice. That counts.'); }
    }));
    $('#add-mission').onsubmit = (e) => {
      e.preventDefault();
      const text = e.target.text.value.trim(); if (!text) return;
      pj.missions.push({ id: `own-${Date.now()}`, level: 'month', text, done: false }); save(); route();
    };
    $('#log').onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      const minutes = Math.max(0, Math.round(Number(f.minutes.value) || 0));
      if (!minutes) return;
      pj.log.push({ date: f.date.value, minutes, note: f.note.value.trim() });
      pj.log.sort((a, b) => a.date.localeCompare(b.date));
      save(); route(); flash(`Logged ${minutes} minutes.`);
    };
    $('#reflect').onsubmit = (e) => {
      e.preventDefault();
      const text = e.target.text.value.trim(); if (!text) return;
      pj.reflections.push({ date: new Date().toISOString().slice(0, 10), prompt: $('.prompt').textContent, text });
      save(); route(); flash('Reflection saved.');
    };
    const keep = $('#keep'); if (keep) keep.onclick = () => { pj.checkedIn90 = true; save(); route(); };
    $('#export').onclick = () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `purpose-backup-${new Date().toISOString().slice(0, 10)}.json` });
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    $('#import').onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!data || !data.profile) throw new Error('not a Purpose backup');
        state = data; save(); route(); flash('Backup restored.');
      } catch (err) { flash(`Couldn’t import: ${err.message}`); }
    };
    $('#reset').onclick = () => {
      if (!confirm('Erase your profile, purpose statement and all logged work from this browser?')) return;
      state = { profile: emptyProfile(), step: 0, statement: '', project: null }; save(); go('#/');
    };
  },
};

function flash(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(flash.timer); flash.timer = setTimeout(() => t.classList.remove('show'), 2600);
}

route();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
