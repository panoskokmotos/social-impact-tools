// Run: node --test test.mjs  (no dependencies)
import test from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, VALUES, STRENGTHS, PROBLEMS, CAPACITY, KEYWORDS } from './data.js';
import {
  themeScores, rankProblems, purposeStatement, buildPlan, missionLevels,
  totalMinutes, weekStreak, weekKey,
} from './engine.js';

const strengthIds = new Set(STRENGTHS.map((s) => s.id));

test('data: ids are unique and references resolve', () => {
  for (const list of [VALUES, STRENGTHS, PROBLEMS, CAPACITY]) {
    const ids = list.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length);
  }
  for (const v of VALUES) for (const t of v.themes) assert.ok(THEMES[t], `${v.id} → ${t}`);
  for (const t of Object.keys(KEYWORDS)) assert.ok(THEMES[t]);
  for (const p of PROBLEMS) {
    assert.ok(p.themes.length, p.id);
    for (const t of p.themes) assert.ok(THEMES[t], `${p.id} → ${t}`);
    for (const s of Object.keys(p.roles)) assert.ok(strengthIds.has(s), `${p.id} role ${s}`);
    for (const l of ['hour', 'month', 'year']) assert.ok(p.missions[l]?.length >= 1, `${p.id} ${l}`);
    for (const k of ['scale', 'neglect', 'solvable']) assert.ok([1, 2, 3].includes(p.rating[k]), `${p.id} ${k}`);
    assert.ok(p.sources.length && p.why.length > 40, p.id);
    assert.match(p.goal, /^[a-z]/, `${p.id} goal must continue a sentence`);
  }
});

test('data: every theme has at least two problems and every strength has a role', () => {
  for (const t of Object.keys(THEMES)) {
    assert.ok(PROBLEMS.filter((p) => p.themes.includes(t)).length >= 2, t);
  }
  for (const s of strengthIds) {
    assert.ok(PROBLEMS.some((p) => s in p.roles), s);
  }
});

test('themeScores: themes, values and free text all count', () => {
  const { scores, why } = themeScores({
    themes: ['animals'], values: ['nature'], answers: { anger: 'Plastic in the ocean' },
  });
  assert.equal(scores.animals, 3 + 1);
  assert.equal(scores.climate, 1 + 2); // value + two keyword hits (plastic, ocean)
  assert.ok(why.climate.some((w) => w.includes('ocean')));
});

test('themeScores: short keywords match whole words only', () => {
  assert.equal(themeScores({ answers: { flow: 'fresh air and fair rules' } }).scores.future, 0);
  assert.equal(themeScores({ answers: { flow: 'worried about AI' } }).scores.future, 1);
});

test('rankProblems: a clear profile surfaces the obvious problem first', () => {
  const r = rankProblems({ themes: ['animals'], values: ['compassion'], strengths: ['science'] });
  assert.equal(r[0].problem.id, 'factory-farming');
  assert.ok(r[0].roles.length >= 1);
  assert.ok(r[0].reasons.length >= 2);
});

test('rankProblems: education + teaching → reading', () => {
  const r = rankProblems({ themes: ['education'], values: ['growth'], strengths: ['teach'] });
  assert.equal(r[0].problem.id, 'learning-poverty');
});

test('rankProblems: an empty profile still returns every problem, stably', () => {
  const r = rankProblems({});
  assert.equal(r.length, PROBLEMS.length);
  assert.deepEqual(r.map((x) => x.problem.id), rankProblems({}).map((x) => x.problem.id));
});

test('purposeStatement uses strengths, values and the top problem', () => {
  const profile = { strengths: ['teach', 'write'], values: ['growth', 'fairness'] };
  const s = purposeStatement(profile, rankProblems(profile)[0]);
  assert.match(s, /teaching & explaining and writing/);
  assert.match(s, /growth and fairness/);
  assert.match(s, /to help get every child reading,/);
  assert.match(purposeStatement({}), /what I am good at/);
});

