import { Group, Mesh, MeshBasicMaterial, PlaneGeometry, type Scene } from 'three';
import {
  DIFF_GATE_SHRINK,
  GATE_BOB_AMP,
  GATE_BOB_PERIOD,
  GATE_COOLDOWN,
  GATE_FADE_OPACITY,
  GATE_FRAME,
  GATE_H,
  GATE_W,
  HALF_W,
} from '../config';
import type { BallState } from '../types';

export interface GateEvent {
  type: 'gateScore';
  gateIndex: 0 | 1;
  x: number;
  y: number;
}

interface Gate {
  cx: number;
  cy: number;
  w: number;
  h: number;
  phase: number;
  bobY: number;
  status: 'active' | 'cooldown';
  timer: number;
  prevInside: boolean;
  armed: boolean;
  flash: number;
}

interface GateView {
  group: Group;
  frameMat: MeshBasicMaterial;
  fillMat: MeshBasicMaterial;
  frames: Mesh[];
  fill: Mesh;
}

const FLASH_TIME = 0.2;
const OVERLAP_PAD = 4;

/**
 * Two floating hollow gates. Logic advances in the fixed step (so scoring
 * matches visuals); views are synced per render frame.
 */
export class GateManager {
  private gates: [Gate, Gate];
  private views: [GateView, GateView];
  private time = 0;
  private enabled = false;

  constructor(scene: Scene) {
    this.gates = [this.makeGate(0), this.makeGate(Math.PI * 0.7)];
    this.views = [this.makeView(scene), this.makeView(scene)];
    this.setEnabled(false);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    for (const v of this.views) v.group.visible = on;
  }

  /** Reposition both gates and re-arm (new run). */
  reset(progress: number): void {
    this.time = 0;
    for (let i = 0; i < 2; i++) {
      const g = this.gates[i]!;
      g.status = 'active';
      g.timer = 0;
      g.flash = 0;
      g.prevInside = false;
      this.reposition(i, progress);
      g.armed = true;
    }
  }

  step(h: number, ball: Readonly<BallState>, progress: number, out: GateEvent[]): void {
    if (!this.enabled) return;
    this.time += h;
    for (let i = 0; i < 2; i++) {
      const g = this.gates[i]!;
      g.bobY = GATE_BOB_AMP * Math.sin(((Math.PI * 2) / GATE_BOB_PERIOD) * this.time + g.phase);
      g.flash = Math.max(0, g.flash - h);

      if (g.status === 'cooldown') {
        g.timer -= h;
        if (g.timer <= 0) {
          g.status = 'active';
          this.reposition(i, progress);
          // Can't score until the ball has been outside the new inner rect.
          g.armed = !this.inside(g, ball);
          g.prevInside = this.inside(g, ball);
        }
        continue;
      }

      const inside = this.inside(g, ball);
      if (!g.armed && !inside) g.armed = true;
      if (g.armed && !g.prevInside && inside) {
        out.push({ type: 'gateScore', gateIndex: i as 0 | 1, x: g.cx, y: g.cy + g.bobY });
        g.status = 'cooldown';
        g.timer = GATE_COOLDOWN;
        g.flash = FLASH_TIME;
        g.armed = false;
      }
      g.prevInside = inside;
    }
  }

  /** Per-render-frame visual sync (flash pulse, fade, bob position). */
  syncViews(dt: number): void {
    if (!this.enabled) return;
    for (let i = 0; i < 2; i++) {
      const g = this.gates[i]!;
      const v = this.views[i]!;
      v.group.position.set(g.cx, g.cy + g.bobY, 0);
      const pulse = 1 + 0.25 * (g.flash / FLASH_TIME);
      v.group.scale.set(pulse, pulse, 1);
      v.fillMat.opacity = 0.85 * (g.flash / FLASH_TIME);
      const targetOpacity = g.status === 'cooldown' ? GATE_FADE_OPACITY : 1;
      v.frameMat.opacity += (targetOpacity - v.frameMat.opacity) * Math.min(1, dt * 12);
    }
  }

  private makeGate(phase: number): Gate {
    return {
      cx: 0,
      cy: 20,
      w: GATE_W,
      h: GATE_H,
      phase,
      bobY: 0,
      status: 'active',
      timer: 0,
      prevInside: false,
      armed: true,
      flash: 0,
    };
  }

  private makeView(scene: Scene): GateView {
    const group = new Group();
    const geo = new PlaneGeometry(1, 1);
    const frameMat = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1,
    });
    const fillMat = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
    });
    const frames: Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const m = new Mesh(geo, frameMat);
      m.position.z = -0.5;
      group.add(m);
      frames.push(m);
    }
    const fill = new Mesh(geo, fillMat);
    fill.position.z = -0.6;
    group.add(fill);
    scene.add(group);
    return { group, frameMat, fillMat, frames, fill };
  }

  private layoutView(i: number): void {
    const g = this.gates[i]!;
    const v = this.views[i]!;
    const t = GATE_FRAME;
    const specs: Array<[number, number, number, number]> = [
      [0, g.h / 2 - t / 2, g.w, t],
      [0, -g.h / 2 + t / 2, g.w, t],
      [-g.w / 2 + t / 2, 0, t, g.h - 2 * t],
      [g.w / 2 - t / 2, 0, t, g.h - 2 * t],
    ];
    specs.forEach(([x, y, w, h], j) => {
      const m = v.frames[j]!;
      m.position.set(x, y, -0.5);
      m.scale.set(w, h, 1);
    });
    v.fill.scale.set(g.w - 2 * t, g.h - 2 * t, 1);
  }

  private inside(g: Gate, ball: Readonly<BallState>): boolean {
    const iw = g.w / 2 - GATE_FRAME;
    const ih = g.h / 2 - GATE_FRAME;
    const cy = g.cy + g.bobY;
    return (
      ball.x > g.cx - iw && ball.x < g.cx + iw && ball.y > cy - ih && ball.y < cy + ih
    );
  }

  private reposition(i: number, progress: number): void {
    const g = this.gates[i]!;
    const other = this.gates[1 - i]!;
    const scale = 1 - DIFF_GATE_SHRINK * progress;
    g.w = GATE_W * scale;
    g.h = GATE_H * scale;

    const minAbsX = 15 + 25 * progress;
    const maxAbsX = HALF_W - g.w / 2 - (10 - 6 * progress);
    const minY = 10 + 14 * progress;
    const maxY = 34 + 8 * progress;

    let placed = false;
    for (let attempt = 0; attempt < 20 && !placed; attempt++) {
      const sign = Math.random() < 0.5 ? -1 : 1;
      const x = sign * (minAbsX + Math.random() * Math.max(0, maxAbsX - minAbsX));
      const y = minY + Math.random() * Math.max(0, maxY - minY);
      if (!this.overlaps(x, y, g.w, g.h, other)) {
        g.cx = x;
        g.cy = y;
        placed = true;
      }
    }
    if (!placed) {
      // Fallback: mirror the other gate horizontally.
      g.cx = -other.cx;
      g.cy = Math.min(maxY, Math.max(minY, other.cy + 8 > maxY ? other.cy - 8 : other.cy + 8));
    }
    this.layoutView(i);
  }

  private overlaps(x: number, y: number, w: number, h: number, other: Gate): boolean {
    const hw = w / 2 + OVERLAP_PAD;
    const hh = h / 2 + OVERLAP_PAD;
    const ohw = other.w / 2 + OVERLAP_PAD;
    const ohh = other.h / 2 + OVERLAP_PAD;
    return (
      Math.abs(x - other.cx) < hw + ohw && Math.abs(y - other.cy) < hh + ohh
    );
  }
}
