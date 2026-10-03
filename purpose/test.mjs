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
