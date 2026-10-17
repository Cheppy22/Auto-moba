import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import type { BroadcastFrame, Shot } from './types';

const MIN_DIST = 110;
const MAX_DIST = 5600;
const PLAY_ELEV = 0.7;
const FOLLOW_ELEV = 0.78;
const BASE_AZIMUTH = -0.24;
/** Portrait screens turn the map so the two bases sit at the bottom and top. */
const PORTRAIT_AZIMUTH = -Math.PI / 4;
/** Phones held sideways turn it so the bases sit left and right, between the corner HUD. */
const LAND_AZIMUTH = Math.PI / 4;
const TARGET_LIFT = 6;
/** The camera never gets closer than this to the ground beneath it. */
const CLEARANCE = 22;

const smooth01 = (a: number, b: number, x: number): number => {
  const t = MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

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

interface Pt3 {
  x: number;
  y: number;
  z: number;
}

/** Scene-space height of the ground (or water) under a point. */
export type GroundFn = (x: number, z: number) => number;

/** Broadcast camera: eases toward the director's shot, tracks a hero, or hands over to MapControls. */
export class CameraRig {
  readonly camera = new PerspectiveCamera(36, 1, 4, 12000);
  /** What the camera currently looks at (world space). */
  readonly focus = new Vector3();
  private controls: MapControls;
  private x = new Spring(0);
  private z = new Spring(0);
  private y = new Spring(0);
  private dist = new Spring(1900);
  private elev = new Spring(1);
  private azim = new Spring(0);
  private free = false;
  private seen = false;
  private cutSince = -1;
  private time = 0;
  private shake = 0;
  private readonly arenaR: number;
  private aspect = 1.6;
  private portrait = false;
  private wideElev = 1;
  private wideDist = 2000;
  private wideX = 0;
  private wideZ = 0;
  private wideAzim = 0;
  private playAzim = BASE_AZIMUTH;
  private goal: Pose | null = null;
  /** Dev tool: pins the camera to a pose (scene-space x, z) until cleared with null. */
  pinned: Pose | null = null;
  /** Dev tool: holds the wide shot whatever the director wants. */
  forceWide = false;

  constructor(
    private canvas: HTMLCanvasElement,
    arenaR: number,
    private readonly ground: GroundFn,
    private readonly outline: Pt3[],
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
    this.controls.rotateSpeed = 0.8;
    this.camera.position.set(0, 1500, 1300);
    this.camera.lookAt(0, 0, 0);
  }

  setAspect(aspect: number): void {
    this.aspect = aspect;
    this.portrait = aspect < 0.95;
    // tall screens get a wider lens (the map is far narrower than the screen is tall)
    this.camera.fov = MathUtils.clamp(36 + (1.2 - aspect) * 22, 34, 42);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    // phones held sideways turn the map so the bases sit left and right, clear of the corner HUD
    const land = smooth01(1.85, 2.05, aspect);
    this.playAzim = this.portrait
      ? PORTRAIT_AZIMUTH
      : MathUtils.lerp(BASE_AZIMUTH, LAND_AZIMUTH, land);
    this.wideAzim = this.portrait ? PORTRAIT_AZIMUTH : MathUtils.lerp(0, LAND_AZIMUTH, land);
    // tall screens look almost straight down so the diamond of lanes fills their height
    this.wideElev = this.portrait ? 1.2 : MathUtils.clamp(1.02 - (aspect - 1.2) * 0.22, 0.8, 1.02);
    // frame the walkable playfield, not the island: tall screens may crop the outer lane edge
    const mh = this.portrait ? 1.05 : 0.93;
    const mv = this.portrait ? 0.84 : 0.9;
    // and sit a little low: the HUD is heavier along the top (sideways phones: the bases' line)
    const bias = this.portrait ? -0.05 : -0.1 * land;
    this.fitWide(this.wideAzim, this.wideElev, mh, mv, bias);
  }

  /** A brief camera tremor, 0..1. */
  kick(amount: number): void {
    this.shake = Math.min(1, this.shake + amount);
  }

  get distance(): number {
    return this.camera.position.distanceTo(this.focus);
  }

  /**
   * Distance and focus at which the playfield outline fills the screen at this angle: `mh` and
   * `mv` are the share of the half-width and half-height it may use (over 1 crops). The focus
   * slides along the ground so the outline's middle lands at `bias` (screen units, up is +).
   */
  private fitWide(az: number, elev: number, mh: number, mv: number, bias: number): void {
    const tv = Math.tan(MathUtils.degToRad(this.camera.fov) / 2);
    const th = tv * this.aspect;
    const ce = Math.cos(elev);
    const se = Math.sin(elev);
    // ground-forward (gx, gz); camera forward f = (g ce, -se); up = (g se, ce); right = (-gz, gx)
    const gx = -Math.sin(az);
    const gz = -Math.cos(az);
    let s = 0;
    let d = MIN_DIST;
    for (let iter = 0; iter < 8; iter++) {
      const ox = gx * s;
      const oz = gz * s;
      d = MIN_DIST;
      for (const p of this.outline) {
        const qx = p.x - ox;
        const qz = p.z - oz;
        const along = (qx * gx + qz * gz) * ce - p.y * se;
        const px = -qx * gz + qz * gx;
        const py = (qx * gx + qz * gz) * se + p.y * ce;
        d = Math.max(d, Math.abs(px) / (th * mh) - along, Math.abs(py) / (tv * mv) - along);
      }
      let lo = Infinity;
      let hi = -Infinity;
      for (const p of this.outline) {
        const qx = p.x - ox;
        const qz = p.z - oz;
        const along = (qx * gx + qz * gz) * ce - p.y * se;
        const py = (qx * gx + qz * gz) * se + p.y * ce;
        const y = py / (tv * (along + d));
        lo = Math.min(lo, y);
        hi = Math.max(hi, y);
      }
      s += (((hi + lo) / 2 - bias) * tv * d) / se;
    }
    this.wideDist = MathUtils.clamp(d, MIN_DIST, MAX_DIST);
    this.wideX = gx * s;
    this.wideZ = gz * s;
  }

  /** Distance at which a circle of `radius` world units fills the view at the given elevation. */
  private fit(radius: number, elev: number, margin = 1.2): number {
    const tv = Math.tan(MathUtils.degToRad(this.camera.fov) / 2);
    const th = tv * this.aspect;
    const dh = radius / th;
    const dv = (radius * Math.sin(elev) + 36) / tv;
    return MathUtils.clamp(Math.max(dh, dv) * margin, MIN_DIST, MAX_DIST);
  }

  private goalFor(
    frame: BroadcastFrame,
    half: number,
    follow: { x: number; z: number } | null,
  ): Pose {
    if (this.pinned) return this.pinned;
    const shot: Shot = frame.shot;
    const drift = Math.sin(this.time * 0.11) * 0.12;
    const baseAz = this.playAzim;
    if (frame.mode === 'follow' && follow) {
      return {
        x: follow.x,
        z: follow.z,
        elev: FOLLOW_ELEV,
        azim: baseAz + drift * 0.6,
        dist: this.fit(this.portrait ? 190 : 150, FOLLOW_ELEV),
      };
    }
    if (shot.kind === 'wide' || this.forceWide) {
      return {
        x: (this.forceWide ? 0 : shot.x - half) + this.wideX,
        z: (this.forceWide ? 0 : shot.y - half) + this.wideZ,
        elev: this.wideElev,
        azim: this.wideAzim + drift * 0.15,
        dist: this.wideDist,
      };
    }
    return {
      x: shot.x - half,
      z: shot.y - half,
      elev: PLAY_ELEV,
      azim: baseAz + drift,
      dist: this.fit(shot.radius, PLAY_ELEV),
    };
  }

  /** Jumps straight to the current goal (tests and screenshots; skips the easing). */
  settle(pose?: Pose): void {
    const p = pose ?? this.goal;
    if (p) this.snapTo(p);
  }

  private snapTo(p: Pose): void {
    this.x.snap(p.x);
    this.z.snap(p.z);
    this.y.snap(this.ground(p.x, p.z) + TARGET_LIFT);
    this.dist.snap(p.dist);
    this.elev.snap(p.elev);
    this.azim.snap(p.azim);
  }

  /* Two-finger twist: MapControls only reads two fingers sliding together, so the turn is added here. */
  private touches = new Map<number, { x: number; y: number }>();
  private twist: number | null = null;

  private readonly onDown = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch') return;
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.twist = null;
  };

  private readonly onMove = (e: PointerEvent): void => {
    const t = this.touches.get(e.pointerId);
    if (!t) return;
    t.x = e.clientX;
    t.y = e.clientY;
    if (this.touches.size !== 2) return;
    const [a, b] = [...this.touches.values()];
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    if (this.twist !== null) {
      const delta = Math.atan2(Math.sin(angle - this.twist), Math.cos(angle - this.twist));
      const c = this.camera.position;
      const o = this.controls.target;
      const dx = c.x - o.x;
      const dz = c.z - o.z;
      const cs = Math.cos(delta);
      const sn = Math.sin(delta);
      c.x = o.x + dx * cs + dz * sn;
      c.z = o.z - dx * sn + dz * cs;
    }
    this.twist = angle;
  };

  private readonly onUp = (e: PointerEvent): void => {
    this.touches.delete(e.pointerId);
    this.twist = null;
  };

  private enterFree(): void {
    this.free = true;
    for (const [name, fn] of [
      ['pointerdown', this.onDown],
      ['pointermove', this.onMove],
      ['pointerup', this.onUp],
      ['pointercancel', this.onUp],
    ] as const)
      this.canvas.addEventListener(name, fn);
    this.controls.target.copy(this.focus);
    this.controls.connect(this.canvas);
    this.controls.enabled = true;
    this.controls.update();
  }

  private dropTwist(): void {
    for (const [name, fn] of [
      ['pointerdown', this.onDown],
      ['pointermove', this.onMove],
      ['pointerup', this.onUp],
      ['pointercancel', this.onUp],
    ] as const)
      this.canvas.removeEventListener(name, fn);
    this.touches.clear();
    this.twist = null;
  }

  private leaveFree(): void {
    this.dropTwist();
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
      const t = this.controls.target;
      const r = Math.hypot(t.x, t.z);
      if (r > this.arenaR) {
        t.x *= this.arenaR / r;
        t.z *= this.arenaR / r;
      }
      t.y += (this.ground(t.x, t.z) + TARGET_LIFT - t.y) * Math.min(1, dt * 6);
      this.controls.update(dt);
      this.keepAbove();
      this.focus.copy(t);
      return;
    }

    const goal = this.goalFor(frame, half, follow);
    this.goal = goal;
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
    this.y.step(this.ground(this.x.value, this.z.value) + TARGET_LIFT, 3.2, dt);
    this.shake *= Math.exp(-6 * dt);
    this.pose();
  }

  /** Lifts the camera clear of any cliff beneath it (never into the rock). */
  private keepAbove(): void {
    const p = this.camera.position;
    const g = this.ground(p.x, p.z) + CLEARANCE;
    if (p.y < g) p.y = g;
  }

  private pose(): void {
    const ce = Math.cos(this.elev.value);
    const d = this.dist.value;
    this.focus.set(this.x.value, this.y.value, this.z.value);
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
    this.keepAbove();
    this.camera.lookAt(this.focus);
  }

  dispose(): void {
    this.dropTwist();
    if (this.free) this.controls.disconnect();
  }
}
