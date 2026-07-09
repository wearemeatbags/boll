const MUSIC_GAIN = 0.22;
const SFX_GAIN = 1.0;

/** Shared lazy AudioContext with master/music/sfx gain buses. */
export class AudioBus {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private sfx: GainNode | null = null;

  /** Lazily creates the (suspended) context; safe to call before a gesture. */
  get ctx(): AudioContext | null {
    if (this.context === null) {
      try {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = 1;
        this.master.connect(this.context.destination);
        this.music = this.context.createGain();
        this.music.gain.value = MUSIC_GAIN;
        this.music.connect(this.master);
        this.sfx = this.context.createGain();
        this.sfx.gain.value = SFX_GAIN;
        this.sfx.connect(this.master);
      } catch (err) {
        console.warn('boll: WebAudio unavailable', err);
      }
    }
    return this.context;
  }

  get musicGain(): GainNode | null {
    void this.ctx;
    return this.music;
  }

  get sfxGain(): GainNode | null {
    void this.ctx;
    return this.sfx;
  }

  get unlocked(): boolean {
    return this.context !== null && this.context.state === 'running';
  }

  /** Resume on first user gesture (autoplay policy). Idempotent. */
  unlock(): void {
    const ctx = this.ctx;
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume();
    }
  }
}
