import { Vector2, type IUniform, type Texture } from 'three';

// ---------------------------------------------------------------------------
// CRT post shader: barrel warp, scanlines, vignette, rounded-corner mask,
// RGB fringe, grain, scheduled static bursts, brightness flicker.
// Tuning constants live at the top of the fragment shader.
// ---------------------------------------------------------------------------

/** Corner radius as a fraction of min(resolution) — mirrored to --crt-radius CSS. */
export const CRT_CORNER_FRAC = 0.055;

export interface CrtUniforms {
  tDiffuse: IUniform<Texture | null>;
  uResolution: IUniform<Vector2>;
  uTime: IUniform<number>;
  uBurst: IUniform<number>;
  uSeed: IUniform<number>;
  [uniform: string]: IUniform<unknown>;
}

export function createCrtUniforms(): CrtUniforms {
  return {
    tDiffuse: { value: null },
    uResolution: { value: new Vector2(1, 1) },
    uTime: { value: 0 },
    uBurst: { value: 0 },
    uSeed: { value: 0.5 },
  };
}

export const CRT_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const CRT_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2  uResolution;  // physical px of the output framebuffer
uniform float uTime;        // seconds
uniform float uBurst;       // 0..1 static-burst envelope (CPU scheduled)
uniform float uSeed;        // per-frame random 0..1

varying vec2 vUv;

// ---- tuning constants ----
const float BARREL_K1    = 0.042;  // primary glass curvature
const float BARREL_K2    = 0.018;  // corner tightening
const float SCAN_AMP     = 0.16;   // scanline darkening 0..1
const float SCAN_LINES   = 240.0;  // target line count (clamped vs resolution)
const float VIGNETTE_AMP = 0.16;   // kept low: CSS overlay adds the rest
const float CORNER_FRAC  = ${CRT_CORNER_FRAC.toFixed(3)}; // must match --crt-radius
const float CORNER_INSET = 2.0;    // px inside the CSS clip so the feather shows
const float FRINGE_PX    = 0.9;    // max chromatic offset in px at corners
const float GRAIN_AMP    = 0.02;   // constant low-level grain
const float BURST_AMP    = 0.32;   // band-noise strength during a burst
const float FLICKER_AMP  = 0.012;  // overall brightness wobble

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  float aspect = uResolution.x / uResolution.y;

  // Barrel warp (aspect-corrected so the curvature is circular).
  vec2 cc = vUv - 0.5;
  cc.x *= aspect;
  float r2 = dot(cc, cc);
  float f = 1.0 + BARREL_K1 * r2 + BARREL_K2 * r2 * r2;
  vec2 duv = cc * f;
  duv.x /= aspect;
  duv += 0.5;

  // Static burst: horizontal band jitter.
  if (uBurst > 0.0) {
    float bandId = floor(duv.y * 36.0);
    float band = step(0.72, hash(vec2(bandId, floor(uTime * 47.0))));
    duv.x += (hash(vec2(bandId, uSeed)) - 0.5) * 0.012 * uBurst * band;
  }

  // Out of bounds after warp -> black.
  if (duv.x < 0.0 || duv.x > 1.0 || duv.y < 0.0 || duv.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // Sample with a subtle radial RGB fringe.
  vec2 fringe = (cc / max(aspect, 1.0)) * r2 * (FRINGE_PX / uResolution.y) * 4.0;
  vec3 col;
  col.r = texture2D(tDiffuse, duv + fringe).r;
  col.g = texture2D(tDiffuse, duv).g;
  col.b = texture2D(tDiffuse, duv - fringe).b;

  // Scanlines on the WARPED uv so lines follow the glass; period >= ~3 px.
  float lines = min(SCAN_LINES, uResolution.y / 3.0);
  float scan = 1.0 - SCAN_AMP * (0.5 - 0.5 * cos(duv.y * lines * 6.28318530718));
  col *= scan;

  // Vignette (subtle; the CSS overlay carries the visible falloff over HUD too).
  float vig = pow(16.0 * duv.x * duv.y * (1.0 - duv.x) * (1.0 - duv.y), 0.35);
  col *= mix(1.0 - VIGNETTE_AMP, 1.0, vig);

  // Constant grain + burst band noise.
  float g = hash(vUv * uResolution + uSeed * 1024.0) - 0.5;
  col += g * GRAIN_AMP;
  if (uBurst > 0.0) {
    float band = step(0.72, hash(vec2(floor(duv.y * 36.0), floor(uTime * 47.0))));
    col += (hash(duv * uResolution + uSeed * 511.0) - 0.5) * BURST_AMP * uBurst * band;
  }

  // Brightness flicker: slow beat of two sines + tiny per-frame random.
  col *= 1.0 + FLICKER_AMP * (0.6 * sin(uTime * 7.3) + 0.4 * sin(uTime * 23.7))
             + 0.5 * FLICKER_AMP * (uSeed - 0.5);

  // Rounded-corner mask (screen space, pre-warp, matches CSS --crt-radius).
  float radius = CORNER_FRAC * min(uResolution.x, uResolution.y);
  vec2 p = (vUv - 0.5) * uResolution;
  float d = sdRoundBox(p, 0.5 * uResolution - CORNER_INSET, radius);
  col *= 1.0 - smoothstep(-1.5, 0.5, d);

  gl_FragColor = vec4(col, 1.0);
}
`;
