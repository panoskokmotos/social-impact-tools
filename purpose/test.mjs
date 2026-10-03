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
