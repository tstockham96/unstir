/**
 * Simulated players. Used for the "how today's players did (est.)" crowd panel when there is
 * no backend, and by scripts/audit.ts to measure the skill gradient and brute-force resistance.
 */
import { makeRng } from './rng';
import type { Twist } from './twist';
import { judge, Verdict } from './rules';
import type { Puzzle } from './puzzle';

export interface Model {
  name: string;
  reads: number; // P(a fresh attempt is aimed at a real whirlpool, rather than a spot that only looked stirred)
  sigEye: number; // thumb error on the eye (board widths)
  sigAmt: number; // relative error in amount
  sigSize: number; // relative error in stir size
  learns: number; // how much a "close" hint shrinks the next error (0..1)
  /** Never looks at the picture: jabs random spots, then homes in using only the 🟧 hints. */
  jabber?: boolean;
  /** Never looks at the picture and ignores feedback. */
  random?: boolean;
}
export const MODELS: Record<string, Model> = {
  expert: { name: 'expert', reads: 0.97, sigEye: 0.014, sigAmt: 0.08, sigSize: 0.1, learns: 0.6 },
  casual: { name: 'casual', reads: 0.85, sigEye: 0.022, sigAmt: 0.14, sigSize: 0.16, learns: 0.5 },
  novice: { name: 'novice', reads: 0.65, sigEye: 0.03, sigAmt: 0.2, sigSize: 0.22, learns: 0.4 },
  sloppy: { name: 'sloppy', reads: 0.5, sigEye: 0.038, sigAmt: 0.26, sigSize: 0.28, learns: 0.2 },
  jabber: { name: 'jabber', reads: 0, sigEye: 0.03, sigAmt: 0.3, sigSize: 0.3, learns: 0, jabber: true },
  tapper: { name: 'tapper', reads: 0, sigEye: 0, sigAmt: 0.3, sigSize: 0.3, learns: 0, random: true },
};

export interface PlayResult {
  moves: number;
  row: string; // L lock, C close, M miss
  solved: boolean;
}

export function verdictLetter(v: Verdict): string {
  return v.kind === 'lock' ? 'L' : v.kind === 'close' ? 'C' : 'M';
}

export function simulate(p: Puzzle, m: Model, seed: number): PlayResult {
  const R = makeRng(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(R.next() + 1e-12)) * Math.cos(2 * Math.PI * R.next());
  const blind = (): Twist => ({ x: 0.1 + R.next() * 0.8, y: 0.1 + R.next() * 0.8, r: 0.18 + R.next() * 0.14, s: (R.chance(0.5) ? 1 : -1) * (3 + R.next() * 2) });
  let stack: Twist[] = p.twists.slice();
  let row = '';
  let focus: Twist | null = null;
  let shrink = 1;
  let probe: Twist | null = null; // jabber: the last twist that earned a 🟧
  while (stack.length && row.length < p.maxTwists) {
    let u: Twist;
    if (m.random) u = blind();
    else if (m.jabber) {
      if (!probe) u = blind();
      else u = { ...probe, x: probe.x + gauss() * m.sigEye, y: probe.y + gauss() * m.sigEye };
    } else {
      if (!(focus && stack.includes(focus))) {
        shrink = 1;
        focus = R.chance(m.reads) ? R.pick(stack) : null;
      }
      if (!focus) u = blind();
      else
        u = {
          x: focus.x + gauss() * m.sigEye * shrink,
          y: focus.y + gauss() * m.sigEye * shrink,
          r: focus.r * (1 + gauss() * m.sigSize * shrink),
          s: -focus.s * (1 + gauss() * m.sigAmt * shrink),
        };
    }
    const v = judge(stack, u);
    row += verdictLetter(v);
    if (v.kind === 'lock') {
      stack = stack.filter((_, i) => i !== v.index);
      focus = null;
      probe = null;
    } else if (v.kind === 'close') {
      shrink *= 1 - m.learns;
      if (m.jabber) {
        // Use the hint the way a determined guesser would.
        const h = v.hint;
        probe = { ...u, s: h === 'direction' ? -u.s : h === 'more' ? u.s * 1.3 : h === 'less' ? u.s * 0.75 : u.s, r: h === 'wider' ? u.r * 1.3 : h === 'tighter' ? u.r * 0.75 : u.r };
      }
    } else {
      focus = null;
      probe = null;
    }
  }
  return { moves: row.length, row, solved: stack.length === 0 };
}
