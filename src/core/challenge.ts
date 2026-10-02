/** Friend challenge links: `#c=<code>`. The code carries the puzzle number and the sender's result only. */
export interface Challenge {
  n: number;
  row: string; // L/C/B/M per twist
  solved: boolean;
  secs: number;
  by: string;
}

function b64url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s: string): string {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(pad);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeChallenge(c: Challenge): string {
  const name = c.by.replace(/[|]/g, '').slice(0, 16);
  return b64url(`1|${c.n}|${c.row}|${c.solved ? 1 : 0}|${Math.round(c.secs)}|${name}`);
}

export function decodeChallenge(code: string): Challenge | null {
  try {
    const [v, n, row, solved, secs, ...name] = unb64url(code).split('|');
    if (v !== '1' || !/^\d+$/.test(n) || !/^[LCBM]{0,40}$/.test(row)) return null;
    return { n: Number(n), row, solved: solved === '1', secs: Number(secs) || 0, by: name.join('|').slice(0, 16) };
  } catch {
    return null;
  }
}
