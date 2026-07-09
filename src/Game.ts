import { ComboSystem } from './ComboSystem';
import {
  CHAOS_HITS_PER_BALL,
  CHAOS_MAX_BALLS,
  CHAOS_PACE_PER_BALL,
  DEFAULT_PARAMS,
  FIXED_STEP,
  FX_BALL_GAIN,
  FX_BALL_LOST,
  FX_GATE,
  FX_SWEET,
  FX_WALL,
  FX_WHITE,
  MAX_FRAME_DT,
  MODES,
  PRESETS,
  RUSH_GATE_PROGRESS,
  RUSH_GATE_SCORE,
  RUSH_MISS_PENALTY,
  RUSH_PACE,
  RUSH_RESERVE_DELAY,
  RUSH_TICK_FROM,
  RUSH_TIME,
  SCORE_GATE,
  SCORE_PADDLE,
  SCORE_SWEET,
  WAVE_BASE_HITS,
  WAVE_BONUS,
  WAVE_HITS_INC,
  WAVE_HITS_MAX,
  WAVE_PACE_MAX,
  WAVE_PACE_MIN,
  WAVE_PADDLE_SHRINK,
  WAVE_RAMP_WAVES,
  type PresetName,
} from './config';
import { Effects } from './fx/Effects';
import { InputController, type InputAction } from './InputController';
import {
  createWorld,
  removeBall,
  resetToReady,
  serve,
  spawnBall,
  stepPhysics,
  type PhysicsWorld,
} from './Physics';
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
import { BallSetView } from './views/Ball';
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
  private ballViews: BallSetView;
  private paddleView: PaddleView;
  private gates: GateManager;
  private effects: Effects;
  private bus = new AudioBus();
  private music = new Music(this.bus);
  private sound = new Sound(this.bus);
  private combo = new ComboSystem();

  private state: GameState = 'title';
  private pauseCause: PauseCause = 'user';
  private score = 0;
  private lastMult = 1;
  private acc = 0;
  private last = -1;
  private events: PhysicsEvent[] = [];
  private gateEvents: GateEvent[] = [];

  // Per-mode run state (reset in startRun / goToTitle).
  private wave = 1;
  private waveHits = 0;
  private timeLeft = RUSH_TIME;
  private hitsSinceBall = 0;
  private reserveTimer = 0;

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

    this.ballViews = new BallSetView(this.renderer.scene);
    this.paddleView = new PaddleView(this.renderer.scene);
    this.gates = new GateManager(this.renderer.scene);
    this.effects = new Effects(
      this.renderer.scene,
      (index, sx, sy) => this.ballViews.setSquash(index, sx, sy),
      fxLayer,
      (x, y) => this.renderer.worldToScreen(x, y),
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

    this.ui.showOverlay('title', { mode: this.modeCfg.id });
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
    this.ballViews.sync(this.world.prevBalls, this.world.balls, alpha);
    this.paddleView.sync(this.world.prevPaddle, this.world.paddle, alpha);
    this.renderer.render(dt, this.effects.cameraOffset());
  }

  // --- simulation ------------------------------------------------------------

  private stepOnce(): void {
    this.updateDerived();

    const ctrl = this.input.sample(FIXED_STEP, this.world.paddle.x, this.derived.paddleWEff / 2);
    this.events.length = 0;
    stepPhysics(this.world, ctrl, this.params, this.derived, FIXED_STEP, this.events);

    if (this.state !== 'playing') return;

    if (this.modeCfg.id === 'rush') {
      this.stepRush();
      // A timeout may have ended the run this step; the events collected
      // above belong to the frame that just closed out, so drop them rather
      // than risk double-firing endRun via a stale miss event.
      if (this.state !== 'playing') return;
    }

    this.gateEvents.length = 0;
    if (this.modeCfg.gates) {
      this.gates.step(FIXED_STEP, this.world.balls[0], this.gateProgress(), this.gateEvents);
    }
    this.processEvents();
  }

  /** Countdown, tick cue, and reserve-delay auto-serve for RUSH. */
  private stepRush(): void {
    const prevCeil = Math.ceil(this.timeLeft);
    this.timeLeft -= FIXED_STEP;
    const nowCeil = Math.ceil(this.timeLeft);
    if (nowCeil < prevCeil && nowCeil <= RUSH_TICK_FROM && nowCeil > 0) {
      this.sound.play('tick');
    }
    if (this.timeLeft <= 0) {
      this.endRun('timeup');
      return;
    }
    if (this.world.ballMode === 'ready') {
      this.reserveTimer -= FIXED_STEP;
      if (this.reserveTimer <= 0) {
        const target = this.input.serveTarget(this.world.paddle.x);
        serve(this.world, target.x, target.y);
        this.sound.play('serve');
      }
    }
  }

  private updateDerived(): void {
    const mode = this.modeCfg.id;
    this.derived.bounceModel = this.modeCfg.bounceModel;
    if (mode === 'waves') {
      const wp = this.waveProgress();
      this.derived.minBounceVyEff =
        this.params.minBounceVy * (WAVE_PACE_MIN + (WAVE_PACE_MAX - WAVE_PACE_MIN) * wp);
      this.derived.paddleWEff = this.params.paddleW * (1 - WAVE_PADDLE_SHRINK * wp);
    } else if (mode === 'rush') {
      this.derived.minBounceVyEff = this.params.minBounceVy * RUSH_PACE;
      this.derived.paddleWEff = this.params.paddleW;
    } else if (mode === 'chaos') {
      this.derived.minBounceVyEff =
        this.params.minBounceVy * (1 + CHAOS_PACE_PER_BALL * (this.world.balls.length - 1));
      this.derived.paddleWEff = this.params.paddleW;
    } else {
      this.derived.paddleWEff = this.params.paddleW;
      this.derived.minBounceVyEff = this.params.minBounceVy;
    }
  }

  private waveProgress(): number {
    return Math.min(1, (this.wave - 1) / WAVE_RAMP_WAVES);
  }

  /** Gate progress feeds gate size/placement (see TargetGate.reposition). */
  private gateProgress(): number {
    if (this.modeCfg.id === 'waves') return this.waveProgress();
    if (this.modeCfg.id === 'rush') return RUSH_GATE_PROGRESS;
    return 0;
  }

  private processEvents(): void {
    for (const e of this.events) {
      if (e.type === 'wall') {
        this.onWall(e);
      } else if (e.type === 'paddleHit') {
        this.onPaddleHit(e);
      } else if (e.type === 'miss') {
        this.onMiss(e);
        return; // state (or ball indices) may have changed; drop the rest
      }
      // 'carry' is intentionally silent (OG behavior).
    }
    for (const g of this.gateEvents) this.onGateScore(g);
  }

  private onWall(e: Extract<PhysicsEvent, { type: 'wall' }>): void {
    this.sound.play('wall');
    const colorful = this.modeCfg.colorFx;
    this.effects.burst(
      e.x,
      e.y,
      colorful ? 7 : 3,
      colorful ? 90 : 60,
      e.nx,
      e.ny,
      colorful ? FX_WALL : FX_WHITE,
    );
    this.effects.squash(e.ball, e.nx, e.ny, 0.12);
  }

  private onPaddleHit(e: Extract<PhysicsEvent, { type: 'paddleHit' }>): void {
    const mode = this.modeCfg.id;
    if (mode === 'og') {
      this.score += 1;
      this.sound.play('paddle');
      this.effects.burst(e.x, e.y, 5, 60, 0, 1);
      this.effects.squash(e.ball, 0, 1, 0.12);
      return;
    }

    this.combo.onPaddleHit(e.sweet);
    const mult = this.combo.multiplier;
    const ballFactor = mode === 'chaos' ? this.world.balls.length : 1;
    const pts = (e.sweet ? SCORE_SWEET : SCORE_PADDLE) * mult * ballFactor;
    this.score += pts;
    this.sound.play(e.sweet ? 'sweet' : 'paddle');
    this.effects.burst(e.x, e.y, e.sweet ? 14 : 10, 110, 0, 1, e.sweet ? FX_SWEET : FX_WHITE);
    this.effects.squash(e.ball, 0, 1, 0.22);
    this.effects.shake(0.18);
    this.effects.popup(e.x, e.y + 4, `+${pts}`);
    if (mult > this.lastMult) {
      this.sound.play('multiplier');
      const b = this.world.balls[e.ball];
      this.effects.popup(b.x, b.y + 6, `x${mult}`);
    }
    this.lastMult = mult;

    if (mode === 'waves') {
      this.waveHits += 1;
      const quota = Math.min(WAVE_HITS_MAX, WAVE_BASE_HITS + WAVE_HITS_INC * (this.wave - 1));
      if (this.waveHits >= quota) {
        this.wave += 1;
        this.waveHits = 0;
        this.score += WAVE_BONUS * mult;
        this.sound.play('wave');
        this.effects.celebrate();
        this.effects.popup(0, 8, `WAVE ${this.wave}`);
      }
    } else if (mode === 'chaos') {
      this.hitsSinceBall += 1;
      if (this.hitsSinceBall >= CHAOS_HITS_PER_BALL && this.world.balls.length < CHAOS_MAX_BALLS) {
        spawnBall(this.world, this.params);
        this.hitsSinceBall = 0;
        this.sound.play('ballGain');
        const nb = this.world.balls[this.world.balls.length - 1];
        this.effects.burst(nb.x, nb.y, 12, 100, 0, 1, FX_BALL_GAIN);
        this.effects.popup(nb.x, nb.y, '+BALL');
      }
    }
  }

  private onGateScore(g: GateEvent): void {
    const pts = (this.modeCfg.id === 'rush' ? RUSH_GATE_SCORE : SCORE_GATE) * this.combo.multiplier;
    this.score += pts;
    this.sound.play('gate');
    this.effects.burst(g.x, g.y, 10, 130, 0, 1, FX_GATE);
    this.effects.burst(g.x, g.y, 10, 130, 0, -1, FX_GATE);
    this.effects.shake(0.3);
    this.effects.popup(g.x, g.y, `+${pts}`);
  }

  private onMiss(e: Extract<PhysicsEvent, { type: 'miss' }>): void {
    const mode = this.modeCfg.id;
    if (mode === 'og' || mode === 'waves') {
      this.endRun('miss');
      return;
    }
    if (mode === 'rush') {
      this.timeLeft -= RUSH_MISS_PENALTY;
      this.combo.reset();
      resetToReady(this.world);
      this.reserveTimer = RUSH_RESERVE_DELAY;
      this.sound.play('miss');
      this.effects.shake(0.3);
      this.effects.popup(e.x, -38, `-${RUSH_MISS_PENALTY}S`, '#ff5544');
      if (this.timeLeft <= 0) this.endRun('timeup');
      return;
    }
    // chaos
    if (this.world.balls.length > 1) {
      removeBall(this.world, e.ball);
      this.combo.reset();
      this.sound.play('ballLost');
      this.effects.burst(e.x, -44, 10, 100, 0, -1, FX_BALL_LOST);
      this.effects.shake(0.4);
      return;
    }
    this.endRun('miss');
  }

  private endRun(reason: 'miss' | 'timeup'): void {
    this.state = 'gameover';
    resetToReady(this.world);
    this.ballViews.setVisible(false);
    this.gates.setEnabled(false);
    this.combo.reset();
    const mode = this.modeCfg.id;
    if (this.score > this.storage.data.best[mode]) {
      this.storage.data.best[mode] = this.score;
      this.storage.schedule();
    }
    this.sound.play(reason === 'miss' ? 'miss' : 'timeUp');
    if (mode !== 'og') this.effects.shake(0.5);
    const heading = reason === 'miss' ? 'MISS' : 'TIME UP';
    this.ui.showOverlay('gameover', { score: this.score, best: this.storage.data.best[mode], heading });
  }

  private startRun(): void {
    this.score = 0;
    this.lastMult = 1;
    this.combo.reset();
    this.wave = 1;
    this.waveHits = 0;
    this.timeLeft = RUSH_TIME;
    this.hitsSinceBall = 0;
    this.reserveTimer = 0;
    if (this.modeCfg.gates) {
      this.gates.reset(this.gateProgress());
      this.gates.setEnabled(true);
    } else {
      this.gates.setEnabled(false);
    }
    this.ballViews.setVisible(true);
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
    this.wave = 1;
    this.waveHits = 0;
    this.timeLeft = RUSH_TIME;
    this.hitsSinceBall = 0;
    this.reserveTimer = 0;
    resetToReady(this.world);
    this.ballViews.setVisible(true);
    this.gates.setEnabled(false);
    this.music.duck(false);
    this.ui.showOverlay('title', { mode: this.modeCfg.id });
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
    this.ballViews.setDiameter(this.params.ballDiameter);
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
        ? Math.round(Math.hypot(this.world.balls[0].vx, this.world.balls[0].vy))
        : 0;
    this.ui.setHud({
      best: this.storage.data.best[this.modeCfg.id],
      score: this.score,
      spd,
      combo: this.combo.combo,
      mult: this.combo.multiplier,
      comboVisible: this.modeCfg.hudCombo,
      sub: this.hudSub(),
    });
  }

  private hudSub(): string {
    switch (this.modeCfg.id) {
      case 'waves':
        return `WAVE ${this.wave}`;
      case 'rush':
        return `TIME ${Math.max(0, Math.ceil(this.timeLeft))}`;
      case 'chaos':
        return `BALLS ${this.world.balls.length}`;
      default:
        return '';
    }
  }
}
