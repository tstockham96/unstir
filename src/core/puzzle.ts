import { makeRng, hashStr, type Rng } from './rng';
import { Twist, gapBetween, mess } from './twist';
import { dateForPuzzle } from './date';
import { SCENE_COUNT, SCENES, DECOYS } from './scenes-meta';

/**
 * Daily difficulty. Whirlpools NEVER overlap (their full influence disks are kept apart by GAP),
 * so they commute: any solve order works, and the only skill is reading each swirl.
 * Harder days = more whirlpools, smaller (but never tiny) radii, a wider range of twist amounts,
 * and eyes allowed closer to the edge.
 */
export interface Tier {
  name: string;
  count: number; // whirlpools (= par)
  rMin: number; // whirlpool radius range, in board widths
  rMax: number;
  sMin: number; // twist angle at the eye, radians (magnitude)
  sMax: number;
  edge: number; // eyes stay at least this far from the board edge
}
// Index = JS getUTCDay(). Monday is gentle, the weekend is a storm.
export const TIERS: Tier[] = [
  { name: 'Storm', count: 5, rMin: 0.18, rMax: 0.2, sMin: 3.2, sMax: 5.0, edge: 0.13 }, // Sun
  { name: 'Ripple', count: 2, rMin: 0.24, rMax: 0.3, sMin: 3.6, sMax: 4.6, edge: 0.24 }, // Mon
  { name: 'Eddy', count: 3, rMin: 0.22, rMax: 0.27, sMin: 3.4, sMax: 4.8, edge: 0.2 }, // Tue
  { name: 'Current', count: 3, rMin: 0.2, rMax: 0.26, sMin: 3.2, sMax: 5.0, edge: 0.2 }, // Wed
  { name: 'Undertow', count: 4, rMin: 0.19, rMax: 0.23, sMin: 3.2, sMax: 5.0, edge: 0.17 }, // Thu
  { name: 'Maelstrom', count: 4, rMin: 0.18, rMax: 0.22, sMin: 3.2, sMax: 5.0, edge: 0.17 }, // Fri
  { name: 'Vortex', count: 5, rMin: 0.18, rMax: 0.2, sMin: 3.4, sMax: 4.8, edge: 0.13 }, // Sat
];

/** Bumped whenever the generator changes, so saved mid-game progress from an older layout is discarded. */
export const PUZZLE_GEN = 2;

/** Hard guarantees for every generated puzzle (asserted in tests/solver.test.ts). */
export const MIN_R = 0.18; // radius >= 18% of the board width (~63 px on a 390 px phone)
export const MIN_S = 3.2; // twist at the eye >= ~183°, so straight guide lines visibly curl
export const GAP = 0.05; // clear water between any two whirlpool disks (~17 px)
export const DECOY_CLEAR = 0.12; // eyes stay this far from round scene features

export type GuideKind = 'grid' | 'stripes' | 'dots';
export interface Guide {
  kind: GuideKind;
  step: number; // line / dot spacing in board widths
  angle: number; // radians
}

export interface Puzzle {
  n: number;
  tier: Tier;
  twists: Twist[]; // the whirlpools (order is irrelevant: they commute)
  par: number;
  maxTwists: number;
  scene: number;
  sceneName: string;
  palette: number;
  guide: Guide;
  attempts: number; // generator retries (diagnostic)
}

const q = (v: number) => Math.round(v * 1000) / 1000; // keep puzzles to 3 decimals: stable, compact

/** Any order solves a puzzle; this is the one the replay uses (left to right, top to bottom). */
export function solveOrder(twists: readonly Twist[]): number[] {
  return twists.map((_, i) => i).sort((a, b) => twists[a].y + twists[a].x * 0.35 - (twists[b].y + twists[b].x * 0.35));
}

