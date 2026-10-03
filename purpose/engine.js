/**
 * engine.js — pure logic: no DOM, no storage. Tested by test.mjs.
 * Problems list their primary theme first — ranking depends on that order.
 *
 * A profile looks like:
 *   { values: [id], themes: [id], strengths: [id], capacity: id,
 *     answers: { flow, anger, lived } }
 */
import { THEMES, VALUES, STRENGTHS, KEYWORDS, PROBLEMS, CAPACITY } from './data.js';

const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
const VALUE = byId(VALUES);
const STRENGTH = byId(STRENGTHS);

/** How strongly the profile leans toward each theme, with the evidence. */
export function themeScores(profile) {
  const scores = Object.fromEntries(Object.keys(THEMES).map((t) => [t, 0]));
  const why = Object.fromEntries(Object.keys(THEMES).map((t) => [t, []]));

  for (const t of profile.themes || []) {
    if (t in scores) { scores[t] += 3; why[t].push('you said it moves you'); }
  }
  for (const v of profile.values || []) {
    for (const t of VALUE[v]?.themes || []) {
      scores[t] += 1; why[t].push(`you value ${VALUE[v].name.toLowerCase()}`);
    }
  }
  const text = Object.values(profile.answers || {}).join(' ').toLowerCase();
  if (text.trim()) {
    for (const [t, words] of Object.entries(KEYWORDS)) {
      // Short words must match whole ("ai" ≠ "air"); longer ones match as prefixes.
      const hits = words.filter((w) => new RegExp(w.length <= 3 ? `\\b${w}\\b` : `\\b${w}`).test(text));
      if (hits.length) {
        scores[t] += Math.min(2, hits.length);
        why[t].push(`you wrote about “${hits[0]}”`);
      }
    }
  }
  return { scores, why };
}

/** Rank problems for a profile. Returns [{ problem, score, reasons, roles }]. */
export function rankProblems(profile, problems = PROBLEMS) {
  const { scores, why } = themeScores(profile);
  const strengths = new Set(profile.strengths || []);
  const effective = (profile.values || []).includes('impact');

  return problems
    .map((p) => {
      const reasons = [];
      // A problem's first theme is its primary one and counts in full;
      // secondary themes count half, so multi-theme problems don't win by default.
      const [primary, ...rest] = p.themes.map((t) => scores[t] || 0);
      let score = primary + 0.5 * rest.reduce((a, b) => a + b, 0);
      const best = p.themes.slice().sort((a, b) => scores[b] - scores[a])[0];
      if (scores[best] > 0) reasons.push(`${THEMES[best].name}: ${unique(why[best]).slice(0, 2).join(', ')}`);

      const roles = Object.entries(p.roles)
        .filter(([s]) => strengths.has(s))
        .map(([s, text]) => ({ strength: STRENGTH[s].name, text }));
      score += 2 * Math.min(roles.length, 2);
      if (roles.length) reasons.push(`uses your ${roles.map((r) => r.strength.toLowerCase()).join(' and ')}`);

      if (effective) {
        score += (p.rating.neglect + p.rating.solvable - 4) * 0.75;
        if (p.rating.neglect + p.rating.solvable >= 5) reasons.push('neglected and solvable — good leverage');
      }
      return { problem: p, score: round(score), reasons, roles };
    })
    .sort((a, b) => b.score - a.score || a.problem.name.localeCompare(b.problem.name));
}

/** A first-draft purpose statement the user is invited to rewrite. */
export function purposeStatement(profile, top) {
  const s = (profile.strengths || []).map((id) => STRENGTH[id]?.name.toLowerCase()).filter(Boolean);
  const v = (profile.values || []).map((id) => VALUE[id]?.name.toLowerCase()).filter(Boolean);
  const gifts = s.length ? listJoin(s.slice(0, 2)) : 'what I am good at';
  const cares = v.length ? listJoin(v.slice(0, 2)) : 'what matters to me';
  const target = top ? top.problem.goal : 'solve a problem that matters';
  return `I use ${gifts} to help ${target}, because I care about ${cares}.`;
}

/** Which mission sizes to suggest for a capacity, smallest first. */
export function missionLevels(capacityId) {
  const order = ['hour', 'month', 'year'];
  const cap = CAPACITY.find((c) => c.id === capacityId);
  if (!cap) return order;
  if (cap.hours <= 1) return ['hour', 'month'];
  return order;
}

/** Build a starting plan: a list of missions with stable ids. */
export function buildPlan(problem, profile) {
  const levels = missionLevels(profile.capacity);
  const missions = [];
  for (const level of levels) {
    problem.missions[level].forEach((text, i) => missions.push({ id: `${level}-${i}`, level, text, done: false }));
  }
  // Put a mission that uses one of the user's strengths up front as the first "month" step.
  const role = Object.entries(problem.roles).find(([s]) => (profile.strengths || []).includes(s));
  if (role && levels.includes('month')) {
    missions.splice(missions.findIndex((m) => m.level === 'month'), 0,
      { id: `role-${role[0]}`, level: 'month', text: role[1], done: false });
  }
  return missions;
}

/** Total minutes logged. */
export function totalMinutes(log) {
  return (log || []).reduce((a, e) => a + (Number(e.minutes) || 0), 0);
}

/** ISO-ish week key (Monday-start) for a date. */
export function weekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = (d.getUTCDay() + 6) % 7; // Mon = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

/**
 * Consecutive weeks (ending this week or last week) with at least one log
 * entry. Last week counts so the streak doesn't "break" on a Monday morning.
 */
export function weekStreak(log, now = new Date()) {
  const weeks = new Set((log || []).map((e) => weekKey(new Date(e.date))));
  const cursor = new Date(now);
  if (!weeks.has(weekKey(cursor))) cursor.setDate(cursor.getDate() - 7);
  let streak = 0;
  while (weeks.has(weekKey(cursor))) { streak++; cursor.setDate(cursor.getDate() - 7); }
  return streak;
}

/** Days since a project started — used to suggest a 90-day check-in. */
export function daysSince(iso, now = new Date()) {
  return Math.floor((now - new Date(iso)) / 86400000);
}

function unique(arr) { return [...new Set(arr)]; }
function round(n) { return Math.round(n * 100) / 100; }
function listJoin(a) { return a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`; }
