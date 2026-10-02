import { puzzleFor, optimalOrder, Puzzle } from '../core/puzzle';
import { puzzleNumberFor, formatPuzzleDate, msUntilLocalMidnight, formatCountdown } from '../core/date';
import { Twist } from '../core/twist';
import { TOL, inverse, Verdict } from '../core/rules';
import { crowdFor, percentile } from '../core/crowd';
import { shareText, GLYPH, fmtTime, badge } from '../core/share';
import { encodeChallenge, decodeChallenge, Challenge } from '../core/challenge';
import { computeStats } from '../core/stats';
import { createRenderer, Renderer } from '../game/renderer';
import { drawScene } from '../game/scenes';
import { Session } from '../game/session';
import * as sfx from '../game/audio';
import { buzz, setHaptics } from '../game/haptics';
import { load, save, reset } from '../state/storage';
import { CONFIG, baseUrl } from '../config';
import { copyText, nativeShare } from './clipboard';

const GAIN = 1.6; // twist radians per radian of thumb travel
const SIZE_K = 1.45; // whirlpool radius = smoothed thumb distance from the eye x SIZE_K
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

type Mode = 'playing' | 'won' | 'lost' | 'replay';
interface Fx { x: number; y: number; r: number; t0: number; dur: number; color: string; kind: 'ripple' | 'flash' | 'spark'; a?: number }

