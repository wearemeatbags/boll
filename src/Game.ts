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
  RUN_COUNTDOWN_SECONDS,
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
import { ObjectiveTracker } from './ObjectiveTracker';
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
import {
  STAGES,
  medalForScore,
  stageById,
  stageIsUnlocked,
} from './stages';
import type {
  AudioLevels,
  DerivedParams,
  GameState,
  Medal,
  Mode,
  ModeConfig,
  PauseCause,
  PhysicsEvent,
  PhysicsParams,
  RunKind,
  StageConfig,
  Toggles,
} from './types';
import { UI } from './UI';
import { BallSetView } from './views/Ball';
import { PaddleView } from './views/Paddle';
import { GateManager, type GateEvent } from './views/TargetGate';

export class Game {
  private storage = new Storage();
  private params: PhysicsParams;
  private simulationParams: PhysicsParams;
  private toggles: Toggles;
  private audioLevels: AudioLevels;
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
  private motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  private music = new Music(this.bus);
  private sound = new Sound(this.bus);
  private combo = new ComboSystem();

  private state: GameState = 'title';
  private pauseCause: PauseCause = 'user';
  private pausedState: 'playing' | 'countdown' = 'playing';
  private runKind: RunKind = 'practice';
  private activeStage: StageConfig | null = null;
  private objective: ObjectiveTracker | null = null;
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
  private countdownLeft = 0;
  private countdownShown = '';
  private stageClearPending = false;
  private rushTimeoutPending = false;

  constructor(private root: HTMLElement) {
    this.params = { ...this.storage.data.settings.params };
    this.simulationParams = { ...this.params };
    this.toggles = { ...this.storage.data.settings.toggles };
    this.audioLevels = { ...this.storage.data.settings.audio };
    this.modeCfg = MODES[this.storage.data.settings.mode];
    this.world = createWorld(this.simulationParams);

    // DOM skeleton: canvas, fx layer (popups), ui layer (HUD/menus), CSS vignette.
    const stage = document.createElement('div');
    stage.className = 'stage';
    this.root.appendChild(stage);
    this.renderer = new Renderer(stage, this.root);
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
    this.applyAudio();
    this.motionQuery.addEventListener('change', () => this.applyToggles());
    this.paddleView.setSweetVisible(this.modeCfg.sweetSpotVisible);

    void this.music.load(`${import.meta.env.BASE_URL}audio/boll.m4a`);
    const onFirstGesture = (): void => {
      this.bus.unlock();
      this.music.start();
    };
    window.addEventListener('pointerdown', onFirstGesture, { once: true });
    window.addEventListener('keydown', onFirstGesture, { once: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && (this.state === 'playing' || this.state === 'countdown')) {
        this.pause('auto');
      }
    });

    this.showMainMenu();
    this.syncSettingsUi();
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
    if (this.state === 'countdown') this.advanceCountdown(dt);

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
    stepPhysics(this.world, ctrl, this.simulationParams, this.derived, FIXED_STEP, this.events);

    if (this.state !== 'playing') return;

    this.stageClearPending = false;
    this.rushTimeoutPending = false;
    this.objective?.step(FIXED_STEP);
    this.checkStageClear();

    if (this.modeCfg.id === 'rush') {
      this.stepRush();
    }

