import { objectiveText } from './stages';
import type { StageConfig, StageObjective } from './types';

const BANK_WINDOW_S = 1.4;

interface ObjectiveCounters {
  hits: number;
  sweetHits: number;
  gates: number;
  bankGates: number;
  carrySeconds: number;
  score: number;
}

export class ObjectiveTracker {
  private counters: ObjectiveCounters = {
    hits: 0,
    sweetHits: 0,
    gates: 0,
    bankGates: 0,
    carrySeconds: 0,
    score: 0,
  };
  private bankWindow = 0;

  constructor(readonly stage: StageConfig) {}

  step(dt: number): void {
    this.bankWindow = Math.max(0, this.bankWindow - dt);
  }

  onWall(): void {
    this.bankWindow = BANK_WINDOW_S;
  }

  onPaddleHit(sweet: boolean): void {
    this.counters.hits += 1;
    if (sweet) this.counters.sweetHits += 1;
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
    if (objective.kind === 'carrySeconds') {
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
    if (objective.kind === 'carrySeconds') {
      return `${Math.min(value, objective.target).toFixed(1)}/${objective.target.toFixed(1)}S`;
    }
    return `${Math.min(Math.floor(value), objective.target)}/${objective.target}`;
  }

  private valueFor(objective: StageObjective): number {
    return this.counters[objective.kind];
  }
}
