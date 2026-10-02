/**
 * Draws the stirred picture. WebGL: every pixel pulls its colour back through the twist stack
 * analytically (crisp at full device resolution, 60 fps). Falls back to a CPU canvas path.
 * The guide pattern is a second texture sampled through the SAME warp, so its straight lines
 * curl exactly like the picture does.
 */
import type { Twist } from '../core/twist';
import { sourceOf } from '../core/twist';
import { GUIDE_PAD } from './guide';

/** A brief brightening of the guide lines inside a disk (x, y, r in board units; a = 0..1). */
export interface Flash {
  x: number;
  y: number;
  r: number;
  a: number;
}

export const MAX_TWISTS = 16;

const VS = `attribute vec2 aPos; varying vec2 vUv;
void main(){ vUv = vec2(aPos.x*0.5+0.5, 0.5-aPos.y*0.5); gl_Position = vec4(aPos,0.0,1.0); }`;
const FS = `precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform sampler2D uGuide;
uniform float uGuideOn;
uniform vec4 uFlash;
uniform vec4 uT[${MAX_TWISTS}];
uniform int uN;
uniform float uGlow;
uniform float uTime;
void main(){
  vec2 p = vUv;
  vec2 q = p;
  for (int i = ${MAX_TWISTS - 1}; i >= 0; i--) {
    if (i < uN) {
      vec4 t = uT[i];
      vec2 d = q - t.xy;
      float r = length(d);
      if (r < t.z) {
        float f = 1.0 - r / t.z;
        float a = -t.w * f * f;
        float c = cos(a); float s = sin(a);
        q = t.xy + vec2(d.x*c - d.y*s, d.x*s + d.y*c);
      }
    }
  }
  vec3 col = texture2D(uTex, clamp(q, vec2(0.001), vec2(0.999))).rgb;
  float disp = length(q - p);
  float st = smoothstep(0.003, 0.07, disp);
  // stirred water reads a touch cooler and darker, with a faint caustic shimmer; clean areas pop.
  float shimmer = 0.5 + 0.5 * sin(disp * 140.0 - uTime * 2.2);
  col = mix(col, col * vec3(0.8, 0.86, 0.98) + vec3(0.02, 0.03, 0.06) * shimmer, st * 0.5);
  // guide pattern (premultiplied alpha), stirred along with the picture
  vec4 gd = texture2D(uGuide, clamp((q + ${GUIDE_PAD.toFixed(3)}) / ${(1 + 2 * GUIDE_PAD).toFixed(3)}, vec2(0.0), vec2(1.0)));
  float fl = uFlash.w * (1.0 - smoothstep(uFlash.z * 0.8, uFlash.z, length(p - uFlash.xy)));
  float k = uGuideOn * (0.92 + fl * 0.08);
  col = col * (1.0 - gd.a * k) + gd.rgb * k;
  col += fl * gd.a * vec3(0.55, 0.48, 0.3);
  col += uGlow * 0.18 * (1.0 - smoothstep(0.0, 0.75, length(p - 0.5)));
  gl_FragColor = vec4(col, 1.0);
}`;

export interface Renderer {
  kind: 'webgl' | 'canvas';
  setPicture(src: HTMLCanvasElement, guide?: HTMLCanvasElement): void;
  draw(twists: readonly Twist[], glow?: number, flash?: Flash | null, guideOn?: number): void;
  resize(cssSize: number, dpr: number): void;
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const gl = (canvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: true, premultipliedAlpha: false }) ||
    canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
  if (gl) {
    try {
      return glRenderer(canvas, gl);
    } catch (e) {
      console.warn('WebGL failed, using canvas', e);
    }
  }
  return cpuRenderer(canvas);
}

function glRenderer(canvas: HTMLCanvasElement, gl: WebGLRenderingContext): Renderer {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const mkTex = (unit: number) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const tex = mkTex(0);
  const gtex = mkTex(1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); // empty until set
  gl.uniform1i(gl.getUniformLocation(prog, 'uTex'), 0);
  gl.uniform1i(gl.getUniformLocation(prog, 'uGuide'), 1);
  const uGuideOn = gl.getUniformLocation(prog, 'uGuideOn');
  const uFlash = gl.getUniformLocation(prog, 'uFlash');
  const uT = gl.getUniformLocation(prog, 'uT');
  const uN = gl.getUniformLocation(prog, 'uN');
  const uGlow = gl.getUniformLocation(prog, 'uGlow');
  const uTime = gl.getUniformLocation(prog, 'uTime');
  const arr = new Float32Array(MAX_TWISTS * 4);
  const t0 = performance.now();
  return {
    kind: 'webgl',
    setPicture(src, guide) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      if (guide) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, gtex);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, guide);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.activeTexture(gl.TEXTURE0);
      }
    },
    resize(css, dpr) {
      const px = Math.round(css * Math.min(dpr, 2));
      canvas.width = canvas.height = px;
      canvas.style.width = canvas.style.height = css + 'px';
      gl.viewport(0, 0, px, px);
    },
    draw(twists, glow = 0, flash = null, guideOn = 1) {
      const n = Math.min(MAX_TWISTS, twists.length);
      gl.uniform1f(uGuideOn, guideOn);
      gl.uniform4f(uFlash, flash ? flash.x : 0, flash ? flash.y : 0, flash ? flash.r : 0, flash ? flash.a : 0);
      arr.fill(0);
      for (let i = 0; i < n; i++) {
        const t = twists[twists.length - n + i];
        arr.set([t.x, t.y, t.r, t.s], i * 4);
      }
      gl.uniform4fv(uT, arr);
      gl.uniform1i(uN, n);
      gl.uniform1f(uGlow, glow);
      gl.uniform1f(uTime, (performance.now() - t0) / 1000);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
  };
}

function cpuRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext('2d')!;
  const N = 300;
  let src32 = new Uint32Array(1);
  let S = 1;
  const img = ctx.createImageData(N, N);
  const out = new Uint32Array(img.data.buffer);
  const o: [number, number] = [0, 0];
  return {
    kind: 'canvas',
    setPicture(src, guide) {
      S = src.width;
      const c = document.createElement('canvas');
      c.width = c.height = S;
      const cx = c.getContext('2d')!;
      cx.drawImage(src, 0, 0);
      if (guide) {
        // crop the padded guide to the board
        const span = 1 + 2 * GUIDE_PAD;
        const g = guide.width;
        cx.drawImage(guide, (GUIDE_PAD / span) * g, (GUIDE_PAD / span) * g, g / span, g / span, 0, 0, S, S);
      }
      src32 = new Uint32Array(cx.getImageData(0, 0, S, S).data.buffer.slice(0));
    },
    resize(css) {
      canvas.width = canvas.height = N;
      canvas.style.width = canvas.style.height = css + 'px';
    },
    draw(twists) {
      for (let j = 0; j < N; j++)
        for (let i = 0; i < N; i++) {
          sourceOf(twists, (i + 0.5) / N, (j + 0.5) / N, o);
          const x = Math.min(S - 1, Math.max(0, (o[0] * S) | 0));
          const y = Math.min(S - 1, Math.max(0, (o[1] * S) | 0));
          out[j * N + i] = src32[y * S + x];
        }
      ctx.putImageData(img, 0, 0);
    },
  };
}
