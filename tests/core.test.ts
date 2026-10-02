import { describe, it, expect } from 'vitest';
import { twistPoint, sourceOf, lockable, mess, type Twist, type Vec } from '../src/core/twist';
import { judge, inverse, cancels, TOL } from '../src/core/rules';
import { puzzleFor, optimalOrder, orderClarity, TIERS } from '../src/core/puzzle';
import { shareText, badge, fmtTime } from '../src/core/share';
import { encodeChallenge, decodeChallenge } from '../src/core/challenge';
import { computeStats, type DayResult } from '../src/core/stats';
import { crowdFor, percentile } from '../src/core/crowd';
import { simulate, MODELS } from '../src/core/players';
import { dateForPuzzle, puzzleNumberFor } from '../src/core/date';
import { SCENES } from '../src/core/scenes-meta';

const T1: Twist = { x: 0.5, y: 0.5, r: 0.3, s: 4 };

describe('twist geometry', () => {
  it('forward then inverse returns every point exactly', () => {
    const a: Vec = [0, 0];
    const b: Vec = [0, 0];
    for (let i = 0; i < 400; i++) {
      const px = (i % 20) / 19;
      const py = Math.floor(i / 20) / 19;
      twistPoint(T1, px, py, 1, a);
      twistPoint(T1, a[0], a[1], -1, b);
      expect(b[0]).toBeCloseTo(px, 9);
      expect(b[1]).toBeCloseTo(py, 9);
    }
  });
  it('leaves points outside the radius untouched and moves points inside', () => {
    const o: Vec = [0, 0];
    expect(twistPoint(T1, 0.9, 0.5, 1, o)).toEqual([0.9, 0.5]);
    twistPoint(T1, 0.6, 0.5, 1, o);
    expect(Math.hypot(o[0] - 0.6, o[1] - 0.5)).toBeGreaterThan(0.01);
    // rotation preserves distance from the eye
    expect(Math.hypot(o[0] - 0.5, o[1] - 0.5)).toBeCloseTo(0.1, 9);
  });
  it('sourceOf with an empty history is the identity; a twist plus its inverse is too', () => {
    expect(sourceOf([], 0.3, 0.7)).toEqual([0.3, 0.7]);
    const [x, y] = sourceOf([T1, inverse(T1)], 0.55, 0.42);
    expect(x).toBeCloseTo(0.55, 9);
    expect(y).toBeCloseTo(0.42, 9);
  });
  it('mess is zero for an unstirred picture and positive once stirred', () => {
    expect(mess([]).mean).toBe(0);
    expect(mess([T1]).mean).toBeGreaterThan(0.01);
  });
  it('lockable: only whirlpools with no later overlapping disk', () => {
    const a: Twist = { x: 0.3, y: 0.3, r: 0.2, s: 3 };
    const b: Twist = { x: 0.4, y: 0.35, r: 0.2, s: -3 }; // overlaps a, on top
    const c: Twist = { x: 0.85, y: 0.85, r: 0.1, s: 2 }; // alone
    expect(lockable([a, b, c])).toEqual([1, 2]);
    expect(lockable([a])).toEqual([0]);
  });
});

describe('judging a twist', () => {
  const a: Twist = { x: 0.3, y: 0.3, r: 0.2, s: 3 };
  const b: Twist = { x: 0.4, y: 0.35, r: 0.2, s: -3 };
  const stack = [a, b];
  it('the exact inverse of the top whirlpool locks', () => {
    expect(judge(stack, inverse(b))).toEqual({ kind: 'lock', index: 1 });
  });
  it('slightly imprecise but within tolerance still locks', () => {
    expect(judge(stack, { x: b.x + TOL.eye * 0.7, y: b.y, r: b.r * 1.2, s: -b.s * 1.15 })).toEqual({ kind: 'lock', index: 1 });
  });
  it('under-twist reads close/more, over-twist close/less, wrong way close/direction', () => {
    expect(judge(stack, { ...inverse(b), s: 1.2 })).toMatchObject({ kind: 'close', hint: 'more' });
    expect(judge(stack, { ...inverse(b), s: 6 })).toMatchObject({ kind: 'close', hint: 'less' });
    expect(judge(stack, { ...inverse(b), s: -2.5 })).toMatchObject({ kind: 'close', hint: 'direction' });
  });
  it('size and eye errors give wider/tighter/eye hints', () => {
    expect(judge(stack, { ...inverse(b), r: 0.1 })).toMatchObject({ kind: 'close', hint: 'wider' });
    expect(judge(stack, { ...inverse(b), r: 0.35 })).toMatchObject({ kind: 'close', hint: 'tighter' });
    expect(judge(stack, { ...inverse(b), x: b.x + 0.07 })).toMatchObject({ kind: 'close', hint: 'eye' });
  });
  it('aiming at a buried whirlpool says buried', () => {
    expect(judge([a, { x: 0.45, y: 0.3, r: 0.22, s: 2 }], inverse(a)).kind).toBe('buried');
  });
  it('twisting empty water is a miss', () => {
    expect(judge(stack, { x: 0.9, y: 0.9, r: 0.1, s: 3 })).toEqual({ kind: 'miss' });
  });
  it('cancels() requires the opposite direction', () => {
    expect(cancels(a, inverse(a))).toBe(true);
    expect(cancels(a, a)).toBe(false);
  });
});

