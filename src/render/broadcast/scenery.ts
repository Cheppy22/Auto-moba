import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Material,
  Matrix4,
  MeshBasicMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from 'three';
import type { Content } from '../../sim';
import { type Bit, type Kit, PAPER, rand01 } from './kit';
import { fbm, type TerrainField, WATER_Y } from './terrain';

const TAU = Math.PI * 2;
const WHITE = '#ffffff';
const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _c = new Color();
const Y = new Vector3(0, 1, 0);

interface Item {
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  tint: number;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The ofuda paper tag (white washi, red seal marks) used by swinging rim tags and boulders. */
export function ofudaTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = PAPER;
  g.fillRect(24, 0, 80, 128);
  g.strokeStyle = '#a8211f';
  g.fillStyle = '#a8211f';
  g.lineWidth = 3.5;
  g.lineCap = 'round';
  g.strokeRect(30, 6, 68, 116);
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.moveTo(52, 14 + i * 22);
    g.lineTo(76, 14 + i * 22 + (i % 2 ? 7 : -3));
    g.moveTo(64, 10 + i * 22);
    g.lineTo(64, 28 + i * 22);
    g.stroke();
  }
  g.beginPath();
  g.arc(64, 104, 8, 0, TAU);
  g.fill();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * Everything planted on the terrain: lantern pines, giant mushrooms, card-suit topiary, torii
 * fragments, ofuda-tagged boulders, reeds and stone lanterns along the roads. All static and
 * instanced, so it costs a handful of draw calls and nothing per frame.
 */
export class Scenery {
  readonly group = new Group();
  /** Draw calls and triangles this scenery adds to the scene, for reporting. */
  readonly counts = { meshes: 0, instances: 0 };
  private readonly owned: { dispose(): void }[] = [];
  private load = 1;
  private seed = 4401;
  private readonly cells = new Map<number, [number, number][]>();

  constructor(
    private readonly kit: Kit,
    private readonly field: TerrainField,
    private readonly content: Content,
    private readonly shadows: boolean,
  ) {
    // phones (no shadows) get a lighter forest
    this.load = shadows ? 1 : 0.6;
    this.scatter();
  }

  private rnd(): number {
    return rand01(this.seed++);
  }

  /** True when no earlier item sits within `gap` of (x, y); records the point when it is free. */
  private free(x: number, y: number, gap: number): boolean {
    const cs = 26;
    const cx = Math.floor(x / cs);
    const cy = Math.floor(y / cs);
    const reach = Math.ceil(gap / cs);
    for (let i = -reach; i <= reach; i++) {
      for (let j = -reach; j <= reach; j++) {
        const list = this.cells.get((cx + i) * 4099 + (cy + j));
        if (!list) continue;
        for (const [px, py] of list) if (Math.hypot(px - x, py - y) < gap) return false;
      }
    }
    const key = cx * 4099 + cy;
    const own = this.cells.get(key);
    if (own) own.push([x, y]);
    else this.cells.set(key, [[x, y]]);
    return true;
  }

  private push(list: Item[], x: number, y: number, scale: number, tint = this.rnd()): Item {
    const it: Item = {
      x: x - this.field.half,
      y: this.field.heightAt(x, y),
      z: y - this.field.half,
      yaw: this.rnd() * TAU,
      scale,
      tint,
    };
    list.push(it);
    return it;
  }

