import {
  HALF_W,
  KB_ACCEL_RATE,
  KB_COAST_RATE,
  KB_MAX_FACTOR,
  KB_STOP_SPEED,
  KB_VERTICAL_FACTOR,
  KB_VERTICAL_MAX,
  PADDLE_REST_Y,
  TARGET_Y_MAX,
  TARGET_Y_MIN,
  TOUCH_LIFT,
  clamp,
} from './config';
import type { ControlFrame, Vec2 } from './types';

export type InputAction = 'primary' | 'serveKey' | 'pauseKey' | 'restartKey';

const LEFT_CODES = new Set(['ArrowLeft', 'KeyA']);
const RIGHT_CODES = new Set(['ArrowRight', 'KeyD']);
const UP_CODES = new Set(['ArrowUp', 'KeyW']);
const DOWN_CODES = new Set(['ArrowDown', 'KeyS']);

/**
 * Pointer drives the paddle in both axes (absolute-position pursuit). While
 * direction/WASD keys are held, keyboard owns that axis; a fresh pointer move
 * after release reclaims it. Vertical key motion is deliberately gentle enough
 * to perform carry objectives without a pointer.
 */
export class InputController {
  private pointerTargetX: number | null = null;
  private lastPointerY = PADDLE_REST_Y;
  private kbVx = 0;
  private keyboardTargetY = PADDLE_REST_Y;
  private left = false;
  private right = false;
  private up = false;
  private down = false;
  private xOwner: 'pointer' | 'keyboard' = 'pointer';
  private yOwner: 'pointer' | 'keyboard' = 'pointer';
  private keyboardEnabled = true;
  private mouseEnabled = true;
  private paddleSpeed = 150;
  private actionCb: (a: InputAction) => void = () => {};
  private disposers: Array<() => void> = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private toWorld: (clientX: number, clientY: number) => Vec2,
  ) {
    const onPointerMove = (e: PointerEvent): void => this.updatePointer(e);
    const onPointerDown = (e: PointerEvent): void => {
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        // Capture is best-effort (matches OG).
      }
      this.updatePointer(e);
      this.actionCb('primary');
    };
    const onKeyDown = (e: KeyboardEvent): void => this.handleKeyDown(e);
    const onKeyUp = (e: KeyboardEvent): void => this.handleKeyUp(e);

    this.canvas.addEventListener('pointermove', onPointerMove);
    this.canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    this.disposers.push(() => {
      this.canvas.removeEventListener('pointermove', onPointerMove);
      this.canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    });
  }

  onAction(cb: (a: InputAction) => void): void {
    this.actionCb = cb;
  }

  setKeyboardEnabled(on: boolean): void {
    this.keyboardEnabled = on;
    if (!on) {
      this.left = false;
      this.right = false;
      this.up = false;
      this.down = false;
      this.kbVx = 0;
      this.xOwner = 'pointer';
      this.yOwner = 'pointer';
      this.keyboardTargetY = PADDLE_REST_Y;
    }
  }

  setMouseEnabled(on: boolean): void {
    this.mouseEnabled = on;
    if (!on) {
      this.pointerTargetX = null;
      this.keyboardTargetY = this.lastPointerY;
      this.lastPointerY = PADDLE_REST_Y;
      if (this.keyboardEnabled) this.yOwner = 'keyboard';
    } else {
      this.lastPointerY = this.keyboardTargetY;
      this.yOwner = 'pointer';
    }
  }

  setPaddleSpeed(v: number): void {
    this.paddleSpeed = v;
  }

  /** Pointer target for serve placement (falls back to the paddle). */
  serveTarget(paddleX: number): Vec2 {
    return {
      x: this.mouseEnabled && this.pointerTargetX !== null ? this.pointerTargetX : paddleX,
      y: this.targetY(),
    };
  }

  sample(h: number, paddleX: number, halfW: number): ControlFrame {
    const verticalDir = (this.up ? 1 : 0) - (this.down ? 1 : 0);
    if (this.keyboardEnabled && this.yOwner === 'keyboard' && verticalDir !== 0) {
      this.keyboardTargetY = clamp(
        this.keyboardTargetY +
          verticalDir * Math.min(this.paddleSpeed * KB_VERTICAL_FACTOR, KB_VERTICAL_MAX) * h,
        TARGET_Y_MIN,
        TARGET_Y_MAX,
      );
    }
    const targetY = this.targetY();

    if (this.xOwner === 'keyboard' && this.keyboardEnabled) {
      const dir = (this.right ? 1 : 0) - (this.left ? 1 : 0);
      if (dir !== 0) {
        const target = dir * KB_MAX_FACTOR * this.paddleSpeed;
        this.kbVx += (target - this.kbVx) * (1 - Math.exp(-KB_ACCEL_RATE * h));
      } else {
        this.kbVx *= Math.exp(-KB_COAST_RATE * h);
        if (Math.abs(this.kbVx) < KB_STOP_SPEED) this.kbVx = 0;
      }
      // Zero the outward velocity on wall contact.
      const eps = 1e-6;
      if (
        (paddleX <= -HALF_W + halfW + eps && this.kbVx < 0) ||
        (paddleX >= HALF_W - halfW - eps && this.kbVx > 0)
      ) {
        this.kbVx = 0;
      }
      return { targetX: null, targetY, kbVx: this.kbVx, xOwner: 'keyboard' };
    }
    return {
      targetX: this.mouseEnabled ? this.pointerTargetX : null,
      targetY,
      kbVx: 0,
      xOwner: 'pointer',
    };
  }

  dispose(): void {
    for (const d of this.disposers) d();
  }

  private targetY(): number {
    if (this.keyboardEnabled && this.yOwner === 'keyboard') return this.keyboardTargetY;
    return this.mouseEnabled ? this.lastPointerY : PADDLE_REST_Y;
  }

  private updatePointer(e: PointerEvent): void {
    if (!this.mouseEnabled) return;
    const p = this.toWorld(e.clientX, e.clientY);
    this.pointerTargetX = clamp(p.x, -HALF_W, HALF_W);
    const lift = e.pointerType === 'touch' ? TOUCH_LIFT : 0;
    this.lastPointerY = clamp(p.y + lift, TARGET_Y_MIN, TARGET_Y_MAX);
    // Reclaim x only when no direction key is held.
    if (!this.left && !this.right) this.xOwner = 'pointer';
    if (!this.up && !this.down) this.yOwner = 'pointer';
  }

  private handleKeyDown(e: KeyboardEvent): void {
    const target = e.target;
    const onUiControl =
      target instanceof HTMLElement &&
      (target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.tagName === 'SELECT');
    // Let focused menu controls keep their native keyboard behavior,
    // except Escape which must always reach the game (close menu / pause).
    if (onUiControl && e.code !== 'Escape') return;

    if (this.keyboardEnabled && LEFT_CODES.has(e.code)) {
      this.left = true;
      this.takeKeyboardOwnership();
      e.preventDefault();
      return;
    }
    if (this.keyboardEnabled && RIGHT_CODES.has(e.code)) {
      this.right = true;
      this.takeKeyboardOwnership();
      e.preventDefault();
      return;
    }
    if (this.keyboardEnabled && UP_CODES.has(e.code)) {
      this.up = true;
      this.takeKeyboardYOwnership();
      e.preventDefault();
      return;
    }
    if (this.keyboardEnabled && DOWN_CODES.has(e.code)) {
      this.down = true;
      this.takeKeyboardYOwnership();
      e.preventDefault();
      return;
    }
    if (e.repeat) return;
    if (e.code === 'Space') {
      this.actionCb('serveKey');
      e.preventDefault();
    } else if (e.code === 'KeyP' || e.code === 'Escape') {
      this.actionCb('pauseKey');
      e.preventDefault();
    } else if (e.code === 'KeyR') {
      this.actionCb('restartKey');
      e.preventDefault();
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    if (LEFT_CODES.has(e.code)) this.left = false;
    if (RIGHT_CODES.has(e.code)) this.right = false;
    if (UP_CODES.has(e.code)) this.up = false;
    if (DOWN_CODES.has(e.code)) this.down = false;
  }

  private takeKeyboardOwnership(): void {
    this.xOwner = 'keyboard';
    // Clear the stale pointer target so pointer and keys never fight.
    this.pointerTargetX = null;
  }

  private takeKeyboardYOwnership(): void {
    if (this.yOwner !== 'keyboard') this.keyboardTargetY = this.lastPointerY;
    this.yOwner = 'keyboard';
  }
}
