import type { Mode, ModeConfig, PhysicsParams } from './types';

// ---------------------------------------------------------------------------
// World. 160x100 units, origin at center, +y up. All OG (legacy HTML) pixel
// constants convert at SCALE = 0.2 u/px for dynamics/sizes; layout-relative
// values convert by fraction of world height.
// ---------------------------------------------------------------------------
export const WORLD_W = 160;
export const WORLD_H = 100;
export const HALF_W = WORLD_W / 2;
export const HALF_H = WORLD_H / 2;

export const FIXED_STEP = 1 / 120;
export const MAX_FRAME_DT = 0.05;
export const RUN_COUNTDOWN_SECONDS = 1.8;

// Paddle
export const PADDLE_H = 2.8;
export const PADDLE_REST_Y = -28;
/** Pointer pursuit stiffness (per second): k = 1 - exp(-PURSUIT_RATE * h). */
export const PURSUIT_RATE = 28;
/**
 * Paddle velocity smoothing per fixed step. OG blends 0.5 per frame at 60fps;
 * the equivalent per-step alpha at h is 1 - 2^(-60h) (~0.2929 at h = 1/120).
 */
export const PADDLE_V_ALPHA = 1 - Math.pow(2, -60 * FIXED_STEP);
export const KB_ACCEL_RATE = 14;
export const KB_COAST_RATE = 3;
export const KB_MAX_FACTOR = 1.15;
export const KB_STOP_SPEED = 2;

// Serve / hover / pointer bounds (layout-fraction ports of the OG canvas)
export const SERVE_VX = 16;
export const SERVE_RISE = 30;
export const SERVE_MAX_Y = 44;
export const HOVER_MAX_Y = 46;
export const TARGET_Y_MIN = -46;
export const TARGET_Y_MAX = 25;
export const TOUCH_LIFT = 13;
export const MISS_Y = -50;

// Extra balls (CHAOS) spawn near the ceiling with a gentle drift.
export const SPAWN_X_RANGE = 30;
export const SPAWN_Y = 40;

// OG bounce model (x0.2 ports of the validated HTML prototype)
export const OG_STEER = 36;
export const OG_VX_CLAMP = 300;
export const OG_VY_CLAMP = 640;
/** Carry (cushion) gates: |relative vy| < 18 u/s AND |paddle.vy| < 52 u/s. */
export const CARRY_REL = 18;
export const CARRY_PADDLE_VY = 52;
export const CROSS_EPS = 0.12;
export const REST_OFFSET = 0.1;
export const WALL_REST_MIN = 0.5;
export const WALL_REST_MAX = 0.98;

// Arcade bounce model
export const SWEET_ZONE = 0.3;
export const ARCADE_VX_FRACTION = 0.85;

// In-scene frame (sells the CRT warp on straight lines); inset clears the
// rounded-corner mask so the frame corners stay visible under the warp.
export const FRAME_INSET = 2.4;
export const FRAME_THICKNESS = 0.5;

export const DEFAULT_PARAMS: PhysicsParams = {
  gravity: 360,
  restitution: 0.92,
  drag: 0,
  influence: 1,
  paddleW: 22,
  ballDiameter: 4.4,
  paddleSpeed: 150,
  // Spec suggests 260/95, but those assume a stationary-y paddle. With the
  // flick paddle (paddle.vy feeds the bounce) they would neuter flick power.
  maxBallSpeed: 400,
  minBounceVy: 150,
};

export type PresetName = 'CLASSIC' | 'MOON' | 'FLUBBER' | 'BRICK';

/** Presets set only these six fields (OG parity); the rest are untouched. */
export const PRESETS: Record<PresetName, Pick<
  PhysicsParams,
  'gravity' | 'restitution' | 'ballDiameter' | 'influence' | 'drag' | 'paddleW'
>> = {
  CLASSIC: { gravity: 360, restitution: 0.92, ballDiameter: 4.4, influence: 1, drag: 0, paddleW: 22 },
  MOON: { gravity: 100, restitution: 0.97, ballDiameter: 4.4, influence: 1, drag: 0, paddleW: 22 },
  FLUBBER: { gravity: 300, restitution: 1.08, ballDiameter: 3.6, influence: 1.15, drag: 0.03, paddleW: 24 },
  BRICK: { gravity: 520, restitution: 0.55, ballDiameter: 5.6, influence: 1.7, drag: 0, paddleW: 26 },
};

export interface SliderDef {
  key: keyof PhysicsParams;
  label: string;
  min: number;
  max: number;
  step: number;
  arcadeOnly?: boolean;
  fmt: (v: number) => string;
}

