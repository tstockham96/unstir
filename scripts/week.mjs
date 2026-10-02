// Renders the stirred start state of each day of a week (every difficulty) at 390x844, plus a
// mid-twist and a solved shot.  Usage: npm run build && node scripts/week.mjs [firstPuzzleNumber]
// -> shots/v2/v2-mon.png … v2-sun.png, v2-mid-twist.png, v2-solved.png
//    shots/v2/check/*-truth.png (same frame with the true eyes/radii drawn on, for checking only)
import { chromium } from 'playwright-core';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';

const OUT = resolve('shots/v2');
mkdirSync(resolve(OUT, 'check'), { recursive: true });
const FILE = pathToFileURL(resolve('dist-single/index.html')).href;
const first = Number(process.argv[2] || 1);
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
await page.goto(FILE + '?reset');
await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('unstir:v1')); s.seenHint = true; localStorage.setItem('unstir:v1', JSON.stringify(s)); });

async function open(n) {
  await page.goto(`${FILE}?debug&n=${n}`);
  await page.waitForFunction(() => !!window.__unstir);
  await page.waitForTimeout(700);
}
async function truth(name) {
  await page.evaluate(() => {
    const U = window.__unstir, r = U.rect();
    const d = document.createElement('div');
    d.id = 'truth';
    d.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;pointer-events:none;z-index:99`;
    d.innerHTML = `<svg viewBox="0 0 1 1" width="100%" height="100%">${U.stack.map((t) => `<circle cx="${t.x}" cy="${t.y}" r="${t.r}" fill="none" stroke="#0f0" stroke-width="0.004"/><circle cx="${t.x}" cy="${t.y}" r="${U.tol.eye}" fill="none" stroke="#f0f" stroke-width="0.004"/>`).join('')}</svg>`;
    document.body.appendChild(d);
  });
  await page.screenshot({ path: `${OUT}/check/${name}-truth.png` });
  await page.evaluate(() => document.getElementById('truth').remove());
}
const info = [];
for (let n = first; n < first + 7; n++) {
  await open(n);
  const p = await page.evaluate(() => { const p = window.__unstir.puzzle; return { n: p.n, tier: p.tier.name, par: p.par, scene: p.sceneName, guide: p.guide.kind, day: new Date(Date.UTC(2026, 9, 2) + (p.n - 1) * 864e5).getUTCDay(), twists: p.twists }; });
  const name = `v2-${DAYS[p.day]}`;
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await truth(name);
  info.push({ name, ...p });
  console.log(name, `#${p.n}`, p.tier, `par ${p.par}`, p.guide, p.scene, p.twists.map((t) => `(${t.x},${t.y}) r${t.r} s${t.s}`).join(' '));
}

// Mid-twist and solved, on the first puzzle of the run.
const cdp = await ctx.newCDPSession(page);
const tp = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 9, radiusY: 9, force: 1 }] });
async function stir(t, frac, midShot) {
  const U = await page.evaluate(() => { const b = window.__unstir.rect(); return { x: b.left, y: b.top, w: b.width, k: window.__unstir.sizeK, gain: window.__unstir.gain }; });
  const ex = U.x + t.x * U.w, ey = U.y + t.y * U.w, d = (t.r / U.k) * U.w, turn = (-t.s / U.gain) * frac;
  await tp('touchStart', ex, ey);
  for (let i = 1; i <= 5; i++) { await tp('touchMove', ex, ey - (d * i) / 5); await page.waitForTimeout(16); }
  const steps = Math.max(12, Math.ceil(Math.abs(turn) / 0.09));
  for (let i = 1; i <= steps; i++) {
    const a = -Math.PI / 2 + turn * (i / steps);
    await tp('touchMove', ex + Math.cos(a) * d, ey + Math.sin(a) * d);
    await page.waitForTimeout(16);
    if (midShot && i === Math.floor(steps * 0.6)) await page.screenshot({ path: `${OUT}/v2-mid-twist.png` });
  }
  await page.waitForTimeout(100);
  await tp('touchEnd', 0, 0);
  await page.waitForFunction(() => !window.__unstir.busy, null, { timeout: 15000 });
  await page.waitForTimeout(150);
}
await open(first);
const tw = await page.evaluate(() => window.__unstir.stack);
for (let i = 0; i < tw.length; i++) await stir(tw[i], 1, i === 0);
if ((await page.evaluate(() => window.__unstir.mode)) !== 'won') errors.push('solve run did not finish as won: ' + (await page.evaluate(() => window.__unstir.row)));
await page.waitForTimeout(1300);
await page.screenshot({ path: `${OUT}/v2-solved.png` });
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
