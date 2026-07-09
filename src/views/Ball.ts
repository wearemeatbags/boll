import { Mesh, MeshBasicMaterial, PlaneGeometry, type Scene } from 'three';
import type { BallState, Vec2 } from '../types';

const DEFAULT_MAX_BALLS = 4;

/** Pool of white SQUARE ball meshes, exactly like the OG fillRect ball. */
export class BallSetView {
  private meshes: Mesh[] = [];
  private squashX: number[] = [];
  private squashY: number[] = [];
  private diameter = 4.4;
  private masterVisible = true;

  constructor(scene: Scene, max = DEFAULT_MAX_BALLS) {
    for (let i = 0; i < max; i++) {
      const mesh = new Mesh(
        new PlaneGeometry(1, 1),
        new MeshBasicMaterial({ color: 0xffffff }),
      );
      mesh.position.z = 0;
      mesh.visible = false;
      scene.add(mesh);
      this.meshes.push(mesh);
      this.squashX.push(1);
      this.squashY.push(1);
    }
  }

  setDiameter(d: number): void {
    this.diameter = d;
  }

  setVisible(v: boolean): void {
    this.masterVisible = v;
    if (!v) {
      for (const mesh of this.meshes) mesh.visible = false;
    }
  }

  setSquash(index: number, sx: number, sy: number): void {
    if (index < 0 || index >= this.meshes.length) return;
    this.squashX[index] = sx;
    this.squashY[index] = sy;
  }

  sync(prevBalls: Vec2[], balls: BallState[], alpha: number): void {
    const count = Math.min(balls.length, this.meshes.length);
    for (let i = 0; i < count; i++) {
      const mesh = this.meshes[i];
      const prev = prevBalls[i];
      const curr = balls[i];
      mesh.position.x = prev.x + (curr.x - prev.x) * alpha;
      mesh.position.y = prev.y + (curr.y - prev.y) * alpha;
      mesh.scale.set(this.diameter * this.squashX[i], this.diameter * this.squashY[i], 1);
      mesh.visible = this.masterVisible;
    }
    for (let i = count; i < this.meshes.length; i++) {
      this.meshes[i].visible = false;
    }
  }
}
