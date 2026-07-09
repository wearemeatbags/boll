// Public volume controls are normalized to 0...1. These ceilings preserve the
// original mix when a channel is at its default volume of 1.
const MUSIC_GAIN_CEILING = 0.22;
const SFX_GAIN_CEILING = 1.0;
const VOLUME_RAMP_SECONDS = 0.02;

function normalizedVolume(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/** Shared lazy AudioContext with master/music/sfx gain buses. */
export class AudioBus {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private sfx: GainNode | null = null;
  private musicVolumeValue = 1;
  private sfxVolumeValue = 1;

  /** Lazily creates the (suspended) context; safe to call before a gesture. */
  get ctx(): AudioContext | null {
    if (this.context === null) {
      try {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = 1;
        this.master.connect(this.context.destination);
        this.music = this.context.createGain();
        this.music.gain.value = MUSIC_GAIN_CEILING * this.musicVolumeValue;
        this.music.connect(this.master);
        this.sfx = this.context.createGain();
        this.sfx.gain.value = SFX_GAIN_CEILING * this.sfxVolumeValue;
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

  get musicVolume(): number {
    return this.musicVolumeValue;
  }

  get sfxVolume(): number {
    return this.sfxVolumeValue;
  }

  /** Set normalized music volume, clamped to 0...1. */
  setMusicVolume(value: number): void {
    this.musicVolumeValue = normalizedVolume(value);
    this.applyChannelGain(this.music, MUSIC_GAIN_CEILING * this.musicVolumeValue);
  }

  /** Set normalized sound-effects volume, clamped to 0...1. */
  setSfxVolume(value: number): void {
    this.sfxVolumeValue = normalizedVolume(value);
    this.applyChannelGain(this.sfx, SFX_GAIN_CEILING * this.sfxVolumeValue);
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

  private applyChannelGain(node: GainNode | null, value: number): void {
    if (!node || !this.context) return;
    node.gain.cancelScheduledValues(this.context.currentTime);
    node.gain.setTargetAtTime(value, this.context.currentTime, VOLUME_RAMP_SECONDS);
  }
}
