import * as THREE from 'three';
import type { Vec2 } from '../types';

/** The ball is a white SQUARE, exactly like the OG fillRect ball. */
export class BallView {
  private mesh: THREE.Mesh;
  private diameter = 4.4;
  private squashX = 1;
  private squashY = 1;

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    this.mesh.position.z = 0;
    scene.add(this.mesh);
  }

  setDiameter(d: number): void {
    this.diameter = d;
  }

  setSquash(sx: number, sy: number): void {
    this.squashX = sx;
    this.squashY = sy;
  }

  setVisible(v: boolean): void {
    this.mesh.visible = v;
  }

  sync(prev: Vec2, curr: Vec2, alpha: number): void {
    this.mesh.position.x = prev.x + (curr.x - prev.x) * alpha;
    this.mesh.position.y = prev.y + (curr.y - prev.y) * alpha;
    this.mesh.scale.set(this.diameter * this.squashX, this.diameter * this.squashY, 1);
  }
}
