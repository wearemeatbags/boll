import { ComboSystem } from './ComboSystem';
import {
  DEFAULT_PARAMS,
  DIFF_PACE_RISE,
  DIFF_PADDLE_SHRINK,
  FIXED_STEP,
  MAX_FRAME_DT,
  MODES,
  PRESETS,
  SCORE_GATE,
  SCORE_PADDLE,
  SCORE_SWEET,
  type PresetName,
} from './config';
import { DifficultySystem } from './DifficultySystem';
import { Effects } from './fx/Effects';
import { InputController, type InputAction } from './InputController';
import { createWorld, serve, stepPhysics, type PhysicsWorld } from './Physics';
import { Renderer } from './render/Renderer';
import { AudioBus } from './audio/AudioBus';
import { Music } from './audio/Music';
import { Sound } from './audio/Sound';
import { Storage } from './Storage';
import type {
  DerivedParams,
  GameState,
  Mode,
  ModeConfig,
  PauseCause,
  PhysicsEvent,
  PhysicsParams,
  Toggles,
} from './types';
import { UI } from './UI';
import { BallView } from './views/Ball';
import { PaddleView } from './views/Paddle';
import { GateManager, type GateEvent } from './views/TargetGate';

export class Game {
  private storage = new Storage();
  private params: PhysicsParams;
  private toggles: Toggles;
  private modeCfg: ModeConfig;
  private world: PhysicsWorld;
  private derived: DerivedParams = { bounceModel: 'og', paddleWEff: 22, minBounceVyEff: 150 };

  private renderer: Renderer;
  private ui: UI;
  private input: InputController;
  private ballView: BallView;
  private paddleView: PaddleView;
  private gates: GateManager;
  private effects: Effects;
  private bus = new AudioBus();
  private music = new Music(this.bus);
  private sound = new Sound(this.bus);
  private combo = new ComboSystem();
  private difficulty = new DifficultySystem();

  private state: GameState = 'title';
  private pauseCause: PauseCause = 'user';
  private score = 0;
  private lastMult = 1;
  private acc = 0;
  private last = -1;
  private events: PhysicsEvent[] = [];
  private gateEvents: GateEvent[] = [];

  constructor(root: HTMLElement) {
    this.params = { ...this.storage.data.settings.params };
    this.toggles = { ...this.storage.data.settings.toggles };
    this.modeCfg = MODES[this.storage.data.settings.mode];
    this.world = createWorld(this.params);

    // DOM skeleton: canvas, fx layer (popups), ui layer (HUD/menus), CSS vignette.
    const stage = document.createElement('div');
    stage.className = 'stage';
    root.appendChild(stage);
    this.renderer = new Renderer(stage, root);
    const fxLayer = document.createElement('div');
    fxLayer.className = 'fx-layer';
    stage.appendChild(fxLayer);
    const uiLayer = document.createElement('div');
    uiLayer.className = 'ui-layer';
    stage.appendChild(uiLayer);
    const crtCss = document.createElement('div');
    crtCss.className = 'crt-css';
    stage.appendChild(crtCss);

    this.ballView = new BallView(this.renderer.scene);
    this.paddleView = new PaddleView(this.renderer.scene);
    this.gates = new GateManager(this.renderer.scene);
    this.effects = new Effects(this.renderer.scene, this.ballView, fxLayer, (x, y) =>
      this.renderer.worldToScreen(x, y),
    );

    this.ui = new UI(uiLayer);
    this.input = new InputController(this.renderer.canvas, (cx, cy) =>
      this.renderer.toWorld(cx, cy),
    );
    this.input.onAction((a) => this.handleAction(a));
    this.wireUi();
    this.applyParams();
    this.applyToggles();
    this.paddleView.setSweetVisible(this.modeCfg.sweetSpotVisible);

    void this.music.load(`${import.meta.env.BASE_URL}audio/boll.m4a`);
    const onFirstGesture = (): void => {
      this.bus.unlock();
      this.music.start();
    };
    window.addEventListener('pointerdown', onFirstGesture, { once: true });
    window.addEventListener('keydown', onFirstGesture, { once: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause('auto');
    });

    this.ui.showOverlay('title');
    this.ui.syncMenu(this.params, this.toggles, this.modeCfg.id);
  }

