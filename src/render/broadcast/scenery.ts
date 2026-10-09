import {
  BoxGeometry,
  type BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  LatheGeometry,
  type Material,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three';
import type { Content } from '../../sim';
import { type Bit, type Kit, rand01 } from './kit';
import type { TerrainField } from './terrain';
import { WATER_Y } from './terrain';

const TAU = Math.PI * 2;
const WHITE = '#ffffff';
const SQRT1_2 = Math.SQRT1_2;
const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _c = new Color();
const Y = new Vector3(0, 1, 0);

/** Length of one balustrade or hedge module along its run. */
const MODULE = 12;
const MARBLE = '#e8e1d0';
const MARBLE_SHADE = '#cdc5b0';
const HEDGE = '#2f4d35';
const HEDGE_TOP = '#3b5e40';
const TOPIARY = '#3a6040';
const CYPRESS = '#27432f';

interface Item {
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  tint: number;
}

const lathe = (pts: [number, number][], seg = 8): LatheGeometry =>
  new LatheGeometry(
    pts.map(([r, y]) => new Vector2(r, y)),
    seg,
  );

/** A chess piece clipped from a yew, standing on a marble plinth (about 22 tall before scaling). */
function topiaryBits(kind: 'pawn' | 'rook' | 'bishop' | 'knight'): Bit[] {
  const bits: Bit[] = [
    { geo: new BoxGeometry(9, 3, 9), color: MARBLE_SHADE, at: [0, 1.5, 0] },
    { geo: new BoxGeometry(7, 1, 7), color: MARBLE, at: [0, 3.5, 0] },
  ];
  switch (kind) {
    case 'pawn':
      bits.push(
        {
          geo: lathe([
            [0.01, 4],
            [4.4, 4],
            [4.2, 6],
            [2.5, 8],
            [2.1, 14],
            [3.6, 15],
            [3.6, 16],
            [0.01, 16.4],
          ]),
          color: TOPIARY,
        },
        { geo: new SphereGeometry(3.5, 8, 6), color: TOPIARY, at: [0, 19.4, 0] },
      );
      break;
    case 'rook':
      bits.push(
        { geo: new CylinderGeometry(3.9, 4.6, 13, 8), color: TOPIARY, at: [0, 10.5, 0] },
        { geo: new CylinderGeometry(5, 4.2, 3, 8), color: TOPIARY, at: [0, 18.5, 0] },
      );
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + Math.PI / 4;
        bits.push({
          geo: new BoxGeometry(2.6, 2.6, 2.6),
          color: HEDGE_TOP,
          at: [Math.cos(a) * 3.4, 21.3, Math.sin(a) * 3.4],
          rot: [0, -a, 0],
        });
      }
      break;
    case 'bishop':
      bits.push(
        {
          geo: lathe([
            [0.01, 4],
            [4.4, 4],
            [3.2, 7],
            [2.3, 14],
            [3.4, 15.4],
            [0.01, 16],
          ]),
          color: TOPIARY,
        },
        {
          geo: new SphereGeometry(1, 8, 6),
          color: TOPIARY,
          at: [0, 20, 0],
          scale: [3.1, 4.8, 3.1],
        },
        { geo: new SphereGeometry(1.1, 6, 4), color: HEDGE_TOP, at: [0, 25.4, 0] },
      );
      break;
    default:
      bits.push(
        {
          geo: lathe([
            [0.01, 4],
            [4.6, 4],
            [3.6, 6.5],
            [3.2, 9],
            [0.01, 9.4],
          ]),
          color: TOPIARY,
        },
        {
          geo: new BoxGeometry(3.6, 10, 5),
          color: TOPIARY,
          at: [0, 14, -0.4],
          rot: [-0.32, 0, 0],
        },
        { geo: new BoxGeometry(3.4, 3.8, 6.2), color: TOPIARY, at: [0, 19.4, 2.6] },
        { geo: new ConeGeometry(1, 3, 4), color: HEDGE_TOP, at: [-1.2, 22.6, 0.2] },
        { geo: new ConeGeometry(1, 3, 4), color: HEDGE_TOP, at: [1.2, 22.6, 0.2] },
      );
  }
  return bits;
}