test('buildPlan: sized to capacity, strength role inserted, ids unique', () => {
  const p = PROBLEMS.find((x) => x.id === 'climate');
  const small = buildPlan(p, { capacity: 'hour', strengths: [] });
  assert.ok(small.every((m) => m.level !== 'year'));
  const big = buildPlan(p, { capacity: 'career', strengths: ['code'] });
  assert.ok(big.some((m) => m.id === 'role-code'));
  assert.equal(new Set(big.map((m) => m.id)).size, big.length);
  assert.deepEqual(missionLevels('nope'), ['hour', 'month', 'year']);
});

test('totalMinutes and weekStreak', () => {
  const now = new Date('2026-10-07T12:00:00'); // Wednesday
  const log = [
    { date: '2026-10-05', minutes: 30 }, // this week
    { date: '2026-09-29', minutes: 60 }, // last week
    { date: '2026-09-22', minutes: '45' },
    { date: '2026-09-01', minutes: 10 }, // gap before this
  ];
  assert.equal(totalMinutes(log), 145);
  assert.equal(weekStreak(log, now), 3);
  // Nothing yet this week: last week still keeps the streak alive.
  assert.equal(weekStreak(log.slice(1), now), 2);
  assert.equal(weekStreak([], now), 0);
  assert.equal(weekKey(new Date('2026-10-11T10:00:00')), '2026-10-05'); // Sunday → Monday
});

// ---------- Conduct ----------
import { USEFULNESS, READY_AT, ROLES, STAGES } from './data.js';
import { newExpedition, readiness, nextStage, rolePrompt, briefMarkdown, critiqueRequest } from './conduct.js';

const reading = PROBLEMS.find((p) => p.id === 'learning-poverty');
const ctx = { northStar: { statement: 'I teach so every child can read.', vision: 'every child reads by ten' }, problem: reading };

test('data: every problem has build ideas; roles and stages are well-formed', () => {
  for (const p of PROBLEMS) assert.ok(p.builds?.length >= 1, p.id);
  assert.ok(READY_AT <= USEFULNESS.length);
  assert.equal(new Set(ROLES.map((r) => r.id)).size, ROLES.length);
  assert.equal(STAGES[0].id, 'chart');
});

test('readiness: needs what + for whom + enough honest checks', () => {
  const x = newExpedition(reading, reading.builds[0], new Date('2026-10-03'));
  assert.equal(x.stage, 'chart');
  assert.equal(readiness(x).ready, false);
  for (const u of USEFULNESS.slice(0, READY_AT)) x.checks[u.id] = true;
  assert.equal(readiness(x).ready, false, 'still missing "for whom"');
  assert.ok(readiness(x).missing.includes('Say who it is for.'));
  x.forWhom = 'volunteer tutors';
  assert.deepEqual([readiness(x).ready, readiness(x).score], [true, READY_AT]);
  x.what = '   ';
  assert.equal(readiness(x).ready, false);
});

test('nextStage advances and stops at the end', () => {
  assert.equal(nextStage('chart'), 'conduct');
  assert.equal(nextStage(STAGES.at(-1).id), STAGES.at(-1).id);
});

test('rolePrompt carries the North Star, the brief and role-specific work', () => {
  const x = { ...newExpedition(reading, 'An offline phonics app'), forWhom: 'tutors', never: 'collect names' };
  for (const role of ROLES) {
    const p = rolePrompt(role.id, x, ctx);
    assert.match(p, /NORTH STAR: I teach so every child can read\./);
    assert.match(p, /WHAT SHOULD EXIST: An offline phonics app/);
    assert.match(p, /IT MUST NEVER: collect names/);
    assert.match(p, new RegExp(`You are the ${role.name}`));
    assert.match(p, /\n1\. /);
  }
  assert.match(rolePrompt('critic', newExpedition(reading), ctx), /IT MUST NEVER: \(not specified — ask me\)/);
  assert.throws(() => rolePrompt('nope', x, ctx));
});

