import { makeRng, hashStr } from './rng';
import { Twist, lockable, apparentEye, mess } from './twist';
import { inverse } from './rules';
import { dateForPuzzle } from './date';
import { SCENE_COUNT, SCENES } from './scenes-meta';

export interface Tier {
  name: string;
  nest: number; // whirlpools laid on top of an earlier one (order matters)
  free: number; // whirlpools on their own (order doesn't matter)
}
// Monday is gentle, Sunday is a storm (index = JS getUTCDay()).
export const TIERS: Tier[] = [
  { name: 'Storm', nest: 3, free: 1 }, // Sun: 5 whirlpools
  { name: 'Ripple', nest: 1, free: 0 }, // Mon: 2
  { name: 'Eddy', nest: 1, free: 1 }, // Tue: 3
  { name: 'Current', nest: 2, free: 0 }, // Wed: 3
  { name: 'Undertow', nest: 2, free: 1 }, // Thu: 4
  { name: 'Maelstrom', nest: 3, free: 0 }, // Fri: 4
  { name: 'Vortex', nest: 3, free: 1 }, // Sat: 5
];

export interface Puzzle {
  n: number;
  tier: Tier;
  twists: Twist[]; // scramble order, oldest first
  par: number;
  maxTwists: number;
  scene: number;
  sceneName: string;
  palette: number;
  attempts: number; // generator retries (diagnostic)
}

const q = (v: number) => Math.round(v * 1000) / 1000; // keep puzzles to 3 decimals: stable, compact

/** Canonical optimal solution: repeatedly cancel the newest undo-able whirlpool. Returns the cancel order (indices into the scramble). */
export function optimalOrder(twists: readonly Twist[]): number[] {
  const stack = twists.map((t, i) => ({ t, i }));
  const order: number[] = [];
  while (stack.length) {
    const free = lockable(stack.map((s) => s.t));
    const k = free[free.length - 1];
    order.push(stack[k].i);
    stack.splice(k, 1);
  }
  return order;
}

/** How clearly the image tells you which whirlpool is on top, along the optimal path (min over steps). */
export function orderClarity(twists: readonly Twist[]): number {
  let stack = twists.slice();
  let worst = Infinity;
  while (stack.length) {
    const free = new Set(lockable(stack));
    const base = mess(stack, 24).restored;
    let topGain = Infinity;
    let buriedGain = 0;
    for (let i = 0; i < stack.length; i++) {
      if (free.has(i)) {
        topGain = Math.min(topGain, mess([...stack, inverse(stack[i])], 24).restored - base);
      } else {
        const [ax, ay] = apparentEye(stack, i);
        let g = 0;
        for (let f = 0.7; f <= 1.31; f += 0.15) g = Math.max(g, mess([...stack, { x: ax, y: ay, r: stack[i].r, s: -stack[i].s * f }], 24).restored - base);
        buriedGain = Math.max(buriedGain, g);
      }
    }
    if (buriedGain > 0) worst = Math.min(worst, topGain / Math.max(buriedGain, 0.01));
    const k = [...free].pop()!;
    stack = stack.filter((_, i) => i !== k);
  }
  return worst === Infinity ? 99 : worst;
}

function tryBuild(n: number, attempt: number, tier: Tier): Twist[] | null {
  const R = makeRng(hashStr(`unstir:${n}:${attempt}`));
  const types = R.shuffle([...Array(tier.nest).fill('nest'), ...Array(tier.free).fill('free')] as string[]);
  const tw: Twist[] = [];
  const amount = () => (R.chance(0.5) ? -1 : 1) * (2.4 + R.next() * 2.0);
  tw.push({ x: 0.32 + R.next() * 0.36, y: 0.32 + R.next() * 0.36, r: 0.28 + R.next() * 0.12, s: amount() });
  for (const type of types) {
    let placed: Twist | null = null;
    for (let g = 0; g < 400 && !placed; g++) {
      if (type === 'nest') {
        // Lay a new whirlpool over a recent one so it drags that one's eye (that is what makes order readable).
        const target = tw[tw.length - 1 - Math.min(tw.length - 1, R.int(0, 1))];
        const r = 0.26 + R.next() * 0.14;
        const a = R.next() * Math.PI * 2;
        const d = r * (0.32 + R.next() * 0.38);
        const c = { x: target.x + Math.cos(a) * d, y: target.y + Math.sin(a) * d, r, s: amount() };
        if (c.x < 0.18 || c.x > 0.82 || c.y < 0.18 || c.y > 0.82) continue;
        if (tw.some((t) => Math.hypot(t.x - c.x, t.y - c.y) < 0.12)) continue;
        placed = c;
      } else {
        const r = 0.16 + R.next() * 0.08;
        const c = { x: 0.16 + R.next() * 0.68, y: 0.16 + R.next() * 0.68, r, s: amount() * 1.1 };
        if (tw.some((t) => Math.hypot(t.x - c.x, t.y - c.y) < t.r + c.r + 0.02)) continue;
        placed = c;
      }
    }
    if (!placed) return null;
    tw.push(placed);
  }
  return tw.map((t) => ({ x: q(t.x), y: q(t.y), r: q(t.r), s: q(t.s) }));
}

function valid(tw: Twist[]): boolean {
  // Every eye (as it appears now) on the board and distinct from the others.
  const eyes = tw.map((_, i) => apparentEye(tw, i));
  if (eyes.some(([x, y]) => x < 0.1 || x > 0.9 || y < 0.1 || y > 0.9)) return false;
  for (let i = 0; i < eyes.length; i++)
    for (let j = i + 1; j < eyes.length; j++) if (Math.hypot(eyes[i][0] - eyes[j][0], eyes[i][1] - eyes[j][1]) < 0.11) return false;
  if (mess(tw, 24).restored > 0.6) return false; // properly stirred
  return orderClarity(tw) >= 1.3;
}

const cache = new Map<number, Puzzle>();
export function puzzleFor(n: number): Puzzle {
  const hit = cache.get(n);
  if (hit) return hit;
  const tier = TIERS[dateForPuzzle(n).getUTCDay()];
  let twists: Twist[] | null = null;
  let attempt = 0;
  for (; attempt < 400; attempt++) {
    const t = tryBuild(n, attempt, tier);
    if (t && valid(t)) {
      twists = t;
      break;
    }
  }
  if (!twists) throw new Error(`no valid puzzle for #${n}`);
  // Scenes cycle through a seeded shuffle so a picture never repeats within a cycle.
  const cycle = Math.floor((n - 1) / SCENE_COUNT);
  const order = makeRng(hashStr(`scenes:${cycle}`)).shuffle([...Array(SCENE_COUNT).keys()]);
  const scene = order[(n - 1) % SCENE_COUNT];
  const p: Puzzle = {
    n,
    tier,
    twists,
    par: twists.length,
    maxTwists: twists.length + 6,
    scene,
    sceneName: SCENES[scene],
    palette: (cycle + n) % 3,
    attempts: attempt + 1,
  };
  cache.set(n, p);
  return p;
}
