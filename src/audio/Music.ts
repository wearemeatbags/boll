import type { AudioBus } from './AudioBus';

const FADE_TAU = 0.5;
const DUCK_LEVEL = 0.4;
const DUCK_TAU = 0.15;

/**
 * Gapless looping background track: decoded buffer + AudioBufferSourceNode
 * with loop=true (HTMLAudio loops have an audible seam).
 */
export class Music {
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private trackGain: GainNode | null = null;
  private enabledFlag = true;
  private ducked = false;
  private wantsPlayback = false;

  constructor(private bus: AudioBus) {}

  /** Fetch + decode; safe to call at boot, before any user gesture. */
  async load(url: string): Promise<void> {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = await res.arrayBuffer();
      const ctx = this.bus.ctx;
      if (!ctx) return;
      this.buffer = await ctx.decodeAudioData(bytes);
      if (this.wantsPlayback) this.start();
    } catch (err) {
      console.warn('boll: background music failed to load', err);
    }
  }

  get enabled(): boolean {
    return this.enabledFlag;
  }

  setEnabled(on: boolean): void {
    this.enabledFlag = on;
    if (!on) {
      this.stop();
    } else if (this.wantsPlayback) {
      this.start();
    }
  }

  /** Begin looping playback (no-op until loaded + unlocked + enabled). */
  start(): void {
    this.wantsPlayback = true;
    if (!this.enabledFlag || this.source !== null || this.buffer === null) return;
    const ctx = this.bus.ctx;
    const musicGain = this.bus.musicGain;
    if (!ctx || !musicGain) return;

    this.trackGain = ctx.createGain();
    this.trackGain.gain.value = 0;
    this.trackGain.connect(musicGain);
    this.source = ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.loop = true;
    this.source.connect(this.trackGain);
    this.source.start();
    const level = this.ducked ? DUCK_LEVEL : 1;
    this.trackGain.gain.setTargetAtTime(level, ctx.currentTime, FADE_TAU);
  }

  /** Lower the track while paused; restore on resume. */
  duck(on: boolean): void {
    this.ducked = on;
    const ctx = this.bus.ctx;
    if (!ctx || !this.trackGain) return;
    this.trackGain.gain.setTargetAtTime(on ? DUCK_LEVEL : 1, ctx.currentTime, DUCK_TAU);
  }

  private stop(): void {
    if (this.source) {
      try {
        this.source.stop();
      } catch {
        // Already stopped.
      }
      this.source.disconnect();
      this.source = null;
    }
    if (this.trackGain) {
      this.trackGain.disconnect();
      this.trackGain = null;
    }
  }
}
