import type { Puzzle } from '../core/puzzle';
import type { Twist } from '../core/twist';
import { judge, Verdict } from '../core/rules';
import { verdictLetter } from '../core/players';

/** One play of one puzzle: which whirlpools are left, the twist log, and timing. */
export class Session {
  removed = new Set<number>();
  row = '';
  elapsedBefore = 0;
  startedAt = 0; // 0 = clock not started (starts on first touch)
  finishedSecs = 0;
  constructor(public p: Puzzle) {}
  get remaining(): number[] {
    return this.p.twists.map((_, i) => i).filter((i) => !this.removed.has(i));
  }
  get stack(): Twist[] {
    return this.remaining.map((i) => this.p.twists[i]);
  }
  get status(): 'playing' | 'won' | 'lost' {
    if (this.removed.size === this.p.twists.length) return 'won';
    if (this.row.length >= this.p.maxTwists) return 'lost';
    return 'playing';
  }
  get locks(): number {
    return this.removed.size;
  }
  startClock() {
    if (!this.startedAt) this.startedAt = Date.now();
  }
  secs(): number {
    if (this.finishedSecs) return this.finishedSecs;
    return (this.elapsedBefore + (this.startedAt ? Date.now() - this.startedAt : 0)) / 1000;
  }
  /** Commit a twist. Returns the verdict and (for a lock) the scramble index that cleared. */
  apply(u: Twist): { v: Verdict; scrambleIndex: number } {
    const rem = this.remaining;
    const v = judge(this.stack, u);
    this.row += verdictLetter(v);
    let scrambleIndex = -1;
    if (v.kind === 'lock') {
      scrambleIndex = rem[v.index];
      this.removed.add(scrambleIndex);
    } else if (v.kind !== 'miss') scrambleIndex = rem[v.index];
    if (this.status !== 'playing') this.finishedSecs = this.secs();
    return { v, scrambleIndex };
  }
}
