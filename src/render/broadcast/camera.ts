import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import type { BroadcastFrame, Shot } from './types';

const VFOV = 36;
const MIN_DIST = 110;
const MAX_DIST = 2300;
const WIDE_ELEV = 1.1;
const PLAY_ELEV = 0.6;
const FOLLOW_ELEV = 0.72;
const BASE_AZIMUTH = -0.24;
const TARGET_Y = 6;

/** Critically damped spring (the closed-form smooth-damp), so easing never overshoots. */
class Spring {
  value: number;
  private velocity = 0;

  constructor(value: number) {
    this.value = value;
  }

  snap(value: number): void {
    this.value = value;
    this.velocity = 0;
  }

  step(target: number, omega: number, dt: number): void {
    const x = this.value - target;
    const k = 1 / (1 + omega * dt + 0.48 * omega * omega * dt * dt + 0.235 * omega ** 3 * dt ** 3);
    const t = (this.velocity + omega * x) * dt;
    this.velocity = (this.velocity - omega * t) * k;
    this.value = target + (x + t) * k;
  }
}

export interface Pose {
  x: number;
  z: number;
  dist: number;
  elev: number;
  azim: number;
}

/** Broadcast camera: eases toward the director's shot, tracks a hero, or hands over to MapControls. */
export class CameraRig {
  readonly camera = new PerspectiveCamera(VFOV, 1, 4, 8000);
  /** What the camera currently looks at (world space). */
  readonly focus = new Vector3();
  private controls: MapControls;
  private x = new Spring(0);
  private z = new Spring(0);
  private dist = new Spring(1900);
  private elev = new Spring(WIDE_ELEV);
  private azim = new Spring(0);
  private free = false;
  private seen = false;
  private cutSince = -1;
  private time = 0;
  private shake = 0;
  private readonly arenaR: number;

  constructor(
    private canvas: HTMLCanvasElement,
    arenaR: number,
  ) {
    this.arenaR = arenaR * 0.94;
    this.controls = new MapControls(this.camera);
    this.controls.enabled = false;
    this.controls.screenSpacePanning = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.minDistance = MIN_DIST * 0.8;
    this.controls.maxDistance = MAX_DIST;
    this.controls.minPolarAngle = 0.25;
    this.controls.maxPolarAngle = 1.38;
    this.controls.zoomSpeed = 0.9;
    this.camera.position.set(0, 1500, 1300);
    this.camera.lookAt(0, 0, 0);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** A brief camera tremor, 0..1. */
  kick(amount: number): void {
    this.shake = Math.min(1, this.shake + amount);
  }

  get distance(): number {
    return this.camera.position.distanceTo(this.focus);
  }

  /** Distance at which a circle of `radius` world units fills the view at the given elevation. */
  private fit(radius: number, elev: number, margin = 1.2): number {
    const tv = Math.tan(MathUtils.degToRad(VFOV) / 2);
    const th = tv * this.camera.aspect;
    const dh = radius / th;
    const dv = (radius * Math.sin(elev) + 36) / tv;
    return MathUtils.clamp(Math.max(dh, dv) * margin, MIN_DIST, MAX_DIST);
  }

  private goalFor(
    frame: BroadcastFrame,
    half: number,
    follow: { x: number; z: number } | null,
  ): Pose {
    const shot: Shot = frame.shot;
    const drift = Math.sin(this.time * 0.11) * 0.12;
    if (frame.mode === 'follow' && follow) {
      return {
        x: follow.x,
        z: follow.z,
        elev: FOLLOW_ELEV,
        azim: BASE_AZIMUTH + drift * 0.6,
        dist: this.fit(150, FOLLOW_ELEV),
      };
    }
    const wide = shot.kind === 'wide';
    const elev = wide ? WIDE_ELEV : PLAY_ELEV;
    return {
      x: shot.x - half,
      z: shot.y - half,
      elev,
      azim: wide ? drift * 0.4 : BASE_AZIMUTH + drift,
      dist: wide ? this.fit(Math.max(shot.radius, 600), elev, 1.08) : this.fit(shot.radius, elev),
    };
  }

  private snapTo(p: Pose): void {
    this.x.snap(p.x);
    this.z.snap(p.z);
    this.dist.snap(p.dist);
    this.elev.snap(p.elev);
    this.azim.snap(p.azim);
  }

  private enterFree(): void {
    this.free = true;
    this.controls.target.copy(this.focus);
    this.controls.connect(this.canvas);
    this.controls.enabled = true;
    this.controls.update();
  }

  private leaveFree(): void {
    this.free = false;
    this.controls.enabled = false;
    this.controls.disconnect();
    const off = this.camera.position.clone().sub(this.controls.target);
    const d = off.length();
    this.snapTo({
      x: this.controls.target.x,
      z: this.controls.target.z,
      dist: d,
      elev: Math.asin(MathUtils.clamp(off.y / d, -1, 1)),
      azim: Math.atan2(off.x, off.z),
    });
  }

  update(frame: BroadcastFrame, half: number, follow: { x: number; z: number } | null): void {
    const dt = MathUtils.clamp(frame.dtMs / 1000, 0, 0.1);
    this.time += dt;
    const wantFree = frame.mode === 'free';
    if (wantFree && !this.free) this.enterFree();
    else if (!wantFree && this.free) this.leaveFree();

    if (this.free) {
      this.controls.update(dt);
      const t = this.controls.target;
      const r = Math.hypot(t.x, t.z);
      if (r > this.arenaR) {
        t.x *= this.arenaR / r;
        t.z *= this.arenaR / r;
      }
      t.y = MathUtils.clamp(t.y, 0, 60);
      if (this.camera.position.y < 14) this.camera.position.y = 14;
      this.focus.copy(t);
      return;
    }

    const goal = this.goalFor(frame, half, follow);
    const cut = frame.shot.cut && frame.shot.since !== this.cutSince;
    if (cut) this.cutSince = frame.shot.since;
    if (!this.seen || cut) {
      this.seen = true;
      this.snapTo(goal);
    } else {
      this.x.step(goal.x, 2.6, dt);
      this.z.step(goal.z, 2.6, dt);
      this.dist.step(goal.dist, 2.1, dt);
      this.elev.step(goal.elev, 2.2, dt);
      this.azim.step(goal.azim, 1.8, dt);
    }
    this.shake *= Math.exp(-6 * dt);
    this.pose();
  }

  private pose(): void {
    const ce = Math.cos(this.elev.value);
    const d = this.dist.value;
    this.focus.set(this.x.value, TARGET_Y, this.z.value);
    this.camera.position.set(
      this.focus.x + Math.sin(this.azim.value) * ce * d,
      this.focus.y + Math.sin(this.elev.value) * d,
      this.focus.z + Math.cos(this.azim.value) * ce * d,
    );
    if (this.shake > 0.002) {
      const a = this.shake * this.shake * 5;
      this.camera.position.x += Math.sin(this.time * 61) * a;
      this.camera.position.y += Math.sin(this.time * 53 + 1) * a;
      this.camera.position.z += Math.sin(this.time * 47 + 2) * a;
    }
    this.camera.lookAt(this.focus);
  }

  dispose(): void {
    if (this.free) this.controls.disconnect();
  }
}
