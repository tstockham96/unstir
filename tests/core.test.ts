import { describe, it, expect } from 'vitest';
import { twistPoint, sourceOf, gapBetween, mess, type Twist, type Vec } from '../src/core/twist';
import { judge, inverse, cancels, TOL } from '../src/core/rules';
import { puzzleFor, solveOrder, problems, TIERS } from '../src/core/puzzle';
import { shareText, badge, fmtTime, GLYPH } from '../src/core/share';
import { encodeChallenge, decodeChallenge } from '../src/core/challenge';
import { computeStats, type DayResult } from '../src/core/stats';
import { crowdFor, percentile } from '../src/core/crowd';
import { simulate, MODELS } from '../src/core/players';
import { dateForPuzzle, puzzleNumberFor, formatPuzzleDate } from '../src/core/date';
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
  it('overlapping whirlpools do NOT commute; separated ones do (why the game keeps them apart)', () => {
    const a: Twist = { x: 0.3, y: 0.3, r: 0.2, s: 3 };
    const b: Twist = { x: 0.4, y: 0.35, r: 0.2, s: -3 }; // overlaps a
    const c: Twist = { x: 0.8, y: 0.8, r: 0.15, s: 2 }; // clear of a
    expect(gapBetween(a, b)).toBeLessThan(0);
    expect(gapBetween(a, c)).toBeGreaterThan(0);
    const d = (h: Twist[], g: Twist[]) => { const [x1, y1] = sourceOf(h, 0.38, 0.33); const [x2, y2] = sourceOf(g, 0.38, 0.33); return Math.hypot(x1 - x2, y1 - y2); };
    expect(d([a, b], [b, a])).toBeGreaterThan(0.01);
    for (let i = 0; i < 100; i++) {
      const px = (i % 10) / 9, py = Math.floor(i / 10) / 9;
      const [x1, y1] = sourceOf([a, c], px, py);
      const [x2, y2] = sourceOf([c, a], px, py);
      expect(Math.hypot(x1 - x2, y1 - y2)).toBeLessThan(1e-12);
    }
  });
});

