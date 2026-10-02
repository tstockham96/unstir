/**
 * The daily pictures: flat risograph-style posters drawn with canvas vector code.
 * Deterministic (no randomness except a seeded grain), with bold stripes and rings so a
 * twist is easy to read and a restored region visibly "clicks" back.
 * Drawing space is 0..100 on both axes.
 */
import { makeRng } from '../core/rng';

type C = CanvasRenderingContext2D;
export interface Pal {
  sky: [string, string, string, string];
  sun: string;
  dark: string;
  mid: string;
  accent: string;
  accent2: string;
  light: string;
  deep: string;
  deep2: string;
  green: string;
  green2: string;
}
export const PALETTES: Pal[] = [
  { sky: ['#ff6f59', '#ff9858', '#ffbf69', '#ffe29a'], sun: '#fff4d6', dark: '#2b1d3a', mid: '#5a3d6b', accent: '#e8505b', accent2: '#14b1ab', light: '#fbf3e6', deep: '#1c3f6e', deep2: '#2d6fa8', green: '#2f7f5f', green2: '#6cc08b' },
  { sky: ['#3fb8cc', '#72cfd8', '#a9e3dd', '#e1f4e6'], sun: '#fff1b8', dark: '#13293d', mid: '#24557a', accent: '#ff7b54', accent2: '#ffc93c', light: '#fbf8ef', deep: '#0f4c75', deep2: '#1b80b3', green: '#24865c', green2: '#8bd17c' },
  { sky: ['#6c4cf5', '#9a72ff', '#cf98ff', '#ffc4e5'], sun: '#fff0f6', dark: '#22113d', mid: '#4b2a7b', accent: '#ff4f8b', accent2: '#33dfa9', light: '#fff6fa', deep: '#35206b', deep2: '#5b3fd0', green: '#178f75', green2: '#76dcb3' },
];

const TAU = Math.PI * 2;
function bands(c: C, cols: readonly string[], h: number, y0 = 0, y1 = 100) {
  for (let y = y0, i = 0; y < y1; y += h, i++) {
    c.fillStyle = cols[Math.min(cols.length - 1, Math.floor((i * h) / ((y1 - y0) / cols.length)))];
    c.fillRect(0, y, 100, h + 0.3);
  }
}
function stripes(c: C, a: string, b: string, h: number, y0 = 0, y1 = 100) {
  for (let y = y0, i = 0; y < y1; y += h, i++) {
    c.fillStyle = i % 2 ? a : b;
    c.fillRect(0, y, 100, h + 0.3);
  }
}
function waves(c: C, a: string, b: string, y0: number, y1: number, h = 3, amp = 1, k = 0.25) {
  for (let y = y0, i = 0; y < y1 + h; y += h, i++) {
    c.fillStyle = i % 2 ? a : b;
    c.beginPath();
    c.moveTo(0, 100);
    for (let x = 0; x <= 100; x += 2) c.lineTo(x, y + Math.sin(x * k + i) * amp);
    c.lineTo(100, 100);
    c.fill();
  }
}
function disc(c: C, x: number, y: number, r: number, col: string) {
  c.fillStyle = col;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
}
function poly(c: C, pts: number[], col: string) {
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath();
  c.fill();
}
function rays(c: C, x: number, y: number, n: number, a: string, b: string, rot = 0) {
  for (let i = 0; i < n; i++) {
    const a0 = rot + (i * TAU) / n;
    const a1 = rot + ((i + 1) * TAU) / n;
    c.fillStyle = i % 2 ? a : b;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(a0) * 200, y + Math.sin(a0) * 200);
    c.lineTo(x + Math.cos(a1) * 200, y + Math.sin(a1) * 200);
    c.fill();
  }
}
function rings(c: C, x: number, y: number, r0: number, step: number, n: number, a: string, b: string) {
  for (let i = n - 1; i >= 0; i--) disc(c, x, y, r0 + i * step, i % 2 ? a : b);
}
function stars(c: C, col: string, n: number, seed: number, maxY = 100) {
  const R = makeRng(seed);
  c.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const s = 0.5 + R.next() * 0.9;
    c.fillRect(R.next() * 100, R.next() * maxY, s, s);
  }
}

