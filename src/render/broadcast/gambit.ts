import {
  AdditiveBlending,
  BoxGeometry,
  type ColorRepresentation,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector3,
} from 'three';
import { BRASS, type Kit } from './kit';

const FLARES = 14;
const ARCS = 4;
const ARC_DOTS = 14;
const CROWNS = 3;

interface Flare {
  ring: Mesh;
  disc: Mesh;
  pillar: Mesh;
  ringMat: MeshBasicMaterial;
  discMat: MeshBasicMaterial;
  pillarMat: MeshBasicMaterial;
  age: number;
  life: number;
  r: number;
  /** 0 = burst (ring expands, then fades), 1 = zone (steady ring that pulses). */
  mode: 0 | 1;
  tall: number;
}

interface Arc {
  dots: Sprite[];
  mats: SpriteMaterial[];
  from: Vector3;
  to: Vector3;
  age: number;
  life: number;
  height: number;
}

interface Crown {
  mesh: Mesh;
  id: number;
  age: number;
  life: number;
}

/**
 * Cheap, pooled visuals for gambits and the Check / Throne / Checkmate moments: ground rings and
 * flares, a zone ring that lasts (Sanctuary), a crown flash over a King and a leap arc (Fork).
 * Nothing here allocates per frame.
 */
export class GambitFx {
  readonly group = new Group();
  private readonly flares: Flare[] = [];
  private readonly arcs: Arc[] = [];
  private readonly crowns: Crown[] = [];
  private nextFlare = 0;
  private nextArc = 0;
  private nextCrown = 0;
  private readonly _p = new Vector3();

  constructor(kit: Kit) {
    const beam = kit.beamTexture();
    for (let i = 0; i < FLARES; i++) {
      const ring = kit.decalRing('#ffffff', 1, false, 1);
      const disc = kit.glowDisc('#ffffff', 1, 0.5);
      const pillarMat = kit.own(
        new MeshBasicMaterial({
          map: beam,
          transparent: true,
          opacity: 0,
          blending: AdditiveBlending,
          depthWrite: false,
          side: DoubleSide,
          fog: false,
        }),
      );
      const pillar = new Mesh(
        kit.geo('pillar', () => new CylinderGeometry(1, 1, 1, 20, 1, true).translate(0, 0.5, 0)),
        pillarMat,
      );
      ring.position.y = 1.5;
      disc.position.y = 1.2;
      for (const m of [ring, disc, pillar]) m.visible = false;
      this.group.add(ring, disc, pillar);
      this.flares.push({
        ring,
        disc,
        pillar,
        ringMat: ring.material as MeshBasicMaterial,
        discMat: disc.material as MeshBasicMaterial,
        pillarMat,
        age: 1,
        life: 1,
        r: 1,
        mode: 0,
        tall: 0,
      });
    }
    for (let i = 0; i < ARCS; i++) {
      const dots: Sprite[] = [];
      const mats: SpriteMaterial[] = [];
      for (let k = 0; k < ARC_DOTS; k++) {
        const mat = kit.own(
          new SpriteMaterial({
            map: kit.glowTexture(),
            transparent: true,
            blending: AdditiveBlending,
            depthWrite: false,
            fog: false,
          }),
        );
        const s = new Sprite(mat);
        s.visible = false;
        this.group.add(s);
        dots.push(s);
        mats.push(mat);
      }
      this.arcs.push({
        dots,
        mats,
        from: new Vector3(),
        to: new Vector3(),
        age: 1,
        life: 1,
        height: 0,
      });
    }
    const crownGeo = kit.geo('check-crown', () =>
      kit.merge([
        { geo: new CylinderGeometry(7, 7.6, 4, 12, 1, true), color: '#ffe9a8' },
        {
          geo: new TorusGeometry(7.3, 0.9, 5, 16).rotateX(Math.PI / 2),
          color: '#ffffff',
          at: [0, 2, 0],
        },
        ...Array.from({ length: 5 }, (_, i) => ({
          geo: new ConeGeometry(1.5, 6, 5),
          color: '#fff4c8',
          at: [Math.cos((i / 5) * 6.283) * 6.8, 5, Math.sin((i / 5) * 6.283) * 6.8] as [
            number,
            number,
            number,
          ],
        })),
        { geo: new BoxGeometry(1.4, 7, 1.4), color: BRASS, at: [0, 7, 0] },
        { geo: new BoxGeometry(5, 1.4, 1.4), color: BRASS, at: [0, 8.4, 0] },
      ]),
    );
    const crownMat = kit.own(
      new MeshBasicMaterial({ vertexColors: true, side: DoubleSide, fog: false }),
    );
    for (let i = 0; i < CROWNS; i++) {
      const mesh = new Mesh(crownGeo, crownMat);
      mesh.visible = false;
      mesh.renderOrder = 30;
      this.group.add(mesh);
      this.crowns.push({ mesh, id: -1, age: 1, life: 1 });
    }
  }

  /** A burst: ring expands to radius `r`, a pale flare fades; `tall` > 0 adds a light pillar. */
  flare(
    x: number,
    y: number,
    z: number,
    color: ColorRepresentation,
    r: number,
    life = 0.9,
    tall = 0,
  ): void {
    this.spawn(x, y, z, color, r, life, tall, 0);
  }

