import type { Twist } from './twist';

/**
 * How close a player's twist must be to cancel a whirlpool. Tuned in scripts/audit.ts.
 * Whirlpools never overlap, so every whirlpool can be cancelled at any time, in any order.
 */
export const TOL = {
  eye: 0.05, // eye distance, in board widths (~17 px on a 348 px board): forgiving for a thumb, still a real target
  amountRel: 0.24, // relative error in twist amount
  amountAbs: 0.2, // plus this many radians of slack
  sizeRel: 0.3, // relative error in whirlpool size
  near: 0.1, // "you were at the right whirlpool" radius for hints
  minStir: 0.6, // radians: a gesture that stirred at least this much counts as a twist
};

export type Hint = 'eye' | 'more' | 'less' | 'wider' | 'tighter' | 'direction';
export type Verdict = { kind: 'lock'; index: number } | { kind: 'close'; index: number; hint: Hint } | { kind: 'miss' };

export function cancels(target: Twist, u: Twist): boolean {
  if (Math.hypot(u.x - target.x, u.y - target.y) > TOL.eye) return false;
  const want = -target.s;
  if (Math.sign(u.s) !== Math.sign(want)) return false;
  if (Math.abs(u.s - want) > TOL.amountRel * Math.abs(want) + TOL.amountAbs) return false;
  if (Math.abs(u.r - target.r) > TOL.sizeRel * target.r) return false;
  return true;
}

export function hintFor(target: Twist, u: Twist): Hint {
  const want = -target.s;
  if (Math.sign(u.s) !== Math.sign(want)) return 'direction';
  if (Math.hypot(u.x - target.x, u.y - target.y) > TOL.eye) return 'eye';
  if (Math.abs(u.r - target.r) > TOL.sizeRel * target.r) return u.r < target.r ? 'wider' : 'tighter';
  return Math.abs(u.s) < Math.abs(want) ? 'more' : 'less';
}

/**
 * Judge a released twist against the whirlpools that are still in the picture.
 * - lock: it cancels one of them (any one: they never overlap, so order never matters).
 * - close: it was aimed near a whirlpool's eye but was too imprecise (with a hint).
 * - miss: no whirlpool eye there.
 */
export function judge(stack: readonly Twist[], u: Twist): Verdict {
  for (let i = 0; i < stack.length; i++) if (cancels(stack[i], u)) return { kind: 'lock', index: i };
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < stack.length; i++) {
    const d = Math.hypot(stack[i].x - u.x, stack[i].y - u.y);
    if (d < TOL.near && d < bestD) {
      best = i;
      bestD = d;
    }
  }
  if (best >= 0) return { kind: 'close', index: best, hint: hintFor(stack[best], u) };
  return { kind: 'miss' };
}

/** The exact twist that cancels whirlpool `t`. */
export const inverse = (t: Twist): Twist => ({ x: t.x, y: t.y, r: t.r, s: -t.s });
