/**
 * Simulated players. Used for the "how today's players did (est.)" crowd panel when there is
 * no backend, and by scripts/audit.ts to measure the skill gradient.
 */
import { makeRng } from './rng';
import { Twist, lockable, apparentEye } from './twist';
import { judge, Verdict } from './rules';
import type { Puzzle } from './puzzle';

export interface Model {
  name: string;
  readsOrder: number; // P(picks an undo-able whirlpool on purpose)
  sigEye: number; // thumb error on the eye (picture widths)
  sigAmt: number; // relative error in amount
  sigSize: number; // relative error in stir size
  memory: boolean; // remembers "buried"/"miss" answers
  learns: number; // how much a "close" hint shrinks the next error (0..1)
  random?: boolean;
}
export const MODELS: Record<string, Model> = {
  expert: { name: 'expert', readsOrder: 0.95, sigEye: 0.012, sigAmt: 0.08, sigSize: 0.1, memory: true, learns: 0.6 },
  casual: { name: 'casual', readsOrder: 0.55, sigEye: 0.02, sigAmt: 0.14, sigSize: 0.16, memory: true, learns: 0.5 },
  novice: { name: 'novice', readsOrder: 0.2, sigEye: 0.028, sigAmt: 0.2, sigSize: 0.22, memory: true, learns: 0.4 },
  sloppy: { name: 'sloppy', readsOrder: 0, sigEye: 0.035, sigAmt: 0.26, sigSize: 0.28, memory: false, learns: 0.2 },
  bruteforce: { name: 'bruteforce', readsOrder: 0, sigEye: 0.015, sigAmt: 0.1, sigSize: 0.12, memory: true, learns: 0.6 },
  tapper: { name: 'tapper', readsOrder: 0, sigEye: 0, sigAmt: 0.3, sigSize: 0.3, memory: false, learns: 0, random: true },
};

export interface PlayResult {
  moves: number;
  row: string; // L lock, C close, B buried, M miss
  solved: boolean;
}

export function verdictLetter(v: Verdict): string {
  return v.kind === 'lock' ? 'L' : v.kind === 'close' ? 'C' : v.kind === 'buried' ? 'B' : 'M';
}

export function simulate(p: Puzzle, m: Model, seed: number): PlayResult {
  const R = makeRng(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(R.next() + 1e-12)) * Math.cos(2 * Math.PI * R.next());
  let stack: Twist[] = p.twists.slice();
  let row = '';
  const ruledOut = new Set<Twist>();
  let focus: Twist | null = null;
  let shrink = 1;
  while (stack.length && row.length < p.maxTwists) {
    const free = lockable(stack);
    let target: Twist | null = null;
    let eye: [number, number];
    if (m.random) {
      eye = [0.1 + R.next() * 0.8, 0.1 + R.next() * 0.8];
    } else {
      if (focus && stack.includes(focus)) target = focus;
      else {
        shrink = 1;
        const pool = stack.filter((t) => !(m.memory && ruledOut.has(t)));
        const cands = pool.length ? pool : stack;
        target = R.chance(m.readsOrder) ? stack[R.pick(free)] : R.pick(cands);
      }
      eye = apparentEye(stack, stack.indexOf(target));
    }
    const base = target ?? { x: eye[0], y: eye[1], r: 0.3, s: (R.chance(0.5) ? 1 : -1) * 3.4 };
    const u: Twist = {
      x: eye[0] + gauss() * m.sigEye * shrink,
      y: eye[1] + gauss() * m.sigEye * shrink,
      r: base.r * (1 + gauss() * m.sigSize * shrink),
      s: -base.s * (1 + gauss() * m.sigAmt * shrink),
    };
    const v = judge(stack, u);
    row += verdictLetter(v);
    if (v.kind === 'lock') {
      stack = stack.filter((_, i) => i !== v.index);
      ruledOut.clear();
      focus = null;
    } else if (v.kind === 'close') {
      focus = stack[v.index];
      shrink *= 1 - m.learns;
    } else if (target) {
      ruledOut.add(target);
      focus = null;
    }
  }
  return { moves: row.length, row, solved: stack.length === 0 };
}
