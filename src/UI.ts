import { MODE_LABELS, MODE_TAGLINES, PRESETS, SLIDER_DEFS, type PresetName } from './config';
import { medalName, objectiveText } from './stages';
import type { Medal, Mode, PhysicsParams, StageConfig, StageRecord, Toggles } from './types';

export type OverlayKind = 'mainMenu' | 'stageSelect' | 'paused' | 'gameover' | 'stageclear';

const MODE_ORDER: Mode[] = ['og', 'waves', 'rush', 'chaos'];

export interface HudModel {
  best: number;
  score: number;
  spd: number;
  combo: number;
  mult: number;
  comboVisible: boolean;
  sub: string;
}

export interface OverlayData {
  heading?: string;
  score?: number;
  best?: number;
  runLabel?: string;
  objective?: string;
  medal?: Medal;
  nextStageId?: string;
  stages?: StageConfig[];
  stageRecords?: Record<string, StageRecord>;
}

interface ToggleDef {
  key: keyof Toggles;
  label: string;
}

const TOGGLE_DEFS: ToggleDef[] = [
  { key: 'keyboard', label: 'KEYS' },
  { key: 'mouse', label: 'MOUSE' },
  { key: 'effects', label: 'FX' },
  { key: 'crt', label: 'CRT' },
  { key: 'sfx', label: 'SFX' },
  { key: 'music', label: 'MUSIC' },
];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  parent: HTMLElement,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  parent.appendChild(node);
  return node;
}

function button(label: string, parent: HTMLElement, onClick: () => void): HTMLButtonElement {
  const b = el('button', 'btn', parent, label);
  b.type = 'button';
  b.addEventListener('click', () => {
    onClick();
    b.blur(); // keep Space from re-triggering the last-clicked button
  });
  return b;
}

/** Retro DOM shell: HUD, state overlays, and the in-game menu panel. */
export class UI {
  onSlider: (key: keyof PhysicsParams, value: number) => void = () => {};
  onPreset: (name: PresetName) => void = () => {};
  onToggle: (key: keyof Toggles, on: boolean) => void = () => {};
  onMode: (m: Mode) => void = () => {};
  onStartPractice: () => void = () => {};
  onStartScoreAttack: () => void = () => {};
  onStartChaos: () => void = () => {};
  onShowStageSelect: () => void = () => {};
  onStage: (id: string) => void = () => {};
  onRetry: () => void = () => {};
  onNextStage: (id: string) => void = () => {};
  onMainMenu: () => void = () => {};
  onResume: () => void = () => {};
  onSettings: () => void = () => {};
  onRestart: () => void = () => {};
  onMenuOpen: () => void = () => {};
  onMenuClose: () => void = () => {};
  onResetDefaults: () => void = () => {};

  private hudBest: HTMLElement;
  private hudScore: HTMLElement;
  private hudSpd: HTMLElement;
  private hudCombo: HTMLElement;
  private hudSub: HTMLElement;
  private overlay: HTMLElement;
  private overlayCard: HTMLElement;
  private menuScrim: HTMLElement;
  private modeNote: HTMLElement;
  private modeButtons = new Map<Mode, HTMLButtonElement>();
  private toggleButtons = new Map<keyof Toggles, HTMLButtonElement>();
  private sliderInputs = new Map<keyof PhysicsParams, HTMLInputElement>();
  private sliderValues = new Map<keyof PhysicsParams, HTMLElement>();
  private sliderRows = new Map<keyof PhysicsParams, HTMLElement>();
  private lastHud: HudModel = {
    best: -1,
    score: -1,
    spd: -1,
    combo: -1,
    mult: -1,
    comboVisible: false,
    sub: '',
  };

  constructor(private uiLayer: HTMLElement) {
    this.hudBest = el('div', 'hud-best', uiLayer, 'BEST 0');
    this.hudScore = el('div', 'hud-score', uiLayer, '0');
    this.hudSpd = el('div', 'hud-spd', uiLayer, 'SPD 0');
    this.hudCombo = el('div', 'hud-combo', uiLayer, '');
    this.hudCombo.style.display = 'none';
    this.hudSub = el('div', 'hud-sub', uiLayer, '');
    this.hudSub.style.display = 'none';
    const menuBtn = button('MENU', uiLayer, () => this.onMenuOpen());
    menuBtn.classList.add('hud-menu');
    menuBtn.setAttribute('aria-label', 'Open game menu');

    this.overlay = el('div', 'overlay', uiLayer);
    this.overlayCard = el('div', 'overlay-card', this.overlay);

    this.menuScrim = el('div', 'menu-scrim', uiLayer);
    this.menuScrim.hidden = true;
    this.modeNote = this.buildMenu(this.menuScrim);
  }

