import type { Puzzle } from './puzzle';

export const GLYPH: Record<string, string> = { L: '🌀', C: '🟧', B: '🟨', M: '⬜' };

export function fmtTime(secs: number): string {
  const s = Math.max(0, Math.round(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function badge(moves: number, par: number, solved: boolean): string {
  if (!solved) return 'Still stirred';
  const d = moves - par;
  return d === 0 ? 'Flawless' : d === 1 ? 'Smooth' : d <= 3 ? 'Steady' : 'Unstirred';
}

/** Spoiler-free share text: no picture, no positions, just how it went. */
export function shareText(p: Puzzle, row: string, solved: boolean, secs: number, link: string, streak = 0): string {
  const moves = row.length;
  const score = solved ? `${moves}/${p.par}` : `X/${p.par}`;
  const lines = [
    `UNSTIR #${p.n} · ${p.tier.name}`,
    `${score} twists · ${badge(moves, p.par, solved)} · ${fmtTime(secs)}${streak > 1 ? ` · 🔥${streak}` : ''}`,
    [...row].map((c) => GLYPH[c] ?? '⬜').join(''),
  ];
  if (link) lines.push(link);
  return lines.join('\n');
}
