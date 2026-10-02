import { Twist, lockable, apparentEye } from './twist';

/** How close a player's twist must be to cancel a whirlpool. Tuned in scripts/audit.ts. */
export const TOL = {
  eye: 0.042, // eye distance, in picture widths (~15 px on a 360 px board)
  amountRel: 0.24, // relative error in twist amount
  amountAbs: 0.2, // plus this many radians of slack
  sizeRel: 0.3, // relative error in whirlpool size
  near: 0.1, // "you were at the right whirlpool" radius for hints
  minStir: 0.6, // radians: a gesture that stirred at least this much counts as a twist
};

export type Hint = 'eye' | 'more' | 'less' | 'wider' | 'tighter' | 'direction';
export type Verdict =
  | { kind: 'lock'; index: number }
  | { kind: 'close'; index: number; hint: Hint }
  | { kind: 'buried'; index: number }
  | { kind: 'miss' };

export function cancels(target: Twist, u: Twist): boolean {
  if (Math.hypot(u.x - target.x, u.y - target.y) > TOL.eye) return false;
  const want = -target.s;
  if (Math.sign(u.s) !== Math.sign(want)) return false;
  if (Math.abs(u.s - want) > TOL.amountRel * Math.abs(want) + TOL.amountAbs) return false;
  if (Math.abs(u.r - target.r) > TOL.sizeRel * target.r) return false;
  return true;
}

function hintFor(target: Twist, u: Twist): Hint {
  const want = -target.s;
  if (Math.sign(u.s) !== Math.sign(want)) return 'direction';
  if (Math.hypot(u.x - target.x, u.y - target.y) > TOL.eye) return 'eye';
  if (Math.abs(u.r - target.r) > TOL.sizeRel * target.r) return u.r < target.r ? 'wider' : 'tighter';
  return Math.abs(u.s) < Math.abs(want) ? 'more' : 'less';
}

/**
 * Judge a released twist against the current stack of remaining whirlpools (oldest first).
 * - lock: it cancels a whirlpool that nothing else is lying on top of.
 * - close: it was aimed at an undo-able whirlpool but was too imprecise (with a hint).
 * - buried: it was aimed at a whirlpool that another whirlpool lies on top of.
 * - miss: nothing there.
 */
export function judge(stack: readonly Twist[], u: Twist): Verdict {
  const free = lockable(stack);
  for (const i of free) if (cancels(stack[i], u)) return { kind: 'lock', index: i };
  let best = -1;
  let bestD = Infinity;
  for (const i of free) {
    const d = Math.hypot(stack[i].x - u.x, stack[i].y - u.y);
    if (d < TOL.near && d < bestD) {
      best = i;
      bestD = d;
    }
  }
  for (let i = 0; i < stack.length; i++) {
    if (free.includes(i)) continue;
    const [ax, ay] = apparentEye(stack, i);
    const d = Math.min(Math.hypot(ax - u.x, ay - u.y), Math.hypot(stack[i].x - u.x, stack[i].y - u.y));
    if (d < TOL.eye * 1.5 && d < bestD) return { kind: 'buried', index: i };
  }
  if (best >= 0) return { kind: 'close', index: best, hint: hintFor(stack[best], u) };
  return { kind: 'miss' };
}

/** The exact twist that cancels whirlpool `t`. */
export const inverse = (t: Twist): Twist => ({ x: t.x, y: t.y, r: t.r, s: -t.s });