/** Checks every guarantee the game makes about a set of whirlpools. Returns the first problem, or ''. */
export function problems(tw: readonly Twist[], tier: Tier, decoys: readonly (readonly [number, number])[] = []): string {
  for (const t of tw) {
    if (t.r < MIN_R - 1e-9) return 'radius too small';
    if (Math.abs(t.s) < MIN_S - 1e-9) return 'twist too weak';
    if (t.x < tier.edge - 1e-9 || t.x > 1 - tier.edge + 1e-9 || t.y < tier.edge - 1e-9 || t.y > 1 - tier.edge + 1e-9) return 'eye off board';
    if (decoys.some(([x, y]) => Math.hypot(t.x - x, t.y - y) < DECOY_CLEAR)) return 'eye on a round feature';
  }
  for (let i = 0; i < tw.length; i++) for (let j = i + 1; j < tw.length; j++) if (gapBetween(tw[i], tw[j]) < GAP - 1e-9) return 'whirlpools overlap';
  return '';
}

/** Lay `tier.count` separated whirlpools from a seed. Returns null if this seed's random layout doesn't fit. */
export function tryBuild(R: Rng, tier: Tier, decoys: readonly (readonly [number, number])[] = []): Twist[] | null {
  const tw: Twist[] = [];
  // Big ones first: they are the hardest to fit.
  const radii = Array.from({ length: tier.count }, () => tier.rMin + R.next() * (tier.rMax - tier.rMin)).sort((a, b) => b - a);
  for (const r0 of radii) {
    let placed: Twist | null = null;
    for (let g = 0; g < 300 && !placed; g++) {
      const span = 1 - 2 * tier.edge;
      const c: Twist = {
        x: q(tier.edge + R.next() * span),
        y: q(tier.edge + R.next() * span),
        r: q(r0),
        s: q((R.chance(0.5) ? -1 : 1) * (tier.sMin + R.next() * (tier.sMax - tier.sMin))),
      };
      if (problems([...tw, c], tier, decoys)) continue;
      placed = c;
    }
    if (!placed) return null;
    tw.push(placed);
  }
  return R.shuffle(tw);
}

/** Generate the whirlpools for an arbitrary seed (used by the daily puzzle and by tests). */
export function generate(seed: string, tier: Tier, decoys: readonly (readonly [number, number])[] = []): { twists: Twist[]; attempts: number } {
  for (let attempt = 0; attempt < 4000; attempt++) {
    // Prefer eyes away from round scene features; if a scene makes that impossible, drop that preference.
    const tw = tryBuild(makeRng(hashStr(`${seed}:${attempt}`)), tier, attempt < 2000 ? decoys : []);
    if (tw && mess(tw, 24).restored < 0.8) return { twists: tw, attempts: attempt + 1 };
  }
  throw new Error(`no valid puzzle for ${seed}`);
}

function guideFor(n: number, tier: Tier): Guide {
  const R = makeRng(hashStr(`guide:${n}`));
  // The fine square grid reads best, so harder days always get it. Easy days vary the look.
  const kind: GuideKind = tier.count <= 2 ? R.pick(['grid', 'stripes', 'dots'] as const) : tier.count === 3 ? R.pick(['grid', 'grid', 'stripes'] as const) : 'grid';
  // Stripes run diagonally so they cross the scenes' mostly horizontal bands (the two together read like a grid).
  const angle = kind === 'stripes' ? R.pick([Math.PI / 4, -Math.PI / 4]) : kind === 'grid' ? R.pick([0, 0, Math.PI / 4]) : 0;
  const step = kind === 'dots' ? 1 / 22 : kind === 'stripes' ? 1 / 24 : 1 / 20;
  return { kind, step, angle };
}

const cache = new Map<number, Puzzle>();
export function puzzleFor(n: number): Puzzle {
  const hit = cache.get(n);
  if (hit) return hit;
  const tier = TIERS[dateForPuzzle(n).getUTCDay()];
  // Scenes cycle through a seeded shuffle so a picture never repeats within a cycle.
  const cycle = Math.floor((n - 1) / SCENE_COUNT);
  const order = makeRng(hashStr(`scenes:${cycle}`)).shuffle([...Array(SCENE_COUNT).keys()]);
  const scene = order[(n - 1) % SCENE_COUNT];
  const { twists, attempts } = generate(`unstir2:${n}`, tier, DECOYS[scene]);
  const p: Puzzle = {
    n,
    tier,
    twists,
    par: twists.length,
    maxTwists: twists.length + 6,
    scene,
    sceneName: SCENES[scene],
    palette: (cycle + n) % 3,
    guide: guideFor(n, tier),
    attempts,
  };
  cache.set(n, p);
  return p;
}