const S: ((c: C, p: Pal) => void)[] = [
  // 0 Sailboat at Sunset
  (c, p) => {
    bands(c, p.sky, 4, 0, 62);
    disc(c, 68, 44, 15, p.sun);
    c.fillStyle = p.sky[1];
    for (let i = 0; i < 4; i++) c.fillRect(50, 46 + i * 3.4, 40, 1.1 + i * 0.35);
    waves(c, p.deep, p.deep2, 60, 100, 3.2, 0.9, 0.22);
    poly(c, [20, 70, 64, 70, 57, 79, 27, 79], p.dark);
    poly(c, [43, 68, 43, 18, 63, 68], p.light);
    poly(c, [40.5, 68, 40.5, 27, 24, 68], p.accent);
    c.fillStyle = p.dark;
    c.fillRect(41.2, 16, 1.6, 54);
    c.strokeStyle = p.dark;
    c.lineWidth = 1;
    for (const [x, y] of [[20, 26], [27, 22]]) {
      c.beginPath();
      c.moveTo(x - 3, y);
      c.quadraticCurveTo(x - 1.5, y - 2, x, y);
      c.quadraticCurveTo(x + 1.5, y - 2, x + 3, y);
      c.stroke();
    }
  },
  // 1 Ginger Cat
  (c, p) => {
    for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
      c.fillStyle = (x + y) % 2 ? p.accent2 : p.light;
      c.fillRect(x * 10, y * 10, 10, 10);
    }
    poly(c, [20, 44, 27, 10, 46, 30], p.accent);
    poly(c, [80, 44, 73, 10, 54, 30], p.accent);
    poly(c, [25, 38, 28.5, 18, 39, 30], p.sky[3]);
    poly(c, [75, 38, 71.5, 18, 61, 30], p.sky[3]);
    disc(c, 50, 56, 33, p.accent);
    c.fillStyle = p.sky[0];
    for (const dx of [-7, 0, 7]) c.fillRect(50 + dx - 1.6, 24, 3.2, 12 - Math.abs(dx) * 0.6);
    disc(c, 50, 70, 15, p.light);
    disc(c, 37, 51, 7, p.light);
    disc(c, 63, 51, 7, p.light);
    disc(c, 37, 51, 4.6, p.green);
    disc(c, 63, 51, 4.6, p.green);
    c.fillStyle = p.dark;
    c.fillRect(36, 47, 2, 8);
    c.fillRect(62, 47, 2, 8);
    poly(c, [45.5, 62, 54.5, 62, 50, 67], p.accent);
    c.strokeStyle = p.dark;
    c.lineWidth = 1.1;
    for (const s of [-1, 1]) for (const d of [-4, 0, 4]) {
      c.beginPath();
      c.moveTo(50 + s * 9, 67 + d * 0.25);
      c.lineTo(50 + s * 38, 63 + d);
      c.stroke();
    }
  },
  // 2 Neon Skyline
  (c, p) => {
    bands(c, [p.dark, p.mid, p.accent, p.sky[1]], 3.5, 0, 72);
    disc(c, 72, 24, 9, p.sun);
    stars(c, p.light, 40, 21, 40);
    const b = [[1, 44, 13], [15, 30, 11], [27, 52, 9], [37, 20, 14], [52, 40, 10], [63, 28, 13], [77, 48, 9], [87, 36, 13]];
    for (const [x, y, w] of b) {
      c.fillStyle = p.dark;
      c.fillRect(x, y, w, 72 - y);
      c.fillStyle = p.accent2;
      for (let yy = y + 3; yy < 70; yy += 4.5) for (let xx = x + 2; xx < x + w - 2; xx += 3.5) c.fillRect(xx, yy, 1.8, 2.2);
    }
    stripes(c, p.deep, p.dark, 2.4, 72, 100);
    c.fillStyle = p.accent2;
    for (const [x, , w] of b) for (let yy = 75; yy < 100; yy += 4.8) c.fillRect(x + 2, yy, w - 4, 0.9);
  },
  // 3 Ringed Planet
  (c, p) => {
    c.fillStyle = p.dark;
    c.fillRect(0, 0, 100, 100);
    c.lineWidth = 4;
    for (let i = -4; i < 18; i++) {
      c.strokeStyle = i % 2 ? p.mid : p.dark;
      c.beginPath();
      c.moveTo(-10, i * 7);
      c.lineTo(110, i * 7 - 34);
      c.stroke();
    }
    stars(c, p.light, 70, 33);
    c.strokeStyle = p.accent2;
    c.lineWidth = 3.4;
    c.beginPath();
    c.ellipse(50, 52, 42, 11, -0.32, Math.PI, TAU);
    c.stroke();
    disc(c, 50, 52, 23, p.accent);
    c.save();
    c.beginPath();
    c.arc(50, 52, 23, 0, TAU);
    c.clip();
    for (let i = -3; i <= 3; i++) {
      c.fillStyle = i % 2 ? p.sky[1] : p.sky[3];
      c.save();
      c.translate(50, 52);
      c.rotate(-0.32);
      c.fillRect(-30, i * 6.5 - 1.6, 60, 3.2);
      c.restore();
    }
    c.restore();
    c.strokeStyle = p.accent2;
    c.beginPath();
    c.ellipse(50, 52, 42, 11, -0.32, 0, Math.PI);
    c.stroke();
    disc(c, 82, 20, 5, p.light);
    disc(c, 80.5, 18.5, 1.3, p.sky[3]);
  },
  // 4 Lighthouse
  (c, p) => {
    rays(c, 50, 24, 18, p.sky[2], p.sky[3], 0.1);
    bands(c, [p.deep, p.deep2], 3, 72, 100);
    waves(c, p.deep, p.deep2, 74, 100, 3, 1, 0.3);
    poly(c, [0, 80, 18, 66, 38, 70, 62, 68, 84, 72, 100, 82, 100, 86, 0, 86], p.dark);
    poly(c, [40, 70, 43, 30, 57, 30, 60, 70], p.light);
    c.save();
    c.beginPath();
    c.moveTo(40, 70);
    c.lineTo(43, 30);
    c.lineTo(57, 30);
    c.lineTo(60, 70);
    c.clip();
    c.fillStyle = p.accent;
    for (let y = 34; y < 70; y += 10) c.fillRect(30, y, 40, 5);
    c.restore();
    c.fillStyle = p.dark;
    c.fillRect(41, 27, 18, 3.5);
    c.fillRect(43.5, 18, 13, 9);
    disc(c, 50, 22.5, 4, p.sun);
    poly(c, [42, 18, 50, 11, 58, 18], p.accent);
  },
  // 5 Hot-Air Balloon
  (c, p) => {
    bands(c, [p.sky[3], p.sky[2], p.sky[1], p.sky[0]], 5);
    for (const [x, y, s] of [[18, 22, 1], [80, 70, 1.3], [72, 16, 0.8]]) {
      c.fillStyle = p.light;
      for (const [dx, dy, r] of [[0, 0, 5], [5, -2, 6], [10, 0, 4.5], [5, 2, 5]]) disc(c, x + dx * s, y + dy * s, r * s, p.light);
    }
    c.save();
    c.beginPath();
    c.ellipse(50, 40, 25, 28, 0, 0, TAU);
    c.moveTo(30, 56);
    c.lineTo(44, 74);
    c.lineTo(56, 74);
    c.lineTo(70, 56);
    c.clip();
    const cols = [p.accent, p.accent2, p.light, p.accent2];
    for (let i = 0; i < 8; i++) {
      c.fillStyle = cols[i % 4];
      c.beginPath();
      c.ellipse(50, 40, 25 - i * 3.3, 30, 0, 0, TAU);
      c.fill();
    }
    c.restore();
    c.strokeStyle = p.dark;
    c.lineWidth = 0.8;
    for (const x of [45, 55]) {
      c.beginPath();
      c.moveTo(x, 74);
      c.lineTo(x + (x < 50 ? 0.5 : -0.5), 82);
      c.stroke();
    }
    c.fillStyle = p.mid;
    c.fillRect(44, 82, 12, 7);
    c.fillStyle = p.dark;
    for (let x = 45; x < 56; x += 2.5) c.fillRect(x, 82, 0.8, 7);
  },
  // 6 Mountain Lake
  (c, p) => {
    bands(c, p.sky, 3.5, 0, 56);
    disc(c, 30, 30, 9, p.sun);
    const mtn = (pts: number[], col: string) => poly(c, [0, 56, ...pts, 100, 56], col);
    mtn([0, 40, 18, 24, 34, 38, 52, 18, 70, 34, 86, 22, 100, 32], p.mid);
    mtn([0, 48, 22, 32, 44, 46, 64, 28, 84, 44, 100, 38], p.dark);
    poly(c, [52, 18, 47, 24, 50, 23, 53, 26, 56, 23], p.light);
    poly(c, [86, 22, 82, 27, 86, 26, 90, 28], p.light);
    // reflection: mirrored bands
    for (let y = 56, i = 0; y < 100; y += 2.6, i++) {
      c.fillStyle = i % 2 ? p.deep2 : p.deep;
      c.fillRect(0, y, 100, 2.7);
    }
    c.fillStyle = p.sun;
    for (let i = 0; i < 6; i++) c.fillRect(24 + i, 60 + i * 4, 12 - i * 2, 1.2);
    for (const x of [8, 14, 88, 94]) {
      poly(c, [x, 44, x - 4, 58, x + 4, 58], p.green);
      poly(c, [x, 40, x - 3, 50, x + 3, 50], p.green2);
    }
  },
  // 7 Rocket Launch
  (c, p) => {
    c.fillStyle = p.dark;
    c.fillRect(0, 0, 100, 100);
    rings(c, 50, 120, 40, 7, 9, p.mid, p.deep);
    stars(c, p.light, 80, 77, 70);
    for (const [x, y, r] of [[38, 84, 9], [62, 86, 10], [50, 90, 11], [28, 92, 8], [72, 94, 9]]) disc(c, x, y, r, p.light);
    poly(c, [46, 70, 54, 70, 56, 82, 50, 92, 44, 82], p.accent2);
    poly(c, [47.5, 70, 52.5, 70, 53, 78, 50, 85, 47, 78], p.sun);
    c.fillStyle = p.light;
    c.beginPath();
    c.moveTo(50, 14);
    c.quadraticCurveTo(62, 30, 59, 66);
    c.lineTo(41, 66);
    c.quadraticCurveTo(38, 30, 50, 14);
    c.fill();
    c.fillStyle = p.accent;
    c.fillRect(40, 44, 20, 4);
    c.fillRect(40, 56, 20, 4);
    poly(c, [41, 52, 33, 70, 41, 66], p.accent);
    poly(c, [59, 52, 67, 70, 59, 66], p.accent);
    disc(c, 50, 34, 5.5, p.mid);
    disc(c, 50, 34, 3.8, p.accent2);
  },
  // 8 Desert Cactus
  (c, p) => {
    bands(c, p.sky, 4, 0, 64);
    rings(c, 66, 34, 9, 4, 4, p.sky[2], p.sun);
    for (let i = 0; i < 6; i++) {
      c.fillStyle = i % 2 ? p.accent : p.sky[0];
      c.beginPath();
      c.moveTo(0, 100);
      for (let x = 0; x <= 100; x += 2) c.lineTo(x, 62 + i * 6.5 + Math.sin(x * 0.06 + i * 1.7) * 3);
      c.lineTo(100, 100);
      c.fill();
    }
    const g = p.green;
    const arm = (x: number, y: number, w: number, h: number) => {
      c.fillStyle = g;
      c.beginPath();
      c.roundRect(x, y, w, h, w / 2);
      c.fill();
    };
    arm(43, 24, 14, 62);
    arm(28, 40, 10, 22);
    arm(30, 54, 16, 8);
    arm(62, 32, 10, 20);
    arm(54, 46, 16, 8);
    c.fillStyle = p.green2;
    for (const x of [46.5, 50, 53.5]) c.fillRect(x - 0.6, 27, 1.2, 56);
    c.fillRect(32.4, 43, 1.2, 16);
    c.fillRect(66.4, 35, 1.2, 14);
    disc(c, 50, 23.5, 3, p.accent);
  },
  // 9 Sunflower
  (c, p) => {
    rays(c, 50, 44, 24, p.sky[1], p.sky[2]);
    c.fillStyle = p.green;
    c.fillRect(48, 60, 4, 40);
    poly(c, [50, 80, 30, 70, 38, 84], p.green2);
    poly(c, [50, 88, 70, 76, 64, 92], p.green2);
    for (let i = 0; i < 18; i++) {
      c.save();
      c.translate(50, 44);
      c.rotate((i * TAU) / 18);
      c.fillStyle = i % 2 ? p.accent2 : p.sun;
      c.beginPath();
      c.ellipse(0, -22, 5, 12, 0, 0, TAU);
      c.fill();
      c.restore();
    }
    disc(c, 50, 44, 15, p.dark);
    const ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < 150; i++) {
      const r = Math.sqrt(i / 150) * 13.5;
      disc(c, 50 + Math.cos(i * ga) * r, 44 + Math.sin(i * ga) * r, 0.75, i % 3 ? p.mid : p.accent);
    }
  },
  // 10 Night Owl
  (c, p) => {
    bands(c, [p.dark, p.deep, p.mid], 4);
    stars(c, p.light, 50, 101, 60);
    disc(c, 80, 18, 9, p.sun);
    disc(c, 84, 15, 8, p.deep);
    c.fillStyle = p.dark;
    c.fillRect(0, 80, 100, 5);
    c.fillStyle = p.accent;
    c.beginPath();
    c.ellipse(50, 56, 22, 28, 0, 0, TAU);
    c.fill();
    poly(c, [30, 36, 34, 22, 42, 32], p.accent);
    poly(c, [70, 36, 66, 22, 58, 32], p.accent);
    c.fillStyle = p.sky[3];
    c.beginPath();
    c.ellipse(50, 66, 13, 16, 0, 0, TAU);
    c.fill();
    c.strokeStyle = p.accent;
    c.lineWidth = 1.2;
    for (let y = 58; y < 80; y += 4.5)
      for (let x = 41; x < 60; x += 5) {
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + 2.5, y + 2);
        c.lineTo(x + 5, y);
        c.stroke();
      }
    for (const x of [40, 60]) {
      rings(c, x, 44, 2.4, 2.4, 4, p.light, p.accent2);
      disc(c, x, 44, 2.6, p.dark);
    }
    poly(c, [47.5, 50, 52.5, 50, 50, 55], p.sun);
    c.fillStyle = p.sun;
    for (const x of [42, 48, 54]) c.fillRect(x, 82, 3, 2);
  },
  // 11 Blue Whale
  (c, p) => {
    bands(c, [p.sky[3], p.sky[2]], 4, 0, 30);
    waves(c, p.deep2, p.deep, 28, 100, 4, 1.1, 0.2);
    for (const [x, y, r] of [[18, 70, 1.6], [22, 62, 1.1], [80, 78, 1.8], [84, 70, 1.2], [76, 86, 1]]) {
      c.strokeStyle = p.light;
      c.lineWidth = 0.7;
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.stroke();
    }
    const body = new Path2D();
    body.moveTo(14, 56);
    body.quadraticCurveTo(20, 34, 52, 38);
    body.quadraticCurveTo(76, 41, 80, 54);
    body.lineTo(92, 46);
    body.lineTo(90, 58);
    body.lineTo(94, 68);
    body.lineTo(80, 60);
    body.quadraticCurveTo(60, 74, 30, 70);
    body.quadraticCurveTo(14, 66, 14, 56);
    c.fillStyle = p.mid;
    c.fill(body);
    c.strokeStyle = p.light;
    c.lineWidth = 1.1;
    c.stroke(body);
    c.save();
    c.clip(body);
    c.beginPath();
    c.moveTo(14, 60);
    c.quadraticCurveTo(40, 72, 80, 58);
    c.lineTo(80, 76);
    c.lineTo(14, 76);
    c.clip();
    for (let y = 56; y < 76; y += 2.4) {
      c.fillStyle = (y / 2.4) % 2 < 1 ? p.light : p.sky[2];
      c.fillRect(10, y, 72, 1.2);
    }
    c.restore();
    disc(c, 26, 54, 1.8, p.dark);
    c.fillStyle = p.light;
    for (const [dx, dy] of [[0, 0], [-3, -3], [3, -3], [-5, -7], [5, -7], [0, -6]]) disc(c, 36 + dx, 30 + dy, 1.4, p.light);
  },
  // 12 Mushroom Grove
  (c, p) => {
    stripes(c, p.sky[2], p.sky[3], 5, 0, 72);
    for (let i = 0; i < 5; i++) {
      c.fillStyle = i % 2 ? p.green : p.green2;
      c.beginPath();
      c.moveTo(0, 100);
      for (let x = 0; x <= 100; x += 3) c.lineTo(x, 70 + i * 6 + (x % 6 === 0 ? -2 : 1.5));
      c.lineTo(100, 100);
      c.fill();
    }
    const mush = (x: number, y: number, s: number, cap: string) => {
      c.fillStyle = p.light;
      c.beginPath();
      c.roundRect(x - 5 * s, y, 10 * s, 26 * s, 3 * s);
      c.fill();
      c.fillStyle = cap;
      c.beginPath();
      c.ellipse(x, y + 1 * s, 20 * s, 15 * s, 0, Math.PI, TAU);
      c.fill();
      for (const [dx, dy, r] of [[-10, -6, 2.6], [0, -11, 3], [9, -5, 2.4], [-3, -3, 1.6], [14, -1, 1.4], [-15, -1, 1.5]]) disc(c, x + dx * s, y + dy * s, r * s, p.light);
    };
    mush(70, 58, 0.6, p.accent2);
    mush(42, 46, 1, p.accent);
    mush(18, 70, 0.45, p.mid);
  },
  // 13 Koi Pond
  (c, p) => {
    c.fillStyle = p.deep;
    c.fillRect(0, 0, 100, 100);
    for (const [x, y] of [[30, 30], [72, 70]]) rings(c, x, y, 4, 4, 14, p.deep, p.deep2);
    const koi = (x: number, y: number, a: number, body: string, spot: string) => {
      c.save();
      c.translate(x, y);
      c.rotate(a);
      c.fillStyle = body;
      c.beginPath();
      c.ellipse(0, 0, 14, 5.5, 0, 0, TAU);
      c.fill();
      poly(c, [12, 0, 21, -6, 19, 0, 21, 6], body);
      disc(c, -4, -1, 3, spot);
      disc(c, 4, 1.5, 2.4, spot);
      disc(c, -10, -1.6, 0.9, p.dark);
      c.restore();
    };
    koi(36, 44, 0.5, p.light, p.accent);
    koi(64, 30, 2.6, p.accent, p.light);
    koi(58, 78, -0.4, p.sun, p.accent);
    for (const [x, y, r] of [[18, 78, 9], [84, 18, 8], [86, 50, 5]]) {
      disc(c, x, y, r, p.green);
      poly(c, [x, y, x + r, y - 2, x + r, y + 2], p.deep);
      disc(c, x - r * 0.3, y - r * 0.3, r * 0.25, p.green2);
    }
  },
];

/** Paint scene `i` with palette `pal` on a square canvas of size `size`. */
export function drawScene(ctx: C, i: number, pal: number, size: number) {
  const p = PALETTES[pal % PALETTES.length];
  ctx.save();
  ctx.scale(size / 100, size / 100);
  S[i % S.length](ctx, p);
  ctx.restore();
  // Seeded risograph grain (deterministic).
  const R = makeRng(9001 + i);
  const n = Math.floor(size * size * 0.012);
  for (let k = 0; k < n; k++) {
    ctx.fillStyle = R.next() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.08)';
    ctx.fillRect(R.next() * size, R.next() * size, 1.5, 1.5);
  }
}
export const SCENE_DRAWERS = S.length;