describe('judging a twist', () => {
  const a: Twist = { x: 0.3, y: 0.3, r: 0.2, s: 3.5 };
  const b: Twist = { x: 0.75, y: 0.7, r: 0.2, s: -4 }; // separate from a (no overlap)
  const stack = [a, b];
  it('the exact inverse of EITHER whirlpool locks (no order)', () => {
    expect(judge(stack, inverse(b))).toEqual({ kind: 'lock', index: 1 });
    expect(judge(stack, inverse(a))).toEqual({ kind: 'lock', index: 0 });
  });
  it('slightly imprecise but within tolerance still locks', () => {
    expect(judge(stack, { x: b.x + TOL.eye * 0.7, y: b.y, r: b.r * 1.2, s: -b.s * 1.15 })).toEqual({ kind: 'lock', index: 1 });
  });
  it('under-twist reads close/more, over-twist close/less, wrong way close/direction', () => {
    expect(judge(stack, { ...inverse(b), s: 1.5 })).toMatchObject({ kind: 'close', hint: 'more' });
    expect(judge(stack, { ...inverse(b), s: 7 })).toMatchObject({ kind: 'close', hint: 'less' });
    expect(judge(stack, { ...inverse(b), s: -2.5 })).toMatchObject({ kind: 'close', hint: 'direction' });
  });
  it('size and eye errors give wider/tighter/eye hints', () => {
    expect(judge(stack, { ...inverse(b), r: 0.1 })).toMatchObject({ kind: 'close', hint: 'wider' });
    expect(judge(stack, { ...inverse(b), r: 0.35 })).toMatchObject({ kind: 'close', hint: 'tighter' });
    expect(judge(stack, { ...inverse(b), x: b.x + 0.07 })).toMatchObject({ kind: 'close', hint: 'eye' });
  });
  it('the eye tolerance is forgiving (a thumb-width) but meaningful', () => {
    expect(TOL.eye).toBeGreaterThanOrEqual(0.04);
    expect(TOL.eye).toBeLessThanOrEqual(0.06);
    expect(judge(stack, { ...inverse(a), x: a.x + TOL.eye * 0.95 }).kind).toBe('lock');
    expect(judge(stack, { ...inverse(a), x: a.x + TOL.eye * 1.2 }).kind).toBe('close');
  });
  it('twisting calm water is a miss; there is no "buried" verdict any more', () => {
    expect(judge(stack, { x: 0.9, y: 0.1, r: 0.1, s: 3 })).toEqual({ kind: 'miss' });
    const kinds = new Set<string>();
    for (let i = 0; i < 400; i++) kinds.add(judge(stack, { x: (i % 20) / 19, y: Math.floor(i / 20) / 19, r: 0.2, s: -3.5 }).kind);
    expect([...kinds].every((k) => ['lock', 'close', 'miss'].includes(k))).toBe(true);
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
  it('tier follows the weekday (Mon 2 whirlpools → weekend 5); #1 is Fri Oct 2 2026', () => {
    expect(dateForPuzzle(1).toISOString().slice(0, 10)).toBe('2026-10-02');
    expect(puzzleNumberFor(new Date(2026, 9, 2, 12))).toBe(1);
    const counts: Record<string, number> = {};
    for (let n = 1; n <= 14; n++) {
      const p = puzzleFor(n);
      const tier = TIERS[dateForPuzzle(n).getUTCDay()];
      expect(p.tier.name).toBe(tier.name);
      expect(p.twists.length).toBe(tier.count);
      expect(p.par).toBe(p.twists.length);
      expect(p.maxTwists).toBe(p.par + 6);
      counts[formatPuzzleDate(n).slice(0, 3)] = p.par;
    }
    expect(counts).toEqual({ MON: 2, TUE: 3, WED: 3, THU: 4, FRI: 4, SAT: 5, SUN: 5 });
  });
  it('every day for 60 days: separated, strong, big enough, and solvable in par in two different orders', () => {
    for (let n = 1; n <= 60; n++) {
      const p = puzzleFor(n);
      expect(problems(p.twists, p.tier)).toBe('');
      for (const order of [solveOrder(p.twists), solveOrder(p.twists).reverse()]) {
        let stack = p.twists.slice();
        for (const idx of order) {
          const v = judge(stack, inverse(p.twists[idx]));
          expect(v.kind).toBe('lock');
          if (v.kind === 'lock') stack = stack.filter((_, k) => k !== v.index);
        }
        expect(stack.length).toBe(0);
      }
      // the picture is physically restored: scramble followed by the player's inverse twists is the identity
      expect(mess(p.twists).mean).toBeGreaterThan(0.005);
      const hist = [...p.twists, ...solveOrder(p.twists).reverse().map((i) => inverse(p.twists[i]))];
      for (let k = 0; k < 64; k++) {
        const px = 0.05 + (0.9 * ((k * 37) % 64)) / 63;
        const py = 0.05 + (0.9 * ((k * 11) % 64)) / 63;
        const [sx, sy] = sourceOf(hist, px, py);
        expect(Math.hypot(sx - px, sy - py)).toBeLessThan(1e-6);
      }
    }
  });
  it('par is a lower bound: each lock removes exactly one whirlpool', () => {
    const p = puzzleFor(3);
    const v = judge(p.twists, inverse(p.twists[0]));
    expect(v.kind).toBe('lock');
    expect(p.twists.filter((t) => cancels(t, inverse(p.twists[0]))).length).toBe(1);
  });
  it('each day picks a guide pattern; harder days always get the square grid', () => {
    const kinds = new Set<string>();
    for (let n = 1; n <= 60; n++) {
      const p = puzzleFor(n);
      expect(['grid', 'stripes', 'dots']).toContain(p.guide.kind);
      expect(p.guide.step).toBeGreaterThan(0.03);
      expect(p.guide.step).toBeLessThan(0.07);
      if (p.par >= 4) expect(p.guide.kind).toBe('grid');
      kinds.add(p.guide.kind);
    }
    expect(kinds.size).toBe(3);
  });
  it('the picture is visibly stirred at the start of every day', () => {
    for (let n = 1; n <= 14; n++) expect(mess(puzzleFor(n).twists).restored).toBeLessThan(0.8);
  });
  it('cycles through every scene within 14 days', () => {
    const s = new Set<number>();
    for (let n = 1; n <= 14; n++) s.add(puzzleFor(n).scene);
    expect(s.size).toBe(SCENES.length);
  });
});

describe('share text', () => {
  const p = puzzleFor(1);
  const txt = shareText(p, 'MCLLLL', true, 83, 'https://unstir.app/#c=abc', 3);
  it('is spoiler-free: no coordinates, no picture name', () => {
    expect(txt).not.toMatch(/0\.\d{2,}/);
    expect(txt.toLowerCase()).not.toContain(p.sceneName.toLowerCase());
    for (const s of SCENES) expect(txt.toLowerCase()).not.toContain(s.toLowerCase());
  });
  it('shows score, badge, emoji row, time, streak and link', () => {
    expect(txt).toContain(`UNSTIR #1`);
    expect(txt).toContain(`6/${p.par}`);
    expect(txt).toContain('⬜🟧🌀🌀🌀🌀');
    expect(txt).not.toContain('🟨');
    expect(Object.values(GLYPH)).toEqual(['🌀', '🟧', '⬜']);
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
    const c = { n: 12, row: 'MCLLL', solved: true, secs: 74, by: 'Zoë 🌀' };
    expect(decodeChallenge(encodeChallenge(c))).toEqual(c);
    // links made before the 🟨 state was retired still open; a legacy B shows as a miss
    expect(decodeChallenge(encodeChallenge({ ...c, row: 'BCLLL' }))!.row).toBe('MCLLL');
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
  it('skill gradient: experts beat novices; random tapping never solves; hint-guided jabbing almost never does', () => {
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
  it('brute force stays in check even on the easiest (Monday) puzzles', () => {
    for (const n of [4, 11, 18, 25]) {
      const p = puzzleFor(n);
      expect(p.par).toBe(2);
      let jab = 0, tap = 0;
      for (let i = 0; i < 300; i++) {
        if (simulate(p, MODELS.jabber, i).solved) jab++;
        if (simulate(p, MODELS.tapper, i).solved) tap++;
      }
      expect(jab / 300).toBeLessThan(0.04);
      expect(tap / 300).toBeLessThan(0.01);
    }
  });
});
