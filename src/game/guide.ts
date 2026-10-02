/**
 * The guide pattern: a crisp, fine pattern of straight lines (or a dot lattice) laid over the
 * picture and stirred together with it. Straight lines that curl show exactly where each
 * whirlpool is and where its eye sits, without any marker that gives the centre away.
 *
 * The texture covers more than the board (GUIDE_PAD on every side) so whirlpools near the edge
 * pull in real pattern from just outside the frame instead of smearing the border.
 */
import type { Guide } from '../core/puzzle';
import { PALETTES } from './scenes';

export const GUIDE_PAD = 0.22; // board widths of pattern beyond each edge
export const GUIDE_SIZE = 1536;

/** Paint the guide on a transparent square canvas of `size` px covering [-PAD, 1+PAD]² of the board. */
export function drawGuide(ctx: CanvasRenderingContext2D, g: Guide, pal: number, size = GUIDE_SIZE, pad = GUIDE_PAD) {
  const p = PALETTES[pal % PALETTES.length];
  const span = 1 + 2 * pad;
  const k = size / span; // px per board width
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(g.angle);
  const step = g.step * k;
  const reach = size * 0.75; // half-diagonal, so rotated lines still cover the whole canvas
  const n = Math.ceil(reach / step);
  const px = k / 348; // ~1 css px on a typical phone board
  if (g.kind === 'dots') {
    const rad = 2.1 * px;
    for (let i = -n; i <= n; i++)
      for (let j = -n; j <= n; j++) {
        ctx.beginPath();
        ctx.arc(i * step, j * step, rad + 1.1 * px, 0, Math.PI * 2);
        ctx.fillStyle = hexA(p.dark, 0.42);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(i * step, j * step, rad, 0, Math.PI * 2);
        ctx.fillStyle = hexA(p.light, 0.92);
        ctx.fill();
      }
  } else {
    const lines = (w: number, col: string) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      for (let i = -n; i <= n; i++) {
        ctx.moveTo(i * step, -reach);
        ctx.lineTo(i * step, reach);
        if (g.kind === 'grid') {
          ctx.moveTo(-reach, i * step);
          ctx.lineTo(reach, i * step);
        }
      }
      ctx.stroke();
    };
    const w = g.kind === 'stripes' ? 1.25 : 1;
    lines(2.6 * px * w, hexA(p.dark, 0.26)); // soft dark under-stroke: reads on light areas
    lines(1.1 * px * w, hexA(p.light, 0.74)); // thin light line: reads on dark areas
  }
  ctx.restore();
}

function hexA(hex: string, a: number): string {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}