export function startApp() {
  const params = new URLSearchParams(location.search);
  if (params.has('reset')) reset();
  const store = load();
  sfx.setSound(store.sound);
  setHaptics(store.haptics);
  const today = puzzleNumberFor();
  const hashC = location.hash.match(/c=([\w-]+)/)?.[1];
  let challenge: Challenge | null = hashC ? decodeChallenge(hashC) : null;
  if (challenge && (challenge.n < 1 || challenge.n > today)) challenge = null;
  const debugN = params.has('debug') && params.get('n') ? Number(params.get('n')) : 0;

  const gl = $<HTMLCanvasElement>('#gl');
  const ov = $<HTMLCanvasElement>('#ov');
  const octx = ov.getContext('2d')!;
  const renderer: Renderer = createRenderer(gl);
  const pic = document.createElement('canvas');
  pic.width = pic.height = 1024;

  let css = 340;
  let dpr = 1;
  function layout() {
    const vh = window.innerHeight;
    css = Math.floor(Math.min(window.innerWidth - 24 - 18, 430, vh * 0.52));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.resize(css, dpr);
    ov.width = ov.height = Math.round(css * dpr);
    ov.style.width = ov.style.height = css + 'px';
    dirty = true;
  }

  let p: Puzzle;
  let session: Session;
  let mode: Mode = 'playing';
  let preview: Twist | null = null;
  let anim: null | { kind: 'snap' | 'spring'; from: Twist; to: Twist; base: Twist[]; t0: number; dur: number; done: () => void } = null;
  let replay: null | { t0: number; segs: { kind: 'stir' | 'unstir' | 'hold'; i: number; dur: number }[]; total: number; done: () => void } = null;
  const fx: Fx[] = [];
  let dirty = true;
  let glow = 0;
  let ghostT0 = 0;
  let lastVerdict: Verdict | null = null;
  const log: { v: string; u: Twist }[] = [];

  // ------------------------------------------------------------------ puzzle lifecycle
  function loadPuzzle(n: number) {
    p = puzzleFor(n);
    session = new Session(p);
    const prog = store.progress;
    const done = store.results[n];
    if (done) {
      p.twists.forEach((_, i) => session.removed.add(i));
      session.row = done.row;
      session.finishedSecs = done.secs || 1;
      if (!done.solved) session.removed.clear();
    } else if (prog && prog.n === n) {
      prog.removed.forEach((i) => session.removed.add(i));
      session.row = prog.row;
      session.elapsedBefore = prog.elapsed;
    }
    drawScene(pic.getContext('2d')!, p.scene, p.palette, 1024);
    renderer.setPicture(pic);
    $('[data-testid=sub]').textContent = `#${n} · ${formatPuzzleDate(n)} · ${p.tier.name}`;
    $('[data-testid=title-card]').classList.add('hidden');
    $('#frame').classList.remove('win');
    glow = 0;
    preview = null;
    mode = done ? (done.solved ? 'won' : 'lost') : 'playing';
    if (mode === 'lost') session.removed.clear();
    if (mode !== 'playing') {
      showTitle();
      $('[data-testid=cta-results]').classList.remove('hidden');
      setTimeout(() => openSheet('results'), 650);
    } else $('[data-testid=cta-results]').classList.add('hidden');
    ghostT0 = !store.seenHint && mode === 'playing' ? performance.now() + 1400 : 0;
    renderBanner();
    updateTracker();
    caption();
    dirty = true;
  }

  function persist() {
    if (mode !== 'playing') return;
    store.progress = { n: p.n, removed: [...session.removed], row: session.row, startedAt: session.startedAt, elapsed: session.secs() * 1000 };
    save();
  }

  function finish() {
    const solved = session.status === 'won';
    mode = solved ? 'won' : 'lost';
    if (!store.results[p.n]) store.results[p.n] = { row: session.row, solved, secs: Math.round(session.secs()), par: p.par, at: Date.now() };
    if (store.progress?.n === p.n) delete store.progress;
    save();
    if (solved) {
      sfx.fanfare();
      buzz([20, 60, 20, 60, 40]);
      const f = $('#frame');
      f.classList.remove('win');
      void f.offsetWidth;
      f.classList.add('win');
      const t0 = performance.now();
      const pulse = () => {
        const t = (performance.now() - t0) / 1400;
        glow = t < 0.25 ? t / 0.25 : Math.max(0, 1 - (t - 0.25) / 0.75);
        dirty = true;
        if (t < 1) requestAnimationFrame(pulse);
      };
      pulse();
      for (let i = 0; i < 26; i++) fx.push({ kind: 'spark', x: 0.5, y: 0.5, r: 0.15 + Math.random() * 0.45, a: Math.random() * Math.PI * 2, t0: performance.now() + Math.random() * 200, dur: 900 + Math.random() * 500, color: ['#ffc94a', '#ff6b57', '#2ec4b6', '#fff8ec'][i % 4] });
      showTitle();
      setTimeout(() => openSheet('results'), 1700);
    } else {
      sfx.bloop();
      toast('The water settled. Here is how it was stirred…', 'M');
      setTimeout(() => runReplay(() => openSheet('results'), true), 900);
    }
    $('[data-testid=cta-results]').classList.remove('hidden');
    updateTracker();
    caption();
  }

  function showTitle() {
    const tc = $('[data-testid=title-card]');
    tc.querySelector('small')!.textContent = mode === 'won' ? 'UNSTIRRED' : 'TODAY’S PICTURE';
    tc.querySelector('b')!.textContent = p.sceneName;
    tc.classList.remove('hidden');
  }

  // ------------------------------------------------------------------ input
  let g: null | { id: number; ex: number; ey: number; acc: number; last: number; d: number; maxS: number; started: boolean; lastT: number; nextTick: number } = null;
  const norm = (e: PointerEvent): [number, number] => {
    const r = ov.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };
  ov.addEventListener('pointerdown', (e) => {
    sfx.unlockAudio();
    if (mode !== 'playing' || anim || g) return;
    e.preventDefault();
    ov.setPointerCapture(e.pointerId);
    const [x, y] = norm(e);
    session.startClock();
    if (!store.seenHint) {
      store.seenHint = true;
      save();
    }
    ghostT0 = 0;
    g = { id: e.pointerId, ex: x, ey: y, acc: 0, last: NaN, d: 0, maxS: 0, started: false, lastT: performance.now(), nextTick: 0.5 };
    fx.push({ kind: 'ripple', x, y, r: 0.05, t0: performance.now(), dur: 380, color: 'rgba(255,255,255,0.8)' });
    dirty = true;
  });
  ov.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.id) return;
    const [x, y] = norm(e);
    const dx = x - g.ex;
    const dy = y - g.ey;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.035) return;
    const a = Math.atan2(dy, dx);
    const now = performance.now();
    if (!isNaN(g.last)) {
      let d = a - g.last;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      g.acc += d;
      const speed = d / Math.max(0.008, (now - g.lastT) / 1000);
      sfx.swish(speed, g.acc * GAIN);
    }
    g.d = g.started ? g.d * 0.82 + dist * 0.18 : dist;
    g.started = true;
    g.last = a;
    g.lastT = now;
    const s = g.acc * GAIN;
    g.maxS = Math.max(g.maxS, Math.abs(s));
    if (Math.abs(s) > g.nextTick) {
      g.nextTick += 0.5;
      buzz(4);
    }
    preview = { x: g.ex, y: g.ey, r: Math.min(0.55, Math.max(0.12, g.d * SIZE_K)), s };
    dirty = true;
  });
  const up = (e: PointerEvent) => {
    if (!g || e.pointerId !== g.id) return;
    const gg = g;
    g = null;
    sfx.swishStop();
    if (!gg.started || gg.maxS < TOL.minStir || !preview) {
      preview = null;
      if (!gg.started) toast('Press on an eye, then circle your thumb around it', 'M');
      dirty = true;
      return;
    }
    commit(preview);
  };
  ov.addEventListener('pointerup', up);
  ov.addEventListener('pointercancel', up);

  function commit(u: Twist) {
    const base = session.stack;
    const { v, scrambleIndex } = session.apply(u);
    lastVerdict = v;
    log.push({ v: v.kind, u });
    persist();
    updateTracker();
    const t0 = performance.now();
    if (v.kind === 'lock') {
      const target = p.twists[scrambleIndex];
      anim = {
        kind: 'snap', from: u, to: inverse(target), base, t0, dur: 210,
        done: () => {
          preview = null;
          anim = null;
          fx.push({ kind: 'flash', x: target.x, y: target.y, r: target.r, t0: performance.now(), dur: 520, color: '255,248,236' });
          fx.push({ kind: 'ripple', x: target.x, y: target.y, r: target.r * 1.1, t0: performance.now(), dur: 700, color: 'rgba(255,201,74,0.95)' });
          fx.push({ kind: 'ripple', x: target.x, y: target.y, r: target.r * 1.5, t0: performance.now() + 90, dur: 800, color: 'rgba(255,201,74,0.5)' });
          sfx.chime(session.locks - 1);
          buzz(18);
          if (session.status !== 'playing') finish();
        },
      };
      toast(session.status === 'won' ? 'Unstirred!' : ['Clean.', 'Click.', 'There it is.', 'Smooth.', 'Untwisted.'][(session.locks - 1) % 5], 'L');
    } else {
      anim = { kind: 'spring', from: u, to: { ...u, s: 0 }, base, t0, dur: 420, done: () => { preview = null; anim = null; if (session.status !== 'playing') finish(); } };
      const f = $('#frame');
      f.classList.remove('shake', 'wobble');
      void f.offsetWidth;
      if (v.kind === 'close') {
        sfx.nearly();
        buzz([8, 40, 8]);
        const hints: Record<string, string> = { eye: 'Right whirlpool — find its exact eye', more: 'Right whirlpool — twist further', less: 'Right whirlpool — not so far', wider: 'Right whirlpool — stir wider', tighter: 'Right whirlpool — stir tighter', direction: 'Right whirlpool — other way round!' };
        toast(hints[v.hint], 'C');
        fx.push({ kind: 'ripple', x: u.x, y: u.y, r: 0.12, t0, dur: 500, color: 'rgba(255,154,60,0.9)' });
      } else if (v.kind === 'buried') {
        sfx.bloop();
        buzz(30);
        f.classList.add('wobble');
        toast('That whirlpool is buried under another one', 'B');
        fx.push({ kind: 'ripple', x: u.x, y: u.y, r: 0.12, t0, dur: 600, color: 'rgba(255,216,74,0.9)' });
      } else {
        sfx.thud();
        buzz(12);
        f.classList.add('shake');
        toast('Nothing was stirred there', 'M');
      }
    }
    caption();
  }

  // ------------------------------------------------------------------ replay: how it was stirred, then the optimal unstir
  function runReplay(done: () => void, fromCurrent = false) {
    const k = p.twists.length;
    const segs: { kind: 'stir' | 'unstir' | 'hold'; i: number; dur: number }[] = [];
    if (!fromCurrent) {
      segs.push({ kind: 'hold', i: -1, dur: 350 });
      for (let i = 0; i < k; i++) segs.push({ kind: 'stir', i, dur: 750 });
      segs.push({ kind: 'hold', i: -2, dur: 500 });
    }
    for (const i of optimalOrder(p.twists)) if (!session.removed.has(i) || !fromCurrent) segs.push({ kind: 'unstir', i, dur: 800 });
    segs.push({ kind: 'hold', i: -3, dur: 450 });
    mode = mode === 'replay' ? mode : mode;
    const prevMode = mode;
    mode = 'replay';
    replay = { t0: performance.now(), segs, total: segs.reduce((a, s) => a + s.dur, 0), done: () => { replay = null; mode = prevMode === 'replay' ? 'won' : prevMode; dirty = true; done(); } };
    $('[data-testid=title-card]').classList.add('hidden');
  }
  function replayFrame(now: number): { list: Twist[]; marks: { x: number; y: number; label: string; a: number }[] } {
    const r = replay!;
    let t = now - r.t0;
    const removed = new Set<number>();
    let stirred = 0;
    let fromCurrent = !r.segs.some((s) => s.kind === 'stir');
    if (fromCurrent) {
      stirred = p.twists.length;
      session.removed.forEach((i) => removed.add(i));
    }
    const marks: { x: number; y: number; label: string; a: number }[] = [];
    let partial: { i: number; e: number; kind: string } | null = null;
    let undoCount = 0;
    for (const s of r.segs) {
      if (t >= s.dur) {
        t -= s.dur;
        if (s.kind === 'stir') stirred = s.i + 1;
        if (s.kind === 'unstir') { removed.add(s.i); undoCount++; }
        continue;
      }
      if (s.kind !== 'hold') partial = { i: s.i, e: ease(t / s.dur), kind: s.kind };
      break;
    }
    const list: Twist[] = [];
    for (let i = 0; i < p.twists.length; i++) {
      const tw = p.twists[i];
      if (removed.has(i)) continue;
      if (partial && partial.i === i) {
        const e = partial.kind === 'stir' ? partial.e : 1 - partial.e;
        list.push({ ...tw, s: tw.s * e });
        marks.push({ x: tw.x, y: tw.y, label: partial.kind === 'stir' ? `${i + 1}` : `undo ${undoCount + 1}`, a: 1 });
        continue;
      }
      if (i < stirred) list.push(tw);
    }
    return { list, marks };
  }

  // ------------------------------------------------------------------ frame loop
  let frames = 0;
  let fpsT = performance.now();
  let fps = 60;
  function frame(now: number) {
    frames++;
    if (now - fpsT > 1000) {
      fps = (frames * 1000) / (now - fpsT);
      frames = 0;
      fpsT = now;
    }
    let list: Twist[];
    let marks: { x: number; y: number; label: string; a: number }[] = [];
    if (replay) {
      const rf = replayFrame(now);
      list = rf.list;
      marks = rf.marks;
      if (now - replay.t0 >= replay.total) replay.done();
    } else if (anim) {
      const e = anim.kind === 'snap' ? ease((now - anim.t0) / anim.dur) : springE((now - anim.t0) / anim.dur);
      const a = anim.from;
      const b = anim.to;
      list = [...anim.base, { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, r: a.r + (b.r - a.r) * e, s: a.s + (b.s - a.s) * e }];
      if (now - anim.t0 >= anim.dur) anim.done();
    } else {
      list = mode === 'won' || mode === 'lost' ? [] : session.stack;
      if (preview) list = [...list, preview];
    }
    renderer.draw(list, glow);
    drawOverlay(now, marks);
    requestAnimationFrame(frame);
  }
  const springE = (t: number) => (t >= 1 ? 1 : 1 - Math.cos(t * Math.PI * 2.5) * Math.exp(-5 * t));

  function drawOverlay(now: number, marks: { x: number; y: number; label: string; a: number }[]) {
    const W = ov.width;
    octx.clearRect(0, 0, W, W);
    if (g && preview) {
      const x = preview.x * W, y = preview.y * W, R = preview.r * W;
      octx.lineWidth = 1.5 * dpr;
      octx.setLineDash([5 * dpr, 6 * dpr]);
      octx.strokeStyle = 'rgba(255,248,236,0.65)';
      octx.beginPath();
      octx.arc(x, y, R, 0, Math.PI * 2);
      octx.stroke();
      octx.setLineDash([]);
      // swept arc
      const amt = Math.min(Math.abs(preview.s) / 6, 0.98) * Math.PI * 2;
      octx.lineWidth = 4 * dpr;
      octx.lineCap = 'round';
      octx.strokeStyle = 'rgba(255,201,74,0.95)';
      octx.beginPath();
      octx.arc(x, y, R + 7 * dpr, -Math.PI / 2, -Math.PI / 2 + Math.sign(preview.s) * amt, preview.s < 0);
      octx.stroke();
    }
    if (g || (anim && anim.kind === 'snap')) {
      const ex = (g ? g.ex : anim!.from.x) * W, ey = (g ? g.ey : anim!.from.y) * W;
      octx.fillStyle = 'rgba(17,18,42,0.55)';
      octx.beginPath();
      octx.arc(ex, ey, 7 * dpr, 0, Math.PI * 2);
      octx.fill();
      octx.strokeStyle = '#fff8ec';
      octx.lineWidth = 2 * dpr;
      octx.beginPath();
      octx.arc(ex, ey, 7 * dpr, 0, Math.PI * 2);
      octx.stroke();
      octx.fillStyle = '#ffc94a';
      octx.beginPath();
      octx.arc(ex, ey, 2.4 * dpr, 0, Math.PI * 2);
      octx.fill();
    }
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      const t = (now - f.t0) / f.dur;
      if (t < 0) continue;
      if (t >= 1) { fx.splice(i, 1); continue; }
      if (f.kind === 'ripple') {
        octx.strokeStyle = f.color;
        octx.globalAlpha = 1 - t;
        octx.lineWidth = (3 - 2 * t) * dpr;
        octx.beginPath();
        octx.arc(f.x * W, f.y * W, f.r * W * (0.4 + 0.6 * ease(t)), 0, Math.PI * 2);
        octx.stroke();
        octx.globalAlpha = 1;
      } else if (f.kind === 'flash') {
        const gr = octx.createRadialGradient(f.x * W, f.y * W, 0, f.x * W, f.y * W, f.r * W);
        gr.addColorStop(0, `rgba(${f.color},${0.55 * (1 - t)})`);
        gr.addColorStop(1, `rgba(${f.color},0)`);
        octx.fillStyle = gr;
        octx.beginPath();
        octx.arc(f.x * W, f.y * W, f.r * W, 0, Math.PI * 2);
        octx.fill();
      } else {
        const d = f.r * ease(t) * W;
        const sx = f.x * W + Math.cos(f.a! + t * 2) * d, sy = f.y * W + Math.sin(f.a! + t * 2) * d;
        octx.fillStyle = f.color;
        octx.globalAlpha = 1 - t;
        octx.beginPath();
        octx.arc(sx, sy, (4 - 3 * t) * dpr, 0, Math.PI * 2);
        octx.fill();
        octx.globalAlpha = 1;
      }
    }
    for (const m of marks) {
      const x = m.x * W, y = m.y * W;
      octx.fillStyle = 'rgba(17,18,42,0.8)';
      octx.font = `700 ${12 * dpr}px Unbounded, system-ui`;
      const w = octx.measureText(m.label).width + 14 * dpr;
      octx.beginPath();
      octx.roundRect(x - w / 2, y - 26 * dpr, w, 20 * dpr, 10 * dpr);
      octx.fill();
      octx.fillStyle = '#ffc94a';
      octx.textAlign = 'center';
      octx.textBaseline = 'middle';
      octx.fillText(m.label, x, y - 16 * dpr);
      octx.strokeStyle = '#ffc94a';
      octx.lineWidth = 2 * dpr;
      octx.beginPath();
      octx.arc(x, y, 5 * dpr, 0, Math.PI * 2);
      octx.stroke();
    }
    if (ghostT0 && now > ghostT0 && mode === 'playing') {
      // A ghost thumb demonstrates "press, then circle" in the middle of the board (not on an actual eye).
      const t = ((now - ghostT0) / 2400) % 1;
      const cx = 0.5 * W, cy = 0.5 * W;
      const press = Math.min(1, t * 6);
      const ang = -Math.PI / 2 + Math.max(0, t - 0.2) * 1.25 * Math.PI * 2;
      const rr = 0.13 * W * Math.min(1, Math.max(0, (t - 0.12) * 8));
      octx.globalAlpha = 0.85 * Math.sin(Math.PI * Math.min(1, t * 1.05));
      octx.strokeStyle = 'rgba(255,248,236,0.9)';
      octx.lineWidth = 2 * dpr;
      octx.setLineDash([4 * dpr, 5 * dpr]);
      octx.beginPath();
      octx.arc(cx, cy, 0.13 * W, 0, Math.PI * 2);
      octx.stroke();
      octx.setLineDash([]);
      octx.fillStyle = 'rgba(255,248,236,0.9)';
      octx.beginPath();
      octx.arc(cx, cy, 4 * dpr * press, 0, Math.PI * 2);
      octx.fill();
      octx.fillStyle = 'rgba(255,248,236,0.35)';
      octx.beginPath();
      octx.arc(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr, 17 * dpr, 0, Math.PI * 2);
      octx.fill();
      octx.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------------------ HUD
  function updateTracker() {
    const pips = $('[data-testid=pips]');
    pips.innerHTML = '';
    for (let i = 0; i < p.par; i++) {
      const d = document.createElement('div');
      d.className = 'pip' + (i < session.locks ? ' on' : '');
      pips.appendChild(d);
    }
    for (const c of session.row) if (c !== 'L') {
      const d = document.createElement('div');
      d.className = 'chip ' + c;
      pips.appendChild(d);
    }
    const used = session.row.length;
    $('[data-testid=count]').innerHTML = `${used} <small>TWIST${used === 1 ? '' : 'S'} · PAR ${p.par}</small>`;
  }
  function caption() {
    const c = $('[data-testid=caption]');
    const left = p.twists.length - session.locks;
    if (mode === 'won') c.innerHTML = `Unstirred in <b>${session.row.length}</b> twists.`;
    else if (mode === 'lost') c.innerHTML = 'Out of twists — the water settled.';
    else if (session.row.length === 0) c.innerHTML = 'Hidden whirlpools stirred this picture. <b>Press a whirlpool’s eye and circle your thumb</b> to untwist it.';
    else c.innerHTML = `<b>${left}</b> whirlpool${left === 1 ? '' : 's'} left · ${p.maxTwists - session.row.length} twists in hand`;
  }
  let toastTimer = 0;
  function toast(msg: string, cls: string) {
    const t = $('[data-testid=toast]');
    t.textContent = msg;
    t.className = `toast show ${cls}`;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => t.classList.remove('show'), 2200);
  }
  function renderBanner() {
    const b = $('[data-testid=challenge-banner]');
    if (!challenge || challenge.n !== p.n) return b.classList.add('hidden');
    const who = esc(challenge.by || 'A friend');
    b.innerHTML = challenge.solved
      ? `🌀 <b>${who}</b> unstirred #${challenge.n} in <b>${challenge.row.length}</b> twists. Can you beat that?`
      : `🌀 <b>${who}</b> couldn’t unstir #${challenge.n}. Can you?`;
    b.classList.remove('hidden');
  }

  // ------------------------------------------------------------------ sheets
  const sheets = ['results', 'stats', 'help', 'archive'] as const;
  type SheetName = (typeof sheets)[number];
  function openSheet(name: SheetName) {
    if (name === 'results') renderResults();
    if (name === 'stats') renderStats();
    if (name === 'help') renderHelp();
    if (name === 'archive') renderArchive();
    for (const s of sheets) {
      const el = $(`#sheet-${s}`);
      el.classList.toggle('open', s === name);
      el.setAttribute('aria-hidden', String(s !== name));
    }
    $('#scrim').classList.remove('hidden');
  }
  function closeSheets() {
    for (const s of sheets) $(`#sheet-${s}`).classList.remove('open');
    $('#scrim').classList.add('hidden');
  }
  $('#scrim').addEventListener('click', closeSheets);
  $('#btn-help').addEventListener('click', () => openSheet('help'));
  $('#btn-stats').addEventListener('click', () => openSheet('stats'));
  $('#btn-results').addEventListener('click', () => openSheet('results'));

  function statsBlock(): string {
    const st = computeStats(store.results, today);
    const max = Math.max(1, ...st.dist);
    const labels = ['par', '+1', '+2', '+3', '+4', '+5', '+6', '✕'];
    const res = store.results[p.n];
    const mine = res ? (res.solved ? Math.min(6, res.row.length - res.par) : 7) : -1;
    return `<div class="card"><h3>Your stats</h3>
      <div class="statgrid"><div><b>${st.played}</b><small>Played</small></div><div><b>${st.played ? Math.round((st.solved / st.played) * 100) : 0}</b><small>Solved %</small></div><div><b>${st.streak}</b><small>Streak</small></div><div><b>${st.maxStreak}</b><small>Best</small></div></div>
      <div class="hist" style="margin-top:12px">${st.dist.map((v, i) => `<div class="bar${i === mine ? ' me' : ''}"><span>${labels[i]}</span><i style="width:${(v / max) * 100}%"></i><span>${v}</span></div>`).join('')}</div></div>`;
  }
  function renderResults() {
    const el = $('#sheet-results');
    const res = store.results[p.n];
    const solved = res ? res.solved : session.status === 'won';
    const row = res ? res.row : session.row;
    const secs = res ? res.secs : session.secs();
    const crowd = crowdFor(p);
    const pct = percentile(crowd, p.par, row.length, solved);
    const labels = ['par', '+1', '+2', '+3', '+4', '+5', '+6', '✕'];
    const mine = solved ? Math.min(6, row.length - p.par) : 7;
    const max = Math.max(...crowd.hist);
    const streak = computeStats(store.results, today).streak;
    let vs = '';
    if (challenge && challenge.n === p.n) {
      const me = solved ? row.length : 99, them = challenge.solved ? challenge.row.length : 99;
      const verdict = me < them ? 'You win! 🏆' : me > them ? `${esc(challenge.by || 'They')} wins this one` : 'Dead heat 🤝';
      vs = `<div class="card" data-testid="vs"><h3>Challenge</h3><div class="vs"><div><b>${solved ? row.length : '✕'}</b><small>You</small><div class="r">${[...row].map((c) => GLYPH[c]).join('')}</div></div><div>vs</div><div><b>${challenge.solved ? challenge.row.length : '✕'}</b><small>${esc(challenge.by || 'Friend')}</small><div class="r">${[...challenge.row].map((c) => GLYPH[c]).join('')}</div></div></div><p class="big-line" style="text-align:center;margin:10px 0 0"><b>${verdict}</b></p></div>`;
    }
    el.innerHTML = `<div class="grab"></div><button class="icon x" data-close>✕</button>
      <div class="kicker">${solved ? 'UNSTIRRED' : 'STILL STIRRED'} · #${p.n} · ${p.tier.name.toUpperCase()}</div>
      <div class="pic-title">${p.sceneName}</div>
      <div class="score"><div><b data-testid="moves">${solved ? row.length : '✕'}</b><small>Twists</small></div><div><b>${p.par}</b><small>Par</small></div><div><b>${fmtTime(secs)}</b><small>Time</small></div></div>
      <span class="badge" data-testid="badge">${badge(row.length, p.par, solved)}</span>
      <div class="row" data-testid="row">${[...row].map((c) => GLYPH[c]).join('')}</div>
      <div class="actions"><button class="btn primary" data-testid="share">Share</button><button class="btn ghost" data-testid="challenge">Challenge</button></div>
      <input class="name-in hidden" data-testid="name" maxlength="16" placeholder="Your name (shown to your friend)" value="${esc(store.name)}" />
      <pre class="hidden" data-testid="share-preview"></pre>
      ${vs}
      <div class="card" data-testid="crowd"><h3>Today’s players <span style="opacity:.6">(est.)</span></h3>
        <p class="big-line">You did better than <b data-testid="pct">${pct}%</b> of players.</p>
        <div class="hist">${crowd.hist.map((v, i) => `<div class="bar${i === mine ? ' me' : ''}"><span>${labels[i]}</span><i style="width:${(v / max) * 100}%;animation-delay:${i * 60}ms"></i><span>${Math.round((v / crowd.n) * 100)}%</span></div>`).join('')}</div></div>
      <button class="btn ghost wide" data-testid="replay">▶ Watch how it was stirred</button>
      ${statsBlock()}
      <div class="countdown">Next picture in <b data-testid="countdown">${formatCountdown(msUntilLocalMidnight())}</b></div>
      ${CONFIG.features.ads && !store.plus ? '<div class="ad-slot" data-testid="ad-slot">Advertisement</div>' : ''}
      ${CONFIG.features.premium ? `<div class="card plus" data-testid="plus"><b>UNSTIR+</b> · every past picture, unlimited practice storms, no ads. <button class="btn ghost" style="margin-top:10px;width:100%" data-archive>Open the archive</button></div>` : ''}
      <div class="foot">streak ${streak} · made with whirlpools</div>`;
    el.querySelector('[data-close]')!.addEventListener('click', closeSheets);
    el.querySelector('[data-archive]')?.addEventListener('click', () => openSheet('archive'));
    el.querySelector('[data-testid=replay]')!.addEventListener('click', () => {
      closeSheets();
      setTimeout(() => runReplay(() => { showTitle(); setTimeout(() => openSheet('results'), 500); }), 350);
    });
    const link = () => {
      const code = encodeChallenge({ n: p.n, row, solved, secs, by: store.name });
      return `${baseUrl()}#c=${code}`;
    };
    el.querySelector('[data-testid=share]')!.addEventListener('click', async () => {
      const text = shareText(p, row, solved, secs, link(), streak);
      el.querySelector('[data-testid=share-preview]')!.textContent = text;
      const r = await nativeShare(text);
      if (r === false) toast((await copyText(text)) ? 'Result copied — paste it anywhere' : 'Copy failed', 'L');
    });
    const nameIn = el.querySelector('[data-testid=name]') as HTMLInputElement;
    el.querySelector('[data-testid=challenge]')!.addEventListener('click', async () => {
      if (nameIn.classList.contains('hidden') && !store.name) {
        nameIn.classList.remove('hidden');
        nameIn.focus();
        return;
      }
      store.name = nameIn.value.trim().slice(0, 16);
      save();
      const text = `I unstirred UNSTIR #${p.n} in ${solved ? row.length : 'X'} twists (par ${p.par}). Your turn 🌀\n${link()}`;
      el.querySelector('[data-testid=share-preview]')!.textContent = text;
      const r = await nativeShare(text);
      if (r === false) toast((await copyText(text)) ? 'Challenge link copied' : 'Copy failed', 'L');
    });
    nameIn.addEventListener('change', () => { store.name = nameIn.value.trim().slice(0, 16); save(); });
    const cd = el.querySelector('[data-testid=countdown]')!;
    const iv = setInterval(() => { if (!el.classList.contains('open')) return clearInterval(iv); cd.textContent = formatCountdown(msUntilLocalMidnight()); }, 1000);
  }
  function renderStats() {
    const el = $('#sheet-stats');
    el.innerHTML = `<div class="grab"></div><button class="icon x" data-close>✕</button><div class="kicker">STATS</div>${statsBlock()}
      <div class="card"><div class="toggle"><span>Sound</span><button class="switch ${store.sound ? 'on' : ''}" data-t="sound"></button></div>
      <div class="toggle"><span>Haptics</span><button class="switch ${store.haptics ? 'on' : ''}" data-t="haptics"></button></div></div>
      ${CONFIG.features.premium ? '<button class="btn ghost wide" data-archive>Archive</button>' : ''}`;
    el.querySelector('[data-close]')!.addEventListener('click', closeSheets);
    el.querySelector('[data-archive]')?.addEventListener('click', () => openSheet('archive'));
    el.querySelectorAll<HTMLButtonElement>('[data-t]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.t as 'sound' | 'haptics';
      store[k] = !store[k];
      save();
      b.classList.toggle('on', store[k]);
      sfx.setSound(store.sound);
      setHaptics(store.haptics);
    }));
  }
  function renderHelp() {
    const el = $('#sheet-help');
    el.innerHTML = `<div class="grab"></div><button class="icon x" data-close>✕</button><div class="kicker">HOW TO PLAY</div>
      <div class="pic-title" style="font-size:24px">Unstir today’s picture</div>
      <ul class="help-list">
        <li><span class="n">1</span><span>Hidden whirlpools stirred the picture, one after another.</span></li>
        <li><span class="n">2</span><span><b>Press a whirlpool’s eye</b>, then <b>circle your thumb</b> against the swirl. Stir wide for big whirlpools, tight for small ones.</span></li>
        <li><span class="n">3</span><span>Get the eye, size and amount right and it <b>snaps clean</b>. Whirlpools lying under another can’t be undone until the top one is gone.</span></li>
        <li><span class="n">4</span><span>Every twist counts. Match par for a flawless day.</span></li>
      </ul>
      <div class="card legend"><span>🌀 unstirred</span><span>🟧 right whirlpool, not quite</span><span>🟨 buried under another</span><span>⬜ nothing there</span></div>
      <p class="caption">A new picture every day at midnight. Monday is a ripple; Sunday is a storm.</p>`;
    el.querySelector('[data-close]')!.addEventListener('click', closeSheets);
  }
  function renderArchive() {
    const el = $('#sheet-archive');
    const unlocked = store.plus || !CONFIG.features.premium;
    const items: string[] = [];
    for (let n = today; n >= Math.max(1, today - 29); n--) {
      const r = store.results[n];
      const pz = puzzleFor(n);
      items.push(`<button data-n="${n}" class="${unlocked || n === today ? '' : 'locked'}">#${n} ${r ? (r.solved ? '🌀' + r.row.length : '✕') : ''}<small>${formatPuzzleDate(n)} · par ${pz.par}</small></button>`);
    }
    el.innerHTML = `<div class="grab"></div><button class="icon x" data-close>✕</button><div class="kicker">ARCHIVE</div>
      ${unlocked ? '' : `<div class="card plus" data-testid="paywall"><b>UNSTIR+</b> unlocks every past picture. <button class="btn primary" style="width:100%;margin-top:10px" data-unlock>Unlock (demo)</button></div>`}
      <div class="arch">${items.join('')}</div>`;
    el.querySelector('[data-close]')!.addEventListener('click', closeSheets);
    el.querySelector('[data-unlock]')?.addEventListener('click', () => { store.plus = true; save(); renderArchive(); });
    el.querySelectorAll<HTMLButtonElement>('[data-n]').forEach((b) => b.addEventListener('click', () => {
      const n = Number(b.dataset.n);
      if (!(unlocked || n === today)) return toast('Past pictures are part of UNSTIR+', 'M');
      closeSheets();
      loadPuzzle(n);
    }));
  }

  // ------------------------------------------------------------------ boot
  layout();
  window.addEventListener('resize', layout);
  loadPuzzle(debugN || challenge?.n || today);
  requestAnimationFrame(frame);

  (window as unknown as { __unstir: unknown }).__unstir = {
    get mode() { return mode; },
    get busy() { return !!anim || !!replay; },
    get puzzle() { return p; },
    get stack() { return session.stack; },
    get row() { return session.row; },
    get lastVerdict() { return lastVerdict; },
    get renderer() { return renderer.kind; },
    get fps() { return fps; },
    get log() { return log; },
    tol: TOL, gain: GAIN, sizeK: SIZE_K,
    rect: () => ov.getBoundingClientRect(),
  };
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