  frame(now: number): void {
    if (this.last < 0) this.last = now;
    const dt = Math.min(Math.max((now - this.last) / 1000, 0), MAX_FRAME_DT);
    this.last = now;

    // Paddle pursuit and the ball hover run in title/gameover too (OG parity);
    // only pause freezes the simulation.
    if (this.state !== 'paused') {
      this.acc += dt;
      while (this.acc >= FIXED_STEP) {
        this.acc -= FIXED_STEP;
        this.stepOnce();
      }
      this.effects.update(dt);
      this.gates.syncViews(dt);
    }

    this.updateHud();
    this.paddleView.setWidth(this.world.paddle.w);
    const alpha = this.state === 'paused' ? 1 : this.acc / FIXED_STEP;
    this.ballView.sync(this.world.prevBall, this.world.ball, alpha);
    this.paddleView.sync(this.world.prevPaddle, this.world.paddle, alpha);
    this.renderer.render(dt, this.effects.cameraOffset());
  }

  // --- simulation ------------------------------------------------------------

  private stepOnce(): void {
    const progress = this.modeCfg.difficulty ? this.difficulty.progress : 0;
    this.derived.bounceModel = this.modeCfg.bounceModel;
    this.derived.paddleWEff = this.params.paddleW * (1 - DIFF_PADDLE_SHRINK * progress);
    this.derived.minBounceVyEff = this.params.minBounceVy * (1 + DIFF_PACE_RISE * progress);

    const ctrl = this.input.sample(FIXED_STEP, this.world.paddle.x, this.derived.paddleWEff / 2);
    this.events.length = 0;
    stepPhysics(this.world, ctrl, this.params, this.derived, FIXED_STEP, this.events);

    if (this.state !== 'playing') return;
    if (this.modeCfg.difficulty) this.difficulty.update(FIXED_STEP);
    this.gateEvents.length = 0;
    if (this.modeCfg.gates) {
      this.gates.step(FIXED_STEP, this.world.ball, progress, this.gateEvents);
    }
    this.processEvents();
  }

  private processEvents(): void {
    const arcade = this.modeCfg.id === 'arcade';
    for (const e of this.events) {
      if (e.type === 'wall') {
        this.sound.play('wall');
        this.effects.burst(e.x, e.y, arcade ? 7 : 3, arcade ? 90 : 60, e.nx, e.ny);
        this.effects.squash(e.nx, e.ny, 0.12);
      } else if (e.type === 'paddleHit') {
        this.onPaddleHit(e);
      } else if (e.type === 'miss') {
        this.onMiss();
        return; // state changed; drop anything after the miss
      }
      // 'carry' is intentionally silent (OG behavior).
    }
    for (const g of this.gateEvents) this.onGateScore(g);
  }

  private onPaddleHit(e: Extract<PhysicsEvent, { type: 'paddleHit' }>): void {
    if (this.modeCfg.scoring === 'hits') {
      this.score += 1;
      this.sound.play('paddle');
      this.effects.burst(e.x, e.y, 5, 60, 0, 1);
      this.effects.squash(0, 1, 0.12);
      return;
    }
    this.combo.onPaddleHit(e.sweet);
    this.difficulty.registerHit();
    const mult = this.combo.multiplier;
    const pts = (e.sweet ? SCORE_SWEET : SCORE_PADDLE) * mult;
    this.score += pts;
    this.sound.play(e.sweet ? 'sweet' : 'paddle');
    this.effects.burst(e.x, e.y, e.sweet ? 14 : 10, 110, 0, 1);
    this.effects.squash(0, 1, 0.22);
    this.effects.shake(0.18);
    this.effects.popup(e.x, e.y + 4, `+${pts}`);
    if (mult > this.lastMult) {
      this.sound.play('multiplier');
      this.effects.popup(this.world.ball.x, this.world.ball.y + 6, `x${mult}`);
    }
    this.lastMult = mult;
  }

  private onGateScore(g: GateEvent): void {
    const pts = SCORE_GATE * this.combo.multiplier;
    this.score += pts;
    this.sound.play('gate');
    this.effects.burst(g.x, g.y, 10, 130, 0, 1);
    this.effects.burst(g.x, g.y, 10, 130, 0, -1);
    this.effects.shake(0.3);
    this.effects.popup(g.x, g.y, `+${pts}`);
  }

  private onMiss(): void {
    this.state = 'gameover';
    this.world.ballMode = 'ready';
    this.ballView.setVisible(false);
    this.gates.setEnabled(false);
    this.combo.reset();
    const mode = this.modeCfg.id;
    if (this.score > this.storage.data.best[mode]) {
      this.storage.data.best[mode] = this.score;
      this.storage.schedule();
    }
    this.sound.play('miss');
    if (this.modeCfg.id === 'arcade') this.effects.shake(0.5);
    this.ui.showOverlay('gameover', { score: this.score, best: this.storage.data.best[mode] });
  }

  private startRun(): void {
    this.score = 0;
    this.lastMult = 1;
    this.combo.reset();
    this.difficulty.reset();
    if (this.modeCfg.gates) {
      this.gates.reset(0);
      this.gates.setEnabled(true);
    } else {
      this.gates.setEnabled(false);
    }
    this.ballView.setVisible(true);
    const target = this.input.serveTarget(this.world.paddle.x);
    serve(this.world, target.x, target.y);
    this.state = 'playing';
    this.sound.play('serve');
    this.ui.hideOverlay();
  }

