import { Group, Mesh, MeshBasicMaterial, PlaneGeometry, type Scene } from 'three';
import { PADDLE_H, SWEET_ZONE } from '../config';
import type { Vec2 } from '../types';

const TICK_W = 0.4;

/** White paddle bar with two black ticks marking the sweet-spot band. */
export class PaddleView {
  private group = new Group();
  private body: Mesh;
  private ticks: [Mesh, Mesh];
  private width = 22;

  constructor(scene: Scene) {
    const geo = new PlaneGeometry(1, 1);
    this.body = new Mesh(geo, new MeshBasicMaterial({ color: 0xffffff }));
    this.body.scale.set(this.width, PADDLE_H, 1);
    this.group.add(this.body);

    const tickMat = new MeshBasicMaterial({ color: 0x000000 });
    const mk = (): Mesh => {
      const m = new Mesh(geo, tickMat);
      m.scale.set(TICK_W, PADDLE_H, 1);
      m.position.z = 0.1;
      this.group.add(m);
      return m;
    };
    this.ticks = [mk(), mk()];
    this.layoutTicks();
    scene.add(this.group);
  }

  setWidth(w: number): void {
    if (w === this.width) return;
    this.width = w;
    this.body.scale.x = w;
    this.layoutTicks();
  }

  setSweetVisible(v: boolean): void {
    for (const t of this.ticks) t.visible = v;
  }

  sync(prev: Vec2, curr: Vec2, alpha: number): void {
    this.group.position.x = prev.x + (curr.x - prev.x) * alpha;
    this.group.position.y = prev.y + (curr.y - prev.y) * alpha;
  }

  private layoutTicks(): void {
    const x = SWEET_ZONE * (this.width / 2);
    this.ticks[0].position.x = -x;
    this.ticks[1].position.x = x;
  }
}
