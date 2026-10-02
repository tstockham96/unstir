/**
 * Solver test: for 50 random seeds (across every difficulty), whirlpools never overlap, every
 * guarantee holds, and undoing them in EVERY permutation yields a perfectly clean picture
 * (and the judge locks each step).
 */
import { describe, it, expect } from 'vitest';
import { generate, problems, TIERS, MIN_R, MIN_S, GAP } from '../src/core/puzzle';
import { gapBetween, sourceOf, type Twist } from '../src/core/twist';
import { judge, inverse } from '../src/core/rules';
import { makeRng } from '../src/core/rng';

function permutations(n: number): number[][] {
  if (n === 0) return [[]];
  const out: number[][] = [];
  for (const p of permutations(n - 1)) for (let i = 0; i <= p.length; i++) out.push([...p.slice(0, i), n - 1, ...p.slice(i)]);
  return out;
}

// Sample points: a grid plus points packed inside every whirlpool (where an error would show).
function samples(tw: readonly Twist[]): [number, number][] {
  const pts: [number, number][] = [];
  for (let j = 0; j < 24; j++) for (let i = 0; i < 24; i++) pts.push([(i + 0.5) / 24, (j + 0.5) / 24]);
  for (const t of tw) for (let k = 0; k < 24; k++) pts.push([t.x + Math.cos(k * 2.4) * t.r * (k / 24), t.y + Math.sin(k * 2.4) * t.r * (k / 24)]);
  return pts;
}

describe('solver: 50 random seeds, every permutation', () => {
  const R = makeRng('solver-seeds');
  const cases = Array.from({ length: 50 }, (_, i) => ({ seed: `seed-${Math.floor(R.next() * 1e9)}`, tier: TIERS[i % TIERS.length] }));

  it.each(cases)('$seed ($tier.name)', ({ seed, tier }) => {
    const { twists } = generate(seed, tier);
    expect(twists.length).toBe(tier.count);
    expect(problems(twists, tier)).toBe('');
    for (let i = 0; i < twists.length; i++) {
      expect(twists[i].r).toBeGreaterThanOrEqual(MIN_R);
      expect(Math.abs(twists[i].s)).toBeGreaterThanOrEqual(MIN_S);
      for (let j = i + 1; j < twists.length; j++) expect(gapBetween(twists[i], twists[j])).toBeGreaterThanOrEqual(GAP - 1e-9);
    }
    const pts = samples(twists);
    // stirred to begin with
    expect(pts.some(([x, y]) => { const [sx, sy] = sourceOf(twists, x, y); return Math.hypot(sx - x, sy - y) > 0.02; })).toBe(true);
    const perms = permutations(twists.length);
    expect(perms.length).toBe([1, 1, 2, 6, 24, 120][twists.length]);
    for (const order of perms) {
      let stack = twists.slice();
      const hist: Twist[] = [...twists];
      for (const idx of order) {
        const v = judge(stack, inverse(twists[idx]));
        expect(v.kind).toBe('lock');
        if (v.kind === 'lock') expect(stack[v.index]).toBe(twists[idx]);
        stack = stack.filter((t) => t !== twists[idx]);
        hist.push(inverse(twists[idx]));
      }
      expect(stack.length).toBe(0);
      let worst = 0;
      for (const [x, y] of pts) {
        const [sx, sy] = sourceOf(hist, x, y);
        worst = Math.max(worst, Math.hypot(sx - x, sy - y));
      }
      expect(worst).toBeLessThan(1e-9);
    }
  });
});
