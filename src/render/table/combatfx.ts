import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  type ColorRepresentation,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three';
import type { Kit } from '../broadcast/kit';
import { Crowd } from './crowd';

/**
 * Light effects of the table look: ground rings, light columns, melee slash arcs and tracer lines.
 * Everything is additive and instanced (one draw call per kind, four in all), pooled, capped and
 * allocation-free per frame. Used for the recall channel, departure and arrival, the pop of a big
 * hit, the slash of a melee swing and the thread that shows who fights whom.
 */

interface Item {
  x: number;
  y: number;
  z: number;
  /** Streaks: the far end. Slashes: unit direction (x, z). */
  tx: number;
  ty: number;
  tz: number;
  r0: number;
  r1: number;
  h: number;
  yaw: number;
  roll: number;
  age: number;
  life: number;
  alpha: number;
  mode: number;
  color: Color;
}

const blank = (): Item => ({
  x: 0,
  y: 0,
  z: 0,
  tx: 0,
  ty: 0,
  tz: 0,
  r0: 1,
  r1: 1,
  h: 1,
  yaw: 0,
  roll: 0,
  age: 0,
  life: 1,
  alpha: 1,
  mode: 0,
  color: new Color(),
});

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler(0, 0, 0, 'YXZ');
const _p = new Vector3();
const _s = new Vector3();
const _d = new Vector3();
const _z = new Vector3(0, 0, 1);
const _c = new Color();
const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** A pooled, capped set of timed items drawn into one instanced mesh. */
class Layer {
  readonly crowd: Crowd;
  readonly live: Item[] = [];
  private readonly pool: Item[] = [];
  /** Items for this frame only (the recall channel, engagement threads). */
  readonly imm: Item[] = [];
  nImm = 0;

  constructor(
    geo: BufferGeometry,
    mat: MeshBasicMaterial,
    readonly cap: number,
    order: number,
  ) {
    this.crowd = new Crowd(geo, mat, cap, true);
    this.crowd.mesh.renderOrder = order;
    for (let i = 0; i < cap; i++) this.pool.push(blank());
  }

  spawn(): Item | null {
    if (this.live.length >= this.cap - this.imm.length) return null;
    const it = this.pool.pop() ?? blank();
    this.live.push(it);
    return it;
  }

  now(): Item | null {
    if (this.nImm >= 32) return null;
    let it = this.imm[this.nImm];
    if (!it) {
      it = blank();
      this.imm.push(it);
    }
    this.nImm++;
    it.age = 0;
    it.life = 1;
    it.mode = 9;
    it.alpha = 1;
    return it;
  }

  retire(i: number): void {
    this.pool.push(this.live[i]);
    this.live.splice(i, 1);
  }

  clear(): void {
    for (const it of this.live) this.pool.push(it);
    this.live.length = 0;
    this.nImm = 0;
  }
}

