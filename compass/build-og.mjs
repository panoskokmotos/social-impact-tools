/**
 * build-og.mjs — generate a per-problem social share image (Open Graph).
 * 1200×630 branded card (emoji, name, stat, trend) so shared/searched
 * problems preview compellingly instead of using one generic image.
 * Output: compass/og/<id>.png. Run after a data.js change:
 *   node compass/build-og.mjs
 */
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;

const DIR = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(DIR, 'data.js'), 'utf8');
const { COMPASS_PROBLEMS, COMPASS_CATEGORIES } =
  new Function(src + '; return { COMPASS_PROBLEMS, COMPASS_CATEGORIES };')();

const TREND = { improving: ['↗ Improving', '#3ecf8e'], worsening: ['↘ Worsening', '#f4718b'], mixed: ['↔ Mixed', '#f0a35e'] };
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function card(p) {
  const [tlabel, tcolor] = TREND[p.trend.dir];
  const cat = COMPASS_CATEGORIES[p.category];
  return `<!DOCTYPE html><html><head><meta charset="utf8">
  <style>
    @font-face { font-family:'PJ'; src:local('Manrope'); }
    *{margin:0;box-sizing:border-box}
    body{width:1200px;height:630px;font-family:'Manrope',system-ui,sans-serif;
      background:linear-gradient(150deg,#16224a,#0a0f1e);color:#e9edf8;padding:70px;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden}
    .top{display:flex;align-items:center;gap:16px;color:#e9b64a;font-weight:800;font-size:26px;letter-spacing:0.12em;text-transform:uppercase}
    .emoji{font-size:150px;line-height:1}
    .name{font-size:74px;font-weight:800;letter-spacing:-0.02em;line-height:1.05;margin-top:10px}
    .stat{font-size:34px;color:#9aa7c7;margin-top:22px;line-height:1.4;max-width:1000px}
    .badges{display:flex;gap:14px;margin-top:30px}
    .badge{padding:9px 20px;border-radius:999px;font-size:24px;font-weight:800}
    .foot{display:flex;align-items:center;justify-content:space-between;color:#5a6684;font-size:24px;font-weight:700}
  </style></head><body>
    <div class="top">🧭 Impact Compass</div>
    <div>
      <div class="emoji">${p.emoji}</div>
      <div class="name">${esc(p.name)}</div>
      <div class="stat">${esc(p.stat)}.</div>
      <div class="badges">
        <span class="badge" style="background:rgba(62,207,142,0.15);color:${tcolor}">${tlabel}</span>
        <span class="badge" style="background:rgba(148,168,220,0.12);color:#9aa7c7">${cat.emoji} ${esc(cat.name)}</span>
      </div>
    </div>
    <div class="foot"><span>Understand it · see what works · act</span><span>tools.panoskokmotos.com/compass</span></div>
  </body></html>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
mkdirSync(join(DIR, 'og'), { recursive: true });
for (const p of COMPASS_PROBLEMS) {
  await page.setContent(card(p), { waitUntil: 'networkidle' });
  await page.screenshot({ path: join(DIR, 'og', p.id + '.jpg'), type: 'jpeg', quality: 82 });
}
await browser.close();
console.log(`generated ${COMPASS_PROBLEMS.length} OG share cards → compass/og/`);
