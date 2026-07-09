export interface Vec2 {
  x: number;
  y: number;
}

export type Mode = 'og' | 'arcade';
export type BounceModel = 'og' | 'arcade';
export type GameState = 'title' | 'playing' | 'paused' | 'gameover';
export type PauseCause = 'user' | 'menu' | 'auto';

export interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export interface PaddleState {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
}

/** User-tunable physics parameters (sliders and presets). */
export interface PhysicsParams {
  gravity: number;
  restitution: number;
  drag: number;
  influence: number;
  paddleW: number;
  ballDiameter: number;
  paddleSpeed: number;
  maxBallSpeed: number;
  minBounceVy: number;
}

/** Params derived per fixed step from mode + difficulty. */
export interface DerivedParams {
  bounceModel: BounceModel;
  paddleWEff: number;
  minBounceVyEff: number;
}

export type PhysicsEvent =
  | { type: 'wall'; x: number; y: number; nx: number; ny: number }
  | { type: 'paddleHit'; x: number; y: number; offset: number; sweet: boolean; outSpeed: number }
  | { type: 'carry' }
  | { type: 'miss'; x: number };

/** One fixed step's worth of control input, produced by InputController.sample(). */
export interface ControlFrame {
  /** Pointer pursuit target x in world units, or null while keyboard owns x. */
  targetX: number | null;
  /** Pursuit target y in world units (always pursued). */
  targetY: number;
  /** Keyboard-driven x velocity in u/s; 0 when pointer owns x. */
  kbVx: number;
  xOwner: 'pointer' | 'keyboard';
}

export interface ModeConfig {
  id: Mode;
  bounceModel: BounceModel;
  scoring: 'hits' | 'points';
  combo: boolean;
  gates: boolean;
  difficulty: boolean;
  sweetSpotVisible: boolean;
  hudCombo: boolean;
}

export interface Toggles {
  keyboard: boolean;
  mouse: boolean;
  effects: boolean;
  crt: boolean;
  sfx: boolean;
  music: boolean;
}
