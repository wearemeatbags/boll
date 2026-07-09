import {
  BufferGeometry,
  Float32BufferAttribute,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import {
  FRAME_INSET,
  FRAME_THICKNESS,
  HALF_H,
  HALF_W,
  WORLD_H,
  WORLD_W,
} from '../config';
import type { Vec2 } from '../types';
import { CRT_CORNER_FRAC, CRT_FRAGMENT, CRT_VERTEX, createCrtUniforms } from './CrtShader';

const MAX_DPR = 2;
const STAGE_MARGIN = 28;

/**
 * Owns the WebGL canvas, the fixed orthographic camera, letterboxed stage
 * sizing, and the two-pass CRT pipeline (scene -> render target -> CRT quad).
 */
export class Renderer {
  readonly scene = new Scene();
  readonly camera: OrthographicCamera;
  readonly canvas: HTMLCanvasElement;
  private crtEnabled = true;
  private motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  private reducedMotion = this.motionQuery.matches;

  private gl: WebGLRenderer;
  private target: WebGLRenderTarget;
  private crtScene = new Scene();
  private crtCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private crtUniforms = createCrtUniforms();
  private cssW = 320;
  private cssH = 200;
  private offsetX = 0;
  private offsetY = 0;
  private time = 0;
  private nextBurstAt = 8 + Math.random() * 12;
  private burstLeft = 0;
  private observer: ResizeObserver | null = null;

  constructor(
    private stage: HTMLDivElement,
    private host: HTMLElement,
  ) {
    this.camera = new OrthographicCamera(-HALF_W, HALF_W, HALF_H, -HALF_H, 0.1, 100);
    this.camera.position.set(0, 0, 10);

    this.gl = new WebGLRenderer({
      antialias: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.gl.setClearColor(0x000000, 1);
    this.canvas = this.gl.domElement;
    this.canvas.className = 'game-canvas';
    stage.appendChild(this.canvas);

    // Full-physical-resolution target; LinearFilter kills warp crawl.
    this.target = new WebGLRenderTarget(2, 2, {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.crtUniforms.tDiffuse.value = this.target.texture;

    // Fullscreen triangle (no plane seam).
    const geo = new BufferGeometry();
    geo.setAttribute(
      'position',
      new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
    );
    geo.setAttribute('uv', new Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    const quad = new Mesh(
      geo,
      new ShaderMaterial({
        vertexShader: CRT_VERTEX,
        fragmentShader: CRT_FRAGMENT,
        uniforms: this.crtUniforms,
        depthTest: false,
        depthWrite: false,
      }),
    );
    quad.frustumCulled = false;
    this.crtScene.add(quad);

    this.buildFrame();

    window.addEventListener('resize', this.resize);
    this.motionQuery.addEventListener('change', this.onMotionPreference);
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(host);
    }
    this.setCrtEnabled(true);
    this.resize();
  }

  /**
   * Toggle the whole CRT treatment: the shader pass plus the CSS side
   * (rounded corners, vignette, HUD corner insets keyed off `.crt-on`).
   */
  setCrtEnabled(on: boolean): void {
    this.crtEnabled = on;
    this.stage.classList.toggle('crt-on', on);
  }

  render(dt: number, camOffset: Vec2): void {
    this.camera.position.set(camOffset.x, camOffset.y, 10);
    if (this.crtEnabled) {
      if (this.reducedMotion) {
        this.crtUniforms.uBurst.value = 0;
        this.crtUniforms.uSeed.value = 0.5;
      } else {
        this.tickCrt(dt);
      }
      this.gl.setRenderTarget(this.target);
      this.gl.render(this.scene, this.camera);
      this.gl.setRenderTarget(null);
      this.gl.render(this.crtScene, this.crtCamera);
    } else {
      this.gl.setRenderTarget(null);
      this.gl.render(this.scene, this.camera);
    }
  }

  /** World units -> CSS px within the stage (fixed frustum makes this exact). */
  worldToScreen(x: number, y: number): Vec2 {
    return {
      x: this.offsetX + (x / WORLD_W + 0.5) * this.cssW,
      y: this.offsetY + (0.5 - y / WORLD_H) * this.cssH,
    };
  }

  /** Client (viewport) coordinates -> world units. */
  toWorld(clientX: number, clientY: number): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width - 0.5) * WORLD_W,
      y: (0.5 - (clientY - rect.top) / rect.height) * WORLD_H,
    };
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.motionQuery.removeEventListener('change', this.onMotionPreference);
    this.observer?.disconnect();
    this.target.dispose();
    this.gl.dispose();
  }

  private resize = (): void => {
    const availW = Math.max(160, this.host.clientWidth - STAGE_MARGIN * 2);
    const availH = Math.max(100, this.host.clientHeight - STAGE_MARGIN * 2);
    const portraitShell = availH > availW * 1.25;
    const scale = Math.min(availW / WORLD_W, availH / WORLD_H);
    // Even integers keep the canvas mapped 1:1 to physical pixels (no blur).
    const cssW = portraitShell
      ? Math.max(160, Math.round(Math.min(availW, availH * (WORLD_W / WORLD_H)) / 2) * 2)
      : Math.max(240, Math.round((WORLD_W * scale) / 2) * 2);
    const cssH = Math.round(cssW * (WORLD_H / WORLD_W));
    const stageW = portraitShell ? availW : cssW;
    const stageH = portraitShell ? availH : cssH;
    this.offsetX = Math.round((stageW - cssW) / 2);
    this.offsetY = Math.round((stageH - cssH) / 2);
    this.cssW = cssW;
    this.cssH = cssH;

    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    this.stage.classList.toggle('portrait-shell', portraitShell);
    this.stage.style.width = `${stageW}px`;
    this.stage.style.height = `${stageH}px`;
    this.stage.style.setProperty('--game-left', `${this.offsetX}px`);
    this.stage.style.setProperty('--game-right', `${stageW - cssW - this.offsetX}px`);
    this.stage.style.setProperty('--game-top', `${this.offsetY}px`);
    this.stage.style.setProperty('--game-bottom', `${stageH - cssH - this.offsetY}px`);
    this.stage.style.setProperty('--game-width', `${cssW}px`);
    this.stage.style.setProperty('--game-height', `${cssH}px`);
    this.stage.style.setProperty('--game-center-x', `${this.offsetX + cssW / 2}px`);
    this.stage.style.setProperty(
      '--crt-radius',
      `${(Math.min(cssW, cssH) * CRT_CORNER_FRAC).toFixed(1)}px`,
    );
    this.gl.setPixelRatio(dpr);
    this.gl.setSize(cssW, cssH, false);
    this.canvas.style.left = `${this.offsetX}px`;
    this.canvas.style.top = `${this.offsetY}px`;
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.target.setSize(Math.round(cssW * dpr), Math.round(cssH * dpr));
    this.crtUniforms.uResolution.value.set(Math.round(cssW * dpr), Math.round(cssH * dpr));
  };

  private tickCrt(dt: number): void {
    this.time += dt;
    if (this.time >= this.nextBurstAt) {
      this.burstLeft = 0.08 + Math.random() * 0.12;
      this.nextBurstAt = this.time + 8 + Math.random() * 12;
    }
    this.burstLeft = Math.max(0, this.burstLeft - dt);
    this.crtUniforms.uBurst.value = this.burstLeft > 0 ? Math.min(1, this.burstLeft / 0.06) : 0;
    this.crtUniforms.uSeed.value = Math.random();
    this.crtUniforms.uTime.value = this.time;
  }

  private onMotionPreference = (event: MediaQueryListEvent): void => {
    this.reducedMotion = event.matches;
  };

  /** Dim inset frame: straight lines that sell the barrel warp. */
  private buildFrame(): void {
    const mat = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.3,
    });
    const geo = new PlaneGeometry(1, 1);
    const innerW = WORLD_W - FRAME_INSET * 2;
    const innerH = WORLD_H - FRAME_INSET * 2;
    const t = FRAME_THICKNESS;
    const parts: Array<[number, number, number, number]> = [
      [0, innerH / 2 - t / 2, innerW, t],
      [0, -innerH / 2 + t / 2, innerW, t],
      [-innerW / 2 + t / 2, 0, t, innerH],
      [innerW / 2 - t / 2, 0, t, innerH],
    ];
    for (const [x, y, w, h] of parts) {
      const mesh = new Mesh(geo, mat);
      mesh.position.set(x, y, -1);
      mesh.scale.set(w, h, 1);
      this.scene.add(mesh);
    }
  }
}