    this.gateEvents.length = 0;
    if (this.modeCfg.gates && this.world.ballMode === 'live') {
      this.gates.step(FIXED_STEP, this.world.balls[0], this.gateProgress(), this.gateEvents);
    }
    this.processEvents();
    this.finishPendingTransitions();
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
      this.timeLeft = 0;
      this.rushTimeoutPending = true;
      return;
    }
    if (this.world.ballMode === 'ready') {
      this.reserveTimer -= FIXED_STEP;
      if (this.reserveTimer <= 0) {
        const target = this.input.serveTarget(this.world.paddle.x);
        serve(this.world, target.x, target.y);
        this.gates.armForBall(this.world.balls[0]);
        this.sound.play('serve');
      }
    }
  }

  private updateDerived(): void {
    const mode = this.modeCfg.id;
    const stagePace = this.activeStage?.rules?.pace ?? 1;
    const stagePaddle = this.activeStage?.rules?.paddleScale ?? 1;
    const basePace = this.simulationParams.minBounceVy * stagePace;
    const basePaddle = this.simulationParams.paddleW * stagePaddle;
    this.derived.bounceModel = this.modeCfg.bounceModel;
    if (mode === 'waves') {
      if (this.runKind === 'stage') {
        this.derived.minBounceVyEff = basePace;
        this.derived.paddleWEff = basePaddle;
      } else {
        const wp = this.waveProgress();
        this.derived.minBounceVyEff =
          basePace * (WAVE_PACE_MIN + (WAVE_PACE_MAX - WAVE_PACE_MIN) * wp);
        this.derived.paddleWEff = basePaddle * (1 - WAVE_PADDLE_SHRINK * wp);
      }
    } else if (mode === 'rush') {
      this.derived.minBounceVyEff = basePace * RUSH_PACE;
      this.derived.paddleWEff = basePaddle;
    } else if (mode === 'chaos') {
      this.derived.minBounceVyEff =
        basePace * (1 + CHAOS_PACE_PER_BALL * (this.world.balls.length - 1));
      this.derived.paddleWEff = basePaddle;
    } else {
      this.derived.paddleWEff = basePaddle;
      this.derived.minBounceVyEff = basePace;
    }
  }

  private waveProgress(): number {
    return Math.min(1, (this.wave - 1) / WAVE_RAMP_WAVES);
  }

  /** Gate progress feeds gate size/placement (see TargetGate.reposition). */
  private gateProgress(): number {
    if (this.activeStage?.rules?.gateDifficulty !== undefined) {
      return this.activeStage.rules.gateDifficulty;
    }
    if (this.modeCfg.id === 'waves') return this.waveProgress();
    if (this.modeCfg.id === 'rush') return RUSH_GATE_PROGRESS;
    return 0;
  }

  private processEvents(): void {
    const misses = this.events.filter(
      (event): event is Extract<PhysicsEvent, { type: 'miss' }> => event.type === 'miss',
    );
    for (const e of this.events) {
      if (e.type === 'miss') continue;
      if (e.type === 'wall') {
        this.onWall(e);
      } else if (e.type === 'paddleHit') {
        this.onPaddleHit(e);
      } else if (e.type === 'carry') {
        this.onCarry();
      }
      if (this.state !== 'playing') return;
    }
    for (const g of this.gateEvents) {
      this.onGateScore(g);
      if (this.state !== 'playing') return;
    }
    if (misses.length > 0) this.processMisses(misses);
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
    this.objective?.onWall();
    this.checkStageClear();
  }

  private onPaddleHit(e: Extract<PhysicsEvent, { type: 'paddleHit' }>): void {
    const mode = this.modeCfg.id;
    if (mode === 'og') {
      this.score += 1;
      this.sound.play('paddle');
      this.effects.burst(e.x, e.y, 5, 60, 0, 1);
      this.effects.squash(e.ball, 0, 1, 0.12);
      this.recordPaddleObjective(e);
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

    if (mode === 'waves' && this.runKind !== 'stage') {
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
      if (this.hitsSinceBall >= CHAOS_HITS_PER_BALL) {
        this.hitsSinceBall = 0;
        const cap = this.activeStage?.rules?.ballCap ?? CHAOS_MAX_BALLS;
        if (this.world.balls.length < cap) {
          spawnBall(this.world, this.simulationParams);
          this.sound.play('ballGain');
          const nb = this.world.balls[this.world.balls.length - 1];
          this.effects.burst(nb.x, nb.y, 12, 100, 0, 1, FX_BALL_GAIN);
          this.effects.popup(nb.x, nb.y, '+BALL');
        }
      }
    }
    this.recordPaddleObjective(e);
  }

  private onCarry(): void {
    this.objective?.onCarry(FIXED_STEP);
    this.checkStageClear();
  }

  private recordPaddleObjective(e: Extract<PhysicsEvent, { type: 'paddleHit' }>): void {
    this.objective?.onPaddleHit(e.sweet, e.offset, e.outSpeed, this.combo.combo);
    this.objective?.setScore(this.score);
    this.checkStageClear();
  }

  private onGateScore(g: GateEvent): void {
    const pts = (this.modeCfg.id === 'rush' ? RUSH_GATE_SCORE : SCORE_GATE) * this.combo.multiplier;
    this.score += pts;
    this.sound.play('gate');
    this.effects.burst(g.x, g.y, 10, 130, 0, 1, FX_GATE);
    this.effects.burst(g.x, g.y, 10, 130, 0, -1, FX_GATE);
    this.effects.shake(0.3);
    this.effects.popup(g.x, g.y, `+${pts}`);
    this.objective?.onGate();
    this.objective?.setScore(this.score);
    this.checkStageClear();
  }

  private processMisses(misses: Array<Extract<PhysicsEvent, { type: 'miss' }>>): void {
    const mode = this.modeCfg.id;
    if (mode === 'og' || mode === 'waves') {
      this.endRun('miss');
      return;
    }
    if (mode === 'rush') {
      const e = misses[0]!;
      this.timeLeft -= RUSH_MISS_PENALTY;
      this.combo.reset();
      resetToReady(this.world);
      this.reserveTimer = RUSH_RESERVE_DELAY;
      this.sound.play('miss');
      this.effects.shake(0.3);
      this.effects.popup(e.x, -38, `-${RUSH_MISS_PENALTY}S`, '#ff5544');
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.rushTimeoutPending = true;
      }
      return;
    }
    const unique = new Map<number, Extract<PhysicsEvent, { type: 'miss' }>>();
    for (const miss of misses) {
      if (miss.ball >= 0 && miss.ball < this.world.balls.length) unique.set(miss.ball, miss);
    }
    if (unique.size >= this.world.balls.length) {
      this.endRun('miss');
      return;
    }
    this.combo.reset();
    this.lastMult = 1;
    this.hitsSinceBall = 0;
    const indices = [...unique.keys()].sort((a, b) => b - a);
    for (const index of indices) removeBall(this.world, index);
    for (const miss of unique.values()) {
      this.sound.play('ballLost');
      this.effects.burst(miss.x, -44, 10, 100, 0, -1, FX_BALL_LOST);
    }
    this.effects.shake(0.4);
  }

  private checkStageClear(): void {
    if (this.state !== 'playing' || this.runKind !== 'stage' || !this.objective?.complete) return;
    if (this.activeStage?.objective.kind === 'score' && this.activeStage.timeLimit !== undefined) {
      return;
    }
    this.stageClearPending = true;
  }

  private finishPendingTransitions(): void {
    if (this.state !== 'playing') return;
    if (this.rushTimeoutPending) {
      if (this.runKind === 'stage' && this.objective?.complete) this.clearStage();
      else this.endRun('timeup');
      return;
    }
    if (this.stageClearPending) this.clearStage();
  }

  private clearStage(): void {
    const medal = this.recordStageResult(true);
    this.state = 'stageclear';
    resetToReady(this.world);
    this.ballViews.setVisible(false);
    this.gates.setEnabled(false);
    this.combo.reset();
    this.ui.hideCountdown();
    this.sound.play('wave');
    this.effects.celebrate();
    this.ui.showOverlay('stageclear', {
      heading: 'STAGE CLEAR',
      score: this.score,
      best: this.bestForRun(),
      runLabel: this.runLabel(),
      objective: this.objective?.summaryText(),
      medal,
      nextStageId: this.nextStageId(),
      stage: this.activeStage ?? undefined,
      stageRun: true,
    });
  }

  private endRun(reason: 'miss' | 'timeup'): void {
    this.state = 'gameover';
    resetToReady(this.world);
    this.ballViews.setVisible(false);
    this.gates.setEnabled(false);
    this.combo.reset();
    this.ui.hideCountdown();
    const mode = this.modeCfg.id;
    if (this.runKind === 'stage') {
      this.recordStageResult(false);
    } else if (this.score > this.storage.data.best[mode]) {
      this.storage.data.best[mode] = this.score;
      this.storage.schedule();
    }
    this.sound.play(reason === 'miss' ? 'miss' : 'timeUp');
    if (mode !== 'og') this.effects.shake(0.5);
    const heading = reason === 'miss' ? 'MISS' : 'TIME UP';
    this.ui.showOverlay('gameover', {
      score: this.score,
      best: this.bestForRun(),
      heading,
      runLabel: this.runLabel(),
      objective: this.objective?.summaryText(),
      stage: this.activeStage ?? undefined,
      stageRun: this.runKind === 'stage',
    });
  }

  private startRun(): void {
    this.applyParams();
    this.score = 0;
    this.lastMult = 1;
    this.combo.reset();
    this.objective = this.activeStage ? new ObjectiveTracker(this.activeStage) : null;
    this.wave = 1;
    this.waveHits = 0;
    this.timeLeft = this.activeStage?.timeLimit ?? RUSH_TIME;
    this.hitsSinceBall = 0;
    this.reserveTimer = 0;
    this.stageClearPending = false;
    this.rushTimeoutPending = false;
    this.countdownLeft = RUN_COUNTDOWN_SECONDS;
    this.countdownShown = '';
    resetToReady(this.world);
    if (this.modeCfg.gates) {
      this.gates.reset(this.gateProgress());
      this.gates.setEnabled(true);
    } else {
      this.gates.setEnabled(false);
    }
    this.ballViews.setVisible(true);
    this.state = 'countdown';
    this.music.duck(false);
    this.ui.hideOverlay();
    this.updateCountdown();
  }

  private advanceCountdown(dt: number): void {
    this.countdownLeft = Math.max(0, this.countdownLeft - dt);
    if (this.countdownLeft <= 0) {
      this.launchCountdownRun();
      return;
    }
    this.updateCountdown();
  }

  private updateCountdown(): void {
    const count = String(
      Math.max(1, Math.ceil((this.countdownLeft / RUN_COUNTDOWN_SECONDS) * 3)),
    );
    if (count === this.countdownShown) return;
    this.countdownShown = count;
    this.ui.showCountdown(count, this.runLabel());
    this.sound.play('tick');
  }

  private launchCountdownRun(): void {
    if (this.state !== 'countdown') return;
    const target = this.input.serveTarget(this.world.paddle.x);
    serve(this.world, target.x, target.y);
    if (this.modeCfg.gates) this.gates.armForBall(this.world.balls[0]);
    this.state = 'playing';
    this.countdownLeft = 0;
    this.countdownShown = '';
    this.sound.play('serve');
    this.ui.hideCountdown();
  }

  private recordStageResult(cleared: boolean): Medal {
    if (!this.activeStage) return 0;
    const record = this.storage.data.stages[this.activeStage.id] ?? { bestScore: 0, medal: 0 as Medal };
    const medal = cleared ? medalForScore(this.score, this.activeStage.medalScores, true) : 0;
    const nextMedal = Math.max(record.medal, medal) as Medal;
    const nextBest = Math.max(record.bestScore, this.score);
    if (nextBest !== record.bestScore || nextMedal !== record.medal) {
      this.storage.data.stages[this.activeStage.id] = { bestScore: nextBest, medal: nextMedal };
      this.storage.schedule();
    }
    return medal;
  }

  private bestForRun(): number {
    if (this.runKind === 'stage' && this.activeStage) {
      return this.storage.data.stages[this.activeStage.id]?.bestScore ?? 0;
    }
    return this.storage.data.best[this.modeCfg.id];
  }

  private nextStageId(): string | undefined {
    if (!this.activeStage) return undefined;
    const records = this.storage.data.stages;
    const isAvailableForward = (stage: StageConfig): boolean =>
      stage.index > this.activeStage!.index &&
      stageIsUnlocked(stage, records) &&
      (records[stage.id]?.medal ?? 0) === 0;
    const forward =
      STAGES.find((stage) => !stage.optional && isAvailableForward(stage)) ??
      STAGES.find(isAvailableForward);
    if (forward) return forward.id;
    const remaining = STAGES.find(
      (stage) => stageIsUnlocked(stage, records) && (records[stage.id]?.medal ?? 0) === 0,
    );
    return remaining?.id;
  }

  private runLabel(): string {
    if (this.runKind === 'stage' && this.activeStage) {
      return `STAGE ${this.activeStage.index}  //  ${this.activeStage.title.toUpperCase()}`;
    }
    if (this.runKind === 'waves') return 'ENDLESS WAVES';
    if (this.runKind === 'scoreAttack') return 'SCORE ATTACK';
    if (this.runKind === 'chaos') return 'CHAOS CHALLENGE';
    return 'PRACTICE / ORIGINAL';
  }

  // --- state -------------------------------------------------------------------

  private pause(cause: PauseCause): void {
    if (this.state !== 'playing' && this.state !== 'countdown') return;
    this.pausedState = this.state;
    this.state = 'paused';
    this.pauseCause = cause;
    this.music.duck(true);
    this.ui.hideCountdown();
    if (cause !== 'menu') {
      this.ui.showOverlay('paused', {
        runLabel: this.runLabel(),
        stageRun: this.runKind === 'stage',
      });
    }
  }

  private resume(): void {
    if (this.state !== 'paused') return;
    this.state = this.pausedState;
    this.music.duck(false);
    this.ui.hideOverlay();
    if (this.pausedState === 'countdown') {
      this.countdownShown = '';
      this.updateCountdown();
    }
  }

  private showMainMenu(): void {
    this.state = 'title';
    this.runKind = 'practice';
    this.activeStage = null;
    this.objective = null;
    this.setMode('og', false);
    this.score = 0;
    this.lastMult = 1;
    this.combo.reset();
    this.wave = 1;
    this.waveHits = 0;
    this.timeLeft = RUSH_TIME;
    this.hitsSinceBall = 0;
    this.reserveTimer = 0;
    this.countdownLeft = 0;
    this.countdownShown = '';
    this.applyParams();
    resetToReady(this.world);
    this.ballViews.setVisible(true);
    this.gates.setEnabled(false);
    this.music.duck(false);
    this.ui.hideCountdown();
    this.ui.showOverlay('mainMenu', { stages: STAGES, stageRecords: this.storage.data.stages });
  }

  private showStageSelect(): void {
    const focusStageId = this.activeStage?.id ?? this.storage.data.campaign.lastStageId;
    this.state = 'title';
    this.runKind = 'practice';
    this.activeStage = null;
    this.objective = null;
    this.setMode('og', false);
    this.countdownLeft = 0;
    this.countdownShown = '';
    this.applyParams();
    resetToReady(this.world);
    this.ballViews.setVisible(true);
    this.gates.setEnabled(false);
    this.music.duck(false);
    this.ui.hideCountdown();
    this.ui.showOverlay('stageSelect', {
      stages: STAGES,
      stageRecords: this.storage.data.stages,
      focusStageId,
    });
  }

  private showHelp(): void {
    this.state = 'title';
    this.runKind = 'practice';
    this.activeStage = null;
    this.objective = null;
    this.setMode('og', false);
    this.applyParams();
    resetToReady(this.world);
    this.ballViews.setVisible(true);
    this.gates.setEnabled(false);
    this.music.duck(false);
    this.ui.hideCountdown();
    this.ui.showOverlay('help');
  }

  private setMode(mode: Mode, persist: boolean): void {
    this.modeCfg = MODES[mode];
    if (persist) {
      this.storage.data.settings.mode = mode;
      this.storage.schedule();
    }
    this.paddleView.setSweetVisible(this.modeCfg.sweetSpotVisible);
    this.syncSettingsUi();
  }

  private startPractice(): void {
    this.runKind = 'practice';
    this.activeStage = null;
    this.setMode('og', false);
    this.startRun();
  }

  private startScoreAttack(): void {
    this.runKind = 'scoreAttack';
    this.activeStage = null;
    this.setMode('rush', false);
    this.startRun();
  }

  private startWaves(): void {
    this.runKind = 'waves';
    this.activeStage = null;
    this.setMode('waves', false);
    this.startRun();
  }

  private startChaos(): void {
    this.runKind = 'chaos';
    this.activeStage = null;
    this.setMode('chaos', false);
    this.startRun();
  }

  private startStage(id: string): void {
    const stage = stageById(id);
    if (!stage || !stageIsUnlocked(stage, this.storage.data.stages)) {
      this.showStageSelect();
      return;
    }
    this.runKind = 'stage';
    this.activeStage = stage;
    this.storage.data.campaign.lastStageId = stage.id;
    this.storage.schedule();
    this.setMode(stage.mode, false);
    this.startRun();
  }

  private retryRun(): void {
    if (this.runKind === 'stage' && this.activeStage) {
      this.startStage(this.activeStage.id);
    } else if (this.runKind === 'scoreAttack') {
      this.startScoreAttack();
    } else if (this.runKind === 'waves') {
      this.startWaves();
    } else if (this.runKind === 'chaos') {
      this.startChaos();
    } else {
      this.startPractice();
    }
  }

  private handleAction(a: InputAction): void {
    if (a === 'primary') {
      if (this.ui.menuOpen) return;
      else if (this.state === 'paused') this.resume();
      else if (this.state === 'gameover' || this.state === 'stageclear') this.retryRun();
    } else if (a === 'serveKey') {
      if (this.ui.menuOpen) return;
      if (this.state === 'gameover' || this.state === 'stageclear') this.retryRun();
    } else if (a === 'pauseKey') {
      if (this.ui.menuOpen) {
        this.closeMenu();
      } else if (this.state === 'playing' || this.state === 'countdown') {
        this.pause('user');
      } else if (this.state === 'paused') {
        this.resume();
      } else if (this.state === 'title' && this.ui.overlayKind !== 'mainMenu') {
        this.showMainMenu();
      }
    } else if (a === 'restartKey') {
      if (this.ui.menuOpen) return;
      if (
        this.state === 'playing' ||
        this.state === 'countdown' ||
        this.state === 'paused' ||
        this.state === 'gameover' ||
        this.state === 'stageclear'
      ) {
        this.retryRun();
      }
    }
  }

  private closeMenu(): void {
    this.ui.closeMenu();
    if (this.state === 'paused' && this.pauseCause === 'menu') this.resume();
  }

  // --- settings ------------------------------------------------------------------

  private wireUi(): void {
    this.ui.onMenuOpen = (): void => {
      if (this.state === 'playing' || this.state === 'countdown') this.pause('menu');
      this.syncSettingsUi();
      this.ui.openMenu();
    };
    this.ui.onMenuClose = (): void => this.closeMenu();
    this.ui.onSettings = (): void => {
      if (this.state === 'playing' || this.state === 'countdown') this.pause('menu');
      this.syncSettingsUi();
      this.ui.openMenu();
    };
    this.ui.onResume = (): void => this.resume();
    this.ui.onMainMenu = (): void => {
      this.ui.closeMenu();
      this.showMainMenu();
    };
    this.ui.onShowStageSelect = (): void => {
      this.ui.closeMenu();
      this.showStageSelect();
    };
    this.ui.onHelp = (): void => this.showHelp();
    this.ui.onStartPractice = (): void => this.startPractice();
    this.ui.onStartWaves = (): void => this.startWaves();
    this.ui.onStartScoreAttack = (): void => this.startScoreAttack();
    this.ui.onStartChaos = (): void => this.startChaos();
    this.ui.onStage = (id: string): void => this.startStage(id);
    this.ui.onRetry = (): void => this.retryRun();
    this.ui.onNextStage = (id: string): void => this.startStage(id);
    this.ui.onRestart = (): void => {
      this.ui.closeMenu();
      this.retryRun();
    };
    this.ui.onResetDefaults = (): void => {
      this.params = { ...DEFAULT_PARAMS };
      this.toggles = {
        keyboard: true,
        mouse: true,
        effects: true,
        shake: true,
        crt: true,
        sfx: true,
        music: true,
      };
      this.audioLevels = { music: 1, sfx: 1 };
      this.persistSettings();
      this.applyParams();
      this.applyToggles();
      this.applyAudio();
      this.syncSettingsUi();
    };
    this.ui.onPreset = (name: PresetName): void => {
      if (!this.tuningAllowed()) return;
      Object.assign(this.params, PRESETS[name]);
      this.persistSettings();
      this.applyParams();
      this.syncSettingsUi();
    };
    this.ui.onSlider = (key: keyof PhysicsParams, value: number): void => {
      if (!this.tuningAllowed()) return;
      this.params[key] = value;
      this.persistSettings();
      this.applyParams();
    };
    this.ui.onToggle = (key: keyof Toggles, on: boolean): void => {
      this.toggles[key] = on;
      this.persistSettings();
      this.applyToggles();
      this.syncSettingsUi();
    };
    this.ui.onAudio = (key: keyof AudioLevels, value: number): void => {
      this.audioLevels[key] = value;
      this.persistSettings();
      this.applyAudio();
    };
    this.ui.onResetProgress = (): void => {
      this.storage.resetProgress();
      this.ui.closeMenu();
      this.showMainMenu();
    };
    this.ui.onFullscreen = (): void => {
      if (!document.fullscreenEnabled) return;
      const operation = document.fullscreenElement
        ? document.exitFullscreen()
        : this.root.requestFullscreen();
      void operation.catch((err: unknown) => console.warn('boll: fullscreen request failed', err));
    };
  }

  private applyParams(): void {
    const base = this.runKind === 'practice' && this.activeStage === null ? this.params : DEFAULT_PARAMS;
    this.simulationParams = {
      ...base,
      gravity: base.gravity * (this.activeStage?.rules?.gravityScale ?? 1),
    };
    this.ballViews.setDiameter(this.simulationParams.ballDiameter);
    this.input.setPaddleSpeed(this.simulationParams.paddleSpeed);
  }

  private applyToggles(): void {
    const t = this.toggles;
    const reducedMotion = this.motionQuery.matches;
    this.input.setKeyboardEnabled(t.keyboard);
    this.input.setMouseEnabled(t.mouse);
    this.effects.setEnabled(t.effects && !reducedMotion);
    this.effects.setShakeEnabled(t.shake && !reducedMotion);
    this.renderer.setCrtEnabled(t.crt);
    this.sound.setEnabled(t.sfx);
    this.music.setEnabled(t.music);
  }

  private applyAudio(): void {
    this.bus.setMusicVolume(this.audioLevels.music);
    this.bus.setSfxVolume(this.audioLevels.sfx);
  }

  private tuningAllowed(): boolean {
    return this.runKind === 'practice' && this.activeStage === null;
  }

  private syncSettingsUi(): void {
    this.ui.syncMenu(
      this.params,
      this.toggles,
      this.modeCfg.id,
      this.audioLevels,
      this.tuningAllowed(),
    );
  }

  private persistSettings(): void {
    this.storage.data.settings.params = { ...this.params };
    this.storage.data.settings.toggles = { ...this.toggles };
    this.storage.data.settings.audio = { ...this.audioLevels };
    this.storage.schedule();
  }

  private updateHud(): void {
    const spd =
      this.world.ballMode === 'live'
        ? Math.round(Math.hypot(this.world.balls[0].vx, this.world.balls[0].vy))
        : 0;
    this.ui.setHud({
      best: this.bestForRun(),
      score: this.score,
      spd,
      combo: this.combo.combo,
      mult: this.combo.multiplier,
      comboVisible: this.modeCfg.hudCombo,
      sub: this.hudSub(),
    });
  }

  private hudSub(): string {
    if (this.runKind === 'stage' && this.objective) {
      const base = this.objective.hudText();
      if (this.modeCfg.id === 'rush') return `${base} · TIME ${Math.max(0, Math.ceil(this.timeLeft))}`;
      return base;
    }
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
