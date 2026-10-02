/** Synthesized sound (WebAudio, no assets). Starts on the first gesture. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let swishGain: GainNode | null = null;
let swishFilter: BiquadFilterNode | null = null;
let noise: AudioBuffer | null = null;
let enabled = true;
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];

export function setSound(on: boolean) {
  enabled = on;
  if (master && ctx) master.gain.setTargetAtTime(on ? 0.8 : 0, ctx.currentTime, 0.02);
}
export function unlockAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  try {
    ctx = new AC();
  } catch {
    return;
  }
  const c = ctx;
  master = c.createGain();
  master.gain.value = enabled ? 0.8 : 0;
  master.connect(c.destination);
  const len = c.sampleRate * 2;
  noise = c.createBuffer(1, len, c.sampleRate);
  const d = noise.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = 0.96 * last + 0.04 * w;
    d[i] = w * 0.35 + last * 3;
  }
  // Water swish: looping noise through a resonant band-pass that follows stirring speed.
  const src = c.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  swishFilter = c.createBiquadFilter();
  swishFilter.type = 'bandpass';
  swishFilter.Q.value = 2.2;
  swishFilter.frequency.value = 400;
  swishGain = c.createGain();
  swishGain.gain.value = 0;
  src.connect(swishFilter).connect(swishGain).connect(master);
  src.start();
}
/** speed: radians/second of stirring; amount: |twist| so far. */
export function swish(speed: number, amount: number) {
  if (!ctx || !swishGain || !swishFilter) return;
  const t = ctx.currentTime;
  const g = Math.min(0.5, Math.abs(speed) * 0.05);
  swishGain.gain.setTargetAtTime(g, t, 0.05);
  swishFilter.frequency.setTargetAtTime(260 + Math.min(1800, Math.abs(amount) * 260 + Math.abs(speed) * 60), t, 0.06);
}
export function swishStop() {
  if (ctx && swishGain) swishGain.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
}
function tone(freq: number, t0: number, dur: number, gain: number, type: OscillatorType = 'sine', glideTo?: number) {
  if (!ctx || !master) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}
const hz = (semi: number) => 523.25 * Math.pow(2, semi / 12);
/** Glassy chime; pitch climbs with each whirlpool cleared. */
export function chime(step: number) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const f = hz(PENTA[Math.min(PENTA.length - 1, step)]);
  tone(f, t, 1.2, 0.22);
  tone(f * 2, t, 0.8, 0.07);
  tone(f * 3.01, t + 0.005, 0.5, 0.035);
  tone(f * 0.5, t, 0.4, 0.05, 'triangle');
}
export function bloop() {
  if (!ctx) return;
  tone(330, ctx.currentTime, 0.28, 0.2, 'sine', 140);
}
export function thud() {
  if (!ctx) return;
  tone(160, ctx.currentTime, 0.16, 0.18, 'triangle', 90);
}
export function nearly() {
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(hz(7), t, 0.18, 0.1, 'sine');
  tone(hz(6), t + 0.09, 0.22, 0.08, 'sine');
}
export function fanfare() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [0, 4, 7, 12, 16].forEach((s, i) => {
    tone(hz(s), t + i * 0.09, 1.4, 0.13);
    tone(hz(s) * 2, t + i * 0.09, 0.7, 0.04);
  });
}
export function tick() {
  if (!ctx) return;
  tone(1800, ctx.currentTime, 0.03, 0.03, 'square');
}
