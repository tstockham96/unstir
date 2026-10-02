/**
 * Whirlpool math. Coordinates live in the unit square (0..1, y down).
 * A twist rotates every point inside its disk around the eye by an angle that is
 * `s` at the eye and fades smoothly to 0 at the rim: angle = s * (1 - d/r)^2.
 * Each circle around the eye is rotated rigidly, so the map is area-preserving and
 * exactly invertible (same eye, same radius, -s). That is what makes "unstirring" possible.
 */
export interface Twist {
  x: number;
  y: number;
  r: number;
  s: number;
}

export const falloff = (t: number): number => (1 - t) * (1 - t);

export type Vec = [number, number];

/** Push a point forward through a twist (dir = +1) or backward (dir = -1). Writes into `out`. */
export function twistPoint(t: Twist, px: number, py: number, dir: 1 | -1, out: Vec): Vec {
  const dx = px - t.x;
  const dy = py - t.y;
  const d2 = dx * dx + dy * dy;
  if (d2 >= t.r * t.r) {
    out[0] = px;
    out[1] = py;
    return out;
  }
  const a = dir * t.s * falloff(Math.sqrt(d2) / t.r);
  const c = Math.cos(a);
  const s = Math.sin(a);
  out[0] = t.x + dx * c - dy * s;
  out[1] = t.y + dx * s + dy * c;
  return out;
}

/**
 * The picture coordinate shown at display point p, given the full history of twists
 * applied to the picture (oldest first). Display = picture pushed through every twist,
 * so we pull p back through them newest-first.
 */
export function sourceOf(history: readonly Twist[], px: number, py: number, out: Vec = [0, 0]): Vec {
  out[0] = px;
  out[1] = py;
  for (let i = history.length - 1; i >= 0; i--) twistPoint(history[i], out[0], out[1], -1, out);
  return out;
}

/** Disks overlap => the two twists don't commute. */
export function overlaps(a: Twist, b: Twist): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r;
}

/** Indices that can be undone now: no LATER twist overlaps them. */
export function lockable(history: readonly Twist[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < history.length; i++) {
    let free = true;
    for (let j = i + 1; j < history.length && free; j++) if (overlaps(history[i], history[j])) free = false;
    if (free) out.push(i);
  }
  return out;
}

/** Where twist i's eye APPEARS now: carried forward by every later twist. */
export function apparentEye(history: readonly Twist[], i: number): Vec {
  const o: Vec = [history[i].x, history[i].y];
  for (let j = i + 1; j < history.length; j++) twistPoint(history[j], o[0], o[1], 1, o);
  return o;
}

/** Mean displacement and share of sample points within `tol` of home, over a G x G grid. */
export function mess(history: readonly Twist[], G = 40, tol = 0.012): { mean: number; restored: number } {
  const o: Vec = [0, 0];
  let sum = 0;
  let ok = 0;
  for (let j = 0; j < G; j++)
    for (let i = 0; i < G; i++) {
      const px = (i + 0.5) / G;
      const py = (j + 0.5) / G;
      sourceOf(history, px, py, o);
      const e = Math.hypot(o[0] - px, o[1] - py);
      sum += e;
      if (e < tol) ok++;
    }
  return { mean: sum / (G * G), restored: ok / (G * G) };
}
