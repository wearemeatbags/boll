// Pure physics core. Plain data, world units, +y up. No three.js, no DOM.
// This is a faithful port of the validated OG prototype (legacy HTML, y-down)
// into y-up world units; the step ordering and the carry branch ARE the feel.
import {
  CARRY_PADDLE_VY,
  CARRY_REL,
  CROSS_EPS,
  HALF_H,
  HALF_W,
  HOVER_MAX_Y,
  MISS_Y,
  OG_STEER,
  OG_VX_CLAMP,
  OG_VY_CLAMP,
  PADDLE_H,
  PADDLE_REST_Y,
  PADDLE_V_ALPHA,
  PURSUIT_RATE,
  REST_OFFSET,
  SERVE_MAX_Y,
  SERVE_RISE,
  SERVE_VX,
  SPAWN_X_RANGE,
  SPAWN_Y,
  SWEET_ZONE,
  ARCADE_VX_FRACTION,
  TARGET_Y_MAX,
  TARGET_Y_MIN,
  WALL_REST_MAX,
  WALL_REST_MIN,
  clamp,
} from './config';
import type {
  ControlFrame,
  DerivedParams,
  PhysicsEvent,
  PhysicsParams,
  Vec2,
} from './types';
import type { BallState, PaddleState } from './types';

export interface PhysicsWorld {
  /** Index 0 always exists. */
  balls: BallState[];
  /** Position snapshots from the start of the last step, for render interpolation. */
  prevBalls: Vec2[];
  paddle: PaddleState;
  ballMode: 'ready' | 'live';
  prevPaddle: Vec2;
}

export function createWorld(p: PhysicsParams): PhysicsWorld {
  return {
    balls: [{ x: 0, y: PADDLE_REST_Y + SERVE_RISE, vx: 0, vy: 0, r: p.ballDiameter / 2 }],
    prevBalls: [{ x: 0, y: PADDLE_REST_Y + SERVE_RISE }],
    paddle: { x: 0, y: PADDLE_REST_Y, w: p.paddleW, h: PADDLE_H, vx: 0, vy: 0 },
    ballMode: 'ready',
    prevPaddle: { x: 0, y: PADDLE_REST_Y },
  };
}

export function serve(w: PhysicsWorld, targetX: number, targetY: number): void {
  w.balls.length = 1;
  w.prevBalls.length = 1;
  const ball = w.balls[0];
  ball.x = targetX;
  ball.y = Math.min(SERVE_MAX_Y, targetY + SERVE_RISE);
  ball.vx = (Math.random() * 2 - 1) * SERVE_VX;
  ball.vy = 0;
  w.ballMode = 'live';
  w.prevBalls[0].x = ball.x;
  w.prevBalls[0].y = ball.y;
}

export function resetToReady(w: PhysicsWorld): void {
  w.balls.length = 1;
  w.prevBalls.length = 1;
  w.ballMode = 'ready';
}

export function spawnBall(w: PhysicsWorld, p: PhysicsParams): void {
  const ball: BallState = {
    x: (Math.random() * 2 - 1) * SPAWN_X_RANGE,
    y: SPAWN_Y,
    vx: (Math.random() * 2 - 1) * SERVE_VX,
    vy: 0,
    r: p.ballDiameter / 2,
  };
  w.balls.push(ball);
  w.prevBalls.push({ x: ball.x, y: ball.y });
}

export function removeBall(w: PhysicsWorld, index: number): void {
  w.balls.splice(index, 1);
  w.prevBalls.splice(index, 1);
}

