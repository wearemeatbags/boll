import { PRESETS, SLIDER_DEFS, type PresetName } from './config';
import type { Mode, PhysicsParams, Toggles } from './types';

export type OverlayKind = 'title' | 'paused' | 'gameover';

export interface HudModel {
  best: number;
  score: number;
  spd: number;
  combo: number;
  mult: number;
  comboVisible: boolean;
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
  onRestart: () => void = () => {};
  onMenuOpen: () => void = () => {};
  onMenuClose: () => void = () => {};
  onResetDefaults: () => void = () => {};

  private hudBest: HTMLElement;
  private hudScore: HTMLElement;
  private hudSpd: HTMLElement;
  private hudCombo: HTMLElement;
  private overlay: HTMLElement;
  private overlayCard: HTMLElement;
  private menuScrim: HTMLElement;
  private modeButtons = new Map<Mode, HTMLButtonElement>();
  private toggleButtons = new Map<keyof Toggles, HTMLButtonElement>();
  private sliderInputs = new Map<keyof PhysicsParams, HTMLInputElement>();
  private sliderValues = new Map<keyof PhysicsParams, HTMLElement>();
  private sliderRows = new Map<keyof PhysicsParams, HTMLElement>();
  private lastHud: HudModel = { best: -1, score: -1, spd: -1, combo: -1, mult: -1, comboVisible: false };

  constructor(uiLayer: HTMLElement) {
    this.hudBest = el('div', 'hud-best', uiLayer, 'BEST 0');
    this.hudScore = el('div', 'hud-score', uiLayer, '0');
    this.hudSpd = el('div', 'hud-spd', uiLayer, 'SPD 0');
    this.hudCombo = el('div', 'hud-combo', uiLayer, '');
    this.hudCombo.style.display = 'none';
    const menuBtn = button('MENU', uiLayer, () => this.onMenuOpen());
    menuBtn.classList.add('hud-menu');
    menuBtn.setAttribute('aria-label', 'Open game menu');

    this.overlay = el('div', 'overlay', uiLayer);
    this.overlayCard = el('div', 'overlay-card', this.overlay);

    this.menuScrim = el('div', 'menu-scrim', uiLayer);
    this.menuScrim.hidden = true;
    this.buildMenu(this.menuScrim);
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
    this.lastHud = { ...m };
  }

  // --- overlays --------------------------------------------------------------

  showOverlay(kind: OverlayKind, data?: { score: number; best: number }): void {
    this.overlay.hidden = false;
    const card = this.overlayCard;
    card.textContent = '';
    if (kind === 'title') {
      el('div', 'ov-title', card, 'BOLL');
      el('div', 'ov-sub', card, 'PADDLE JUGGLE');
      el('div', 'ov-blink', card, 'CLICK OR TAP TO SERVE');
      const hint = el('div', 'ov-hint', card);
      hint.append(
        'MOVE THE PADDLE TO JUGGLE THE BALL',
        document.createElement('br'),
        'FLICK UP FOR POWER - EASE DOWN TO CUSHION',
        document.createElement('br'),
        'SPACE SERVE · P PAUSE · R RESTART · ←/→ OR A/D MOVE',
      );
    } else if (kind === 'paused') {
      el('div', 'ov-big', card, 'PAUSED');
      el('div', 'ov-blink', card, 'P OR CLICK TO RESUME');
    } else {
      el('div', 'ov-big', card, 'MISS');
      if (data) el('div', 'ov-score', card, `SCORE ${data.score} · BEST ${data.best}`);
      el('div', 'ov-blink', card, 'TAP TO SERVE AGAIN');
    }
  }

  hideOverlay(): void {
    this.overlay.hidden = true;
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
  }

  private buildMenu(scrim: HTMLElement): void {
    const card = el('div', 'menu-card', scrim);
    el('div', 'menu-title', card, 'BOLL SETTINGS');

    // Mode
    const modeGroup = el('div', 'menu-group', card);
    const modes: Array<[Mode, string]> = [
      ['og', 'OG'],
      ['arcade', 'ARCADE'],
    ];
    for (const [mode, label] of modes) {
      this.modeButtons.set(mode, button(label, modeGroup, () => this.onMode(mode)));
    }
    el(
      'div',
      'mode-note',
      card,
      'OG: THE ORIGINAL JUGGLE · ARCADE: COMBOS, SWEET SPOT, GATES, RISING DIFFICULTY',
    );

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
  }
}
