import { puzzleFor, solveOrder } from '../src/core/puzzle';
import { mess } from '../src/core/twist';
import { formatPuzzleDate } from '../src/core/date';
const t0 = Date.now();
for (let n = 1; n <= 14; n++) { const p = puzzleFor(n); console.log(`#${n} ${formatPuzzleDate(n)} ${p.tier.name.padEnd(9)} k=${p.par} tries=${p.attempts} restored0=${(mess(p.twists).restored * 100).toFixed(0)}% guide=${p.guide.kind} scene=${p.sceneName} order=${solveOrder(p.twists).join('')}`); }
console.log('ms', Date.now() - t0);