export const SLIDER_DEFS: SliderDef[] = [
  { key: 'gravity', label: 'GRAVITY', min: 40, max: 800, step: 10, fmt: (v) => String(Math.round(v)) },
  { key: 'restitution', label: 'BOUNCE', min: 0.3, max: 1.1, step: 0.01, fmt: (v) => v.toFixed(2) },
  { key: 'ballDiameter', label: 'BALL SIZE', min: 2, max: 9.6, step: 0.2, fmt: (v) => v.toFixed(1) },
  { key: 'influence', label: 'PADDLE PWR', min: 0, max: 2, step: 0.05, fmt: (v) => v.toFixed(2) + 'x' },
  { key: 'drag', label: 'AIR DRAG', min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) },
  { key: 'paddleW', label: 'PADDLE W', min: 12, max: 44, step: 1, fmt: (v) => String(Math.round(v)) },
  { key: 'paddleSpeed', label: 'PADDLE SPD', min: 60, max: 260, step: 5, fmt: (v) => String(Math.round(v)) },
  { key: 'maxBallSpeed', label: 'MAX BALL SPD', min: 200, max: 800, step: 10, arcadeOnly: true, fmt: (v) => String(Math.round(v)) },
  { key: 'minBounceVy', label: 'MIN BOUNCE', min: 60, max: 260, step: 5, arcadeOnly: true, fmt: (v) => String(Math.round(v)) },
];

export const MODES: Record<Mode, ModeConfig> = {
  og: {
    id: 'og',
    bounceModel: 'og',
    scoring: 'hits',
    combo: false,
    gates: false,
    sweetSpotVisible: false,
    hudCombo: false,
    waves: false,
    timer: false,
    multiball: false,
    colorFx: false,
  },
  waves: {
    id: 'waves',
    bounceModel: 'arcade',
    scoring: 'points',
    combo: true,
    gates: true,
    sweetSpotVisible: true,
    hudCombo: true,
    waves: true,
    timer: false,
    multiball: false,
    colorFx: true,
  },
  rush: {
    id: 'rush',
    bounceModel: 'arcade',
    scoring: 'points',
    combo: true,
    gates: true,
    sweetSpotVisible: true,
    hudCombo: true,
    waves: false,
    timer: true,
    multiball: false,
    colorFx: true,
  },
  chaos: {
    id: 'chaos',
    bounceModel: 'arcade',
    scoring: 'points',
    combo: true,
    gates: false,
    sweetSpotVisible: true,
    hudCombo: true,
    waves: false,
    timer: false,
    multiball: true,
    colorFx: true,
  },
};

export const MODE_LABELS: Record<Mode, string> = {
  og: 'PRACTICE',
  waves: 'WAVES',
  rush: 'SCORE',
  chaos: 'CHAOS',
};

export const MODE_TAGLINES: Record<Mode, string> = {
  og: 'ORIGINAL JUGGLE · FREE PRACTICE',
  waves: 'CLEAR WAVES · PACE RISES · PADDLE SHRINKS',
  rush: 'SCORE ATTACK · 60 SECONDS · MISSES COST 5S',
  chaos: 'MULTIBALL · EVERY 12 HITS ADDS A BALL',
};

// WAVES: per-wave ramp. Wave 1 is gentler than the old arcade start, then the
// pace floor and paddle shrink ramp over WAVE_RAMP_WAVES waves.
export const WAVE_BASE_HITS = 8;
export const WAVE_HITS_INC = 2;
export const WAVE_HITS_MAX = 20;
export const WAVE_RAMP_WAVES = 8;
export const WAVE_PACE_MIN = 0.85;
export const WAVE_PACE_MAX = 1.4;
export const WAVE_PADDLE_SHRINK = 0.32;
export const WAVE_BONUS = 100;

// RUSH
export const RUSH_TIME = 60;
export const RUSH_MISS_PENALTY = 5;
export const RUSH_RESERVE_DELAY = 0.8;
export const RUSH_PACE = 1.1;
export const RUSH_GATE_SCORE = 75;
export const RUSH_GATE_PROGRESS = 0.35;
export const RUSH_TICK_FROM = 5;

// CHAOS
export const CHAOS_MAX_BALLS = 4;
export const CHAOS_HITS_PER_BALL = 12;
export const CHAOS_PACE_PER_BALL = 0.08;

// Gates (shared)
export const GATE_W = 17;
export const GATE_H = 11;
export const GATE_FRAME = 1.2;
export const GATE_BOB_AMP = 1.5;
export const GATE_BOB_PERIOD = 2.7;
export const GATE_COOLDOWN = 0.8;
export const GATE_FADE_OPACITY = 0.35;
export const DIFF_GATE_SHRINK = 0.35;

// Scoring
export const SCORE_PADDLE = 10;
export const SCORE_SWEET = 25;
export const SCORE_GATE = 50;
export const COMBO_MAX_MULT = 10;
export const COMBO_PER_MULT = 5;

// Particle palette (phosphor arcade). OG mode ignores these and stays white.
export const FX_WHITE = 0xffffff;
export const FX_SWEET = 0xffc843;
export const FX_WALL = 0x53d8ff;
export const FX_GATE = 0xff4fd8;
export const FX_BALL_GAIN = 0x6dff7c;
export const FX_BALL_LOST = 0xff5544;
export const FX_CELEBRATE: number[] = [0x53d8ff, 0xffc843, 0xff4fd8, 0x6dff7c, 0xffffff];

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

export function smoothstep01(x: number): number {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}
