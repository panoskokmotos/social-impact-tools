/**
 * buddy.js — accountability buddy. Pure logic, no DOM. Tested by test.mjs.
 *
 * There is no server: a progress link carries a small read-only snapshot in
 * its URL fragment (#/buddy/<data>). Fragments are never sent to a web
 * server, so the snapshot only travels where the user sends the link. The
 * user decides what goes in it; reflections never do.
 *
 * Snapshot (v1, compact keys to keep links short):
 *   { v, n: name, s: statement, p: problemId, since, at,
 *     h: minutes total, wk: minutes this week, w: week streak,
 *     md: missions done, mt: missions total,
 *     r: [[date, minutes, note]] recent log, x: [[what, stageId]] expeditions }
 */
import { PROBLEMS, STAGES } from './data.js';
import { totalMinutes, weekStreak, weekKey } from './engine.js';

const MAX_STR = 300;
const MAX_ROWS = 5;
const day = (d) => new Date(d).toISOString().slice(0, 10);

export function buildSnapshot(state, { name = '', notes = false, expeditions = true } = {}, now = new Date()) {
  const pj = state.project;
  if (!pj) return null;
  const thisWeek = weekKey(now);
  const log = pj.log || [];
  return {
    v: 1,
    n: name.trim().slice(0, 40),
    s: (state.statement || '').trim().slice(0, MAX_STR),
    p: pj.problemId,
    since: day(pj.started),
    at: day(now),
    h: totalMinutes(log),
    wk: totalMinutes(log.filter((e) => weekKey(new Date(e.date)) === thisWeek)),
    w: weekStreak(log, now),
    md: pj.missions.filter((m) => m.done).length,
    mt: pj.missions.length,
    r: log.slice(-MAX_ROWS).reverse().map((e) => [e.date, Number(e.minutes) || 0, notes ? (e.note || '').slice(0, 120) : '']),
    x: expeditions ? (state.expeditions || []).slice(-3).reverse().map((e) => [(e.what || 'Untitled').slice(0, 120), e.stage]) : [],
  };
}

// UTF-8 safe base64url, so names and statements in any language survive.
export function encodeSnapshot(snap) {
  const bytes = new TextEncoder().encode(JSON.stringify(snap));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decode and validate. Anyone can craft a link, so every field is checked
 * and clamped; anything malformed returns null. (Rendering still escapes.)
 */
export function decodeSnapshot(str) {
  try {
    if (!/^[A-Za-z0-9_-]{8,6000}$/.test(str)) return null;
    const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    const raw = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
    if (!raw || raw.v !== 1) return null;
    const s = (v, max = MAX_STR) => (typeof v === 'string' ? v.slice(0, max) : '');
    const n = (v) => (Number.isFinite(v) && v >= 0 ? Math.min(Math.round(v), 1e7) : 0);
    const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
    const stageIds = new Set(STAGES.map((x) => x.id));
    return {
      v: 1,
      n: s(raw.n, 40), s: s(raw.s),
      p: PROBLEMS.some((p) => p.id === raw.p) ? raw.p : null,
      since: date(raw.since), at: date(raw.at),
      h: n(raw.h), wk: n(raw.wk), w: n(raw.w), md: n(raw.md), mt: n(raw.mt),
      r: (Array.isArray(raw.r) ? raw.r : []).slice(0, MAX_ROWS)
        .filter((e) => Array.isArray(e) && date(e[0])).map((e) => [e[0], n(e[1]), s(e[2], 120)]),
      x: (Array.isArray(raw.x) ? raw.x : []).slice(0, 3)
        .filter((e) => Array.isArray(e) && stageIds.has(e[1])).map((e) => [s(e[0], 120) || 'Untitled', e[1]]),
    };
  } catch {
    return null;
  }
}

export const hours = (mins) => {
  const h = mins / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} ${h === 1 ? 'hour' : 'hours'}`;
};

/** A plain-text update for WhatsApp, Signal, email… Works without any link. */
export function progressMessage(snap, link = '') {
  const p = PROBLEMS.find((x) => x.id === snap.p);
  const lines = [
    snap.s ? `My purpose: ${snap.s}` : null,
    p ? `Working on: ${p.emoji} ${p.name} (since ${snap.since})` : null,
    `This week: ${hours(snap.wk)} · ${snap.w}-week streak · ${snap.md}/${snap.mt} missions done · ${hours(snap.h)} in total`,
    snap.r.length ? `Latest: ${snap.r[0][0]} — ${snap.r[0][1]} min${snap.r[0][2] ? ` (${snap.r[0][2]})` : ''}` : 'Latest: nothing logged yet',
    ...snap.x.map(([what, st]) => `Building: ${what} (${STAGES.find((x) => x.id === st).name})`),
    link ? `Check on me: ${link}` : 'Ask me about it next week — keep me honest.',
  ];
  return lines.filter(Boolean).join('\n');
}