  // --- HUD -----------------------------------------------------------------

  setHud(m: HudModel): void {
    const last = this.lastHud;
    if (m.best !== last.best) this.hudBest.textContent = `BEST ${m.best}`;
    if (m.score !== last.score) this.hudScore.textContent = String(m.score);
    if (m.spd !== last.spd) this.hudSpd.textContent = `SPD ${m.spd}`;
    if (m.combo !== last.combo || m.mult !== last.mult) {
      this.hudCombo.textContent = `COMBO ${m.combo} x${m.mult}`;
    }
    if (m.comboVisible !== last.comboVisible) {
      this.hudCombo.style.display = m.comboVisible ? '' : 'none';
    }
    if (m.sub !== last.sub) {
      this.hudSub.textContent = m.sub;
      this.hudSub.style.display = m.sub ? '' : 'none';
    }
    this.lastHud = { ...m };
  }

  // --- overlays --------------------------------------------------------------

  showOverlay(kind: OverlayKind, data?: OverlayData): void {
    this.overlay.hidden = false;
    this.uiLayer.classList.add('overlay-open');
    const card = this.overlayCard;
    card.className = 'overlay-card';
    card.textContent = '';
    if (kind === 'mainMenu') {
      this.buildMainMenu(card, data);
    } else if (kind === 'stageSelect') {
      this.buildStageSelect(card, data);
    } else if (kind === 'paused') {
      card.classList.add('overlay-narrow');
      el('div', 'ov-big', card, 'PAUSED');
      const actions = el('div', 'overlay-actions', card);
      button('RESUME', actions, () => this.onResume());
      button('MENU', actions, () => this.onMainMenu());
    } else {
      this.buildEndOverlay(card, kind, data);
    }
  }

  private buildMainMenu(card: HTMLElement, data?: OverlayData): void {
    card.classList.add('overlay-menu-card');
    const stages = data?.stages ?? [];
    const records = data?.stageRecords ?? {};
    const cleared = stages.filter((stage) => (records[stage.id]?.medal ?? 0) > 0).length;

      el('div', 'ov-title', card, 'BOLL');
      el('div', 'ov-sub', card, 'PADDLE JUGGLE');
    el('div', 'ov-hint', card, 'FLICK UP FOR POWER - EASE DOWN TO CUSHION');

    const menu = el('div', 'main-menu', card);
    button('ARCADE LADDER', menu, () => this.onShowStageSelect());
    button('SCORE ATTACK', menu, () => this.onStartScoreAttack());
    button('CHAOS CHALLENGE', menu, () => this.onStartChaos());
    button('PRACTICE / ORIGINAL', menu, () => this.onStartPractice());
    button('SETTINGS', menu, () => this.onSettings());

    if (stages.length > 0) {
      el('div', 'ov-hint', card, `${cleared}/${stages.length} STAGES CLEAR`);
    }
  }

  private buildStageSelect(card: HTMLElement, data?: OverlayData): void {
    card.classList.add('overlay-menu-card');
    const stages = data?.stages ?? [];
    const records = data?.stageRecords ?? {};

    el('div', 'ov-big', card, 'ARCADE LADDER');
    el('div', 'ov-hint', card, 'CLEAR OBJECTIVES · EARN MEDALS · KEEP CONTROL');
    const list = el('div', 'stage-list', card);
    for (const stage of stages) {
      const record = records[stage.id] ?? { bestScore: 0, medal: 0 as Medal };
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'stage-pick';
      b.addEventListener('click', () => {
        this.onStage(stage.id);
        b.blur();
      });
      const left = el('span', 'stage-pick-main', b);
      el('span', 'stage-pick-title', left, `${stage.index}. ${stage.title}`);
      el('span', 'stage-pick-sub', left, `${objectiveText(stage.objective).toUpperCase()} · ${stage.subtitle}`);
      const right = el('span', 'stage-pick-meta', b);
      el('span', '', right, medalName(record.medal));
      el('span', '', right, `BEST ${record.bestScore}`);
      list.appendChild(b);
    }
    const actions = el('div', 'overlay-actions', card);
    button('BACK', actions, () => this.onMainMenu());
  }

