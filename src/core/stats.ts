export interface DayResult {
  row: string;
  solved: boolean;
  secs: number;
  par: number;
  at: number;
}

export interface Stats {
  played: number;
  solved: number;
  streak: number;
  maxStreak: number;
  flawless: number;
  dist: number[]; // index = moves - par (0..6), 7 = failed
}

/** Streak = consecutive solved puzzle numbers ending at `today` (or yesterday if today isn't played yet). */
export function computeStats(results: Record<string, DayResult>, today: number): Stats {
  const nums = Object.keys(results).map(Number).sort((a, b) => a - b);
  const dist = new Array(8).fill(0);
  let solved = 0;
  let flawless = 0;
  let maxStreak = 0;
  let run = 0;
  let prev = -10;
  for (const n of nums) {
    const r = results[n];
    if (r.solved) {
      solved++;
      dist[Math.min(6, r.row.length - r.par)]++;
      if (r.row.length === r.par) flawless++;
      run = n === prev + 1 ? run + 1 : 1;
      prev = n;
      maxStreak = Math.max(maxStreak, run);
    } else {
      dist[7]++;
      run = 0;
      prev = -10;
    }
  }
  let streak = 0;
  let k = results[today] ? today : today - 1;
  while (results[k]?.solved) {
    streak++;
    k--;
  }
  return { played: nums.length, solved, streak, maxStreak, flawless, dist };
}
