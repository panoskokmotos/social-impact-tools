/**
 * test-data.mjs — integrity checks for the Problem Atlas.
 * Guards content quality over time: run before shipping a data change.
 *   node compass/test-data.mjs
 * Checks structure/enums in data.js, Greek↔English id parity in
 * data.el.js, and that every problem has a generated EN + EL page.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };

// Load data.js + data.el.js in one sandbox
const dataSrc = readFileSync(join(DIR, 'data.js'), 'utf8');
const elSrc = readFileSync(join(DIR, 'data.el.js'), 'utf8');
const { COMPASS_PROBLEMS, COMPASS_CATEGORIES, COMPASS_EL } =
  new Function(dataSrc + ';' + elSrc + '; return { COMPASS_PROBLEMS, COMPASS_CATEGORIES, COMPASS_EL };')();

const CATS = Object.keys(COMPASS_CATEGORIES);
const EVID = ['strong', 'promising', 'debated'];
const DIRS = ['improving', 'worsening', 'mixed'];

ok(COMPASS_PROBLEMS.length >= 15, `Atlas has ${COMPASS_PROBLEMS.length} problems (≥15)`);

const ids = new Set();
let structOk = true;
for (const p of COMPASS_PROBLEMS) {
  const bad = [];
  if (!p.id || ids.has(p.id)) bad.push('id missing/duplicate');
  ids.add(p.id);
  if (!p.name || !p.emoji || !p.stat) bad.push('name/emoji/stat');
  if (!CATS.includes(p.category)) bad.push('category=' + p.category);
  if (!p.trend || !DIRS.includes(p.trend.dir) || !p.trend.text) bad.push('trend');
  const u = p.understand || {};
  if (!u.scale || !u.causes || !u.sufferers || !u.misconception) bad.push('understand.*');
  if (!Array.isArray(p.interventions) || p.interventions.length < 2) bad.push('interventions<2');
  for (const iv of (p.interventions || []))
    if (!iv.name || !iv.what || !EVID.includes(iv.evidence) || !iv.cost) bad.push('intervention:' + iv.name);
  const a = p.actions || {};
  if (!['money', 'time', 'skills', 'voice'].some(k => Array.isArray(a[k]) && a[k].length)) bad.push('actions empty');
  if (!Array.isArray(p.sources) || !p.sources.length) bad.push('sources');
  if (bad.length) { structOk = false; console.log('  ↳ ' + p.id + ': ' + bad.join(', ')); }
}
ok(structOk, 'every problem has valid structure, enums and non-empty content');

// Greek layer: ids and categories must line up with English
const elIds = Object.keys(COMPASS_EL.problems);
ok(elIds.every(id => ids.has(id)), 'every Greek problem id exists in the English Atlas (no drift)');
ok(elIds.length === COMPASS_PROBLEMS.length, `Greek covers all ${COMPASS_PROBLEMS.length} problems (${elIds.length} present)`);
ok(CATS.every(c => COMPASS_EL.categories[c]), 'every category has a Greek label');
ok(DIRS.every(d => COMPASS_EL.trend[d]), 'every trend direction has a Greek label');
for (const id of elIds) {
  const e = COMPASS_EL.problems[id];
  if (!e.name || !e.stat || !e.trend || !e.misconception)
    ok(false, `Greek ${id} missing a field`);
}

// Generated pages exist for every problem, both languages
let pagesOk = true;
for (const p of COMPASS_PROBLEMS) {
  if (!existsSync(join(DIR, 'p', p.id + '.html'))) { pagesOk = false; console.log('  ↳ missing EN page: ' + p.id); }
  if (!existsSync(join(DIR, 'el', p.id + '.html'))) { pagesOk = false; console.log('  ↳ missing EL page: ' + p.id); }
}
ok(pagesOk, 'every problem has a generated English + Greek page (run build-pages.py / build-el.py if not)');

console.log(fails ? `\n${fails} check(s) failed.` : '\nAll Atlas integrity checks passed ✅');
process.exit(fails ? 1 : 0);