  // --- state -------------------------------------------------------------------

  private pause(cause: PauseCause): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.pauseCause = cause;
    this.music.duck(true);
    if (cause !== 'menu') this.ui.showOverlay('paused');
  }

  private resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.music.duck(false);
    this.ui.hideOverlay();
  }

  private goToTitle(): void {
    this.state = 'title';
    this.score = 0;
    this.lastMult = 1;
    this.combo.reset();
    this.difficulty.reset();
    this.world.ballMode = 'ready';
    this.ballView.setVisible(true);
    this.gates.setEnabled(false);
    this.music.duck(false);
    this.ui.showOverlay('title');
  }

  private handleAction(a: InputAction): void {
    if (a === 'primary') {
      if (this.ui.menuOpen) return;
      if (this.state === 'title' || this.state === 'gameover') this.startRun();
      else if (this.state === 'paused') this.resume();
    } else if (a === 'serveKey') {
      if (this.ui.menuOpen) return;
      if (this.state === 'title' || this.state === 'gameover') this.startRun();
    } else if (a === 'pauseKey') {
      if (this.ui.menuOpen) {
        this.closeMenu();
      } else if (this.state === 'playing') {
        this.pause('user');
      } else if (this.state === 'paused') {
        this.resume();
      }
    } else if (a === 'restartKey') {
      if (this.ui.menuOpen) this.ui.closeMenu();
      this.startRun();
    }
  }

  private closeMenu(): void {
    this.ui.closeMenu();
    if (this.state === 'paused' && this.pauseCause === 'menu') this.resume();
  }

  // --- settings ------------------------------------------------------------------

  private wireUi(): void {
    this.ui.onMenuOpen = (): void => {
      if (this.state === 'playing') this.pause('menu');
      this.ui.openMenu();
    };
    this.ui.onMenuClose = (): void => this.closeMenu();
    this.ui.onRestart = (): void => {
      this.ui.closeMenu();
      this.startRun();
    };
    this.ui.onResetDefaults = (): void => {
      this.params = { ...DEFAULT_PARAMS };
      this.persistSettings();
      this.applyParams();
      this.ui.syncMenu(this.params, this.toggles, this.modeCfg.id);
    };
    this.ui.onPreset = (name: PresetName): void => {
      Object.assign(this.params, PRESETS[name]);
      this.persistSettings();
      this.applyParams();
      this.ui.syncMenu(this.params, this.toggles, this.modeCfg.id);
    };
    this.ui.onSlider = (key: keyof PhysicsParams, value: number): void => {
      this.params[key] = value;
      this.persistSettings();
      this.applyParams();
    };
    this.ui.onToggle = (key: keyof Toggles, on: boolean): void => {
      this.toggles[key] = on;
      this.persistSettings();
      this.applyToggles();
      this.ui.syncMenu(this.params, this.toggles, this.modeCfg.id);
    };
    this.ui.onMode = (m: Mode): void => {
      if (m === this.modeCfg.id) return;
      this.modeCfg = MODES[m];
      this.storage.data.settings.mode = m;
      this.storage.schedule();
      this.paddleView.setSweetVisible(this.modeCfg.sweetSpotVisible);
      this.goToTitle();
      this.ui.syncMenu(this.params, this.toggles, this.modeCfg.id);
    };
  }

  private applyParams(): void {
    this.ballView.setDiameter(this.params.ballDiameter);
    this.input.setPaddleSpeed(this.params.paddleSpeed);
  }

  private applyToggles(): void {
    const t = this.toggles;
    this.input.setKeyboardEnabled(t.keyboard);
    this.input.setMouseEnabled(t.mouse);
    this.effects.setEnabled(t.effects);
    this.renderer.setCrtEnabled(t.crt);
    this.sound.setEnabled(t.sfx);
    this.music.setEnabled(t.music);
  }

  private persistSettings(): void {
    this.storage.data.settings.params = { ...this.params };
    this.storage.data.settings.toggles = { ...this.toggles };
    this.storage.schedule();
  }

  private updateHud(): void {
    const spd =
      this.world.ballMode === 'live'
        ? Math.round(Math.hypot(this.world.ball.vx, this.world.ball.vy))
        : 0;
    this.ui.setHud({
      best: this.storage.data.best[this.modeCfg.id],
      score: this.score,
      spd,
      combo: this.combo.combo,
      mult: this.combo.multiplier,
      comboVisible: this.modeCfg.hudCombo,
    });
  }
}
