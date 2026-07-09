import { MODE_TAGLINES, PRESETS, SLIDER_DEFS, type PresetName } from './config';
import {
  STAGES,
  WORLDS,
  medalName,
  recommendedStageId,
  stageById,
} from './stages';
import type {
  AudioLevels,
  Medal,
  Mode,
  PhysicsParams,
  StageConfig,
  StageRecord,
  Toggles,
} from './types';
import { buildCampaignMap } from './ui/CampaignMap';

export type OverlayKind =
  | 'mainMenu'
  | 'stageSelect'
  | 'help'
  | 'paused'
  | 'gameover'
  | 'stageclear';

type SettingsTab = 'display' | 'controls' | 'audio' | 'tuning' | 'data';

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
  stage?: StageConfig;
  stages?: StageConfig[];
  stageRecords?: Record<string, StageRecord>;
  focusStageId?: string;
  stageRun?: boolean;
}

interface ToggleDef {
  key: keyof Toggles;
  label: string;
  description: string;
  tab: SettingsTab;
}

const TOGGLE_DEFS: ToggleDef[] = [
  { key: 'effects', label: 'GAME FX', description: 'Particles, squash, and score flashes.', tab: 'display' },
  { key: 'shake', label: 'SCREEN SHAKE', description: 'Camera impact on strong contacts.', tab: 'display' },
  { key: 'crt', label: 'CRT FILTER', description: 'Curved glass, scanlines, grain, and flicker.', tab: 'display' },
  {
    key: 'keyboard',
    label: 'KEYBOARD',
    description: 'Move with Arrow keys or WASD.',
    tab: 'controls',
  },
  { key: 'mouse', label: 'POINTER', description: 'Follow mouse, trackpad, pen, or touch.', tab: 'controls' },
  { key: 'music', label: 'MUSIC', description: 'Looping cabinet soundtrack.', tab: 'audio' },
  { key: 'sfx', label: 'SOUND FX', description: 'Contact, score, and warning tones.', tab: 'audio' },
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
  b.addEventListener('click', onClick);
  return b;
}

function menuButton(
  label: string,
  className: string,
  parent: HTMLElement,
  onClick: () => void,
): HTMLButtonElement {
  const b = button(label, parent, onClick);
  b.classList.add('mode-choice', className);
  return b;
}

/** DOM shell for the HUD, screen router, campaign map, and player options. */
export class UI {
  onSlider: (key: keyof PhysicsParams, value: number) => void = () => {};
  onAudio: (key: keyof AudioLevels, value: number) => void = () => {};
  onPreset: (name: PresetName) => void = () => {};
  onToggle: (key: keyof Toggles, on: boolean) => void = () => {};
  onStartPractice: () => void = () => {};
  onStartWaves: () => void = () => {};
  onStartScoreAttack: () => void = () => {};
  onStartChaos: () => void = () => {};
  onShowStageSelect: () => void = () => {};
  onHelp: () => void = () => {};
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
  onResetProgress: () => void = () => {};
  onFullscreen: () => void = () => {};

  private hudBest: HTMLElement;
  private hudScore: HTMLElement;
  private hudSpd: HTMLElement;
  private hudCombo: HTMLElement;
  private hudSub: HTMLElement;
  private hudMenu: HTMLButtonElement;
  private gameplayFocus: HTMLCanvasElement | null;
  private overlay: HTMLElement;
  private overlayCard: HTMLElement;
  private activeOverlay: OverlayKind | null = null;
  private countdown: HTMLElement;
  private countdownCount: HTMLElement;
  private countdownLabel: HTMLElement;
  private menuScrim: HTMLElement;
  private modeNote: HTMLElement;
  private settingsTabs = new Map<SettingsTab, HTMLButtonElement>();
  private settingsPanels = new Map<SettingsTab, HTMLElement>();
  private presetButtons: HTMLButtonElement[] = [];
  private toggleButtons = new Map<keyof Toggles, HTMLButtonElement>();
  private sliderInputs = new Map<keyof PhysicsParams, HTMLInputElement>();
  private sliderValues = new Map<keyof PhysicsParams, HTMLElement>();
  private sliderRows = new Map<keyof PhysicsParams, HTMLElement>();
  private audioInputs = new Map<keyof AudioLevels, HTMLInputElement>();
  private audioValues = new Map<keyof AudioLevels, HTMLElement>();
  private menuOpener: HTMLElement | null = null;
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
    this.hudMenu = button('MENU', uiLayer, () => this.onMenuOpen());
    this.hudMenu.classList.add('hud-menu');
    this.hudMenu.setAttribute('aria-label', 'Open pause and settings menu');
    this.gameplayFocus = uiLayer.parentElement?.querySelector<HTMLCanvasElement>('canvas') ?? null;
    if (this.gameplayFocus) this.gameplayFocus.tabIndex = -1;

