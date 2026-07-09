import { DEFAULT_PARAMS, SLIDER_DEFS, clamp } from './config';
import { STAGES, STAGE_IDS, emptyStageRecords } from './stages';
import type { AudioLevels, Medal, Mode, PhysicsParams, StageRecord, Toggles } from './types';

const SAVE_VERSION = 4;
const LIVE_KEY = `boll.pj2.v${SAVE_VERSION}`;
const LEGACY_KEYS = ['boll.pj2.v1'];
const SAVE_DEBOUNCE_MS = 250;

const archiveVersion =
  typeof window === 'undefined'
    ? null
    : window.location.pathname.match(/\/versions\/(v\d+\.\d+\.\d+)(?:\/|$)/)?.[1] ?? null;
const KEY = archiveVersion === null ? LIVE_KEY : `${LIVE_KEY}.archive.${archiveVersion}`;

const MODE_IDS: Mode[] = ['og', 'waves', 'rush', 'chaos'];

export interface SaveData {
  version: typeof SAVE_VERSION;
  best: Record<Mode, number>;
  stages: Record<string, StageRecord>;
  campaign: {
    lastStageId: string;
  };
  settings: {
    mode: Mode;
    toggles: Toggles;
    audio: AudioLevels;
    params: PhysicsParams;
  };
}

function defaults(): SaveData {
  return {
    version: 4,
    best: { og: 0, waves: 0, rush: 0, chaos: 0 },
    stages: emptyStageRecords(),
    campaign: { lastStageId: STAGES[0]!.id },
    settings: {
      mode: 'og',
      toggles: {
        keyboard: true,
        mouse: true,
        effects: true,
        shake: true,
        crt: true,
        sfx: true,
        music: true,
      },
      audio: { music: 1, sfx: 1 },
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

function asMedal(v: unknown): Medal {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 3 ? (v as Medal) : 0;
}

/** Merge parsed JSON of unknown shape over defaults, clamped to valid ranges. */
function sanitize(raw: unknown): SaveData {
  const d = defaults();
  if (typeof raw !== 'object' || raw === null) return d;
  const o = raw as Record<string, unknown>;
  const rawVersion = typeof o['version'] === 'number' ? o['version'] : 0;
  const hasCurrentCampaign = rawVersion >= 4;

  const best = (o['best'] ?? {}) as Record<string, unknown>;
  for (const mode of MODE_IDS) {
    d.best[mode] = asScore(best[mode]);
  }
  // v1 migration: the old ARCADE mode evolved into WAVES.
  if (d.best.waves === 0 && best['arcade'] !== undefined) {
    d.best.waves = asScore(best['arcade']);
  }
  if (!hasCurrentCampaign) {
    // V4 made campaign and arcade runs fixed-loadout. Keep the comparable
    // Practice record, but reset tunable arcade scores and the old six-stage
    // ladder so stale medals cannot unlock disconnected World Tour nodes.
    d.best.waves = 0;
    d.best.rush = 0;
    d.best.chaos = 0;
  }

  if (hasCurrentCampaign) {
    const stages = (o['stages'] ?? {}) as Record<string, unknown>;
    for (const stage of STAGES) {
      const rawRecord = stages[stage.id];
      if (typeof rawRecord !== 'object' || rawRecord === null) continue;
      const record = rawRecord as Record<string, unknown>;
      d.stages[stage.id] = {
        bestScore: asScore(record['bestScore']),
        medal: asMedal(record['medal']),
      };
    }

    const campaign = (o['campaign'] ?? {}) as Record<string, unknown>;
    const lastStageId = campaign['lastStageId'];
    if (typeof lastStageId === 'string' && STAGE_IDS.includes(lastStageId)) {
      d.campaign.lastStageId = lastStageId;
    }
  }

  const settings = (o['settings'] ?? {}) as Record<string, unknown>;
  const mode = settings['mode'];
  if (typeof mode === 'string' && (MODE_IDS as string[]).includes(mode)) {
    d.settings.mode = mode as Mode;
  } else if (mode === 'arcade') {
    d.settings.mode = 'waves';
  }

  const toggles = (settings['toggles'] ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(d.settings.toggles) as Array<keyof Toggles>) {
    d.settings.toggles[key] = asBool(toggles[key], d.settings.toggles[key]);
  }

  const audio = (settings['audio'] ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(d.settings.audio) as Array<keyof AudioLevels>) {
    const value = audio[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      d.settings.audio[key] = clamp(value, 0, 1);
    }
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
    let loadedFromLegacy = false;
    try {
      let text = localStorage.getItem(KEY);
      if (text === null && archiveVersion === null) {
        for (const legacyKey of LEGACY_KEYS) {
          text = localStorage.getItem(legacyKey);
          if (text !== null) {
            loadedFromLegacy = true;
            break;
          }
        }
      }
      raw = text === null ? null : JSON.parse(text);
    } catch (err) {
      console.warn('boll: failed to load save data, using defaults', err);
    }
    this.data = sanitize(raw);
    const loadedVersion =
      typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>)['version'] : null;
    if (loadedFromLegacy || loadedVersion !== this.data.version) this.schedule();
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

  /** Clear scores and campaign medals while preserving player preferences. */
  resetProgress(): void {
    this.data.best = { og: 0, waves: 0, rush: 0, chaos: 0 };
    this.data.stages = emptyStageRecords();
    this.data.campaign.lastStageId = STAGES[0]!.id;
    this.flush();
  }
}