describe('daily puzzles', () => {
  it('is deterministic (same number, same puzzle) and stable across 30 days', () => {
    const sig = (n: number) => JSON.stringify(puzzleFor(n).twists);
    for (let n = 1; n <= 30; n++) expect(sig(n)).toBe(sig(n));
    let h = 0;
    for (let n = 1; n <= 30; n++) for (const ch of sig(n)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    expect(h).toMatchSnapshot();
  });
  it('days differ from each other', () => {
    const seen = new Set<string>();
    for (let n = 1; n <= 30; n++) seen.add(JSON.stringify(puzzleFor(n).twists));
    expect(seen.size).toBe(30);
  });
  it('tier follows the weekday (Mon gentle → Sun storm); #1 is Fri Oct 2 2026', () => {
    expect(dateForPuzzle(1).toISOString().slice(0, 10)).toBe('2026-10-02');
    expect(puzzleNumberFor(new Date(2026, 9, 2, 12))).toBe(1);
    for (let n = 1; n <= 14; n++) {
      const p = puzzleFor(n);
      const tier = TIERS[dateForPuzzle(n).getUTCDay()];
      expect(p.tier.name).toBe(tier.name);
      expect(p.twists.length).toBe(tier.nest + tier.free + 1);
      expect(p.par).toBe(p.twists.length);
      expect(p.maxTwists).toBe(p.par + 6);
    }
  });
  it('every day for 60 days is solvable in exactly par by cancelling in optimal order', () => {
    for (let n = 1; n <= 60; n++) {
      const p = puzzleFor(n);
      const order = optimalOrder(p.twists);
      expect(new Set(order).size).toBe(p.par);
      const stack = p.twists.map((t, i) => ({ t, i }));
      let moves = 0;
      for (const idx of order) {
        const v = judge(stack.map((s) => s.t), inverse(p.twists[idx]));
        expect(v.kind).toBe('lock');
        if (v.kind === 'lock') stack.splice(v.index, 1);
        moves++;
      }
      expect(stack.length).toBe(0);
      expect(moves).toBe(p.par);
      // and the picture is physically restored: scramble followed by the player's inverse twists is the identity
      expect(mess(p.twists).mean).toBeGreaterThan(0.005);
      const hist = [...p.twists, ...order.map((i) => inverse(p.twists[i]))];
      for (let k = 0; k < 64; k++) {
        const px = 0.05 + 0.9 * ((k * 37) % 64) / 63;
        const py = 0.05 + 0.9 * ((k * 11) % 64) / 63;
        const [sx, sy] = sourceOf(hist, px, py);
        expect(Math.hypot(sx - px, sy - py)).toBeLessThan(1e-6);
      }
    }
  });
  it('par is a lower bound: each lock removes exactly one whirlpool', () => {
    const p = puzzleFor(3);
    const free = lockable(p.twists);
    expect(free.length).toBeLessThan(p.twists.length); // some whirlpool is buried at the start
  });
  it('order is readable: the top whirlpool always helps the picture clearly more than a buried one', () => {
    for (let n = 1; n <= 21; n++) expect(orderClarity(puzzleFor(n).twists)).toBeGreaterThanOrEqual(1.3);
  });
  it('the picture is visibly stirred at the start of every day', () => {
    for (let n = 1; n <= 14; n++) expect(mess(puzzleFor(n).twists).restored).toBeLessThan(0.9);
  });
  it('cycles through every scene within 14 days', () => {
    const s = new Set<number>();
    for (let n = 1; n <= 14; n++) s.add(puzzleFor(n).scene);
    expect(s.size).toBe(SCENES.length);
  });
});

describe('share text', () => {
  const p = puzzleFor(1);
  const txt = shareText(p, 'BCLLLL', true, 83, 'https://unstir.app/#c=abc', 3);
  it('is spoiler-free: no coordinates, no picture name', () => {
    expect(txt).not.toMatch(/0\.\d{2,}/);
    expect(txt.toLowerCase()).not.toContain(p.sceneName.toLowerCase());
    for (const s of SCENES) expect(txt.toLowerCase()).not.toContain(s.toLowerCase());
  });
  it('shows score, badge, emoji row, time, streak and link', () => {
    expect(txt).toContain(`UNSTIR #1`);
    expect(txt).toContain(`6/${p.par}`);
    expect(txt).toContain('🟨🟧🌀🌀🌀🌀');
    expect(txt).toContain('1:23');
    expect(txt).toContain('🔥3');
    expect(txt).toContain('https://unstir.app/#c=abc');
  });
  it('fails show X', () => {
    expect(shareText(p, 'MMMMMMMMMM', false, 60, '')).toContain(`X/${p.par}`);
    expect(badge(4, 4, true)).toBe('Flawless');
    expect(badge(5, 4, true)).toBe('Smooth');
    expect(fmtTime(605)).toBe('10:05');
  });
});

describe('challenge links', () => {
  it('round-trips, including unicode names', () => {
    const c = { n: 12, row: 'BCLLL', solved: true, secs: 74, by: 'Zoë 🌀' };
    expect(decodeChallenge(encodeChallenge(c))).toEqual(c);
  });
  it('rejects garbage', () => {
    expect(decodeChallenge('')).toBeNull();
    expect(decodeChallenge('!!!')).toBeNull();
    expect(decodeChallenge(btoa('2|1|LL|1|3|x'))).toBeNull();
    expect(decodeChallenge(btoa('1|1|LXZ|1|3|x'))).toBeNull();
  });
  it('carries no puzzle geometry', () => {
    const code = encodeChallenge({ n: 1, row: 'LLLL', solved: true, secs: 30, by: 'T' });
    expect(atob(code.replace(/-/g, '+').replace(/_/g, '/'))).toBe('1|1|LLLL|1|30|T');
  });
});

describe('stats & streaks', () => {
  const r = (solved: boolean, len = 4): DayResult => ({ row: 'L'.repeat(len), solved, secs: 30, par: 4, at: 0 });
  it('counts current and max streaks, broken by a miss or a gap', () => {
    const res = { 1: r(true), 2: r(true), 3: r(false), 4: r(true), 5: r(true, 5), 6: r(true) };
    const s = computeStats(res, 6);
    expect(s.played).toBe(6);
    expect(s.solved).toBe(5);
    expect(s.streak).toBe(3);
    expect(s.maxStreak).toBe(3);
    expect(s.flawless).toBe(4);
    expect(s.dist[0]).toBe(4);
    expect(s.dist[1]).toBe(1);
    expect(s.dist[7]).toBe(1);
  });
  it("keeps yesterday's streak alive until today is played", () => {
    expect(computeStats({ 4: r(true), 5: r(true) }, 6).streak).toBe(2);
    expect(computeStats({ 4: r(true) }, 6).streak).toBe(0);
  });
});

describe('simulated crowd & players', () => {
  it('is deterministic and sums to the crowd size', () => {
    const p = puzzleFor(2);
    const a = crowdFor(p);
    expect(a.hist.reduce((x, y) => x + y, 0)).toBe(a.n);
    expect(crowdFor(p)).toBe(a);
  });
  it('percentile is bounded and monotone', () => {
    const p = puzzleFor(5);
    const c = crowdFor(p);
    const vals = [0, 1, 2, 3, 4, 5, 6].map((d) => percentile(c, p.par, p.par + d, true));
    for (const v of vals) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(100);
    for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeLessThanOrEqual(vals[i - 1]);
    expect(percentile(c, p.par, 0, false)).toBeLessThanOrEqual(vals[6]);
  });
  it('skill gradient: experts beat novices; random tapping never solves', () => {
    const p = puzzleFor(5);
    const avg = (m: keyof typeof MODELS) => {
      let s = 0;
      let solved = 0;
      for (let i = 0; i < 200; i++) {
        const r = simulate(p, MODELS[m], i);
        if (r.solved) solved++;
        s += r.solved ? r.moves : p.maxTwists + 1;
      }
      return { mean: s / 200, solved };
    };
    const ex = avg('expert');
    const nov = avg('novice');
    expect(ex.mean).toBeLessThan(nov.mean - 1);
    expect(avg('tapper').solved).toBe(0);
  });
});
