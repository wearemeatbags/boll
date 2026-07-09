import type { AudioBus } from './AudioBus';

export type SfxCue =
  | 'paddle'
  | 'sweet'
  | 'wall'
  | 'gate'
  | 'multiplier'
  | 'serve'
  | 'miss'
  | 'wave'
  | 'ballGain'
  | 'ballLost'
  | 'tick'
  | 'timeUp';

interface Note {
  f: number;
  at: number;
  d: number;
  v: number;
}

// Square-wave palette: OG's 460/230/340/170-110 base, new cues built on the
// 460 overtone ladder (580/690/920) so everything harmonizes.
const CUES: Record<SfxCue, Note[]> = {
  paddle: [{ f: 460, at: 0, d: 0.05, v: 0.04 }],
  sweet: [
    { f: 690, at: 0, d: 0.06, v: 0.05 },
    { f: 920, at: 0.045, d: 0.05, v: 0.04 },
  ],
  wall: [{ f: 230, at: 0, d: 0.04, v: 0.035 }],
  gate: [
    { f: 580, at: 0, d: 0.05, v: 0.045 },
    { f: 870, at: 0.06, d: 0.09, v: 0.05 },
  ],
  multiplier: [
    { f: 460, at: 0, d: 0.045, v: 0.045 },
    { f: 580, at: 0.05, d: 0.045, v: 0.045 },
    { f: 690, at: 0.1, d: 0.09, v: 0.045 },
  ],
  serve: [{ f: 340, at: 0, d: 0.05, v: 0.04 }],
  miss: [
    { f: 170, at: 0, d: 0.12, v: 0.05 },
    { f: 110, at: 0.1, d: 0.25, v: 0.05 },
  ],
  wave: [
    { f: 460, at: 0, d: 0.05, v: 0.045 },
    { f: 580, at: 0.06, d: 0.05, v: 0.045 },
    { f: 690, at: 0.12, d: 0.05, v: 0.045 },
    { f: 920, at: 0.18, d: 0.12, v: 0.045 },
  ],
  ballGain: [
    { f: 340, at: 0, d: 0.05, v: 0.045 },
    { f: 680, at: 0.07, d: 0.1, v: 0.045 },
  ],
  ballLost: [
    { f: 220, at: 0, d: 0.08, v: 0.05 },
    { f: 160, at: 0.08, d: 0.16, v: 0.05 },
  ],
  tick: [{ f: 880, at: 0, d: 0.03, v: 0.03 }],
  timeUp: [
    { f: 300, at: 0, d: 0.1, v: 0.05 },
    { f: 220, at: 0.12, d: 0.1, v: 0.05 },
    { f: 150, at: 0.26, d: 0.3, v: 0.05 },
  ],
};

const RATE_LIMIT_S = 0.03;

/** Retro square-wave beeps (multi-note cues scheduled on the audio clock). */
export class Sound {
  private enabledFlag = true;
  private lastPlayed = new Map<SfxCue, number>();

  constructor(private bus: AudioBus) {}

  get enabled(): boolean {
    return this.enabledFlag;
  }

  setEnabled(on: boolean): void {
    this.enabledFlag = on;
  }

  play(cue: SfxCue): void {
    if (!this.enabledFlag) return;
    const ctx = this.bus.ctx;
    const sfxGain = this.bus.sfxGain;
    if (!ctx || !sfxGain) return;
    // Scheduling on a suspended context is fine: notes sound once the first
    // user gesture resumes it (matches the OG behavior).
    if (!this.bus.unlocked) this.bus.unlock();

    const now = ctx.currentTime;
    const last = this.lastPlayed.get(cue);
    if (last !== undefined && now - last < RATE_LIMIT_S) return;
    this.lastPlayed.set(cue, now);

    try {
      for (const n of CUES[cue]) {
        const t = now + n.at;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = n.f;
        gain.gain.setValueAtTime(n.v, t);
        gain.gain.exponentialRampToValueAtTime(0.0008, t + n.d);
        osc.connect(gain);
        gain.connect(sfxGain);
        osc.start(t);
        osc.stop(t + n.d + 0.02);
      }
    } catch (err) {
      console.warn('boll: sfx playback failed', err);
    }
  }
}
