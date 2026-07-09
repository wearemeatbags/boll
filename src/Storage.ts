import { DEFAULT_PARAMS, SLIDER_DEFS, clamp } from './config';
import type { Mode, PhysicsParams, Toggles } from './types';

const KEY = 'boll.pj2.v1';
const SAVE_DEBOUNCE_MS = 250;

export interface SaveData {
  version: 1;
  best: { og: number; arcade: number };
  settings: {
    mode: Mode;
    toggles: Toggles;
    params: PhysicsParams;
  };
}

function defaults(): SaveData {
  return {
    version: 1,
    best: { og: 0, arcade: 0 },
    settings: {
      mode: 'og',
      toggles: { keyboard: true, mouse: true, effects: true, crt: true, sfx: true, music: true },
      params: { ...DEFAULT_PARAMS },
    },
  };
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function asScore(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

/** Merge parsed JSON of unknown shape over defaults, clamped to valid ranges. */
function sanitize(raw: unknown): SaveData {
  const d = defaults();
  if (typeof raw !== 'object' || raw === null) return d;
  const o = raw as Record<string, unknown>;

  const best = (o['best'] ?? {}) as Record<string, unknown>;
  d.best.og = asScore(best['og']);
  d.best.arcade = asScore(best['arcade']);

  const settings = (o['settings'] ?? {}) as Record<string, unknown>;
  if (settings['mode'] === 'arcade') d.settings.mode = 'arcade';

  const toggles = (settings['toggles'] ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(d.settings.toggles) as Array<keyof Toggles>) {
    d.settings.toggles[key] = asBool(toggles[key], d.settings.toggles[key]);
  }

  const params = (settings['params'] ?? {}) as Record<string, unknown>;
  for (const def of SLIDER_DEFS) {
    const v = params[def.key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      d.settings.params[def.key] = clamp(v, def.min, def.max);
    }
  }
  return d;
}

export class Storage {
  readonly data: SaveData;
  private timer: number | null = null;

  constructor() {
    let raw: unknown = null;
    try {
      const text = localStorage.getItem(KEY);
      raw = text === null ? null : JSON.parse(text);
    } catch (err) {
      console.warn('boll: failed to load save data, using defaults', err);
    }
    this.data = sanitize(raw);
    window.addEventListener('pagehide', () => this.flush());
  }

  /** Debounced persist; call after any mutation of `data`. */
  schedule(): void {
    if (this.timer !== null) return;
    this.timer = window.setTimeout(() => this.flush(), SAVE_DEBOUNCE_MS);
  }

  flush(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (err) {
      console.warn('boll: failed to persist save data', err);
    }
  }
}
