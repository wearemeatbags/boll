import { objectiveText } from './stages';
import type { StageConfig, StageObjective } from './types';

const BANK_WINDOW_S = 1.4;

/** Outer 35% of either paddle half counts as a deliberate edge hit. */
export const EDGE_HIT_OFFSET_THRESHOLD = 0.65;

/** Exit speed required for a power hit, in world units per second. */
export const POWER_HIT_SPEED_THRESHOLD = 300;

interface ObjectiveCounters {
  hits: number;
  sweetHits: number;
  edgeHits: number;
  powerHits: number;
  wallHits: number;
  gates: number;
  bankGates: number;
  carrySeconds: number;
  combo: number;
  surviveSeconds: number;
  score: number;
}

export class ObjectiveTracker {
  private counters: ObjectiveCounters = {
    hits: 0,
    sweetHits: 0,
    edgeHits: 0,
    powerHits: 0,
    wallHits: 0,
    gates: 0,
    bankGates: 0,
    carrySeconds: 0,
    combo: 0,
    surviveSeconds: 0,
    score: 0,
  };
  private bankWindow = 0;

  constructor(readonly stage: StageConfig) {}

  step(dt: number): void {
    this.bankWindow = Math.max(0, this.bankWindow - dt);
    this.counters.surviveSeconds += dt;
  }

  onWall(): void {
    this.counters.wallHits += 1;
    this.bankWindow = BANK_WINDOW_S;
  }

  onPaddleHit(sweet: boolean, offset: number, outSpeed: number, combo: number): void {
    this.counters.hits += 1;
    if (sweet) this.counters.sweetHits += 1;
    if (Math.abs(offset) >= EDGE_HIT_OFFSET_THRESHOLD) this.counters.edgeHits += 1;
    if (outSpeed >= POWER_HIT_SPEED_THRESHOLD) this.counters.powerHits += 1;
    this.counters.combo = Math.max(this.counters.combo, combo);
  }

  onCarry(dt: number): void {
    this.counters.carrySeconds += dt;
  }

  onGate(): void {
    this.counters.gates += 1;
    if (this.bankWindow > 0) {
      this.counters.bankGates += 1;
      this.bankWindow = 0;
    }
  }

  setScore(score: number): void {
    this.counters.score = score;
  }

  get complete(): boolean {
    return this.valueFor(this.stage.objective) >= this.stage.objective.target;
  }

  hudText(): string {
    const objective = this.stage.objective;
    const value = this.valueFor(objective);
    if (this.isSecondsObjective(objective)) {
      return `S${this.stage.index} ${Math.min(value, objective.target).toFixed(1)}/${objective.target.toFixed(1)}S`;
    }
    return `S${this.stage.index} ${Math.min(Math.floor(value), objective.target)}/${objective.target}`;
  }

  summaryText(): string {
    return `${this.progressText()} · ${objectiveText(this.stage.objective).toUpperCase()}`;
  }

  progressText(): string {
    const objective = this.stage.objective;
    const value = this.valueFor(objective);
    if (this.isSecondsObjective(objective)) {
      return `${Math.min(value, objective.target).toFixed(1)}/${objective.target.toFixed(1)}S`;
    }
    return `${Math.min(Math.floor(value), objective.target)}/${objective.target}`;
  }

  private valueFor(objective: StageObjective): number {
    return this.counters[objective.kind];
  }

  private isSecondsObjective(objective: StageObjective): boolean {
    return objective.kind === 'carrySeconds' || objective.kind === 'surviveSeconds';
  }
}