  private instanced(
    geo: BufferGeometry,
    mat: Material,
    items: Item[],
    cast: boolean,
    tint?: [string, string],
  ): InstancedMesh | null {
    if (!items.length) return null;
    const mesh = new InstancedMesh(geo, mat, items.length);
    items.forEach((it, i) => {
      _q.setFromAxisAngle(Y, it.yaw);
      _m.compose(_p.set(it.x, it.y, it.z), _q, _s.setScalar(it.scale));
      mesh.setMatrixAt(i, _m);
      if (tint) mesh.setColorAt(i, _c.set(tint[0]).lerp(new Color(tint[1]), it.tint));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (tint && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = cast && this.shadows;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.owned.push(mesh);
    this.counts.meshes++;
    this.counts.instances += items.length;
    return mesh;
  }

  /* ------------------------------ geometry ------------------------------ */

  private pineBits(): Bit[] {
    const cone = (r: number, h: number): ConeGeometry => new ConeGeometry(r, h, 7, 1, true);
    return [
      { geo: new CylinderGeometry(1.1, 1.8, 10, 6, 1, true), color: '#3a2a30', at: [0, 5, 0] },
      { geo: cone(11, 16), color: '#1d3a3e', at: [0, 15, 0] },
      { geo: cone(8.8, 14), color: '#25494b', at: [0, 24, 0] },
      { geo: cone(6, 12), color: '#2f5a58', at: [0, 32, 0] },
      { geo: cone(2.6, 6), color: '#386a64', at: [0, 39, 0] },
    ];
  }

  private mapleBits(): Bit[] {
    return [
      { geo: new CylinderGeometry(1.2, 2, 11, 6, 1, true), color: '#3a2a30', at: [0, 5.5, 0] },
      {
        geo: new IcosahedronGeometry(1, 0),
        color: '#8a2c3a',
        at: [0, 15, 0],
        scale: [10.5, 8, 10.5],
      },
      {
        geo: new IcosahedronGeometry(1, 0),
        color: '#b0443c',
        at: [3, 22, -1],
        scale: [7, 6, 7],
      },
      {
        geo: new IcosahedronGeometry(1, 0),
        color: '#c9663e',
        at: [-3, 20, 3],
        scale: [5.4, 4.6, 5.4],
      },
    ];
  }

  private mushroomBits(cap: string): Bit[] {
    const spot = '#f4ead6';
    const bits: Bit[] = [
      { geo: new CylinderGeometry(1.7, 2.5, 9, 7, 1, true), color: '#e8dcc8', at: [0, 4.5, 0] },
      {
        geo: new SphereGeometry(8, 9, 5, 0, TAU, 0, Math.PI / 2),
        color: cap,
        at: [0, 8, 0],
        scale: [1, 0.66, 1],
      },
    ];
    for (let i = 0; i < 5; i++) {
      const a = i * 1.7 + 0.4;
      const r = 3 + (i % 2) * 2.4;
      bits.push({
        geo: new SphereGeometry(1.1, 5, 4),
        color: spot,
        at: [Math.cos(a) * r, 8 + 4.6 * (1 - (r / 8) ** 2) ** 0.5 * 0.66 + 0.2, Math.sin(a) * r],
        scale: [1, 0.5, 1],
      });
    }
    return bits;
  }

  private suitBits(kind: 'heart' | 'spade' | 'club' | 'diamond'): Bit[] {
    const red = '#8a2a3a';
    const green = '#2a5a3c';
    const stem: Bit = {
      geo: new CylinderGeometry(1.2, 1.6, 7, 6, 1, true),
      color: '#3a2a30',
      at: [0, 3.5, 0],
    };
    const ball = (x: number, y: number, r: number, color: string): Bit => ({
      geo: new IcosahedronGeometry(r, 1),
      color,
      at: [x, y, 0],
      scale: [1, 1, 0.7],
    });
    switch (kind) {
      case 'heart':
        return [
          stem,
          ball(-3.4, 14, 4.8, red),
          ball(3.4, 14, 4.8, red),
          {
            geo: new ConeGeometry(8, 11, 8, 1, true).rotateX(Math.PI),
            color: red,
            at: [0, 10.4, 0],
            scale: [1, 1, 0.7],
          },
        ];
      case 'spade':
        return [
          stem,
          ball(-3.4, 12, 4.4, green),
          ball(3.4, 12, 4.4, green),
          {
            geo: new ConeGeometry(7.6, 11, 8, 1, true),
            color: green,
            at: [0, 17.5, 0],
            scale: [1, 1, 0.7],
          },
        ];
      case 'club':
        return [
          stem,
          ball(0, 17, 4.4, green),
          ball(-4.6, 11.4, 4.4, green),
          ball(4.6, 11.4, 4.4, green),
        ];
      default:
        return [
          stem,
          {
            geo: new OctahedronGeometry(8, 0),
            color: red,
            at: [0, 15, 0],
            scale: [0.78, 1.2, 0.55],
          },
        ];
    }
  }

  private toriiBits(): Bit[] {
    const red = '#9a2c30';
    const black = '#1a1218';
    return [
      { geo: new CylinderGeometry(1.6, 2, 24, 8), color: red, at: [-10, 12, 0] },
      {
        geo: new CylinderGeometry(1.5, 2.1, 12, 6),
        color: red,
        at: [10, 6, 0],
        rot: [0.12, 0, 0.1],
      },
      { geo: new BoxGeometry(30, 2.6, 3.8), color: black, at: [-8, 24.6, 0], rot: [0, 0, 0.05] },
      { geo: new BoxGeometry(24, 1.6, 2.4), color: red, at: [-9, 20, 0] },
      {
        geo: new BoxGeometry(11, 2.4, 3.4),
        color: black,
        at: [14, 2, 4],
        rot: [0.1, 0.6, 0.7],
      },
      { geo: new IcosahedronGeometry(2.4, 0), color: '#4a4452', at: [5, 1.2, 5] },
      { geo: new IcosahedronGeometry(1.8, 0), color: '#3b3647', at: [-2, 0.9, -5] },
    ];
  }

  private boulderBits(): Bit[] {
    return [
      {
        geo: new IcosahedronGeometry(1, 1),
        color: '#4a4558',
        at: [0, 3.4, 0],
        scale: [6.8, 5, 6],
      },
      {
        geo: new IcosahedronGeometry(1, 0),
        color: '#3a3548',
        at: [5.6, 1.6, 2.4],
        scale: [3.2, 2.6, 3],
      },
      {
        geo: new TorusGeometry(5.5, 0.55, 5, 14).rotateX(Math.PI / 2),
        color: '#cdb98a',
        at: [0, 4.2, 0],
      },
    ];
  }

  private reedBits(): Bit[] {
    const bits: Bit[] = [];
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05;
      const h = 9 + (i % 3) * 3;
      bits.push({
        geo: new ConeGeometry(0.85, h, 3, 1, true),
        color: i % 3 === 0 ? '#6f9a6a' : '#4c7e62',
        at: [Math.cos(a) * 1.7, h / 2, Math.sin(a) * 1.7],
        rot: [Math.sin(a) * 0.22, 0, -Math.cos(a) * 0.22],
      });
    }
    return bits;
  }

  private lanternBits(): { solid: Bit[]; glow: Bit[] } {
    const stone = '#5b5569';
    const dark = '#3b3647';
    return {
      solid: [
        { geo: new CylinderGeometry(3, 3.6, 2, 6), color: stone, at: [0, 1, 0] },
        { geo: new CylinderGeometry(1, 1.3, 7, 6), color: stone, at: [0, 5.5, 0] },
        { geo: new BoxGeometry(3.8, 3.2, 3.8), color: dark, at: [0, 10.1, 0] },
        {
          geo: new ConeGeometry(4, 2.8, 4, 1, true).rotateY(Math.PI / 4),
          color: dark,
          at: [0, 13.1, 0],
        },
      ],
      glow: [{ geo: new SphereGeometry(1.6, 8, 6), color: WHITE, at: [0, 10.1, 0] }],
    };
  }

  /** Merges parts into one vertex-colour geometry (indexed and flat parts can be mixed). */
  private build(bits: Bit[]): BufferGeometry {
    for (const b of bits) if (b.geo.index) b.geo = b.geo.toNonIndexed();
    return this.kit.merge(bits);
  }

  /* ------------------------------ scatter ------------------------------ */

  private scatter(): void {
    const f = this.field;
    const kit = this.kit;
    const half = f.half;
    const { islandR: ISLAND_R, k: mapK } = f.ws;
    // A bigger island gets proportionally more of everything, so the forest keeps its density.
    const area = mapK * mapK;
    const trees: Item[] = [];
    const maples: Item[] = [];
    const shrooms: Item[][] = [[], [], []];
    const suits: Item[][] = [[], [], [], []];
    const torii: Item[] = [];
    const boulders: Item[] = [];
    const reeds: Item[] = [];
    const lanterns: Item[] = [];

    for (let n = 0; n < Math.round(16000 * area); n++) {
      const x = half + (this.rnd() * 2 - 1) * (ISLAND_R - 30);
      const y = half + (this.rnd() * 2 - 1) * (ISLAND_R - 30);
      if (Math.hypot(x - half, y - half) > ISLAND_R - 34) continue;
      const d = f.sdfAt(x, y);
      if (d < 8) continue;
      const slope = f.slopeAt(x, y);
      if (slope > 0.5) continue;
      const rr = f.riverDist(x, y);
      const h = f.heightAt(x, y);
      if (h < WATER_Y + 3.2) continue;
      const dens = smooth(0.42, 0.62, fbm(x * 0.012, y * 0.012, 31, 2));
      const roll = this.rnd();
      if (
        d > 34 &&
        roll < 0.1 + 0.85 * dens &&
        trees.length + maples.length < 700 * area * this.load
      ) {
        if (!this.free(x, y, 20 - dens * 6)) continue;
        const big = (0.62 + this.rnd() * 0.6) * (0.6 + 0.4 * smooth(34, 110, d));
        if (this.rnd() < 0.05) this.push(maples, x, y, big * 0.95);
        else this.push(trees, x, y, big);
      } else if (roll > 0.985 && d > 12 && rr > 40 && boulders.length < 36 * area) {
        if (this.free(x, y, 40)) this.push(boulders, x, y, 0.85 + this.rnd() * 0.7);
      } else if (roll > 0.972 && d > 14 && d < 90 && torii.length < 16 * area) {
        if (this.free(x, y, 70)) this.push(torii, x, y, 0.9 + this.rnd() * 0.4);
      } else if (roll > 0.955 && d > 14 && d < 110) {
        if (!this.free(x, y, 40)) continue;
        const k = Math.floor(this.rnd() * 4);
        if (suits[k].length < 14) this.push(suits[k], x, y, 0.9 + this.rnd() * 0.5);
      } else if (roll > 0.93 && (rr < 150 || dens < 0.4)) {
        if (!this.free(x, y, 24)) continue;
        const k = Math.floor(this.rnd() * 3);
        if (shrooms[k].length < 14) this.push(shrooms[k], x, y, 0.7 + this.rnd() * 1.0);
      }
    }

    // reeds along the river banks and fringing the cliff feet
    for (let n = 0; n < Math.round(9000 * area) && reeds.length < 520 * area * this.load; n++) {
      const x = half + (this.rnd() * 2 - 1) * (ISLAND_R - 60);
      const y = half + (this.rnd() * 2 - 1) * (ISLAND_R - 60);
      const h = f.heightAt(x, y);
      const rr = f.riverDist(x, y);
      const d = f.sdfAt(x, y);
      const bank = rr > 20 && rr < 62 && h > WATER_Y - 0.4 && h < WATER_Y + 7;
      const foot = d > -3 && d < 4 && this.rnd() < 0.18;
      if (!(bank || foot) || f.slopeAt(x, y) > 0.45) continue;
      if (!this.free(x, y, 11)) continue;
      this.push(reeds, x, y, 0.8 + this.rnd() * 0.8);
    }

    // stone lanterns on the first ledge, a little back from the roads
    const lanes = this.content.map.lanes;
    const lane = f.ws.lane;
    const gap = 88 * mapK;
    for (const id of ['top', 'mid', 'bot'] as const) {
      const pts = lanes[id];
      let carry = 0;
      for (let i = 1; i < pts.length; i++) {
        const ax = pts[i - 1][0];
        const ay = pts[i - 1][1];
        const bx = pts[i][0];
        const by = pts[i][1];
        const len = Math.hypot(bx - ax, by - ay);
        if (len < 1e-6) continue;
        const nx = -(by - ay) / len;
        const ny = (bx - ax) / len;
        for (let s = carry; s < len; s += gap) {
          const px = ax + ((bx - ax) * s) / len;
          const py = ay + ((by - ay) * s) / len;
          const side = Math.floor(s / gap + i) % 2 === 0 ? 1 : -1;
          for (const off of [lane + 16, lane + 24, lane + 32]) {
            const x = px + nx * off * side;
            const y = py + ny * off * side;
            const d = f.sdfAt(x, y);
            if (d < 12 || d > 36 || f.slopeAt(x, y) > 0.4) continue;
            if (f.riverDist(x, y) < 50 || !this.free(x, y, 30)) continue;
            this.push(lanterns, x, y, 1.15);
            break;
          }
          carry = s + gap - len;
        }
      }
    }

    const treeMat = kit.vertexToon();
    this.instanced(this.build(this.pineBits()), treeMat, trees, true, ['#d8e6e0', '#ffb8c0']);
    this.instanced(this.build(this.mapleBits()), treeMat, maples, true);
    const caps = ['#b03a4a', '#7a5ac8', '#3aa0a0'];
    shrooms.forEach((list, i) =>
      this.instanced(this.build(this.mushroomBits(caps[i])), treeMat, list, false),
    );
    (['heart', 'spade', 'club', 'diamond'] as const).forEach((k, i) =>
      this.instanced(this.build(this.suitBits(k)), treeMat, suits[i], false),
    );
    this.instanced(this.build(this.toriiBits()), treeMat, torii, true);
    this.instanced(this.build(this.boulderBits()), treeMat, boulders, true);
    this.instanced(this.build(this.reedBits()), treeMat, reeds, false);
    const lan = this.lanternBits();
    this.instanced(this.build(lan.solid), treeMat, lanterns, true);
    const glowGeo = this.build(lan.glow);
    this.instanced(glowGeo, kit.basic('#ffd88a'), lanterns, false);

    // hanging lanterns in about a third of the pines
    const lit = trees.filter((_, i) => i % 3 === 0);
    const bulbGeo = this.build([
      { geo: new SphereGeometry(1.9, 7, 5), color: WHITE, at: [5.6, 0, 0], scale: [1, 1.25, 1] },
    ]);
    const bulbMesh = this.instanced(bulbGeo, kit.basic('#ffc46a'), lit, false);
    if (bulbMesh)
      lit.forEach((t, i) => {
        _q.setFromAxisAngle(Y, t.yaw);
        _m.compose(_p.set(t.x, t.y + 17.5 * t.scale, t.z), _q, _s.setScalar(t.scale));
        bulbMesh.setMatrixAt(i, _m);
      });

    // ofuda tags tied to the boulders
    const tex = ofudaTexture();
    const mat = new MeshBasicMaterial({
      map: tex,
      side: DoubleSide,
      transparent: true,
      alphaTest: 0.5,
    });
    const geo = new PlaneGeometry(4.2, 9).translate(0, 0, 0);
    this.owned.push(tex, mat, geo);
    if (boulders.length) {
      const tags = new InstancedMesh(geo, mat, boulders.length);
      boulders.forEach((b, i) => {
        _q.setFromAxisAngle(Y, b.yaw + 0.5);
        _m.compose(
          _p.set(
            b.x + Math.cos(b.yaw) * 6.2 * b.scale,
            b.y + 5 * b.scale,
            b.z - Math.sin(b.yaw) * 6.2 * b.scale,
          ),
          _q,
          _s.setScalar(b.scale),
        );
        tags.setMatrixAt(i, _m);
      });
      tags.frustumCulled = false;
      this.group.add(tags);
      this.counts.meshes++;
      this.owned.push(tags);
    }
  }

  dispose(): void {
    for (const o of this.owned) o.dispose();
    this.owned.length = 0;
  }
}