    this.overlay = el('div', 'overlay', uiLayer);
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlayCard = el('div', 'overlay-card', this.overlay);

    this.countdown = el('div', 'countdown', uiLayer);
    this.countdown.setAttribute('aria-live', 'polite');
    this.countdown.hidden = true;
    this.countdownCount = el('div', 'countdown-count', this.countdown);
    this.countdownLabel = el('div', 'countdown-label', this.countdown);

    this.menuScrim = el('div', 'menu-scrim', uiLayer);
    this.menuScrim.hidden = true;
    this.menuScrim.setAttribute('role', 'dialog');
    this.menuScrim.setAttribute('aria-modal', 'true');
    this.menuScrim.setAttribute('aria-label', 'Options');
    this.modeNote = this.buildSettings(this.menuScrim);
    this.overlay.addEventListener('keydown', (event) => this.trapFocus(event, this.overlay));
    this.menuScrim.addEventListener('keydown', (event) => this.trapFocus(event, this.menuScrim));
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

  // --- screens --------------------------------------------------------------

  get overlayKind(): OverlayKind | null {
    return this.activeOverlay;
  }

  showOverlay(kind: OverlayKind, data?: OverlayData): void {
    this.activeOverlay = kind;
    const labels: Record<OverlayKind, string> = {
      mainMenu: 'BOLL main menu',
      stageSelect: 'World Tour map',
      help: 'How to play',
      paused: data?.runLabel ? `Paused, ${data.runLabel}` : 'Paused',
      gameover: data?.heading ?? 'Run over',
      stageclear: data?.heading ?? 'Stage clear',
    };
    this.overlay.setAttribute('aria-label', labels[kind]);
    this.overlay.inert = false;
    this.overlay.removeAttribute('aria-hidden');
    this.overlay.hidden = false;
    this.hudMenu.tabIndex = -1;
    this.hudMenu.setAttribute('aria-hidden', 'true');
    this.uiLayer.classList.add('overlay-open');
    const card = this.overlayCard;
    card.className = 'overlay-card';
    card.textContent = '';

    if (kind === 'mainMenu') {
      this.buildMainMenu(card, data);
    } else if (kind === 'stageSelect') {
      card.classList.add('overlay-menu-card', 'campaign-card');
      buildCampaignMap(card, {
        stages: data?.stages ?? STAGES,
        worlds: WORLDS,
        records: data?.stageRecords ?? {},
        focusStageId: data?.focusStageId,
        onStage: (id) => this.onStage(id),
        onBack: () => this.onMainMenu(),
      });
    } else if (kind === 'help') {
      this.buildHelp(card);
    } else if (kind === 'paused') {
      this.buildPause(card, data);
    } else {
      this.buildEndOverlay(card, kind, data);
    }

    window.setTimeout(() => {
      card.querySelector<HTMLElement>('[data-autofocus], button:not(:disabled)')?.focus();
    }, 0);
  }

