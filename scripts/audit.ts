// Design audit: skill gradient, brute-force resistance, 7+ day variety/difficulty, solvability in any order.
import { puzzleFor, solveOrder } from '../src/core/puzzle';
import { MODELS, simulate } from '../src/core/players';
import { judge, inverse } from '../src/core/rules';
import { mess, gapBetween } from '../src/core/twist';
import { crowdFor } from '../src/core/crowd';
import { formatPuzzleDate } from '../src/core/date';
import { writeFileSync, mkdirSync } from 'node:fs';
const days = Number(process.argv[2] || 14);
const out: any[] = [];
const names = ['expert', 'casual', 'novice', 'sloppy', 'jabber', 'tapper'] as const;
console.log('#   date        tier       par minGap minR  stir%  ' + names.map((n) => n.padStart(11)).join(''));
for (let n = 1; n <= days; n++) {
  const p = puzzleFor(n);
  // Solvability: exact inverses lock every whirlpool in exactly par moves, forwards and backwards.
  let ok = true;
  for (const order of [solveOrder(p.twists), solveOrder(p.twists).reverse()]) {
    let stack = p.twists.slice();
    for (const i of order) { const v = judge(stack, inverse(p.twists[i])); if (v.kind !== 'lock') ok = false; else stack = stack.filter((_, k) => k !== v.index); }
    if (stack.length) ok = false;
  }
  let minGap = Infinity;
  for (let i = 0; i < p.twists.length; i++) for (let j = i + 1; j < p.twists.length; j++) minGap = Math.min(minGap, gapBetween(p.twists[i], p.twists[j]));
  const row: any = { n, date: formatPuzzleDate(n), tier: p.tier.name, par: p.par, scene: p.sceneName, guide: p.guide.kind, solvableInPar: ok, minGap: +minGap.toFixed(3), minR: Math.min(...p.twists.map((t) => t.r)), minS: Math.min(...p.twists.map((t) => Math.abs(t.s))), stirred: +(100 - mess(p.twists).restored * 100).toFixed(0), models: {} };
  for (const nm of names) {
    const rs = Array.from({ length: 400 }, (_, s) => simulate(p, MODELS[nm], n * 7777 + s));
    const solvedR = rs.filter((r) => r.solved); const mv = solvedR.map((r) => r.moves).sort((a, b) => a - b);
    row.models[nm] = { solve: +(solvedR.length / rs.length).toFixed(3), mean: mv.length ? +(mv.reduce((a, b) => a + b, 0) / mv.length).toFixed(2) : null, median: mv[Math.floor(mv.length / 2)] ?? null, parRate: +(rs.filter((r) => r.solved && r.moves === p.par).length / rs.length).toFixed(2) };
  }
  const c = crowdFor(p); row.crowd = { solveRate: +c.solveRate.toFixed(2), mean: +c.meanMoves.toFixed(2), hist: c.hist };
  out.push(row);
  console.log(`${String(n).padEnd(3)} ${row.date.padEnd(11)} ${p.tier.name.padEnd(10)} ${p.par}   ${String(row.minGap).padEnd(6)} ${String(row.minR).padEnd(5)} ${String(row.stirred).padEnd(5)}  ` + names.map((nm) => { const m = row.models[nm]; return `${m.mean ?? '-'}/${(m.solve * 100).toFixed(1)}%`.padStart(11); }).join('') + `  ${ok ? 'solvable' : 'UNSOLVABLE'}  ${p.guide.kind.padEnd(7)} ${p.sceneName}`);
}
mkdirSync('shots', { recursive: true });
writeFileSync('shots/audit.json', JSON.stringify(out, null, 1));
console.log('cells = mean twists when solved / solve rate (cap = par+6)');