export function stepPhysics(
  w: PhysicsWorld,
  ctrl: ControlFrame,
  p: PhysicsParams,
  d: DerivedParams,
  h: number,
  out: PhysicsEvent[],
): void {
  const paddle = w.paddle;
  paddle.w = d.paddleWEff;

  // Capture BEFORE anything moves this step (the sweep test depends on it).
  const prevBallBottom: number[] = new Array(w.balls.length);
  for (let i = 0; i < w.balls.length; i++) {
    const ball = w.balls[i];
    ball.r = p.ballDiameter / 2;
    w.prevBalls[i].x = ball.x;
    w.prevBalls[i].y = ball.y;
    prevBallBottom[i] = ball.y - ball.r;
  }
  w.prevPaddle.x = paddle.x;
  w.prevPaddle.y = paddle.y;
  const prevPaddleTop = paddle.y + paddle.h / 2;

  // --- paddle motion -------------------------------------------------------
  const k = 1 - Math.exp(-PURSUIT_RATE * h);
  const px0 = paddle.x;
  const py0 = paddle.y;
  const halfW = paddle.w / 2;
  const minX = -HALF_W + halfW;
  const maxX = HALF_W - halfW;

  if (ctrl.xOwner === 'keyboard') {
    paddle.x = clamp(paddle.x + ctrl.kbVx * h, minX, maxX);
  } else if (ctrl.targetX !== null) {
    paddle.x = px0 + (clamp(ctrl.targetX, minX, maxX) - px0) * k;
  }
  paddle.y = py0 + (clamp(ctrl.targetY, TARGET_Y_MIN, TARGET_Y_MAX) - py0) * k;

  // Velocity estimate from actual motion, smoothed (impact momentum is honest).
  const instVx = (paddle.x - px0) / h;
  const instVy = (paddle.y - py0) / h;
  paddle.vx += (instVx - paddle.vx) * PADDLE_V_ALPHA;
  paddle.vy += (instVy - paddle.vy) * PADDLE_V_ALPHA;

  // --- ready: ball hovers above the paddle waiting for serve ---------------
  // Only ball 0 hovers; other balls shouldn't exist in ready mode anyway.
  if (w.ballMode === 'ready') {
    const ball = w.balls[0];
    ball.x += (paddle.x - ball.x) * Math.min(1, 10 * h);
    ball.y = Math.min(paddle.y + SERVE_RISE, HOVER_MAX_Y);
    ball.vx = 0;
    ball.vy = 0;
    return;
  }

  // --- live: integrate + collide each ball independently (no ball-ball) ----
  const wr = clamp(p.restitution, WALL_REST_MIN, WALL_REST_MAX);
  for (let i = 0; i < w.balls.length; i++) {
    const ball = w.balls[i];

    // --- integrate ball ------------------------------------------------------
    ball.vy -= p.gravity * h;
    const dragDecay = Math.max(0, 1 - p.drag * 1.5 * h);
    ball.vx *= dragDecay;
    ball.vy *= dragDecay;
    ball.x += ball.vx * h;
    ball.y += ball.vy * h;

    // --- walls (reflect only when moving into the wall) ----------------------
    if (ball.x - ball.r < -HALF_W) {
      ball.x = -HALF_W + ball.r;
      if (ball.vx < 0) {
        ball.vx = -ball.vx * wr;
        out.push({ type: 'wall', ball: i, x: -HALF_W, y: ball.y, nx: 1, ny: 0 });
      }
    } else if (ball.x + ball.r > HALF_W) {
      ball.x = HALF_W - ball.r;
      if (ball.vx > 0) {
        ball.vx = -ball.vx * wr;
        out.push({ type: 'wall', ball: i, x: HALF_W, y: ball.y, nx: -1, ny: 0 });
      }
    }
    if (ball.y + ball.r > HALF_H) {
      ball.y = HALF_H - ball.r;
      if (ball.vy > 0) {
        ball.vy = -ball.vy * wr;
        out.push({ type: 'wall', ball: i, x: ball.x, y: HALF_H, nx: 0, ny: -1 });
      }
    }

    paddleHit(w, i, p, d, prevPaddleTop, prevBallBottom[i], out);

    if (ball.y + ball.r < MISS_Y) {
      out.push({ type: 'miss', ball: i, x: ball.x });
    }
  }
}

function paddleHit(
  w: PhysicsWorld,
  index: number,
  p: PhysicsParams,
  d: DerivedParams,
  prevPaddleTop: number,
  prevBallBottom: number,
  out: PhysicsEvent[],
): void {
  const ball = w.balls[index];
  const paddle = w.paddle;
  const half = paddle.w / 2;
  const top = paddle.y + paddle.h / 2;
  const r = ball.r;

  if (ball.x + r < paddle.x - half || ball.x - r > paddle.x + half) return;

  // Must be approaching the paddle from above.
  const relVy = ball.vy - paddle.vy;
  if (relVy >= 0) return;

  const ballBottom = ball.y - r;
  const crossed = prevBallBottom >= prevPaddleTop - CROSS_EPS && ballBottom <= top;
  // The "inside" window extends a full paddle height below center: OG quirk, keep.
  const inside = ballBottom <= top && ball.y > paddle.y - paddle.h;
  if (!crossed && !inside) return;

  const pvy = paddle.vy * p.influence;
  const rel = ball.vy - pvy; // < 0 when closing

  // CARRY: gentle contact lets the ball ride the paddle (cushioning).
  // Runs before the bounce so the arcade pace floor never breaks it.
  if (rel > -CARRY_REL && Math.abs(paddle.vy) < CARRY_PADDLE_VY) {
    ball.y = top + r;
    ball.vy = paddle.vy;
    ball.vx = ball.vx * 0.9 + paddle.vx * 0.1;
    out.push({ type: 'carry', ball: index });
    return;
  }

  const off = clamp((ball.x - paddle.x) / half, -1, 1);
  let vx: number;
  let vy: number;
  let sweet = false;

  if (d.bounceModel === 'og') {
    vy = clamp(pvy - p.restitution * rel, -OG_VY_CLAMP, OG_VY_CLAMP);
    vx = clamp(
      ball.vx * 0.72 + paddle.vx * 0.55 * p.influence + off * OG_STEER,
      -OG_VX_CLAMP,
      OG_VX_CLAMP,
    );
  } else {
    sweet = Math.abs(off) <= SWEET_ZONE;
    // pvy - restitution*rel IS the OG flick formula; the difficulty-scaled
    // floor supplies the rising pace without killing flick-to-power.
    vy = Math.min(p.maxBallSpeed, Math.max(d.minBounceVyEff, pvy - p.restitution * rel));
    vx = sweet
      ? ball.vx * 0.2 + paddle.vx * p.influence * 0.9 + off * 40
      : ball.vx * 0.25 + paddle.vx * p.influence * 0.8 + off * Math.abs(off) * 120 + off * 30;
    const vxMax = ARCADE_VX_FRACTION * p.maxBallSpeed;
    vx = clamp(vx, -vxMax, vxMax);
    const speed = Math.hypot(vx, vy);
    if (speed > p.maxBallSpeed) {
      const f = p.maxBallSpeed / speed;
      vx *= f;
      vy *= f;
    }
  }

  ball.vx = vx;
  ball.vy = vy;
  ball.y = top + r + REST_OFFSET;
  out.push({
    type: 'paddleHit',
    ball: index,
    x: ball.x,
    y: top,
    offset: off,
    sweet,
    outSpeed: Math.hypot(vx, vy),
  });
}