  private buildMainMenu(card: HTMLElement, data?: OverlayData): void {
    card.classList.add('overlay-menu-card', 'main-menu-card');
    const stages = data?.stages ?? STAGES;
    const records = data?.stageRecords ?? {};
    const cleared = stages.filter((stage) => (records[stage.id]?.medal ?? 0) > 0).length;
    const diamonds = stages.reduce((total, stage) => total + (records[stage.id]?.medal ?? 0), 0);
    const golds = stages.filter((stage) => (records[stage.id]?.medal ?? 0) === 3).length;
    const recommendedId = recommendedStageId(records);
    const recommended = recommendedId ? stageById(recommendedId) : undefined;

    this.buildMenuSparks(card);
    el('div', 'menu-kicker', card, 'TRANSMISSION // ONLINE');
    el('div', 'ov-title', card, 'BOLL');
    el('div', 'ov-sub', card, 'PADDLE JUGGLE');

    const progress = el('div', 'career-strip', card);
    const progressCopy = el('div', 'career-copy', progress);
    el('span', 'career-label', progressCopy, 'WORLD TOUR');
    el('span', 'career-stat', progressCopy, `${cleared}/${stages.length} CLEAR  //  ${diamonds} ◆  //  ${golds} GOLD`);
    const rail = el('span', 'career-rail', progress);
    const fill = el('span', 'career-fill', rail);
    fill.style.width = `${stages.length === 0 ? 0 : (cleared / stages.length) * 100}%`;

    const menu = el('div', 'main-menu', card);
    if (recommended) {
      const continueButton = menuButton(
        cleared === 0 ? 'START WORLD TOUR' : 'CONTINUE WORLD TOUR',
        'mode-continue',
        menu,
        () => this.onStage(recommended.id),
      );
      continueButton.dataset.autofocus = 'true';
      el('span', 'mode-choice-detail', continueButton, `S${String(recommended.index).padStart(2, '0')}  ${recommended.title}`);
    } else {
      const completeButton = menuButton(
        'WORLD TOUR COMPLETE',
        'mode-continue',
        menu,
        () => this.onShowStageSelect(),
      );
      completeButton.dataset.autofocus = 'true';
      el('span', 'mode-choice-detail', completeButton, `${cleared}/${stages.length} SIGNALS CLEAR`);
    }
    menuButton('WORLD MAP', 'mode-map', menu, () => this.onShowStageSelect());

    const arcade = el('div', 'menu-section-label', menu, 'ARCADE CHANNELS');
    arcade.setAttribute('aria-hidden', 'true');
    menuButton('ENDLESS WAVES', 'mode-waves', menu, () => this.onStartWaves());
    menuButton('SCORE ATTACK', 'mode-score', menu, () => this.onStartScoreAttack());
    menuButton('CHAOS', 'mode-chaos', menu, () => this.onStartChaos());
    menuButton('PRACTICE LAB', 'mode-practice', menu, () => this.onStartPractice());

    const utility = el('div', 'menu-utility', card);
    button('HOW TO PLAY', utility, () => this.onHelp());
    button('OPTIONS', utility, () => this.onSettings());
  }

