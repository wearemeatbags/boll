import {
  DIFF_HITS,
  DIFF_HITS_WEIGHT,
  DIFF_TIME,
  DIFF_TIME_WEIGHT,
  smoothstep01,
} from './config';

/** Smooth difficulty curve blending survival time and paddle hits. */
export class DifficultySystem {
  private time = 0;
  private hits = 0;

  update(h: number): void {
    this.time += h;
  }

  registerHit(): void {
    this.hits += 1;
  }

  reset(): void {
    this.time = 0;
    this.hits = 0;
  }

  get progress(): number {
    return smoothstep01(
      (this.time / DIFF_TIME) * DIFF_TIME_WEIGHT + (this.hits / DIFF_HITS) * DIFF_HITS_WEIGHT,
    );
  }
}
