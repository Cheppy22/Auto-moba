import {
  AdditiveBlending,
  BoxGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Material,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { BRASS, type Kit, PAPER, type Piece, rand01 } from './kit';

const STEP = 1 / 60;
const MAX_STEPS = 6;
const GRAVITY = 330;
const GROUND_FRICTION = 4.2;
const SPIN_FRICTION = 3.2;
const SLEEP_SPEED = 7;
const SLEEP_SPIN = 0.7;
const SLEEP_TIME = 0.15;
const TOPPLE_RATE = 5;

/** A fade group: materials shared by the bodies of one burst, disposed when the last one goes. */
interface Skin {
  materials: Material[];
  refs: number;
}

interface Body {
  object: Object3D;
  skin: Skin;
  vel: Vector3;
  spin: Vector3;
  radius: number;
  lie: boolean;
  gravity: number;
  airDrag: number;
  bounce: number;
  age: number;
  life: number;
  fade: number;
  still: number;
  asleep: boolean;
}

export interface BodyInit {
  object: Object3D;
  materials: Material[];
  velocity: Vector3;
  spin: Vector3;
  radius: number;
  life: number;
  fade: number;
  lie?: boolean;
  gravity?: number;
  airDrag?: number;
  bounce?: number;
}

const _axis = new Vector3();
const _up = new Vector3(0, 1, 0);
const _dq = new Quaternion();
const _local = new Vector3();

/**
 * Visual-only rigid-body-lite: fixed step, gravity, ground bounce, friction, spin, sleep and fade.
 * Nothing here is read by the sim.
 */
export class VisualPhysics {
  readonly group = new Group();
  private bodies: Body[] = [];
  private acc = 0;
  private seed = 7;

  constructor(
    private kit: Kit,
    private cap = 56,
  ) {}

  get count(): number {
    return this.bodies.length;
  }

  private rnd(lo = 0, hi = 1): number {
    return lo + (hi - lo) * rand01(this.seed++);
  }

  private skin(materials: Material[], bodies: number): Skin {
    return { materials, refs: bodies };
  }

  spawn(init: BodyInit, skin?: Skin): void {
    if (this.bodies.length >= this.cap) this.remove(0);
    this.group.add(init.object);
    this.bodies.push({
      object: init.object,
      skin: skin ?? this.skin(init.materials, 1),
      vel: init.velocity,
      spin: init.spin,
      radius: init.radius,
      lie: init.lie ?? false,
      gravity: init.gravity ?? 1,
      airDrag: init.airDrag ?? 0,
      bounce: init.bounce ?? 0.38,
      age: 0,
      life: init.life,
      fade: init.fade,
      still: 0,
      asleep: false,
    });
  }

  private remove(i: number): void {
    const b = this.bodies[i];
    this.group.remove(b.object);
    if (--b.skin.refs <= 0) for (const m of b.skin.materials) m.dispose();
    this.bodies.splice(i, 1);
  }

  update(dtMs: number): void {
    this.acc = Math.min(this.acc + dtMs / 1000, STEP * MAX_STEPS);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      for (let i = this.bodies.length - 1; i >= 0; i--) {
        const b = this.bodies[i];
        this.integrate(b);
        if (b.age >= b.life + b.fade) this.remove(i);
        else if (b.age > b.life) {
          const o = 1 - (b.age - b.life) / b.fade;
          for (const m of b.skin.materials) m.opacity = o;
        }
      }
    }
  }

  private integrate(b: Body): void {
    b.age += STEP;
    if (b.asleep) return;
    const o = b.object;
    b.vel.y -= GRAVITY * b.gravity * STEP;
    if (b.airDrag > 0) b.vel.multiplyScalar(Math.exp(-b.airDrag * STEP));
    o.position.addScaledVector(b.vel, STEP);
    const w = b.spin.length();
    if (w > 1e-3) {
      _dq.setFromAxisAngle(_axis.copy(b.spin).divideScalar(w), w * STEP);
      o.quaternion.premultiply(_dq);
    }
    if (o.position.y > b.radius) return;
    o.position.y = b.radius;
    if (b.vel.y < 0) {
      b.vel.y = -b.vel.y > 16 ? -b.vel.y * b.bounce : 0;
      if (b.vel.y > 0) {
        b.vel.x *= 0.7;
        b.vel.z *= 0.7;
        b.spin.multiplyScalar(0.7);
      }
    }
    const fr = Math.exp(-GROUND_FRICTION * STEP);
    b.vel.x *= fr;
    b.vel.z *= fr;
    b.spin.multiplyScalar(Math.exp(-SPIN_FRICTION * STEP));
    if (b.lie) this.topple(b);
    const slow = b.vel.lengthSq() < SLEEP_SPEED * SLEEP_SPEED && w < SLEEP_SPIN;
    b.still = slow ? b.still + STEP : 0;
    if (b.still > SLEEP_TIME) {
      b.asleep = true;
      b.vel.set(0, 0, 0);
      b.spin.set(0, 0, 0);
    }
  }

  private topple(b: Body): void {
    _local.copy(_up).applyQuaternion(b.object.quaternion);
    if (Math.abs(_local.y) < 0.06) return;
    _axis.crossVectors(_up, _local);
    if (_axis.lengthSq() < 1e-4) _axis.set(1, 0, 0);
    _axis.normalize().multiplyScalar(Math.sign(_local.y));
    _dq.setFromAxisAngle(_axis, TOPPLE_RATE * STEP * Math.min(1, Math.abs(_local.y) * 3));
    b.object.quaternion.premultiply(_dq);
  }

  /** Split a defeated figure into pieces thrown away from `from` (a scene-space point, or null). */
  ragdoll(pieces: Piece[], from: Vector3 | null): void {
    const at = pieces[0].object.getWorldPosition(new Vector3());
    const away = new Vector3(this.rnd(-1, 1), 0, this.rnd(-1, 1));
    if (from) {
      const d = new Vector3(at.x - from.x, 0, at.z - from.z);
      if (d.lengthSq() > 4) away.copy(d);
    }
    away.normalize();
    pieces.forEach((p, i) => {
      const { object, materials } = this.kit.fadable(p.object);
      p.object.matrixWorld.decompose(object.position, object.quaternion, object.scale);
      const head = i === 1;
      const sigil = i === 2;
      const speed =
        (head ? this.rnd(110, 150) : sigil ? this.rnd(60, 90) : this.rnd(70, 105)) * (1 + 0.1 * i);
      const side = new Vector3(-away.z, 0, away.x).multiplyScalar(this.rnd(-0.35, 0.35));
      this.spawn({
        object,
        materials,
        velocity: new Vector3()
          .copy(away)
          .multiplyScalar(speed)
          .add(side.multiplyScalar(speed))
          .setY(head ? this.rnd(150, 210) : sigil ? this.rnd(180, 240) : this.rnd(120, 170)),
        spin: new Vector3(this.rnd(-1, 1), this.rnd(-0.5, 0.5), this.rnd(-1, 1)).multiplyScalar(
          head ? 15 : sigil ? 9 : 7,
        ),
        radius: p.radius,
        life: sigil ? 2.2 : 2.3,
        fade: 0.8,
        lie: p.lie,
        gravity: sigil ? 0.55 : 1,
        airDrag: sigil ? 0.9 : 0,
        bounce: head ? 0.5 : sigil ? 0.45 : 0.3,
      });
    });
  }

  /** Stone chunks, splinters and embers from a structure falling at ground point (x, z). */
  debris(
    x: number,
    z: number,
    height: number,
    spread: number,
    colors: string[],
    count: number,
  ): void {
    const kit = this.kit;
    const ico = kit.geo('chunk-ico', () => new IcosahedronGeometry(1, 0));
    const box = kit.geo('chunk-box', () => new BoxGeometry(1, 1, 1));
    for (let i = 0; i < count; i++) {
      const size = this.rnd(0.14, 0.34) * height * (i % 4 === 0 ? 1.3 : 1);
      const mesh = kit.inked(i % 3 === 0 ? box : ico, kit.toon(colors[i % colors.length]), 0.8);
      mesh.scale.set(size * this.rnd(0.7, 1.3), size * this.rnd(0.6, 1), size * this.rnd(0.7, 1.3));
      const a = this.rnd(0, Math.PI * 2);
      const r = this.rnd(0, spread);
      mesh.position.set(x + Math.cos(a) * r, this.rnd(0.2, 0.9) * height, z + Math.sin(a) * r);
      mesh.rotation.set(this.rnd(0, 6), this.rnd(0, 6), this.rnd(0, 6));
      const { object, materials } = kit.fadable(mesh);
      object.position.copy(mesh.position);
      object.rotation.copy(mesh.rotation);
      object.scale.copy(mesh.scale);
      const out = this.rnd(40, 120);
      this.spawn({
        object,
        materials,
        velocity: new Vector3(Math.cos(a) * out, this.rnd(90, 230), Math.sin(a) * out),
        spin: new Vector3(this.rnd(-1, 1), this.rnd(-1, 1), this.rnd(-1, 1)).multiplyScalar(8),
        radius: size * 0.7,
        life: this.rnd(2.2, 3.2),
        fade: 0.9,
        bounce: 0.32,
      });
    }
    const ember = kit.geo('ember', () => new SphereGeometry(1, 6, 5));
    const mats = [
      new MeshBasicMaterial({
        color: BRASS,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    ];
    const embers = Math.round(count * 0.8);
    const skin = this.skin(mats, embers);
    const emberLife = this.rnd(0.6, 1);
    for (let i = 0; i < embers; i++) {
      const a = this.rnd(0, Math.PI * 2);
      const out = this.rnd(30, 90);
      const m = new Mesh(ember, mats[0]);
      m.scale.setScalar(this.rnd(0.7, 1.5));
      m.position.set(x, this.rnd(0.3, 0.8) * height, z);
      this.spawn(
        {
          object: m,
          materials: mats,
          velocity: new Vector3(Math.cos(a) * out, this.rnd(110, 260), Math.sin(a) * out),
          spin: new Vector3(),
          radius: 0.5,
          life: emberLife,
          fade: 0.5,
          gravity: 0.5,
          bounce: 0.2,
        },
        skin,
      );
    }
  }

  /** A small flutter of paper scraps where a minion or spirit fell. */
  paperBurst(x: number, y: number, z: number, color: string): void {
    const kit = this.kit;
    const scrap = kit.geo('scrap', () => new PlaneGeometry(2.2, 3.2));
    const mats = [color, PAPER].map(
      (c) => new MeshBasicMaterial({ color: c, side: DoubleSide, transparent: true, fog: false }),
    );
    const n = 8;
    const skin = this.skin(mats, n);
    for (let i = 0; i < n; i++) {
      const m = new Mesh(scrap, mats[i % 2]);
      m.position.set(x, y + this.rnd(2, 8), z);
      m.rotation.set(this.rnd(0, 6), this.rnd(0, 6), 0);
      const a = this.rnd(0, Math.PI * 2);
      const out = this.rnd(18, 55);
      this.spawn(
        {
          object: m,
          materials: mats,
          velocity: new Vector3(Math.cos(a) * out, this.rnd(60, 130), Math.sin(a) * out),
          spin: new Vector3(this.rnd(-1, 1), this.rnd(-1, 1), this.rnd(-1, 1)).multiplyScalar(11),
          radius: 0.3,
          life: 0.45,
          fade: 0.5,
          gravity: 0.3,
          airDrag: 1.6,
          bounce: 0.2,
        },
        skin,
      );
    }
  }

  clear(): void {
    for (let i = this.bodies.length - 1; i >= 0; i--) this.remove(i);
  }

  dispose(): void {
    this.clear();
  }
}