  private buildMenuSparks(card: HTMLElement): void {
    const sparks = el('div', 'menu-sparks', card);
    sparks.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 18; i++) {
      const spark = document.createElement('span');
      spark.style.setProperty('--x', `${8 + Math.random() * 84}%`);
      spark.style.setProperty('--y', `${14 + Math.random() * 70}%`);
      spark.style.setProperty('--delay', `${Math.random() * -4}s`);
      spark.style.setProperty('--dur', `${2.4 + Math.random() * 2.6}s`);
      sparks.appendChild(spark);
    }
  }

  private buildHelp(card: HTMLElement): void {
    card.classList.add('overlay-menu-card', 'help-card');
    el('div', 'menu-kicker', card, 'FIELD MANUAL // REV 04');
    el('div', 'ov-big', card, 'HOW TO PLAY');
    el('div', 'ov-hint', card, 'THE BOUNCE IS THE GAME');
    const grid = el('div', 'help-grid', card);
    this.helpPanel(
      grid,
      '01  MOVE',
      'The paddle follows your pointer in both directions. Arrow keys or WASD provide full two-axis keyboard control.',
    );
    this.helpPanel(grid, '02  FLICK', 'Meet the falling ball while moving up. Your paddle speed transfers into the return.');
    this.helpPanel(grid, '03  STEER', 'Center hits are stable and build combo faster. Edge hits create sharper, riskier angles.');
    this.helpPanel(grid, '04  CARRY', 'Ease under a slow ball with gentle motion. It can settle on the paddle until you release it.');
    this.helpPanel(grid, '05  GATES', 'Put the ball through a hollow relay. Touch a wall shortly before a gate to score a bank gate.');
    this.helpPanel(grid, '06  TOUR', 'Clear connected map nodes to open new routes. Higher scores upgrade each stage medal.');
    const controls = el('div', 'control-ribbon', card);
    controls.innerHTML =
      '<span>MOVE&nbsp; POINTER / WASD / ARROWS</span><span>PAUSE&nbsp; P / ESC</span><span>RESTART&nbsp; R</span>';
    const actions = el('div', 'overlay-actions', card);
    const back = button('BACK', actions, () => this.onMainMenu());
    back.dataset.autofocus = 'true';
  }

  private helpPanel(parent: HTMLElement, title: string, copy: string): void {
    const panel = el('section', 'help-panel', parent);
    el('div', 'help-title', panel, title);
    el('p', 'help-copy', panel, copy);
  }

  private buildPause(card: HTMLElement, data?: OverlayData): void {
    card.classList.add('overlay-narrow', 'pause-card');
    el('div', 'menu-kicker', card, 'SIGNAL HELD');
    el('div', 'ov-big', card, 'PAUSED');
    if (data?.runLabel) el('div', 'ov-hint', card, data.runLabel);
    const actions = el('div', 'pause-actions', card);
    const resume = button('RESUME', actions, () => this.onResume());
    resume.dataset.autofocus = 'true';
    button(data?.stageRun ? 'RESTART STAGE' : 'RESTART RUN', actions, () => this.onRestart());
    if (data?.stageRun) button('WORLD MAP', actions, () => this.onShowStageSelect());
    button('OPTIONS', actions, () => this.onSettings());
    button('MAIN MENU', actions, () => this.onMainMenu());
  }

  private buildEndOverlay(card: HTMLElement, kind: OverlayKind, data?: OverlayData): void {
    card.classList.add('overlay-narrow', 'result-card');
    const cleared = kind === 'stageclear';
    el('div', 'menu-kicker', card, cleared ? 'ROUTE OPEN' : 'SIGNAL LOST');
    el('div', 'ov-big', card, data?.heading ?? (cleared ? 'STAGE CLEAR' : 'MISS'));
    if (data?.runLabel) el('div', 'ov-hint', card, data.runLabel);
    if (data?.score !== undefined && data.best !== undefined) {
      el('div', 'ov-score', card, `SCORE ${data.score}  //  BEST ${data.best}`);
    }
    if (data?.objective) el('div', cleared ? 'ov-clear' : 'ov-hint', card, data.objective);
    if (data?.medal !== undefined) {
      const medal = el('div', 'ov-medal', card, `${medalName(data.medal)}  ${'◆'.repeat(data.medal) || '○'}`);
      medal.dataset.medal = String(data.medal);
    }
    if (data?.stage) {
      el(
        'div',
        'medal-targets',
        card,
        `BRONZE ${data.stage.medalScores.bronze}  //  SILVER ${data.stage.medalScores.silver}  //  GOLD ${data.stage.medalScores.gold}`,
      );
    }
    const actions = el('div', 'overlay-actions', card);
    const retry = button('RETRY', actions, () => this.onRetry());
    if (!cleared) retry.dataset.autofocus = 'true';
    if (data?.nextStageId) {
      const next = button('NEXT SIGNAL', actions, () => this.onNextStage(data.nextStageId!));
      if (cleared) next.dataset.autofocus = 'true';
    }
    if (data?.stageRun) button('WORLD MAP', actions, () => this.onShowStageSelect());
    button('MAIN MENU', actions, () => this.onMainMenu());
  }

  hideOverlay(): void {
    this.activeOverlay = null;
    this.overlay.hidden = true;
    this.uiLayer.classList.remove('overlay-open');
    this.hudMenu.tabIndex = 0;
    this.hudMenu.removeAttribute('aria-hidden');
    this.gameplayFocus?.focus({ preventScroll: true });
  }

  showCountdown(count: string, label: string): void {
    this.countdown.hidden = false;
    this.countdownCount.textContent = count;
    this.countdownLabel.textContent = label;
  }

  hideCountdown(): void {
    this.countdown.hidden = true;
  }

  // --- settings -------------------------------------------------------------

  get menuOpen(): boolean {
    return !this.menuScrim.hidden;
  }

  openMenu(tab: SettingsTab = 'display'): void {
    this.menuOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.overlay.inert = true;
    this.overlay.setAttribute('aria-hidden', 'true');
    this.hudMenu.tabIndex = -1;
    this.menuScrim.hidden = false;
    this.showSettingsTab(tab);
    window.setTimeout(() => this.settingsTabs.get(tab)?.focus(), 0);
  }

  closeMenu(): void {
    this.menuScrim.hidden = true;
    this.overlay.inert = false;
    this.overlay.removeAttribute('aria-hidden');
    if (this.overlay.hidden) {
      this.hudMenu.tabIndex = 0;
      this.hudMenu.removeAttribute('aria-hidden');
    }
    if (this.menuOpener?.isConnected) this.menuOpener.focus({ preventScroll: true });
    this.menuOpener = null;
  }

  syncMenu(
    params: PhysicsParams,
    toggles: Toggles,
    mode: Mode,
    audio: AudioLevels,
    tuningAllowed: boolean,
  ): void {
    for (const def of SLIDER_DEFS) {
      const input = this.sliderInputs.get(def.key);
      const value = this.sliderValues.get(def.key);
      const row = this.sliderRows.get(def.key);
      if (!input || !value || !row) continue;
      input.value = String(params[def.key]);
      value.textContent = def.fmt(params[def.key]);
      const unavailable = !tuningAllowed || (def.arcadeOnly === true && mode === 'og');
      row.classList.toggle('disabled', unavailable);
      input.disabled = unavailable;
    }
    for (const preset of this.presetButtons) preset.disabled = !tuningAllowed;
    for (const [key, toggle] of this.toggleButtons) {
      const on = toggles[key];
      toggle.textContent = on ? 'ON' : 'OFF';
      toggle.classList.toggle('active', on);
      toggle.setAttribute('aria-pressed', String(on));
    }
    for (const key of Object.keys(audio) as Array<keyof AudioLevels>) {
      const input = this.audioInputs.get(key);
      const value = this.audioValues.get(key);
      if (!input || !value) continue;
      input.value = String(Math.round(audio[key] * 100));
      value.textContent = `${Math.round(audio[key] * 100)}%`;
    }
    this.modeNote.textContent = tuningAllowed
      ? `${MODE_TAGLINES[mode]}  //  PRACTICE VALUES SAVE AUTOMATICALLY`
      : 'FIXED ARCADE LOADOUT  //  TUNING RETURNS IN PRACTICE LAB';
  }

  private buildSettings(scrim: HTMLElement): HTMLElement {
    const card = el('div', 'menu-card settings-card', scrim);
    const header = el('div', 'settings-header', card);
    const headerCopy = el('div', '', header);
    el('div', 'menu-kicker', headerCopy, 'CABINET CONTROL');
    el('div', 'menu-title', headerCopy, 'OPTIONS');
    const close = button('×', header, () => this.onMenuClose());
    close.classList.add('settings-close');
    close.setAttribute('aria-label', 'Close options');

    const tabs = el('div', 'settings-tabs', card);
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Option categories');
    const panels = el('div', 'settings-panels', card);
    const labels: Array<[SettingsTab, string]> = [
      ['display', 'DISPLAY'],
      ['controls', 'CONTROLS'],
      ['audio', 'AUDIO'],
      ['tuning', 'TUNING'],
      ['data', 'DATA'],
    ];
    for (const [id, label] of labels) {
      const tab = button(label, tabs, () => this.showSettingsTab(id));
      tab.classList.add('settings-tab');
      tab.id = `settings-tab-${id}`;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', `settings-${id}`);
      this.settingsTabs.set(id, tab);
      const panel = el('section', 'settings-panel', panels);
      panel.id = `settings-${id}`;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tab.id);
      this.settingsPanels.set(id, panel);
    }
    tabs.addEventListener('keydown', (event) => {
      const order = labels.map(([id]) => id);
      const active = order.findIndex((id) => this.settingsTabs.get(id) === document.activeElement);
      if (active < 0) return;
      let next = active;
      if (event.key === 'ArrowLeft') next = (active - 1 + order.length) % order.length;
      else if (event.key === 'ArrowRight') next = (active + 1) % order.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = order.length - 1;
      else return;
      event.preventDefault();
      const id = order[next]!;
      this.showSettingsTab(id);
      this.settingsTabs.get(id)?.focus();
    });

    this.buildToggleSettings();
    this.buildDisplaySettings();
    this.buildControlSettings();
    this.buildAudioSettings();
    const modeNote = this.buildTuningSettings();
    this.buildDataSettings();

    const actions = el('div', 'menu-actions', card);
    button('RESET SETTINGS', actions, () => this.onResetDefaults());
    button('DONE', actions, () => this.onMenuClose());
    this.showSettingsTab('display');
    return modeNote;
  }

  private buildToggleSettings(): void {
    for (const def of TOGGLE_DEFS) {
      const panel = this.settingsPanels.get(def.tab)!;
      const row = el('div', 'setting-item', panel);
      const copy = el('div', 'setting-copy', row);
      const label = el('div', 'setting-label', copy, def.label);
      label.id = `setting-label-${def.key}`;
      el('div', 'setting-description', copy, def.description);
      const toggle = button('ON', row, () => {
        const on = toggle.getAttribute('aria-pressed') === 'true';
        this.onToggle(def.key, !on);
      });
      toggle.classList.add('setting-toggle');
      toggle.setAttribute('aria-pressed', 'true');
      toggle.setAttribute('aria-labelledby', label.id);
      this.toggleButtons.set(def.key, toggle);
    }
  }

  private buildDisplaySettings(): void {
    const panel = this.settingsPanels.get('display')!;
    const full = el('div', 'setting-item', panel);
    const copy = el('div', 'setting-copy', full);
    el('div', 'setting-label', copy, 'FULLSCREEN');
    el('div', 'setting-description', copy, 'Fill the current display with the cabinet.');
    const toggle = button('TOGGLE', full, () => this.onFullscreen());
    toggle.classList.add('setting-toggle');
    toggle.setAttribute('aria-label', 'Toggle fullscreen');
  }

  private buildControlSettings(): void {
    const panel = this.settingsPanels.get('controls')!;
    const keys = el('div', 'key-grid', panel);
    keys.innerHTML =
      '<span><kbd>WASD</kbd> MOVE</span><span><kbd>ARROWS</kbd> MOVE</span><span><kbd>P / ESC</kbd> PAUSE</span><span><kbd>R</kbd> RESTART</span>';
    el('p', 'settings-note', panel, 'Pointer movement controls both axes. Keyboard movement owns the horizontal axis until the pointer moves again.');
  }

  private buildAudioSettings(): void {
    const panel = this.settingsPanels.get('audio')!;
    const defs: Array<[keyof AudioLevels, string]> = [
      ['music', 'MUSIC LEVEL'],
      ['sfx', 'SFX LEVEL'],
    ];
    for (const [key, label] of defs) {
      const row = el('label', 'menu-row audio-row', panel);
      el('span', '', row, label);
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = '100';
      input.step = '1';
      input.setAttribute('aria-label', label);
      row.appendChild(input);
      const value = el('span', 'menu-val', row, '100%');
      input.addEventListener('input', () => {
        const normalized = Number(input.value) / 100;
        value.textContent = `${input.value}%`;
        this.onAudio(key, normalized);
      });
      this.audioInputs.set(key, input);
      this.audioValues.set(key, value);
    }
  }

  private buildTuningSettings(): HTMLElement {
    const panel = this.settingsPanels.get('tuning')!;
    const modeNote = el('div', 'mode-note', panel, MODE_TAGLINES.og);
    const presets = el('div', 'preset-grid', panel);
    for (const name of Object.keys(PRESETS) as PresetName[]) {
      const preset = button(name, presets, () => this.onPreset(name));
      this.presetButtons.push(preset);
    }
    for (const def of SLIDER_DEFS) {
      const row = el('label', 'menu-row', panel);
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
        const v = Number(input.value);
        value.textContent = def.fmt(v);
        this.onSlider(def.key, v);
      });
      this.sliderInputs.set(def.key, input);
      this.sliderValues.set(def.key, value);
      this.sliderRows.set(def.key, row);
    }
    return modeNote;
  }

  private buildDataSettings(): void {
    const panel = this.settingsPanels.get('data')!;
    const block = el('div', 'data-block', panel);
    el('div', 'setting-label', block, 'CAREER DATA');
    el('p', 'settings-note', block, 'Clears, medals, and local best scores are stored only in this browser. Player options are preserved when career data is reset.');
    let armed = false;
    let timer: number | null = null;
    const reset = button('RESET CAREER', block, () => {
      if (!armed) {
        armed = true;
        reset.textContent = 'CONFIRM RESET';
        reset.classList.add('danger-armed');
        if (timer !== null) window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          armed = false;
          reset.textContent = 'RESET CAREER';
          reset.classList.remove('danger-armed');
        }, 4000);
        return;
      }
      armed = false;
      this.onResetProgress();
    });
    reset.classList.add('danger-button');
  }

  private trapFocus(event: KeyboardEvent, container: HTMLElement): void {
    if (event.key !== 'Tab') return;
    const focusable = [...container.querySelectorAll<HTMLElement>(
      'a[href], button:not(:disabled), input:not(:disabled), summary, [tabindex]:not([tabindex="-1"])',
    )].filter((node) => !node.hidden && !node.inert && node.getClientRects().length > 0);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private showSettingsTab(id: SettingsTab): void {
    for (const [tabId, tab] of this.settingsTabs) {
      const active = tabId === id;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    for (const [panelId, panel] of this.settingsPanels) panel.hidden = panelId !== id;
  }
}