function crescent(): BufferGeometry {
  // a horizontal arc of radius 1 around the origin, bulging toward +Z, tapering to points
  const N = 14;
  const half = 1.15;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const a = (u - 0.5) * 2 * half;
    const taper = Math.sin(u * Math.PI) ** 0.7;
    const wd = 0.6 * taper;
    const sx = Math.sin(a);
    const cz = Math.cos(a);
    pos.push(sx * (1 - wd * 0.5), 0, cz * (1 - wd * 0.5) - 0.0, sx * (1 + wd), 0, cz * (1 + wd));
    uv.push(u, 0, u, 1);
    if (i < N) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function streakGeo(): BufferGeometry {
  // two crossed ribbons along +Z (0 to 1), so the line reads from any angle
  const pos = [
    -0.5, 0, 0, 0.5, 0, 0, -0.5, 0, 1, 0.5, 0, 1, 0, -0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1,
  ];
  const uv = [0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1];
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex([0, 1, 2, 1, 3, 2, 4, 5, 6, 5, 7, 6]);
  return g;
}

export class CombatFx {
  private readonly rings: Layer;
  private readonly cols: Layer;
  private readonly slashes: Layer;
  private readonly streaks: Layer;
  readonly meshes: Crowd['mesh'][];

  constructor(kit: Kit) {
    const mat = (map: ReturnType<Kit['texture']>, side = DoubleSide): MeshBasicMaterial =>
      kit.own(
        new MeshBasicMaterial({
          map,
          transparent: true,
          depthWrite: false,
          blending: AdditiveBlending,
          side,
          fog: false,
        }),
      );
    const ringTex = kit.texture('fx-ring', 128, 128, (g) => {
      const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      r.addColorStop(0, 'rgba(255,255,255,0)');
      r.addColorStop(0.6, 'rgba(255,255,255,0)');
      r.addColorStop(0.74, 'rgba(255,255,255,0.45)');
      r.addColorStop(0.83, 'rgba(255,255,255,1)');
      r.addColorStop(0.92, 'rgba(255,255,255,0.4)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, 128, 128);
    });
    const colTex = kit.texture('fx-col', 64, 64, (g) => {
      // eight facets (brighter and dimmer bands), fading to nothing at the top
      for (let i = 0; i < 8; i++) {
        const v = [0.7, 1, 0.82, 1, 0.65, 1, 0.78, 0.95][i];
        const gr = g.createLinearGradient(0, 0, 0, 64);
        gr.addColorStop(0, 'rgba(255,255,255,0)');
        gr.addColorStop(0.55, `rgba(255,255,255,${0.35 * v})`);
        gr.addColorStop(1, `rgba(255,255,255,${v})`);
        g.fillStyle = gr;
        g.fillRect(i * 8, 0, 8, 64);
      }
    });
    const slashTex = kit.texture('fx-slash', 128, 16, (g) => {
      const h = g.createLinearGradient(0, 0, 128, 0);
      h.addColorStop(0, 'rgba(255,255,255,0)');
      h.addColorStop(0.55, 'rgba(255,255,255,0.35)');
      h.addColorStop(0.9, 'rgba(255,255,255,1)');
      h.addColorStop(1, 'rgba(255,255,255,0.9)');
      g.fillStyle = h;
      g.fillRect(0, 0, 128, 16);
      g.globalCompositeOperation = 'destination-in';
      const v = g.createLinearGradient(0, 0, 0, 16);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(0.5, 'rgba(0,0,0,1)');
      v.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = v;
      g.fillRect(0, 0, 128, 16);
    });
    const streakTex = kit.texture('fx-streak', 16, 64, (g) => {
      const v = g.createLinearGradient(0, 0, 0, 64);
      // canvas top is the far end (v = 1): bright head, dim tail
      v.addColorStop(0, 'rgba(255,255,255,1)');
      v.addColorStop(1, 'rgba(255,255,255,0.2)');
      g.fillStyle = v;
      g.fillRect(0, 0, 16, 64);
      g.globalCompositeOperation = 'destination-in';
      const h = g.createLinearGradient(0, 0, 16, 0);
      h.addColorStop(0, 'rgba(0,0,0,0)');
      h.addColorStop(0.5, 'rgba(0,0,0,1)');
      h.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = h;
      g.fillRect(0, 0, 16, 64);
    });
    this.rings = new Layer(
      kit.geo('fx-ring', () => new PlaneGeometry(2, 2).rotateX(-Math.PI / 2)),
      mat(ringTex),
      40,
      3,
    );
    this.cols = new Layer(
      kit.geo('fx-col', () => new CylinderGeometry(1, 1, 1, 8, 1, true).translate(0, 0.5, 0)),
      mat(colTex),
      24,
      62,
    );
    this.slashes = new Layer(
      kit.geo('fx-slash', () => crescent()),
      mat(slashTex),
      20,
      63,
    );
    this.streaks = new Layer(
      kit.geo('fx-streak', () => streakGeo()),
      mat(streakTex),
      56,
      4,
    );
    this.meshes = [this.rings, this.cols, this.slashes, this.streaks].map((l) => l.crowd.mesh);
  }

  /* ------------------------------ spawns ------------------------------ */

  /** A flat ring on the board growing from radius `r0` to `r1` and fading. `delay` in seconds. */
  ring(
    x: number,
    y: number,
    z: number,
    color: ColorRepresentation,
    r0: number,
    r1: number,
    life: number,
    alpha = 1,
    delay = 0,
  ): void {
    const it = this.rings.spawn();
    if (!it) return;
    it.x = x;
    it.y = y;
    it.z = z;
    it.r0 = r0;
    it.r1 = r1;
    it.age = -delay;
    it.life = life;
    it.alpha = alpha;
    it.mode = 0;
    it.color.set(color);
  }

  /**
   * A faceted light column. mode 0 shoots up and fades (departure, a pop); mode 1 starts full height
   * and collapses onto the floor while it widens (arrival).
   */
  column(
    x: number,
    y: number,
    z: number,
    color: ColorRepresentation,
    r0: number,
    r1: number,
    h: number,
    life: number,
    mode: 0 | 1,
    alpha = 1,
    delay = 0,
  ): void {
    const it = this.cols.spawn();
    if (!it) return;
    it.x = x;
    it.y = y;
    it.z = z;
    it.r0 = r0;
    it.r1 = r1;
    it.h = h;
    it.age = -delay;
    it.life = life;
    it.alpha = alpha;
    it.mode = mode;
    it.color.set(color);
  }

  /** A melee swing: a crescent sweeping across `to` (unit direction from `from`), radius `r`. */
  slash(from: Vector3, to: Vector3, color: ColorRepresentation, r: number, roll: number): void {
    const it = this.slashes.spawn();
    if (!it) return;
    _d.subVectors(to, from);
    const l = Math.hypot(_d.x, _d.z) || 1;
    it.tx = _d.x / l;
    it.tz = _d.z / l;
    // the arc's centre sits behind the target so its leading edge lands on it
    it.x = to.x - it.tx * r * 0.85;
    it.y = to.y;
    it.z = to.z - it.tz * r * 0.85;
    it.yaw = Math.atan2(it.tx, it.tz);
    it.roll = roll;
    it.r0 = r;
    it.age = 0;
    it.life = 0.24;
    it.alpha = 1;
    it.mode = roll < 0 ? 1 : 0;
    it.color.set(color);
  }

  /** A short bright line between two points that fades fast (a melee tracer). */
  tracer(
    from: Vector3,
    to: Vector3,
    color: ColorRepresentation,
    width: number,
    life: number,
    alpha = 1,
  ): void {
    const it = this.streaks.spawn();
    if (!it) return;
    it.x = from.x;
    it.y = from.y;
    it.z = from.z;
    it.tx = to.x;
    it.ty = to.y;
    it.tz = to.z;
    it.h = width;
    it.age = 0;
    it.life = life;
    it.alpha = alpha;
    it.mode = 0;
    it.color.set(color);
  }

  /* ------------------------- this-frame items ------------------------- */

  ringNow(x: number, y: number, z: number, color: ColorRepresentation, r: number, a: number): void {
    const it = this.rings.now();
    if (!it) return;
    it.x = x;
    it.y = y;
    it.z = z;
    it.r0 = r;
    it.r1 = r;
    it.alpha = a;
    it.color.set(color);
  }

  columnNow(
    x: number,
    y: number,
    z: number,
    color: ColorRepresentation,
    r: number,
    h: number,
    a: number,
    spin: number,
  ): void {
    const it = this.cols.now();
    if (!it) return;
    it.x = x;
    it.y = y;
    it.z = z;
    it.r0 = r;
    it.r1 = r;
    it.h = h;
    it.yaw = spin;
    it.alpha = a;
    it.color.set(color);
  }

  /** A faint line on the floor between two pieces that are fighting. */
  threadNow(
    ax: number,
    az: number,
    bx: number,
    bz: number,
    y: number,
    color: ColorRepresentation,
    width: number,
    a: number,
  ): void {
    const it = this.streaks.now();
    if (!it) return;
    it.x = ax;
    it.y = y;
    it.z = az;
    it.tx = bx;
    it.ty = y;
    it.tz = bz;
    it.h = width;
    it.alpha = a;
    it.color.set(color);
  }

  /* ------------------------------ draw ------------------------------ */

  update(dt: number): void {
    this.drawRings(dt);
    this.drawCols(dt);
    this.drawSlashes(dt);
    this.drawStreaks(dt);
    this.rings.nImm = this.cols.nImm = this.slashes.nImm = this.streaks.nImm = 0;
  }

  private drawRings(dt: number): void {
    const L = this.rings;
    const c = L.crowd;
    c.begin();
    for (let i = L.live.length - 1; i >= 0; i--) {
      const it = L.live[i];
      it.age += dt;
      if (it.age >= it.life) {
        L.retire(i);
        continue;
      }
      if (it.age < 0) continue;
      const t = it.age / it.life;
      const r = lerp(it.r0, it.r1, easeOut(t));
      const k = it.alpha * (1 - t) ** 1.4;
      c.color(c.addXYZ(it.x, it.y, it.z, 0, r, 1, r), _c.copy(it.color).multiplyScalar(k));
    }
    for (let i = 0; i < L.nImm; i++) {
      const it = L.imm[i];
      c.color(
        c.addXYZ(it.x, it.y, it.z, 0, it.r0, 1, it.r0),
        _c.copy(it.color).multiplyScalar(it.alpha),
      );
    }
    c.end();
  }

  private drawCols(dt: number): void {
    const L = this.cols;
    const c = L.crowd;
    c.begin();
    for (let i = L.live.length - 1; i >= 0; i--) {
      const it = L.live[i];
      it.age += dt;
      if (it.age >= it.life) {
        L.retire(i);
        continue;
      }
      if (it.age < 0) continue;
      const t = it.age / it.life;
      let h: number;
      let r: number;
      let k: number;
      if (it.mode === 0) {
        h = it.h * easeOut(clamp01(t / 0.45));
        r = lerp(it.r0, it.r1, t);
        k = it.alpha * (t < 0.15 ? t / 0.15 : (1 - (t - 0.15) / 0.85) ** 1.6);
      } else {
        h = it.h * (1 - easeOut(t) * 0.9);
        r = lerp(it.r0, it.r1, easeOut(t));
        k = it.alpha * (t < 0.2 ? t / 0.2 : (1 - (t - 0.2) / 0.8) ** 1.4);
      }
      c.color(
        c.addXYZ(it.x, it.y, it.z, it.age * 2.2, r, h, r),
        _c.copy(it.color).multiplyScalar(k),
      );
    }
    for (let i = 0; i < L.nImm; i++) {
      const it = L.imm[i];
      c.color(
        c.addXYZ(it.x, it.y, it.z, it.yaw, it.r0, it.h, it.r0),
        _c.copy(it.color).multiplyScalar(it.alpha),
      );
    }
    c.end();
  }

  private drawSlashes(dt: number): void {
    const L = this.slashes;
    const c = L.crowd;
    c.begin();
    for (let i = L.live.length - 1; i >= 0; i--) {
      const it = L.live[i];
      it.age += dt;
      if (it.age >= it.life) {
        L.retire(i);
        continue;
      }
      const t = it.age / it.life;
      // the blade sweeps across the target: yaw from one side to the other, tilted a little
      const sweep = (easeOut(t) - 0.5) * 1.5 * (it.mode === 1 ? -1 : 1);
      const s = it.r0 * (0.9 + 0.2 * t);
      _m.compose(
        _p.set(it.x, it.y, it.z),
        _q.setFromEuler(_e.set(0.35 * it.roll, it.yaw + sweep, it.roll * 0.4, 'YXZ')),
        _s.set(s, s, s),
      );
      const k = it.alpha * 1.7 * (t < 0.12 ? t / 0.12 : (1 - (t - 0.12) / 0.88) ** 1.3);
      c.color(c.addMatrix(_m), _c.copy(it.color).multiplyScalar(k));
    }
    c.end();
  }

  private drawStreaks(dt: number): void {
    const L = this.streaks;
    const c = L.crowd;
    c.begin();
    for (let i = L.live.length - 1; i >= 0; i--) {
      const it = L.live[i];
      it.age += dt;
      if (it.age >= it.life) {
        L.retire(i);
        continue;
      }
      const t = it.age / it.life;
      this.streak(c, it, it.h * (1 - 0.5 * t), it.alpha * (1 - t) ** 1.2);
    }
    for (let i = 0; i < L.nImm; i++) {
      const it = L.imm[i];
      this.streak(c, it, it.h, it.alpha);
    }
    c.end();
  }

  private streak(c: Crowd, it: Item, w: number, k: number): void {
    _d.set(it.tx - it.x, it.ty - it.y, it.tz - it.z);
    const len = _d.length();
    if (len < 1) return;
    _d.divideScalar(len);
    _m.compose(_p.set(it.x, it.y, it.z), _q.setFromUnitVectors(_z, _d), _s.set(w, w, len));
    c.color(c.addMatrix(_m), _c.copy(it.color).multiplyScalar(k));
  }

  /** Live effects per kind: rings, columns, slashes, streaks (debug). */
  counts(): number[] {
    return [this.rings, this.cols, this.slashes, this.streaks].map((l) => l.live.length + l.nImm);
  }

  clear(): void {
    this.rings.clear();
    this.cols.clear();
    this.slashes.clear();
    this.streaks.clear();
  }

  dispose(): void {
    for (const l of [this.rings, this.cols, this.slashes, this.streaks]) l.crowd.dispose();
  }
}
