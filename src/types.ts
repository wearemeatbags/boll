export interface Vec2 {
  x: number;
  y: number;
}

export type Mode = 'og' | 'waves' | 'rush' | 'chaos';
export type BounceModel = 'og' | 'arcade';
export type GameState = 'title' | 'countdown' | 'playing' | 'paused' | 'gameover' | 'stageclear';
export type PauseCause = 'user' | 'menu' | 'auto';
export type RunKind = 'practice' | 'waves' | 'scoreAttack' | 'chaos' | 'stage';
export type Medal = 0 | 1 | 2 | 3;
export type WorldId = 'boot-sector' | 'relay-fields' | 'moonfall' | 'overclock' | 'null-crown';

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

/** Params derived per fixed step from mode rules (waves, timer, ball count). */
export interface DerivedParams {
  bounceModel: BounceModel;
  paddleWEff: number;
  minBounceVyEff: number;
}

/** Every event carries the index of the ball that produced it. */
export type PhysicsEvent =
  | { type: 'wall'; ball: number; x: number; y: number; nx: number; ny: number }
  | {
      type: 'paddleHit';
      ball: number;
      x: number;
      y: number;
      offset: number;
      sweet: boolean;
      outSpeed: number;
    }
  | { type: 'carry'; ball: number }
  | { type: 'miss'; ball: number; x: number };

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
  sweetSpotVisible: boolean;
  hudCombo: boolean;
  /** Wave progression: hit quotas, celebrations, per-wave pace ramp. */
  waves: boolean;
  /** Countdown timer run (RUSH): misses cost time instead of ending the run. */
  timer: boolean;
  /** Multi-ball (CHAOS): extra balls spawn as you rack up hits. */
  multiball: boolean;
  /** Colored particles; OG keeps everything white. */
  colorFx: boolean;
}

export type ObjectiveKind =
  | 'hits'
  | 'sweetHits'
  | 'edgeHits'
  | 'powerHits'
  | 'wallHits'
  | 'gates'
  | 'bankGates'
  | 'carrySeconds'
  | 'combo'
  | 'surviveSeconds'
  | 'score';

export interface StageObjective {
  kind: ObjectiveKind;
  target: number;
}

export interface MedalScores {
  bronze: number;
  silver: number;
  gold: number;
}

export interface StageRules {
  /** Multiplies the mode's minimum upward bounce speed. */
  pace?: number;
  /** Multiplies the fixed campaign paddle width. */
  paddleScale?: number;
  /** Multiplies gravity for low-gravity and heavy-ball stages. */
  gravityScale?: number;
  /** 0..1 gate placement pressure, where 1 is smallest and furthest out. */
  gateDifficulty?: number;
  /** Per-stage multiball ceiling for CHAOS lessons. */
  ballCap?: 2 | 3 | 4;
}

export interface WorldConfig {
  id: WorldId;
  index: number;
  title: string;
  subtitle: string;
  description: string;
}

export interface StageConfig {
  id: string;
  index: number;
  worldId: WorldId;
  title: string;
  subtitle: string;
  mode: Mode;
  objective: StageObjective;
  medalScores: MedalScores;
  timeLimit?: number;
  rules?: StageRules;
  mapX: number;
  mapY: number;
  /** Every listed stage must be clear before this node opens. */
  requires?: string[];
  optional?: boolean;
  tower?: boolean;
}

export interface StageRecord {
  bestScore: number;
  medal: Medal;
}

export interface Toggles {
  keyboard: boolean;
  mouse: boolean;
  effects: boolean;
  shake: boolean;
  crt: boolean;
  sfx: boolean;
  music: boolean;
}

export interface AudioLevels {
  music: number;
  sfx: number;
}
