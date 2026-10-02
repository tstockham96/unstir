/**
 * Draws the stirred picture. WebGL: every pixel pulls its colour back through the twist stack
 * analytically (crisp at full device resolution, 60 fps). Falls back to a CPU canvas path.
 */
import type { Twist } from '../core/twist';
import { sourceOf } from '../core/twist';

export const MAX_TWISTS = 16;

const VS = `attribute vec2 aPos; varying vec2 vUv;
void main(){ vUv = vec2(aPos.x*0.5+0.5, 0.5-aPos.y*0.5); gl_Position = vec4(aPos,0.0,1.0); }`;
const FS = `precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
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
  col += uGlow * 0.18 * (1.0 - smoothstep(0.0, 0.75, length(p - 0.5)));
  gl_FragColor = vec4(col, 1.0);
}`;

export interface Renderer {
  kind: 'webgl' | 'canvas';
  setPicture(src: HTMLCanvasElement): void;
  draw(twists: readonly Twist[], glow?: number): void;
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
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const uT = gl.getUniformLocation(prog, 'uT');
  const uN = gl.getUniformLocation(prog, 'uN');
  const uGlow = gl.getUniformLocation(prog, 'uGlow');
  const uTime = gl.getUniformLocation(prog, 'uTime');
  const arr = new Float32Array(MAX_TWISTS * 4);
  const t0 = performance.now();
  return {
    kind: 'webgl',
    setPicture(src) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    },
    resize(css, dpr) {
      const px = Math.round(css * Math.min(dpr, 2));
      canvas.width = canvas.height = px;
      canvas.style.width = canvas.style.height = css + 'px';
      gl.viewport(0, 0, px, px);
    },
    draw(twists, glow = 0) {
      const n = Math.min(MAX_TWISTS, twists.length);
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
    setPicture(src) {
      S = src.width;
      src32 = new Uint32Array(src.getContext('2d')!.getImageData(0, 0, S, S).data.buffer.slice(0));
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
