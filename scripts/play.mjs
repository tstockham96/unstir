// End-to-end verification in headless Chromium at 390x844 with real touch input (CDP touch events).
// Usage: npm run build && node scripts/play.mjs   -> shots/*.png, shots/play.mp4, shots/e2e.json
import { chromium } from 'playwright-core';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const SHOTS = resolve('shots');
mkdirSync(SHOTS, { recursive: true });
const FILE = pathToFileURL(resolve('dist-single/index.html')).href;
const report = { steps: [], errors: [], asserts: 0, failed: 0 };
const log = (k, v) => { report.steps.push({ k, v }); console.log('•', k, typeof v === 'string' ? v : JSON.stringify(v)); };
const assert = (c, msg) => { report.asserts++; if (!c) { report.failed++; report.errors.push('ASSERT ' + msg); console.log('✗', msg); } else console.log('✓', msg); };

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const device = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function player(label, url) {
  const ctx = await browser.newContext(device);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => report.errors.push(`${label} pageerror ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && report.errors.push(`${label} console ${m.text()}`));
  const t0 = Date.now();
  await page.goto(url);
  await page.waitForFunction(() => !!window.__unstir);
  const cdp = await ctx.newCDPSession(page);
  return { ctx, page, cdp, t0, label };
}
const touch = (P, type, x, y) => P.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 9, radiusY: 9, force: 1 }] });
const shot = async (P, name) => { await P.page.screenshot({ path: `${SHOTS}/${name}` }); log('screenshot', name); };
const state = (P) => P.page.evaluate(() => ({ mode: window.__unstir.mode, row: window.__unstir.row, left: window.__unstir.stack.length, v: window.__unstir.lastVerdict }));
const idle = (P) => P.page.waitForFunction(() => !window.__unstir.busy, null, { timeout: 15000 });

/** A human-ish stir: press on the eye, slide out to the stirring radius, circle by `turn` radians, release. */
async function stir(P, eye, r, turn, { jitter = 2, onMid } = {}) {
  const rect = await P.page.evaluate(() => { const b = window.__unstir.rect(); return { x: b.left, y: b.top, w: b.width }; });
  const k = await P.page.evaluate(() => window.__unstir.sizeK);
  const ex = rect.x + eye[0] * rect.w + (Math.random() - 0.5) * jitter, ey = rect.y + eye[1] * rect.w + (Math.random() - 0.5) * jitter;
  const d = (r / k) * rect.w;
  const a0 = -Math.PI / 2;
  await touch(P, 'touchStart', ex, ey);
  await P.page.waitForTimeout(60);
  for (let i = 1; i <= 5; i++) { await touch(P, 'touchMove', ex + Math.cos(a0) * d * i / 5, ey + Math.sin(a0) * d * i / 5); await P.page.waitForTimeout(16); }
  const steps = Math.max(12, Math.ceil(Math.abs(turn) / 0.09));
  for (let i = 1; i <= steps; i++) {
    const e = i / steps, a = a0 + turn * (1 - (1 - e) * (1 - e) * 0.15 - 0.85 * (1 - e)) ;
    const aa = a0 + turn * e;
    await touch(P, 'touchMove', ex + Math.cos(aa) * d, ey + Math.sin(aa) * d);
    await P.page.waitForTimeout(16);
    if (onMid && i === Math.floor(steps * 0.55)) await onMid();
    void a;
  }
  await P.page.waitForTimeout(120);
  await touch(P, 'touchEnd', 0, 0);
  await P.page.waitForTimeout(80);
  await idle(P);
}
const plan = (P) => P.page.evaluate(() => {
  const U = window.__unstir; const st = U.stack; const p = U.puzzle;
  // lockable = no later twist overlaps
  const lock = st.map((t, i) => st.slice(i + 1).every((u) => Math.hypot(t.x - u.x, t.y - u.y) >= t.r + u.r));
  const fwd = (t, x, y) => { const dx = x - t.x, dy = y - t.y, d = Math.hypot(dx, dy); if (d >= t.r) return [x, y]; const a = t.s * (1 - d / t.r) ** 2; return [t.x + dx * Math.cos(a) - dy * Math.sin(a), t.y + dx * Math.sin(a) + dy * Math.cos(a)]; };
  const eyes = st.map((t, i) => { let q = [t.x, t.y]; for (let j = i + 1; j < st.length; j++) q = fwd(st[j], q[0], q[1]); return q; });
  return { st, lock, eyes, gain: U.gain, par: p.par };
});

// ============================================================ Player A: first open, a few mistakes, then a clean solve
const A = await player('A', FILE + '?reset');
const info = await A.page.evaluate(() => ({ n: window.__unstir.puzzle.n, tier: window.__unstir.puzzle.tier.name, par: window.__unstir.puzzle.par, scene: window.__unstir.puzzle.sceneName, renderer: window.__unstir.renderer }));
log('puzzle', info);
assert(info.renderer === 'webgl', 'WebGL renderer active');
await A.page.waitForTimeout(2100);
await shot(A, '01-start.png');
const cap = await A.page.textContent('[data-testid=caption]');
log('first-open caption', cap);

let P0 = await plan(A);
const buriedIdx = P0.lock.findIndex((l) => !l);
const firstTouchMs = Date.now() - A.t0;
if (buriedIdx >= 0) {
  const t = P0.st[buriedIdx];
  await stir(A, P0.eyes[buriedIdx], t.r, -t.s / P0.gain);
  const s = await state(A);
  log('stirred a buried whirlpool', s.v);
  assert(s.v.kind === 'buried', 'a buried whirlpool bounces back as 🟨');
  await A.page.waitForTimeout(250);
  await shot(A, '02-buried.png');
}
log('first committed twist at ms after open', Date.now() - A.t0);
assert(Date.now() - A.t0 < 10000, 'first play happens within 10 s of opening (no tutorial)');
// An under-twist on the right whirlpool -> close / "twist further".
P0 = await plan(A);
let top = P0.lock.lastIndexOf(true);
await stir(A, P0.eyes[top], P0.st[top].r, (-P0.st[top].s / P0.gain) * 0.45);
let s = await state(A);
log('under-twist', s.v);
assert(s.v.kind === 'close', 'an under-twist on the right whirlpool reads as 🟧 close');
// Clean solve in canonical order.
let midShot = false;
for (let guard = 0; guard < 10; guard++) {
  const P = await plan(A);
  if (!P.st.length) break;
  const i = P.lock.lastIndexOf(true);
  const t = P.st[i];
  await stir(A, P.eyes[i], t.r, (-t.s / P.gain) * (0.94 + Math.random() * 0.1), { onMid: midShot ? undefined : async () => { await shot(A, '03-mid-twist.png'); midShot = true; } });
  s = await state(A);
  if (P.st.length === 2 && s.v.kind === 'lock') { await A.page.waitForTimeout(350); await shot(A, '04-after-lock.png'); }
  if (s.mode !== 'playing') break;
}
s = await state(A);
log('final', s);
assert(s.mode === 'won', 'solved');
await A.page.waitForTimeout(700);
await shot(A, '05-solved.png');
await A.page.waitForSelector('#sheet-results.open', { timeout: 6000 });
await A.page.waitForTimeout(900);
await shot(A, '06-results.png');
await A.page.evaluate(() => (document.querySelector('#sheet-results').scrollTop = 520));
await A.page.waitForTimeout(400);
await shot(A, '06b-results-scrolled.png');
await A.page.evaluate(() => (document.querySelector('#sheet-results').scrollTop = 0));
const res = await A.page.evaluate(() => ({ moves: document.querySelector('[data-testid=moves]').textContent, row: document.querySelector('[data-testid=row]').textContent, pct: document.querySelector('[data-testid=pct]').textContent, badge: document.querySelector('[data-testid=badge]').textContent, fps: window.__unstir.fps }));
log('results', res);
await A.page.click('[data-testid=share]');
await A.page.waitForTimeout(250);
const share = await A.page.textContent('[data-testid=share-preview]');
log('share text', share);
assert(/^UNSTIR #\d+/.test(share) && /#c=/.test(share), 'share text has title + challenge link');
assert(!/0\.\d{2}/.test(share.replace(/https?:\S+/, '')), 'share text leaks no coordinates');
assert(!share.includes(info.scene), 'share text does not name the picture');
await A.page.click('[data-testid=challenge]');
await A.page.fill('[data-testid=name]', 'Thomas');
await A.page.click('[data-testid=challenge]');
await A.page.waitForTimeout(250);
const chText = await A.page.textContent('[data-testid=share-preview]');
const chLink = chText.match(/#c=[\w-]+/)[0];
log('challenge text', chText);

// Replay ("watch how it was stirred")
await A.page.click('[data-testid=replay]');
await A.page.waitForTimeout(1900);
await shot(A, '09-replay.png');
await A.page.waitForSelector('#sheet-results.open', { timeout: 15000 });

// Persistence: reload -> still solved, streak 1.
await A.page.goto(FILE);
await A.page.waitForFunction(() => !!window.__unstir);
await A.page.waitForTimeout(400);
const after = await A.page.evaluate(() => ({ mode: window.__unstir.mode, store: JSON.parse(localStorage.getItem('unstir:v1')) }));
assert(after.mode === 'won', 'result persists across reload');
assert(Object.keys(after.store.results).length === 1, 'one result stored');
await A.page.waitForSelector('#sheet-results.open', { timeout: 5000 });
await A.page.click('#sheet-results [data-close]');
await A.page.click('[data-testid=stats-btn]');
await A.page.waitForTimeout(500);
const streak = await A.page.evaluate(() => document.querySelector('#sheet-stats .statgrid div:nth-child(3) b').textContent);
assert(streak === '1', 'streak = 1');
await A.page.click('#sheet-stats [data-archive]');
await A.page.waitForTimeout(500);
assert(await A.page.isVisible('[data-testid=paywall]'), 'archive is behind the UNSTIR+ flag');
await shot(A, '10-archive.png');

// ============================================================ Player B: opens the challenge link
const B = await player('B', FILE + chLink);
await B.page.waitForTimeout(600);
const banner = await B.page.textContent('[data-testid=challenge-banner]');
log('friend banner', banner);
assert(/Thomas/.test(banner), 'challenge banner names the sender');
await shot(B, '07-challenge.png');
for (let guard = 0; guard < 10; guard++) {
  const P = await plan(B);
  if (!P.st.length) break;
  const i = P.lock.lastIndexOf(true);
  await stir(B, P.eyes[i], P.st[i].r, -P.st[i].s / P.gain);
  if ((await state(B)).mode !== 'playing') break;
}
await B.page.waitForSelector('#sheet-results.open', { timeout: 8000 });
await B.page.waitForTimeout(800);
const vs = await B.page.textContent('[data-testid=vs]');
log('friend vs card', vs.replace(/\s+/g, ' '));
assert(/You win|wins this one|Dead heat/.test(vs), 'friend sees the head-to-head verdict');
await B.page.evaluate(() => { const el = document.querySelector('[data-testid=vs]'); document.querySelector('#sheet-results').scrollTop = el.offsetTop - 80; });
await B.page.waitForTimeout(300);
await shot(B, '08-vs.png');

// ============================================================ Video: a full play captured as frames (CDP screencast) -> ffmpeg
const V = await player('V', FILE + '?reset');
const frameDir = resolve(SHOTS, 'frames');
rmSync(frameDir, { recursive: true, force: true });
mkdirSync(frameDir, { recursive: true });
const frames = [];
V.cdp.on('Page.screencastFrame', async (f) => { frames.push({ data: f.data, t: f.metadata.timestamp }); try { await V.cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch {} });
await V.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: 780, maxHeight: 1688, everyNthFrame: 1 });
await V.page.waitForTimeout(1800);
{ const P = await plan(V); const b = P.lock.findIndex((l) => !l); if (b >= 0) await stir(V, P.eyes[b], P.st[b].r, -P.st[b].s / P.gain); }
await V.page.waitForTimeout(500);
for (let guard = 0; guard < 10; guard++) {
  const P = await plan(V);
  if (!P.st.length) break;
  const i = P.lock.lastIndexOf(true);
  await stir(V, P.eyes[i], P.st[i].r, -P.st[i].s / P.gain);
  await V.page.waitForTimeout(350);
  if ((await state(V)).mode !== 'playing') break;
}
await V.page.waitForTimeout(3400);
await V.cdp.send('Page.stopScreencast');
// Resample to constant 30 fps using frame timestamps.
const T0 = frames[0].t, T1 = frames[frames.length - 1].t;
let k = 0;
for (let t = T0, out = 0; t <= T1; t += 1 / 30, out++) {
  while (k + 1 < frames.length && frames[k + 1].t <= t) k++;
  writeFileSync(`${frameDir}/${String(out).padStart(5, '0')}.jpg`, Buffer.from(frames[k].data, 'base64'));
}
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', `${frameDir}/%05d.jpg`, '-vf', 'scale=390:-2', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-crf', '24', `${SHOTS}/play.mp4`]);
log('video', { rawFrames: frames.length, seconds: +(T1 - T0).toFixed(1), out: 'shots/play.mp4', resampledFrames: readdirSync(frameDir).length });
rmSync(frameDir, { recursive: true, force: true });

report.firstTouchMs = firstTouchMs;
writeFileSync(`${SHOTS}/e2e.json`, JSON.stringify(report, null, 1));
console.log(`\n${report.asserts - report.failed}/${report.asserts} assertions passed; errors: ${report.errors.length}`);
report.errors.forEach((e) => console.log('  !', e));
await browser.close();
process.exit(report.failed || report.errors.length ? 1 : 0);
