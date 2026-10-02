import type { DayResult } from '../core/stats';

export interface Progress {
  n: number;
  removed: number[]; // scramble indices already cancelled
  row: string;
  startedAt: number;
  elapsed: number; // ms spent before the current session
}
export interface Store {
  v: 1;
  results: Record<string, DayResult>;
  progress?: Progress;
  sound: boolean;
  haptics: boolean;
  seenHint: boolean;
  name: string;
  plus: boolean; // premium stub
  challenges: Record<string, { by: string; row: string; solved: boolean }>;
}
const KEY = 'unstir:v1';
let mem: Store | null = null;
const fresh = (): Store => ({ v: 1, results: {}, sound: true, haptics: true, seenHint: false, name: '', plus: false, challenges: {} });
export function load(): Store {
  if (mem) return mem;
  try {
    const raw = localStorage.getItem(KEY);
    mem = raw ? { ...fresh(), ...(JSON.parse(raw) as Store) } : fresh();
  } catch {
    mem = fresh();
  }
  return mem!;
}
export function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(load()));
  } catch {
    /* private mode */
  }
}
export function reset(): void {
  mem = fresh();
  save();
}
