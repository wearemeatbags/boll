import * as THREE from 'three';
import type { BallView } from '../views/Ball';
import type { Vec2 } from '../types';

const POOL_SIZE = 200;
const POPUP_POOL = 8;
const PARTICLE_GRAVITY = 220;
const PARTICLE_DRAG = 1.6;
const SHAKE_MAX = 2.2;
const SHAKE_DECAY = 2.4;
const SQUASH_TIME = 0.12;
const POPUP_TIME = 0.7;
const POPUP_RISE = 12;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

interface Popup {
  el: HTMLDivElement;
  x: number;
  y: number;
  t: number;
  active: boolean;
}

/**
 * Particles (one InstancedMesh; additive blending on black means fading the
 * instance color toward black IS the opacity fade), trauma camera shake,
 * ball squash, and pooled DOM "+points" popups.
 */
export class Effects {
  enabled = true;

  private mesh: THREE.InstancedMesh;
  private particles: Particle[] = [];
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();
  private cursor = 0;
  private trauma = 0;
  private shakeOffset: Vec2 = { x: 0, y: 0 };
  private squashT = 0;
  private squashAmount = 0;
  private squashNx = 0;
  private squashNy = 1;
  private popups: Popup[] = [];

  constructor(
    scene: THREE.Scene,
    private ballView: BallView,
    fxLayer: HTMLElement,
    private worldToScreen: (x: number, y: number) => Vec2,
  ) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
      POOL_SIZE,
    );
    this.mesh.frustumCulled = false;
    this.mesh.position.z = 1;
    for (let i = 0; i < POOL_SIZE; i++) {
      this.particles.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 1 });
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, this.color.setScalar(0));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    scene.add(this.mesh);

    for (let i = 0; i < POPUP_POOL; i++) {
      const el = document.createElement('div');
      el.className = 'popup';
      el.style.opacity = '0';
      fxLayer.appendChild(el);
      this.popups.push({ el, x: 0, y: 0, t: 0, active: false });
    }
  }

  /** Spawn a fan of tiny white squares at (x, y) around normal (nx, ny). */
  burst(x: number, y: number, count: number, speed: number, nx = 0, ny = 1): void {
    if (!this.enabled) return;
    const baseAngle = Math.atan2(ny, nx);
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.cursor]!;
      this.cursor = (this.cursor + 1) % POOL_SIZE;
      const angle = baseAngle + (Math.random() - 0.5) * Math.PI * 0.9;
      const v = speed * (0.4 + Math.random() * 0.6);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * v;
      p.vy = Math.sin(angle) * v;
      p.maxLife = 0.25 + Math.random() * 0.2;
      p.life = p.maxLife;
      p.size = 1.2 + Math.random();
    }
  }

  shake(mag: number): void {
    if (!this.enabled) return;
    this.trauma = Math.min(1, this.trauma + mag);
  }

  /** Squash along the impact normal (unit axis) for ~120ms. */
  squash(nx: number, ny: number, amount: number): void {
    if (!this.enabled) return;
    this.squashT = SQUASH_TIME;
    this.squashAmount = amount;
    this.squashNx = Math.abs(nx);
    this.squashNy = Math.abs(ny);
  }

  popup(x: number, y: number, text: string): void {
    if (!this.enabled) return;
    let slot = this.popups.find((p) => !p.active);
    if (!slot) slot = this.popups[0]!;
    slot.el.textContent = text;
    slot.x = x;
    slot.y = y;
    slot.t = 0;
    slot.active = true;
  }

  cameraOffset(): Readonly<Vec2> {
    return this.shakeOffset;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.clear();
  }

  update(dt: number): void {
    this.updateParticles(dt);
    this.updateShake(dt);
    this.updateSquash(dt);
    this.updatePopups(dt);
  }

  private updateParticles(dt: number): void {
    const drag = Math.exp(-PARTICLE_DRAG * dt);
    for (let i = 0; i < POOL_SIZE; i++) {
      const p = this.particles[i]!;
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        this.dummy.position.set(0, 0, 1);
        this.dummy.scale.setScalar(0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        this.mesh.setColorAt(i, this.color.setScalar(0));
        continue;
      }
      p.vy -= PARTICLE_GRAVITY * dt;
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const t = p.life / p.maxLife;
      this.dummy.position.set(p.x, p.y, 1);
      this.dummy.scale.set(p.size * t, p.size * t, 1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, this.color.setScalar(t));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private updateShake(dt: number): void {
    this.trauma = Math.max(0, this.trauma - SHAKE_DECAY * dt);
    const mag = this.trauma * this.trauma * SHAKE_MAX;
    this.shakeOffset.x = mag * (Math.random() * 2 - 1);
    this.shakeOffset.y = mag * (Math.random() * 2 - 1);
  }

  private updateSquash(dt: number): void {
    if (this.squashT <= 0) {
      this.ballView.setSquash(1, 1);
      return;
    }
    this.squashT = Math.max(0, this.squashT - dt);
    const k = this.squashAmount * (this.squashT / SQUASH_TIME);
    // Vertical impact: wide + short. Horizontal impact: narrow + tall.
    const axis = this.squashNy - this.squashNx;
    this.ballView.setSquash(1 + k * axis, 1 - k * axis);
  }

  private updatePopups(dt: number): void {
    for (const p of this.popups) {
      if (!p.active) continue;
      p.t += dt;
      if (p.t >= POPUP_TIME) {
        p.active = false;
        p.el.style.opacity = '0';
        continue;
      }
      const u = p.t / POPUP_TIME;
      const rise = POPUP_RISE * (1 - (1 - u) * (1 - u));
      const s = this.worldToScreen(p.x, p.y + rise);
      p.el.style.transform = `translate(-50%, -50%) translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
      p.el.style.opacity = String(1 - u);
    }
  }

  private clear(): void {
    for (const p of this.particles) p.life = 0;
    for (let i = 0; i < POOL_SIZE; i++) {
      this.dummy.position.set(0, 0, 1);
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    for (const p of this.popups) {
      p.active = false;
      p.el.style.opacity = '0';
    }
    this.trauma = 0;
    this.shakeOffset.x = 0;
    this.shakeOffset.y = 0;
    this.squashT = 0;
    this.ballView.setSquash(1, 1);
  }
}
