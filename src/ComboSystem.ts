import { COMBO_MAX_MULT, COMBO_PER_MULT } from './config';

export class ComboSystem {
  combo = 0;

  get multiplier(): number {
    return Math.min(COMBO_MAX_MULT, 1 + Math.floor(this.combo / COMBO_PER_MULT));
  }

  onPaddleHit(sweet: boolean): void {
    this.combo += sweet ? 2 : 1;
  }

  reset(): void {
    this.combo = 0;
  }
}