  private buildEndOverlay(card: HTMLElement, kind: OverlayKind, data?: OverlayData): void {
    card.classList.add('overlay-narrow');
    const cleared = kind === 'stageclear';
    el('div', 'ov-big', card, data?.heading ?? (cleared ? 'STAGE CLEAR' : 'MISS'));
    if (data?.runLabel) el('div', 'ov-hint', card, data.runLabel);
    if (data?.score !== undefined && data.best !== undefined) {
      el('div', 'ov-score', card, `SCORE ${data.score} · BEST ${data.best}`);
    }
    if (data?.objective) {
      el('div', cleared ? 'ov-clear' : 'ov-hint', card, data.objective);
    }
    if (data?.medal !== undefined) {
      el('div', 'ov-medal', card, `MEDAL ${medalName(data.medal)}`);
    }
    const actions = el('div', 'overlay-actions', card);
    button('RETRY', actions, () => this.onRetry());
    if (data?.nextStageId) {
      button('NEXT', actions, () => this.onNextStage(data.nextStageId!));
    }
    button('MENU', actions, () => this.onMainMenu());
  }

  hideOverlay(): void {
    this.overlay.hidden = true;
    this.uiLayer.classList.remove('overlay-open');
  }

  // --- menu ------------------------------------------------------------------

  get menuOpen(): boolean {
    return !this.menuScrim.hidden;
  }

  openMenu(): void {
    this.menuScrim.hidden = false;
  }

  closeMenu(): void {
    this.menuScrim.hidden = true;
  }

  /** Push current settings into the menu controls. */
  syncMenu(params: PhysicsParams, toggles: Toggles, mode: Mode): void {
    for (const def of SLIDER_DEFS) {
      const input = this.sliderInputs.get(def.key);
      const value = this.sliderValues.get(def.key);
      const row = this.sliderRows.get(def.key);
      if (!input || !value || !row) continue;
      input.value = String(params[def.key]);
      value.textContent = def.fmt(params[def.key]);
      row.classList.toggle('disabled', def.arcadeOnly === true && mode === 'og');
    }
    for (const [key, btn] of this.toggleButtons) {
      const def = TOGGLE_DEFS.find((t) => t.key === key);
      btn.textContent = `${def?.label ?? key}: ${toggles[key] ? 'ON' : 'OFF'}`;
    }
    for (const [m, btn] of this.modeButtons) {
      btn.classList.toggle('active', m === mode);
    }
    this.modeNote.textContent = MODE_TAGLINES[mode];
  }

  private buildMenu(scrim: HTMLElement): HTMLElement {
    const card = el('div', 'menu-card', scrim);
    el('div', 'menu-title', card, 'BOLL SETTINGS');

    // Mode
    const modeGroup = el('div', 'menu-group', card);
    for (const mode of MODE_ORDER) {
      this.modeButtons.set(mode, button(MODE_LABELS[mode], modeGroup, () => this.onMode(mode)));
    }
    const modeNote = el('div', 'mode-note', card, MODE_TAGLINES.og);

    // Sliders
    for (const def of SLIDER_DEFS) {
      const row = el('div', 'menu-row', card);
      el('span', '', row, def.label);
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(def.min);
      input.max = String(def.max);
      input.step = String(def.step);
      input.setAttribute('aria-label', def.label);
      row.appendChild(input);
      const value = el('span', 'menu-val', row);
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        value.textContent = def.fmt(v);
        this.onSlider(def.key, v);
      });
      this.sliderInputs.set(def.key, input);
      this.sliderValues.set(def.key, value);
      this.sliderRows.set(def.key, row);
    }

    // Presets
    const presetGroup = el('div', 'menu-group', card);
    for (const name of Object.keys(PRESETS) as PresetName[]) {
      button(name, presetGroup, () => this.onPreset(name));
    }

    // Toggles
    const toggleGroup = el('div', 'menu-group', card);
    for (const def of TOGGLE_DEFS) {
      const btn = button(`${def.label}: ON`, toggleGroup, () => {
        const isOn = btn.textContent?.endsWith('ON') === true;
        this.onToggle(def.key, !isOn);
      });
      this.toggleButtons.set(def.key, btn);
    }

    // Actions
    const actions = el('div', 'menu-actions', card);
    button('RESET DEFAULTS', actions, () => this.onResetDefaults());
    button('RESTART', actions, () => this.onRestart());
    button('DONE', actions, () => this.onMenuClose());

    return modeNote;
  }
}