  /** A lasting zone ring (Sanctuary) that pulses until `life` runs out. */
  zone(x: number, y: number, z: number, color: ColorRepresentation, r: number, life: number): void {
    this.spawn(x, y, z, color, r, life, 40, 1);
  }

  private spawn(
    x: number,
    y: number,
    z: number,
    color: ColorRepresentation,
    r: number,
    life: number,
    tall: number,
    mode: 0 | 1,
  ): void {
    const f = this.flares[this.nextFlare];
    this.nextFlare = (this.nextFlare + 1) % FLARES;
    f.age = 0;
    f.life = life;
    f.r = r;
    f.mode = mode;
    f.tall = tall;
    for (const m of [f.ringMat, f.discMat, f.pillarMat]) m.color.set(color);
    for (const m of [f.ring, f.disc]) m.position.set(x, y + 1.4, z);
    f.pillar.position.set(x, y, z);
    f.ring.visible = f.disc.visible = true;
    f.pillar.visible = tall > 0;
  }

  /** A crown that pops above unit `id` for `life` seconds. */
  crown(id: number, life = 1.8): void {
    const c = this.crowns[this.nextCrown];
    this.nextCrown = (this.nextCrown + 1) % CROWNS;
    c.id = id;
    c.age = 0;
    c.life = life;
    c.mesh.visible = true;
  }

  /** A glowing parabola from `from` to `to` (a leap). */
  arc(from: Vector3, to: Vector3, color: ColorRepresentation, life = 0.55): void {
    const a = this.arcs[this.nextArc];
    this.nextArc = (this.nextArc + 1) % ARCS;
    a.from.copy(from);
    a.to.copy(to);
    a.age = 0;
    a.life = life;
    a.height = Math.min(90, 24 + from.distanceTo(to) * 0.35);
    for (const m of a.mats) m.color.set(color);
  }

  update(dt: number, time: number, find: (id: number, out: Vector3) => boolean): void {
    for (const f of this.flares) {
      if (f.age >= f.life) {
        if (f.ring.visible) f.ring.visible = f.disc.visible = f.pillar.visible = false;
        continue;
      }
      f.age += dt;
      const t = Math.min(1, f.age / f.life);
      if (f.mode === 0) {
        const grow = 1 - (1 - t) * (1 - t);
        const rr = f.r * (0.25 + 0.95 * grow);
        f.ring.scale.set(rr * 2, 1, rr * 2);
        f.disc.scale.set(f.r * 2.2, 1, f.r * 2.2);
        f.ringMat.opacity = (1 - t) * 1.2;
        f.discMat.opacity = (1 - t) * (1 - t) * 0.8;
        if (f.tall > 0) {
          f.pillar.scale.set(f.r * 0.5, f.tall * (0.4 + t), f.r * 0.5);
          f.pillarMat.opacity = (1 - t) * 0.9;
        }
      } else {
        const fade = Math.min(1, t * 8, (1 - t) * 6);
        const pulse = 0.5 + 0.5 * Math.sin(time * 5 + f.r);
        f.ring.scale.set(f.r * 2, 1, f.r * 2);
        f.ring.rotation.y = time * 0.5;
        f.disc.scale.set(f.r * 2.1, 1, f.r * 2.1);
        f.ringMat.opacity = fade * (0.7 + 0.3 * pulse);
        f.discMat.opacity = fade * (0.3 + 0.15 * pulse);
        f.pillar.scale.set(f.r * 0.8, f.tall, f.r * 0.8);
        f.pillarMat.opacity = fade * (0.25 + 0.1 * pulse);
      }
    }
    for (const c of this.crowns) {
      if (c.age >= c.life) {
        c.mesh.visible = false;
        continue;
      }
      c.age += dt;
      const t = Math.min(1, c.age / c.life);
      const pop = Math.sin(Math.min(1, t * 1.15) * Math.PI);
      if (!find(c.id, this._p)) {
        c.mesh.visible = false;
        continue;
      }
      c.mesh.position.set(this._p.x, this._p.y + 62 + t * 14, this._p.z);
      c.mesh.scale.setScalar(Math.max(0.01, pop * (1.3 + 0.15 * Math.sin(time * 14))));
      c.mesh.rotation.y = time * 3;
    }
    for (const a of this.arcs) {
      if (a.age >= a.life) {
        for (const d of a.dots) d.visible = false;
        continue;
      }
      a.age += dt;
      const t = Math.min(1, a.age / a.life);
      for (let i = 0; i < ARC_DOTS; i++) {
        const u = i / (ARC_DOTS - 1);
        const head = t * 1.25;
        const k = head - u * 0.55;
        const d = a.dots[i];
        if (k < 0 || k > 1) {
          d.visible = false;
          continue;
        }
        d.visible = true;
        d.position.lerpVectors(a.from, a.to, k);
        d.position.y += Math.sin(k * Math.PI) * a.height + 8;
        d.scale.setScalar(16 * (1 - u * 0.6));
        a.mats[i].opacity = 1 - u * 0.7;
      }
    }
  }

  clear(): void {
    for (const f of this.flares) {
      f.age = f.life;
      f.ring.visible = f.disc.visible = f.pillar.visible = false;
    }
    for (const c of this.crowns) {
      c.age = c.life;
      c.mesh.visible = false;
    }
    for (const a of this.arcs) {
      a.age = a.life;
      for (const d of a.dots) d.visible = false;
    }
  }
}
