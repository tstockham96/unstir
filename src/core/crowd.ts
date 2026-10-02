/**
 * Offline crowd estimate: a deterministic pool of simulated players for today's puzzle.
 * Shown in the UI as "(est.)". A real backend would replace this with actual results.
 */
import type { Puzzle } from './puzzle';
import { MODELS, simulate } from './players';

const MIX: [keyof typeof MODELS, number][] = [
  ['expert', 0.14],
  ['casual', 0.4],
  ['novice', 0.32],
  ['sloppy', 0.14],
];

export interface Crowd {
  n: number;
  hist: number[]; // index = moves - par (0..6), last = failed
  solveRate: number;
  meanMoves: number;
}

const cache = new Map<number, Crowd>();
export function crowdFor(p: Puzzle, n = 500): Crowd {
  const hit = cache.get(p.n);
  if (hit) return hit;
  const hist = new Array(8).fill(0);
  let solved = 0;
  let sum = 0;
  let k = 0;
  for (const [name, w] of MIX) {
    const count = Math.round(n * w);
    for (let i = 0; i < count; i++) {
      const r = simulate(p, MODELS[name], p.n * 100003 + k++);
      if (r.solved) {
        hist[Math.min(6, r.moves - p.par)]++;
        solved++;
        sum += r.moves;
      } else hist[7]++;
    }
  }
  const c = { n: k, hist, solveRate: solved / k, meanMoves: solved ? sum / solved : 0 };
  cache.set(p.n, c);
  return c;
}

/** Share of the crowd you did better than (ties count half). Failed = worst bucket. */
export function percentile(c: Crowd, par: number, moves: number, solved: boolean): number {
  const b = solved ? Math.min(6, moves - par) : 7;
  let worse = 0;
  for (let i = b + 1; i < c.hist.length; i++) worse += c.hist[i];
  return Math.round(((worse + c.hist[b] / 2) / c.n) * 100);
}