/**
 * Everything planted on the terrain: the formal palace garden. Marble balustrades along the
 * terrace edges, canal banks and bridges, clipped hedges behind them, chess-piece topiary and box
 * balls at the crossings of the gravel walks, a few cypresses and marble lamps along the roads.
 * All static and instanced, so it costs a handful of draw calls and nothing per frame.
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
    // phones (no shadows) get a lighter garden
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

  private push(
    list: Item[],
    x: number,
    y: number,
    scale: number,
    yaw = this.rnd() * TAU,
    tint = this.rnd(),
  ): Item {
    const it: Item = {
      x: x - this.field.half,
      y: this.field.heightAt(x, y),
      z: y - this.field.half,
      yaw,
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

  /** One run of marble balustrade (local +x along the run): rails, balusters and an end pier. */
  private balustradeBits(): Bit[] {
    const bits: Bit[] = [
      { geo: new BoxGeometry(MODULE, 1.4, 2.6), color: MARBLE_SHADE, at: [0, 0.7, 0] },
      { geo: new BoxGeometry(MODULE, 1.2, 2.8), color: MARBLE, at: [0, 5.6, 0] },
      { geo: new BoxGeometry(2, 7, 3.2), color: MARBLE, at: [-MODULE / 2, 3.5, 0] },
      { geo: new BoxGeometry(2.8, 0.9, 4), color: MARBLE_SHADE, at: [-MODULE / 2, 7.4, 0] },
    ];
    for (const x of [-3.6, 0, 3.6])
      bits.push({
        geo: new CylinderGeometry(0.8, 0.8, 4.2, 4, 1, true),
        color: MARBLE,
        at: [x, 3.2, 0],
      });
    return bits;
  }

  /** One clipped yew hedge: a long block with a stepped top. */
  private hedgeBits(): Bit[] {
    return [
      { geo: new BoxGeometry(MODULE + 0.4, 4.6, 4.6), color: HEDGE, at: [0, 2.3, 0] },
      { geo: new BoxGeometry(MODULE - 1, 1.4, 3.6), color: HEDGE_TOP, at: [0, 5.2, 0] },
    ];
  }

  private cypressBits(): Bit[] {
    return [
      { geo: new CylinderGeometry(0.9, 1.3, 5, 5, 1, true), color: '#4a3a2c', at: [0, 2.5, 0] },
      { geo: new ConeGeometry(3.6, 26, 7, 1, true), color: CYPRESS, at: [0, 16, 0] },
      { geo: new ConeGeometry(2.4, 11, 7, 1, true), color: '#335a3d', at: [0, 31, 0] },
    ];
  }

  /** A clipped box ball on a short stem, in a small marble pot. */
  private boxBits(): Bit[] {
    return [
      { geo: new CylinderGeometry(3.4, 2.8, 3.4, 8), color: MARBLE_SHADE, at: [0, 1.7, 0] },
      {
        geo: new IcosahedronGeometry(1, 1),
        color: TOPIARY,
        at: [0, 7.4, 0],
        scale: [5.2, 4.8, 5.2],
      },
    ];
  }

  private lampBits(): { solid: Bit[]; glow: Bit[] } {
    const dark = '#35383a';
    return {
      solid: [
        { geo: new CylinderGeometry(3, 3.6, 2, 6), color: MARBLE_SHADE, at: [0, 1, 0] },
        { geo: new CylinderGeometry(0.9, 1.3, 9, 6), color: dark, at: [0, 6.5, 0] },
        { geo: new BoxGeometry(3.8, 3.4, 3.8), color: dark, at: [0, 12.2, 0] },
        {
          geo: new ConeGeometry(3.4, 2.6, 4, 1, true).rotateY(Math.PI / 4),
          color: MARBLE_SHADE,
          at: [0, 15.2, 0],
        },
      ],
      glow: [{ geo: new SphereGeometry(1.6, 8, 6), color: WHITE, at: [0, 12.2, 0] }],
    };
  }

  /** Merges parts into one vertex-colour geometry (indexed and flat parts can be mixed). */
  private build(bits: Bit[]): BufferGeometry {
    for (const b of bits) if (b.geo.index) b.geo = b.geo.toNonIndexed();
    return this.kit.merge(bits);
  }

  /* ------------------------------ scatter ------------------------------ */

  /**
   * Walks the outline of every walkable shape `dist` outside its edge and calls back with a point
   * and the heading along the outline. Points that sit nearer another shape are skipped, so what
   * is left follows the outline of the whole walkable ground.
   */
  private along(dist: number, step: number, cb: (x: number, y: number, h: number) => void): void {
    const f = this.field;
    for (const s of f.shapes) {
      const R = s.r + dist;
      const dx = s.bx - s.ax;
      const dy = s.by - s.ay;
      const len = Math.hypot(dx, dy);
      const ux = len > 1e-6 ? dx / len : 1;
      const uy = len > 1e-6 ? dy / len : 0;
      const nx = -uy;
      const ny = ux;
      const th = Math.atan2(uy, ux);
      const cap = Math.PI * R;
      const total = 2 * len + 2 * cap;
      for (let t = 0; t < total; t += step) {
        let x: number;
        let y: number;
        let hx: number;
        let hy: number;
        if (t < len) {
          x = s.ax + ux * t + nx * R;
          y = s.ay + uy * t + ny * R;
          hx = ux;
          hy = uy;
        } else if (t < len + cap) {
          const a = th + Math.PI / 2 - (t - len) / R;
          x = s.bx + Math.cos(a) * R;
          y = s.by + Math.sin(a) * R;
          hx = Math.sin(a);
          hy = -Math.cos(a);
        } else if (t < 2 * len + cap) {
          const u = t - len - cap;
          x = s.bx - ux * u - nx * R;
          y = s.by - uy * u - ny * R;
          hx = -ux;
          hy = -uy;
        } else {
          const a = th + (3 * Math.PI) / 2 - (t - 2 * len - cap) / R;
          x = s.ax + Math.cos(a) * R;
          y = s.ay + Math.sin(a) * R;
          hx = Math.sin(a);
          hy = -Math.cos(a);
        }
        if (Math.abs(f.sdfAt(x, y) - dist) > 1.8) continue;
        cb(x, y, Math.atan2(-hy, hx));
      }
    }
  }

  /** True on level ground with a drop to the walkable side (a terrace edge worth railing). */
  private terraceEdge(x: number, y: number, drop = 8, slope = 0.22): boolean {
    const f = this.field;
    if (f.slopeAt(x, y) > slope) return false;
    const e = 3;
    let gx = f.sdfAt(x + e, y) - f.sdfAt(x - e, y);
    let gy = f.sdfAt(x, y + e) - f.sdfAt(x, y - e);
    const l = Math.hypot(gx, gy) || 1;
    gx /= l;
    gy /= l;
    return f.heightAt(x, y) - f.heightAt(x - gx * 14, y - gy * 14) > drop;
  }

  private scatter(): void {
    const f = this.field;
    const kit = this.kit;
    const half = f.half;
    const { islandR: ISLAND_R, k: mapK, tile, riverCore } = f.ws;
    // A bigger island gets proportionally more of everything, so the garden keeps its density.
    const area = mapK * mapK;
    const run = MODULE * (this.shadows ? 1 : 1.5);
    const rails: Item[] = [];
    const hedges: Item[] = [];
    const cypresses: Item[] = [];
    const boxes: Item[] = [];
    const topiary: Item[][] = [[], [], [], []];
    const lamps: Item[] = [];
    const inIsland = (x: number, y: number): boolean =>
      Math.hypot(x - half, y - half) < ISLAND_R - 40;

    // marble lamps on the first terrace, a little back from the roads
    const lanes = this.content.map.lanes;
    const lane = f.ws.lane;
    const gap = 110 * mapK;
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
          carry = s + gap - len;
          for (const off of [16, 22, 28, 34, 40]) {
            const x = px + nx * (lane + off) * side;
            const y = py + ny * (lane + off) * side;
            if (!inIsland(x, y) || f.sdfAt(x, y) < 14 || f.slopeAt(x, y) > 0.2) continue;
            if (f.riverDist(x, y) < riverCore + 40 * mapK || !this.free(x, y, 30)) continue;
            this.push(lamps, x, y, 1.15);
            break;
          }
        }
      }
    }

    // balustrades along the terrace edges, a clipped hedge on the terrace behind each
    const far = (x: number, y: number): boolean =>
      !inIsland(x, y) || f.riverDist(x, y) < riverCore + 30 * mapK;
    this.along(15.5, run, (x, y, yaw) => {
      if (far(x, y) || !this.terraceEdge(x, y) || !this.free(x, y, run * 0.7)) return;
      this.push(rails, x, y, 1, yaw);
    });
    this.along(21, run, (x, y, yaw) => {
      if (far(x, y) || !this.terraceEdge(x, y, 8, 0.3) || !this.free(x, y, run * 0.7)) return;
      this.push(hedges, x, y, 1, yaw, this.rnd());
    });
    this.along(38, run, (x, y, yaw) => {
      if (far(x, y) || !this.terraceEdge(x, y, 5, 0.25) || !this.free(x, y, run * 0.7)) return;
      this.push(rails, x, y, 1, yaw);
    });
    this.along(43.5, run, (x, y, yaw) => {
      if (far(x, y) || !this.terraceEdge(x, y, 5, 0.3) || !this.free(x, y, run * 0.7)) return;
      this.push(hedges, x, y, 1, yaw, this.rnd());
    });

    // the canal: a balustrade along each bank, and a parapet on every bridge
    const reach = ISLAND_R - 70;
    for (const side of [-1, 1]) {
      for (let s = -reach; s < reach; s += run) {
        const a = f.riverCenter(s) + side * (riverCore + 13.5 * mapK);
        const x = half + (s + a) * SQRT1_2;
        const y = half + (s - a) * SQRT1_2;
        const a1 = f.riverCenter(s + 1) + side * (riverCore + 13.5 * mapK);
        const hx = (s + 1 + a1) * SQRT1_2 - (s + a) * SQRT1_2;
        const hy = (s + 1 - a1) * SQRT1_2 - (s - a) * SQRT1_2;
        if (!inIsland(x, y) || f.sdfAt(x, y) < 3 || f.slopeAt(x, y) > 0.35) continue;
        if (f.heightAt(x, y) < WATER_Y + 0.8 || !this.free(x, y, run * 0.7)) continue;
        this.push(rails, x, y, 1, Math.atan2(-hy, hx));
      }
    }
    for (const id of ['top', 'mid', 'bot'] as const) {
      const pts = lanes[id];
      for (const side of [-1, 1]) {
        let off = 0;
        for (let i = 1; i < pts.length; i++) {
          const ax = pts[i - 1][0];
          const ay = pts[i - 1][1];
          const bx = pts[i][0];
          const by = pts[i][1];
          const len = Math.hypot(bx - ax, by - ay);
          if (len < 1e-6) continue;
          const ux = (bx - ax) / len;
          const uy = (by - ay) / len;
          let s = off;
          for (; s < len; s += MODULE) {
            const x = ax + ux * s - uy * (lane + 1.5) * side;
            const y = ay + uy * s + ux * (lane + 1.5) * side;
            if (f.riverDist(x, y) > riverCore + 16 * mapK || f.sdfAt(x, y) < 0.3) continue;
            if (!this.free(x, y, MODULE * 0.7)) continue;
            this.push(rails, x, y, 1, Math.atan2(-uy, ux));
          }
          off = s - len;
        }
      }
    }

    // topiary and box balls on the round beds where the gravel walks cross
    for (const { x, y, i, j } of f.gardenBeds()) {
      if (this.load < 1 && (i + j) % 2 !== 0) continue;
      const kind = Math.floor(rand01(i * 131 + j * 17 + 7) * 4) % 4;
      this.push(topiary[kind], x, y, 1.5, Math.round(this.rnd() * 4) * (TAU / 4));
      if (this.load < 1) continue;
      for (const [ox, oy] of [
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ]) {
        const bx = x + ox * tile * 0.95;
        const by = y + oy * tile * 0.95;
        if (f.slopeAt(bx, by) > 0.22 || f.sdfAt(bx, by) < 20) continue;
        this.push(boxes, bx, by, 1.2);
      }
    }

    // a few cypresses, in pairs, on the high lawns
    const cap = Math.round(110 * area * this.load);
    for (let t = 0; t < Math.round(9000 * area) && cypresses.length < cap; t++) {
      const x = half + (this.rnd() * 2 - 1) * (ISLAND_R - 60);
      const y = half + (this.rnd() * 2 - 1) * (ISLAND_R - 60);
      if (!inIsland(x, y) || f.sdfAt(x, y) < 50 || f.slopeAt(x, y) > 0.2) continue;
      if (f.heightAt(x, y) < WATER_Y + 3.2 || f.riverDist(x, y) < riverCore + 40 * mapK) continue;
      if (!this.free(x, y, 70)) continue;
      const s = 0.9 + this.rnd() * 0.5;
      this.push(cypresses, x, y, s);
      const a = this.rnd() * TAU;
      const px = x + Math.cos(a) * 16;
      const py = y + Math.sin(a) * 16;
      if (f.slopeAt(px, py) < 0.18) this.push(cypresses, px, py, s * 0.85);
    }

    const mat = kit.vertexToon();
    this.instanced(this.build(this.balustradeBits()), mat, rails, false);
    this.instanced(this.build(this.hedgeBits()), mat, hedges, true, ['#ffffff', '#d4e4cc']);
    this.instanced(this.build(this.cypressBits()), mat, cypresses, true, ['#ffffff', '#cfe0c6']);
    this.instanced(this.build(this.boxBits()), mat, boxes, false, ['#ffffff', '#d4e4cc']);
    (['pawn', 'rook', 'bishop', 'knight'] as const).forEach((k, i) =>
      this.instanced(this.build(topiaryBits(k)), mat, topiary[i], true),
    );
    const lamp = this.lampBits();
    this.instanced(this.build(lamp.solid), mat, lamps, true);
    this.instanced(this.build(lamp.glow), kit.basic('#ffd88a'), lamps, false);
  }

  dispose(): void {
    for (const o of this.owned) o.dispose();
    this.owned.length = 0;
  }
}