test('briefMarkdown renders checks, stage and outcomes', () => {
  const x = { ...newExpedition(reading, 'Tutor pack'), checks: { person: true }, stage: 'ship', outcomes: [{ date: '2026-10-03', text: '9 kids read a sentence' }] };
  const md = briefMarkdown(x, ctx);
  assert.match(md, /^# Tutor pack/);
  assert.match(md, /\*\*Stage:\*\* Shipped/);
  assert.match(md, /- \[x\] I can name a real person/);
  assert.match(md, /- \[ \] I have talked to/);
  assert.match(md, /## What changed\n- 2026-10-03: 9 kids read a sentence/);
});

test('critiqueRequest sends the brief only', () => {
  const r = critiqueRequest({ ...newExpedition(reading, 'Tutor pack') }, ctx);
  assert.match(r.systemPrompt, /usefulness/);
  assert.match(r.userMessage, /WHAT SHOULD EXIST: Tutor pack/);
  assert.doesNotMatch(r.userMessage, /minutes|reflection/i);
});

// ---------- Live run ----------
import { RUN_ORDER, nextInRun, canRun, recordOutput, approveStep, handoffPrompt } from './conduct.js';

test('live run: order, gating, approval and hand-off', () => {
  assert.ok(RUN_ORDER.every((id) => ROLES.some((r) => r.id === id)));
  assert.ok(!RUN_ORDER.includes('builder'));
  let x = { ...newExpedition(reading, 'Tutor pack'), forWhom: 'tutors' };
  assert.equal(nextInRun(x), 'scout');
  assert.ok(canRun(x, 'scout') && !canRun(x, 'architect'));
  assert.throws(() => approveStep(x, 'scout'));

  x = recordOutput(x, 'scout', 'Three similar packs exist; none offline.');
  assert.ok(!canRun(x, 'architect'), 'output alone is not approval');
  x = approveStep(x, 'scout', { note: 'Focus on printable, no phones.' });
  assert.ok(canRun(x, 'architect'));
  assert.equal(nextInRun(x), 'architect');

  const p = handoffPrompt('architect', x, ctx);
  assert.match(p, /You are the Architect/);
  assert.match(p, /--- SCOUT \(approved by the Explorer\) ---\nThree similar packs exist/);
  assert.match(p, /EXPLORER'S DIRECTION: Focus on printable, no phones\./);
  assert.equal(handoffPrompt('scout', x, ctx), rolePrompt('scout', x, ctx));

  // Editing the output on approval is what gets handed off.
  x = recordOutput(x, 'architect', 'draft plan');
  x = approveStep(x, 'architect', { output: 'edited plan' });
  assert.match(handoffPrompt('critic', x, ctx), /edited plan/);
  assert.doesNotMatch(handoffPrompt('critic', x, ctx), /draft plan/);
});

test('live run: the Builder (outside the run) gets every approved step', () => {
  let x = newExpedition(reading, 'Tutor pack');
  for (const id of RUN_ORDER) x = approveStep(recordOutput(x, id, `${id} out`), id);
  assert.equal(nextInRun(x), null);
  const p = handoffPrompt('builder', x, ctx);
  for (const id of RUN_ORDER) assert.match(p, new RegExp(`${id} out`));
});

test('live run: re-running a step clears everything after it', () => {
  let x = newExpedition(reading, 'Tutor pack');
  for (const id of ['scout', 'architect', 'critic']) x = approveStep(recordOutput(x, id, `${id} out`), id);
  assert.equal(nextInRun(x), 'measurer');
  x = recordOutput(x, 'architect', 'new plan');
  assert.equal(x.run.scout.approved, true);
  assert.equal(x.run.architect.approved, false);
  assert.equal(x.run.critic, undefined);
  assert.equal(nextInRun(x), 'architect');
});

test('live run: long hand-offs are trimmed', () => {
  let x = newExpedition(reading, 'Tutor pack');
  x = approveStep(recordOutput(x, 'scout', 'a'.repeat(5000)), 'scout');
  const p = handoffPrompt('architect', x, ctx);
  assert.match(p, /… \[trimmed\]/);
  assert.ok(p.length < 5000);
});

// ---------- Accountability buddy ----------
import { buildSnapshot, encodeSnapshot, decodeSnapshot, progressMessage, hours } from './buddy.js';

const buddyState = () => ({
  statement: 'I teach so every child can read — ελληνικά too.',
  project: {
    problemId: 'learning-poverty', started: '2026-09-01T10:00:00Z',
    missions: [{ done: true }, { done: false }, { done: true }],
    log: [
      { date: '2026-09-29', minutes: 60, note: 'old' },
      { date: '2026-10-12', minutes: 90, note: 'Tutored at the library' },
      { date: '2026-10-14', minutes: 30, note: 'Prepared cards' },
    ],
    reflections: [{ text: 'SECRET reflection' }],
  },
  expeditions: [{ what: 'Printable tutor pack', stage: 'conduct' }],
});
const NOW = new Date('2026-10-15T12:00:00');

test('buddy: snapshot summarises progress and leaves private things out', () => {
  const snap = buildSnapshot(buddyState(), { name: 'Panos' }, NOW);
  assert.equal(snap.h, 180);
  assert.equal(snap.wk, 120, 'only this week (Mon 12 Oct onward)');
  assert.equal(snap.md, 2); assert.equal(snap.mt, 3);
  assert.deepEqual(snap.r[0], ['2026-10-14', 30, ''], 'notes are off by default');
  assert.equal(buildSnapshot(buddyState(), { notes: true }, NOW).r[0][2], 'Prepared cards');
  assert.deepEqual(buildSnapshot(buddyState(), { expeditions: false }, NOW).x, []);
  assert.doesNotMatch(JSON.stringify(snap), /SECRET/);
  assert.equal(buildSnapshot({ project: null }), null);
});

test('buddy: encode/decode round-trips, including non-ASCII', () => {
  const snap = buildSnapshot(buddyState(), { name: 'Πάνος', notes: true }, NOW);
  const enc = encodeSnapshot(snap);
  assert.match(enc, /^[A-Za-z0-9_-]+$/, 'safe in a URL fragment');
  assert.deepEqual(decodeSnapshot(enc), snap);
});

test('buddy: decode rejects or clamps hostile links', () => {
  assert.equal(decodeSnapshot('not base64!!'), null);
  assert.equal(decodeSnapshot(encodeSnapshot({ v: 2 })), null);
  const evil = decodeSnapshot(encodeSnapshot({
    v: 1, n: 'x'.repeat(500), s: { a: 1 }, p: '../../etc', h: -5, wk: 'lots', w: 1e12,
    r: [['2026-10-01', 10, 'ok'], ['<img onerror>', 5, 'x'], 'junk'], x: [['A', 'hacked'], ['B', 'ship']],
  }));
  assert.equal(evil.n.length, 40);
  assert.equal(evil.s, '');
  assert.equal(evil.p, null);
  assert.deepEqual([evil.h, evil.wk, evil.w], [0, 0, 1e7]);
  assert.deepEqual(evil.r, [['2026-10-01', 10, 'ok']]);
  assert.deepEqual(evil.x, [['B', 'ship']]);
});

test('buddy: message reads naturally with and without a link', () => {
  const snap = buildSnapshot(buddyState(), {}, NOW);
  const m = progressMessage(snap, 'https://example.org/#/buddy/abc');
  assert.match(m, /Working on: 📖 Children who can’t read \(since 2026-09-01\)/);
  assert.match(m, /This week: 2 hours · \d+-week streak · 2\/3 missions done · 3 hours in total/);
  assert.match(m, /Latest: 2026-10-14 — 30 min\n/);
  assert.match(m, /Building: Printable tutor pack \(Conducting\)/);
  assert.match(m, /Check on me: https:\/\/example\.org/);
  assert.match(progressMessage(snap), /keep me honest/);
  assert.equal(hours(60), '1 hour'); assert.equal(hours(90), '1.5 hours');
});
