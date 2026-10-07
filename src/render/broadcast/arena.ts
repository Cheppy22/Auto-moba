import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  SphereGeometry,
  Sprite,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import type { Content, Snapshot } from '../../sim';
import { PALETTE, teamColor } from '../theme';
import {
  type Bit,
  BRASS,
  hash,
  type Kit,
  LACQUER,
  PAPER,
  put,
  rand01,
  STONE,
  STONE_DARK,
} from './kit';
import { ofudaTexture, Scenery } from './scenery';
import { ISLAND_R, type TerrainField, TerrainView } from './terrain';
import { Veils } from './veil';
import { River } from './water';

const TAU = Math.PI * 2;
const WHITE = new Color('#ffffff');
const LANE_NAMES = ['top', 'mid', 'bot'];
const GATE_GAP = 0.2;
/** Seconds a freshly opened clearing's scenery takes to grow out of the ground. */
const SPROUT = 1.4;

const _m = new Matrix4();
const _q = new Quaternion();
const _swing = new Quaternion();
const _pos = new Vector3();
const _one = new Vector3(1, 1, 1);
const _up = new Vector3(0, 1, 0);
const _right = new Vector3(1, 0, 0);

type Pt = [number, number];
type Bag = { dispose(): void }[];

interface Port {
  lane: number;
  gx: number;
  gy: number;
  ex: number;
  ey: number;
  ang: number;
}

interface SlotView {
  key: string;
  group: Group;
  bag: Bag;
  spin: Mesh | null;
  dir: number;
  /** Time the clearing opened while being watched (for the sprout-in), else far in the past. */
  born: number;
  /** Ground height at the clearing's centre. */
  gy: number;
}

interface ShopView {
  id: string;
  ring: Mesh;
  lamp: Sprite;
}

function laneAt(lane: Pt[], t: number): Pt {
  let total = 0;
  const segs: number[] = [];
  for (let i = 1; i < lane.length; i++) {
    const d = Math.hypot(lane[i][0] - lane[i - 1][0], lane[i][1] - lane[i - 1][1]);
    segs.push(d);
    total += d;
  }
  let want = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < segs.length; i++) {
    if (want <= segs[i] || i === segs.length - 1) {
      const f = segs[i] === 0 ? 0 : Math.min(1, want / segs[i]);
      return [
        lane[i][0] + (lane[i + 1][0] - lane[i][0]) * f,
        lane[i][1] + (lane[i + 1][1] - lane[i][1]) * f,
      ];
    }
    want -= segs[i];
  }
  return lane[0];
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return [c, c.getContext('2d')!];
}

export class Arena {
  readonly group = new Group();
  readonly half: number;
  readonly terrain: TerrainView;
  readonly field: TerrainField;
  readonly scenery: Scenery;
  private lanes: Pt[][];
  private slotViews = new Map<string, SlotView>();
  private slotGroup = new Group();
  private shops: ShopView[] = [];
  private suggested = new Set<string>();
  private stars: Points;
  private motes: Points;
  private moteBase: Float32Array;
  private ofuda: InstancedMesh;
  private ofudaSpots: { x: number; y: number; z: number; yaw: number }[] = [];
  private rocks: { mesh: Mesh; base: Vector3; speed: number; spin: number }[] = [];
  private seals: Mesh[] = [];
  private river: River;
  private veils: Veils;
  private bag: Bag = [];

  constructor(
    private kit: Kit,
    private content: Content,
    shadows: boolean,
  ) {
    const size = content.map.size;
    this.half = size / 2;
    this.lanes = [content.map.lanes.top, content.map.lanes.mid, content.map.lanes.bot] as Pt[][];
    this.terrain = new TerrainView(kit, content, shadows);
    this.field = this.terrain.field;
    this.group.add(this.terrain.group);
    this.river = new River(this.field);
    this.group.add(this.river.group);
    this.scenery = new Scenery(kit, this.field, content, shadows);
    this.group.add(this.scenery.group);
    this.veils = new Veils(kit, this.field, content);
    this.group.add(this.veils.group);
    this.group.add(this.slotGroup);
    this.buildBases();
    this.buildShops();
    this.buildRim();
    this.ofuda = this.buildOfuda();
    this.buildRocks();
    this.stars = this.buildStars();
    const m = this.buildMotes();
    this.motes = m.points;
    this.moteBase = m.base;
  }

  /** Scene-space point for sim (x, y), standing on the terrain. */
  world(x: number, y: number): Vector3 {
    return new Vector3(x - this.half, this.field.heightAt(x, y), y - this.half);
  }

  private own<T extends { dispose(): void }>(x: T): T {
    this.bag.push(x);
    return x;
  }

  /* ------------------------------ slots ------------------------------ */

  private gate(slotId: string): { ports: Port[]; cx: number; cy: number; r: number } | null {
    const def = this.content.map.slots.find((s) => s.id === slotId);
    if (!def) return null;
    const ports = def.ports.map((pt) => {
      const lane = LANE_NAMES.indexOf(pt.lane);
      const [gx, gy] = laneAt(this.lanes[lane], pt.t);
      const ang = Math.atan2(gy - def.y, gx - def.x);
      return {
        lane,
        gx,
        gy,
        ex: def.x + Math.cos(ang) * def.radius,
        ey: def.y + Math.sin(ang) * def.radius,
        ang,
      };
    });
    return { ports, cx: def.x, cy: def.y, r: def.radius };
  }

  private paintSlot(
    biomeId: string | null,
    R: number,
    pal: { ground: string; accent: string; glow: string } | null,
  ): HTMLCanvasElement {
    const [c, g] = canvas(512);
    const k = 256 / (R * 1.3);
    const cx = 256;
    if (!pal) {
      // uncharted: a dim ink floor with a keyhole seal, half lost under the mist
      const gr = g.createRadialGradient(cx, cx, 0, cx, cx, R * k * 1.05);
      gr.addColorStop(0, 'rgba(30,22,52,0.72)');
      gr.addColorStop(0.85, 'rgba(22,16,38,0.66)');
      gr.addColorStop(1, 'rgba(22,16,38,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(cx, cx, R * k * 1.05, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(176,150,232,0.26)';
      g.lineWidth = 3;
      g.setLineDash([12, 18]);
      g.beginPath();
      g.arc(cx, cx, R * k * 0.92, 0, TAU);
      g.stroke();
      g.setLineDash([]);
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(176,150,232,0.2)';
      g.beginPath();
      g.arc(cx, cx, R * k * 0.5, 0, TAU);
      g.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + Math.PI / 8;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * R * k * 0.54, cx + Math.sin(a) * R * k * 0.54);
        g.lineTo(cx + Math.cos(a) * R * k * 0.86, cx + Math.sin(a) * R * k * 0.86);
        g.stroke();
      }
      const kr = R * k * 0.16;
      g.fillStyle = 'rgba(186,160,240,0.26)';
      g.beginPath();
      g.arc(cx, cx - kr * 0.5, kr, 0, TAU);
      g.moveTo(cx - kr * 0.55, cx - kr * 0.2);
      g.lineTo(cx + kr * 0.55, cx - kr * 0.2);
      g.lineTo(cx + kr * 0.9, cx + kr * 1.9);
      g.lineTo(cx - kr * 0.9, cx + kr * 1.9);
      g.closePath();
      g.fill();
      return c;
    }
    const gr = g.createRadialGradient(cx, cx, R * 0.1 * k, cx, cx, R * 1.3 * k);
    gr.addColorStop(0, pal.accent + 'aa');
    gr.addColorStop(0.6, pal.ground + 'cc');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 512, 512);
    g.save();
    g.beginPath();
    g.arc(cx, cx, R * 0.98 * k, 0, TAU);
    g.clip();
    let seed = hash(biomeId ?? '') + Math.round(R);
    const rnd = (): number => rand01(seed++);
    g.lineWidth = 2;
    if (biomeId === 'shrine') {
      for (let i = 1; i <= 5; i++) {
        g.strokeStyle = pal.glow + (i % 2 ? '3c' : '24');
        g.beginPath();
        g.arc(cx, cx, R * k * (0.2 + i * 0.16), 0, TAU);
        g.stroke();
      }
      g.fillStyle = pal.glow + '44';
      for (let i = 0; i < 12; i++) {
        const a = rnd() * TAU;
        const r = 0.2 + rnd() * 0.65;
        g.beginPath();
        g.ellipse(cx + Math.cos(a) * R * k * r, cx + Math.sin(a) * R * k * r, 12, 7, 0.3, 0, TAU);
        g.fill();
      }
    } else if (biomeId === 'foundry') {
      g.strokeStyle = pal.glow + '48';
      g.lineWidth = 4;
      g.setLineDash([14, 10]);
      for (const f of [0.45, 0.72]) {
        g.beginPath();
        g.arc(cx, cx, R * k * f, 0, TAU);
        g.stroke();
      }
      g.setLineDash([]);
      g.fillStyle = pal.glow + '88';
      for (let i = 0; i < 40; i++) {
        const a = rnd() * TAU;
        const r = rnd() * 0.9;
        const sz = 1.5 + rnd() * 3.5;
        g.fillRect(cx + Math.cos(a) * R * k * r, cx + Math.sin(a) * R * k * r, sz, sz);
      }
    } else if (biomeId === 'teaparty') {
      // a clock face on the ground, stopped at six, with tea rings and crumbs
      g.strokeStyle = pal.glow + '40';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(cx, cx, R * k * 0.8, 0, TAU);
      g.stroke();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        const f = i % 3 === 0 ? 0.68 : 0.74;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * R * k * f, cx + Math.sin(a) * R * k * f);
        g.lineTo(cx + Math.cos(a) * R * k * 0.8, cx + Math.sin(a) * R * k * 0.8);
        g.stroke();
      }
      g.lineWidth = 4;
      g.strokeStyle = pal.glow + '55';
      g.beginPath();
      g.moveTo(cx, cx - R * k * 0.5);
      g.lineTo(cx, cx);
      g.lineTo(cx, cx + R * k * 0.34);
      g.stroke();
      g.lineWidth = 2;
      for (let i = 0; i < 9; i++) {
        const a = rnd() * TAU;
        const r = 0.2 + rnd() * 0.65;
        g.strokeStyle = pal.glow + '30';
        g.beginPath();
        g.arc(cx + Math.cos(a) * R * k * r, cx + Math.sin(a) * R * k * r, 7 + rnd() * 5, 0, TAU);
        g.stroke();
      }
    } else if (biomeId === 'roses') {
      // fallen petals, painted red, on a faint diamond lattice
      g.strokeStyle = pal.glow + '24';
      g.lineWidth = 2;
      for (let i = -4; i <= 4; i++) {
        g.beginPath();
        g.moveTo(cx + i * R * k * 0.3 - R * k, cx - R * k);
        g.lineTo(cx + i * R * k * 0.3 + R * k, cx + R * k);
        g.moveTo(cx + i * R * k * 0.3 + R * k, cx - R * k);
        g.lineTo(cx + i * R * k * 0.3 - R * k, cx + R * k);
        g.stroke();
      }
      for (let i = 0; i < 46; i++) {
        const a = rnd() * TAU;
        const r = rnd() * 0.92;
        g.fillStyle = i % 5 === 0 ? pal.glow + '66' : pal.accent + '88';
        g.beginPath();
        g.ellipse(
          cx + Math.cos(a) * R * k * r,
          cx + Math.sin(a) * R * k * r,
          6 + rnd() * 3,
          3.4,
          rnd() * 3,
          0,
          TAU,
        );
        g.fill();
      }
    } else if (biomeId === 'station') {
      g.strokeStyle = pal.glow + '48';
      g.lineWidth = 3;
      for (const off of [-0.14, 0.14]) {
        g.beginPath();
        g.moveTo(cx - R * k, cx + off * R * k * 2);
        g.lineTo(cx + R * k, cx + off * R * k * 2);
        g.stroke();
      }
      g.strokeStyle = pal.glow + '30';
      for (let i = -6; i <= 6; i++) {
        g.beginPath();
        g.moveTo(cx + (i / 6) * R * k * 0.95, cx - R * k * 0.2);
        g.lineTo(cx + (i / 6) * R * k * 0.95, cx + R * k * 0.2);
        g.stroke();
      }
    } else {
      // unknown biome id: soft rings and specks in its own glow colour
      g.strokeStyle = pal.glow + '30';
      g.lineWidth = 2;
      for (const f of [0.35, 0.65]) {
        g.beginPath();
        g.arc(cx, cx, R * k * f, 0, TAU);
        g.stroke();
      }
      g.fillStyle = pal.glow + '50';
      for (let i = 0; i < 24; i++) {
        const a = rnd() * TAU;
        const r = 0.15 + rnd() * 0.75;
        g.fillRect(cx + Math.cos(a) * R * k * r, cx + Math.sin(a) * R * k * r, 3, 3);
      }
    }
    g.restore();
    g.strokeStyle = pal.glow + '99';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(cx, cx, R * k, 0, TAU);
    g.stroke();
    g.strokeStyle = pal.glow + '44';
    g.beginPath();
    g.arc(cx, cx, R * k * 1.12, 0, TAU);
    g.stroke();
    g.fillStyle = pal.glow + 'aa';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      g.beginPath();
      g.arc(cx + Math.cos(a) * R * k * 1.06, cx + Math.sin(a) * R * k * 1.06, 3.2, 0, TAU);
      g.fill();
    }
    return c;
  }

  /** Sets `bits` down at (x, z) turned by `yaw`, as if they had been built around the origin. */
  private placed(bits: Bit[], x: number, z: number, yaw: number, y = 0): Bit[] {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    return bits.map((b) => {
      const [bx, by, bz] = b.at ?? [0, 0, 0];
      const [rx, ry, rz] = b.rot ?? [0, 0, 0];
      return {
        ...b,
        at: [x + bx * c + bz * s, y + by, z - bx * s + bz * c],
        rot: [rx, ry + yaw, rz],
      };
    });
  }

  private toriiBits(trim: string): Bit[] {
    const bits: Bit[] = [
      { geo: new BoxGeometry(33, 2.4, 3.6), color: '#3a1a20', at: [0, 22.4, 0] },
      { geo: new BoxGeometry(25, 1.5, 2), color: '#3a1a20', at: [0, 17.4, 0] },
      { geo: new BoxGeometry(34.5, 0.9, 4), color: trim, at: [0, 24, 0] },
    ];
    for (const s of [-1, 1])
      bits.push({
        geo: new CylinderGeometry(1.35, 1.7, 21, 8),
        color: '#3a1a20',
        at: [s * 11.5, 10.5, 0],
      });
    return bits;
  }

  private propBits(
    kind: string,
    x: number,
    z: number,
    seed: number,
  ): { solid: Bit[]; glow: Bit[] } {
    const solid: Bit[] = [];
    const glow: Bit[] = [];
    const yaw = seed * 3;
    if (kind === 'lantern') {
      solid.push(
        { geo: new CylinderGeometry(3, 3.6, 2, 6), color: STONE, at: [0, 1, 0] },
        { geo: new CylinderGeometry(1, 1.3, 7, 6), color: STONE, at: [0, 5.5, 0] },
        { geo: new BoxGeometry(3.6, 3.2, 3.6), color: STONE_DARK, at: [0, 10.1, 0] },
        {
          geo: new ConeGeometry(3.8, 2.6, 4).rotateY(Math.PI / 4),
          color: STONE_DARK,
          at: [0, 13, 0],
        },
      );
      glow.push({ geo: new SphereGeometry(1.6, 8, 6), color: WHITE, at: [0, 10.1, 0] });
    } else if (kind === 'slag') {
      const s = 3 + (seed % 1) * 3;
      solid.push({
        geo: new SphereGeometry(1, 5, 4),
        color: '#2a1f1c',
        at: [0, s * 0.5, 0],
        scale: [s, s * 0.8, s],
      });
      glow.push({ geo: new SphereGeometry(1.1, 8, 6), color: WHITE, at: [0, s * 0.95, 0] });
    } else if (kind === 'teacup') {
      const china = seed % 2 > 1 ? BRASS : PAPER;
      solid.push(
        { geo: new CylinderGeometry(4.6, 4.2, 0.9, 12), color: china, at: [0, 0.45, 0] },
        {
          geo: new LatheGeometry(
            [
              [0.01, 0.9],
              [2.4, 0.9],
              [3.5, 3.4],
              [4, 6.6],
              [3.4, 6.7],
              [0.01, 5.4],
            ].map(([r, y]) => new Vector2(r, y)),
            12,
          ),
          color: china,
        },
        {
          geo: new TorusGeometry(1.6, 0.5, 5, 10),
          color: china,
          at: [4.3, 4.2, 0],
        },
      );
      glow.push({
        geo: new SphereGeometry(3, 10, 6),
        color: WHITE,
        at: [0, 5.8, 0],
        scale: [1, 0.12, 1],
      });
    } else if (kind === 'rose') {
      solid.push({
        geo: new SphereGeometry(1, 8, 6),
        color: '#22402c',
        at: [0, 3.4, 0],
        scale: [6.6, 4.4, 6.2],
      });
      for (let i = 0; i < 6; i++) {
        const a = seed * 5 + i * 1.9;
        solid.push({
          geo: new SphereGeometry(1.35, 7, 5),
          color: i % 4 === 3 ? '#f1e6d6' : '#c0404e',
          at: [Math.cos(a) * 4.6, 4.6 + (i % 3) * 1.3, Math.sin(a) * 4.2],
        });
      }
    } else if (kind === 'hoop') {
      solid.push(
        {
          geo: new TorusGeometry(5.2, 0.6, 6, 14, Math.PI),
          color: PAPER,
        },
        { geo: new SphereGeometry(1.7, 8, 6), color: '#c0404e', at: [7.5, 1.7, 5] },
      );
    } else {
      solid.push(
        { geo: new BoxGeometry(9, 1.2, 2.2), color: '#3a2f48', at: [0, 0.6, 0] },
        { geo: new CylinderGeometry(0.5, 0.5, 4, 5), color: '#2c2538', at: [0, 2, 0] },
      );
      glow.push({ geo: new SphereGeometry(1.2, 8, 6), color: WHITE, at: [0, 4, 0] });
    }
    const y = this.field.heightW(x, z);
    return {
      solid: this.placed(solid, x, z, yaw, y),
      glow: this.placed(glow, x, z, yaw, y),
    };
  }

  /** Slot-local angle pointing as far as possible from every gate. */
  private quietAngle(gaps: number[]): number {
    let best = 0;
    let bestD = -1;
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * TAU;
      let d = Infinity;
      for (const g of gaps) d = Math.min(d, Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))));
      if (d > bestD) {
        bestD = d;
        best = a;
      }
    }
    return best;
  }

  /** The long tea table (local +x runs along it), mismatched chairs, a teapot and a stopped clock. */
  private teaTableBits(R: number): { solid: Bit[]; glow: Bit[] } {
    const L = Math.min(R * 0.95, 82);
    const solid: Bit[] = [
      { geo: new BoxGeometry(L, 1.4, 9), color: '#4a3626', at: [0, 9, 0] },
      { geo: new BoxGeometry(L + 1.6, 0.6, 10.4), color: '#e9dfc9', at: [0, 9.9, 0] },
    ];
    for (const x of [-1, 1])
      for (const z of [-1, 1])
        solid.push({
          geo: new CylinderGeometry(0.9, 0.9, 9, 6),
          color: LACQUER,
          at: [x * (L / 2 - 3), 4.5, z * 3.4],
        });
    const glow: Bit[] = [];
    const cols = [BRASS, PAPER, '#b9a0e6', '#c0404e'];
    for (let i = -4; i <= 4; i++) {
      if (i === 0) continue;
      const x = (i / 4.6) * (L / 2);
      const z = i % 2 ? 2.6 : -2.6;
      solid.push(
        { geo: new CylinderGeometry(1.9, 1.7, 0.3, 8), color: cols[(i + 4) % 4], at: [x, 10.4, z] },
        { geo: new CylinderGeometry(1.3, 0.9, 1.6, 8), color: cols[(i + 4) % 4], at: [x, 11.3, z] },
      );
      glow.push({
        geo: new SphereGeometry(0.9, 6, 4),
        color: WHITE,
        at: [x, 12.2, z],
        scale: [1, 0.2, 1],
      });
    }
    solid.push(
      {
        geo: new SphereGeometry(2.8, 10, 8),
        color: '#e9dfc9',
        at: [0, 13.2, 0],
        scale: [1, 0.85, 1],
      },
      { geo: new ConeGeometry(0.7, 3.2, 5), color: '#e9dfc9', at: [3.1, 14, 0], rot: [0, 0, -1.2] },
      { geo: new SphereGeometry(0.6, 6, 4), color: BRASS, at: [0, 16, 0] },
    );
    for (const x of [-0.28, 0.26])
      for (const z of [-1, 1])
        solid.push(
          {
            geo: new BoxGeometry(5, 1, 5),
            color: x < 0 ? '#5a4430' : '#3a2f48',
            at: [x * L, 4.6, z * 8.6],
          },
          {
            geo: new BoxGeometry(5, 7, 0.8),
            color: x < 0 ? '#5a4430' : '#3a2f48',
            at: [x * L, 8.6, z * 10.8],
          },
        );
    const cx = L / 2 + 10;
    solid.push(
      { geo: new CylinderGeometry(1.1, 1.5, 13, 6), color: LACQUER, at: [cx, 6.5, 0] },
      {
        geo: new CylinderGeometry(7.4, 7.4, 1.6, 24).rotateX(Math.PI / 2),
        color: PAPER,
        at: [cx, 20, 0],
      },
      { geo: new TorusGeometry(7.4, 0.9, 6, 24), color: BRASS, at: [cx, 20, 0.2] },
      { geo: new BoxGeometry(0.7, 5.4, 0.5), color: '#0b0a0f', at: [cx, 22.7, 1.1] },
      { geo: new BoxGeometry(0.9, 3.8, 0.5), color: '#0b0a0f', at: [cx, 18.1, 1.1] },
      { geo: new SphereGeometry(0.9, 6, 4), color: BRASS, at: [cx, 20, 1.2] },
    );
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      solid.push({
        geo: new BoxGeometry(0.5, i % 3 ? 0.9 : 1.6, 0.4),
        color: '#0b0a0f',
        at: [cx + Math.sin(a) * 6, 20 + Math.cos(a) * 6, 1.1],
        rot: [0, 0, -a],
      });
    }
    return { solid, glow };
  }

  /** Croquet hoops in a row with a ball, for the rose garden. */
  private hoopBits(R: number): { solid: Bit[]; glow: Bit[] } {
    const solid: Bit[] = [];
    for (let i = -2; i <= 2; i++)
      solid.push({
        geo: new TorusGeometry(5.6, 0.65, 6, 14, Math.PI),
        color: i % 2 ? PAPER : BRASS,
        at: [i * R * 0.16, 0, (i % 2) * 4],
        rot: [0, i * 0.2, 0],
      });
    solid.push(
      { geo: new SphereGeometry(2, 8, 6), color: '#c0404e', at: [R * 0.05, 2, 9] },
      { geo: new CylinderGeometry(0.7, 0.9, 11, 6), color: PAPER, at: [-R * 0.38, 5.5, 2] },
      { geo: new SphereGeometry(1.2, 6, 4), color: '#c0404e', at: [-R * 0.38, 11.4, 2] },
    );
    return { solid, glow: [] };
  }

  private buildSlot(slot: Snapshot['slots'][number]): SlotView {
    const kit = this.kit;
    const group = new Group();
    const bag: Bag = [];
    const biome = slot.open && slot.biomeId ? this.content.biomeById.get(slot.biomeId) : undefined;
    const R = slot.radius;
    const center = this.world(slot.x, slot.y);
    this.terrain.setSlotArt(
      slot.id,
      this.paintSlot(biome ? slot.biomeId : null, R, biome?.palette ?? null),
    );
    const view: SlotView = {
      key: '',
      group,
      bag,
      spin: null,
      dir: slot.x > slot.y ? 1 : -1,
      born: -1e9,
      gy: center.y,
    };
    if (!biome) return view;

    const pal = biome.palette;
    const geo = this.gate(slot.id);
    const spin = kit.decalRing(pal.glow, R * 0.82, true, 0.6);
    spin.position.set(center.x, center.y + 0.7, center.z);
    group.add(spin);
    view.spin = spin;
    if (!geo) return view;

    const gaps = geo.ports.map((p) => p.ang);
    const inGap = (a: number): boolean =>
      gaps.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < GATE_GAP);
    const lampR = R * 1.04;

    const solid: Bit[] = [];
    const glow: Bit[] = [];
    for (const p of geo.ports) {
      const w = this.world(p.ex, p.ey);
      const gold = p.lane === 1;
      solid.push(
        ...this.placed(
          this.toriiBits(gold ? PALETTE.gold : BRASS),
          w.x,
          w.z,
          Math.atan2(Math.cos(p.ang), Math.sin(p.ang)),
          w.y,
        ),
      );
      const lamp = gold ? PALETTE.gold : pal.glow;
      for (const side of [-1, 1]) {
        const a = p.ang + side * GATE_GAP * 1.4;
        const lx = center.x + Math.cos(a) * lampR;
        const lz = center.z + Math.sin(a) * lampR;
        const pb = this.propBits('lantern', lx, lz, a);
        solid.push(...pb.solid);
        for (const g of pb.glow) glow.push({ ...g, color: pal.glow });
      }
      glow.push({ geo: new SphereGeometry(1.2, 8, 6), color: lamp, at: [w.x, w.y + 13, w.z] });
    }
    const kinds: Record<string, string> = {
      shrine: 'lantern',
      foundry: 'slag',
      station: 'tie',
      teaparty: 'teacup',
      roses: 'rose',
    };
    const kind = kinds[biome.id] ?? 'lantern';
    if (biome.id === 'teaparty' || biome.id === 'roses') {
      const a = this.quietAngle(geo.ports.map((p) => p.ang));
      const set = biome.id === 'teaparty' ? this.teaTableBits(R) : this.hoopBits(R);
      const dist = R * (biome.id === 'teaparty' ? 0.6 : 0.38);
      const yaw = Math.atan2(-Math.cos(a), -Math.sin(a));
      const sx = center.x + Math.cos(a) * dist;
      const sz = center.z + Math.sin(a) * dist;
      const sy = this.field.heightW(sx, sz);
      solid.push(...this.placed(set.solid, sx, sz, yaw, sy));
      for (const g of this.placed(set.glow, sx, sz, yaw, sy)) glow.push({ ...g, color: pal.glow });
    }
    for (let i = 0; i < 6; i++) {
      const a = rand01(hash(slot.id) * 3 + i) * TAU;
      if (inGap(a) || inGap(a + 0.15) || inGap(a - 0.15)) continue;
      const r = R * (0.72 + rand01(hash(slot.id) + i * 17) * 0.14);
      const bits = this.propBits(kind, center.x + Math.cos(a) * r, center.z + Math.sin(a) * r, a);
      solid.push(...bits.solid);
      for (const g of bits.glow) glow.push({ ...g, color: pal.glow });
    }
    const key = `slot:${slot.id}:${biome.id}`;
    group.add(kit.solid(key, () => solid, 0.9));
    group.add(kit.glowSolid(`${key}:glow`, () => glow));
    return view;
  }

  /** Rebuilds only the slots whose open state or biome changed. */
  sync(snap: Snapshot, time = 0): void {
    this.veils.sync(snap.slots, time);
    for (const slot of snap.slots) {
      const key = `${slot.open ? slot.biomeId : '-'}`;
      const cur = this.slotViews.get(slot.id);
      if (cur && cur.key === key) continue;
      if (cur) this.dropSlot(cur);
      const view = this.buildSlot(slot);
      view.key = key;
      if (cur && cur.key === '-' && slot.open) view.born = time;
      this.slotViews.set(slot.id, view);
      this.slotGroup.add(view.group);
    }
    this.terrain.flush();
    if (
      snap.suggest.length !== this.suggested.size ||
      snap.suggest.some((s) => !this.suggested.has(s))
    )
      this.suggested = new Set(snap.suggest);
  }

  private dropSlot(v: SlotView): void {
    this.slotGroup.remove(v.group);
    for (const d of v.bag) d.dispose();
  }

  /* ------------------------------ bases & shops ------------------------------ */

  /** Ink and lacquer checkerboard for the base platforms: low contrast so lanes still read. */
  private boardMaterial(): MeshBasicMaterial {
    const tex = this.kit.texture('base-board', 256, 256, (g) => {
      const n = 8;
      const t = 256 / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          g.fillStyle = (i + j) % 2 ? '#3b2a34' : '#15111c';
          g.fillRect(i * t, j * t, t, t);
        }
    });
    return this.own(new MeshBasicMaterial({ map: tex }));
  }

  private buildBases(): void {
    const kit = this.kit;
    for (const team of ['A', 'B'] as const) {
      const [bx, by] = this.content.map.bases[team];
      const c = this.world(bx, by);
      const col = teamColor(team);
      const g = new Group();
      g.position.set(c.x, c.y, c.z);
      g.add(
        kit.solid(
          `base:${team}`,
          () => {
            const bits: Bit[] = [];
            for (let i = 0; i < 6; i++) {
              const a = (i / 6) * TAU + Math.PI / 6;
              bits.push({
                geo: new CylinderGeometry(1.8, 2.3, 9, 6),
                color: STONE_DARK,
                at: [Math.cos(a) * 47, 4.5, Math.sin(a) * 47],
              });
            }
            return bits;
          },
          1.5,
        ),
      );
      g.add(
        kit.glowSolid(`base-flames:${team}`, () =>
          Array.from({ length: 6 }, (_, i) => {
            const a = (i / 6) * TAU + Math.PI / 6;
            return {
              geo: new SphereGeometry(2.1, 8, 6),
              color: col,
              at: [Math.cos(a) * 47, 10.5, Math.sin(a) * 47] as [number, number, number],
            };
          }),
        ),
      );
      const board = new Mesh(
        kit.geo('base-board', () => new CircleGeometry(35, 48).rotateX(-Math.PI / 2)),
        this.boardMaterial(),
      );
      board.position.y = 0.5;
      board.renderOrder = 5;
      g.add(board);
      const inlay = kit.decalRing(col, 44, false, 0.8);
      inlay.position.y = 0.6;
      const inlay2 = kit.decalRing(col, 31, true, 0.55);
      inlay2.position.y = 0.7;
      const pool = kit.glowDisc(col, 56, 0.4);
      pool.position.y = 0.4;
      g.add(inlay, inlay2, pool);
      this.seals.push(inlay2);
      this.group.add(g);
    }
  }

  private buildShops(): void {
    const kit = this.kit;
    for (const sh of this.content.map.shops) {
      const c = this.world(sh.x, sh.y);
      const g = new Group();
      g.position.set(c.x, c.y, c.z);
      const ring = kit.decalRing(PALETTE.gold, sh.radius, true, 0.38);
      ring.position.y = 0.8;
      g.add(
        ring,
        kit.solid(
          'shop',
          () => {
            const bits: Bit[] = [
              { geo: new CylinderGeometry(15, 16, 1.8, 8), color: '#3b3447', at: [0, 0.9, 0] },
              {
                geo: new ConeGeometry(21, 8, 4).rotateY(Math.PI / 4),
                color: '#7a2430',
                at: [0, 20.2, 0],
                scale: [1, 1, 0.8],
              },
              { geo: new BoxGeometry(18, 5, 5), color: '#4a3626', at: [0, 4.3, 5] },
              {
                geo: new BoxGeometry(4, 4, 4),
                color: '#5a4430',
                at: [-8, 3.8, -4],
                rot: [0, 0.4, 0],
              },
              {
                geo: new BoxGeometry(4, 4, 4),
                color: '#5a4430',
                at: [7, 3.8, -5],
                rot: [0, -0.3, 0],
              },
              { geo: new BoxGeometry(14, 5.5, 0.4), color: '#8a2a36', at: [0, 14, 8.2] },
            ];
            for (const x of [-1, 1])
              for (const z of [-1, 1])
                bits.push({
                  geo: new CylinderGeometry(0.8, 0.9, 15, 6),
                  color: LACQUER,
                  at: [x * 11, 9.3, z * 8],
                });
            return bits;
          },
          1,
        ),
        kit.glowSolid('shop-bulb', () => [
          { geo: new SphereGeometry(1.5, 8, 6), color: '#ffd88a', at: [0, 11.2, 7] },
        ]),
      );
      const lamp = put(g, kit.glowSprite('#ffd88a', 26, 0.7), 0, 11.2, 7);
      this.group.add(g);
      this.shops.push({ id: sh.id, ring, lamp });
    }
  }

  /* ------------------------------ rim, void, atmosphere ------------------------------ */

  private buildRim(): void {
    const kit = this.kit;
    const n = 12;
    const posts = new InstancedMesh(
      kit.geo('rim-post', () => new CylinderGeometry(1.8, 2.4, 19, 8).translate(0, 9.5, 0)),
      kit.toon('#2a1c24'),
      n,
    );
    const caps = new InstancedMesh(
      kit.geo('rim-cap', () => new SphereGeometry(2.8, 10, 8)),
      kit.toon(BRASS, BRASS, 0.4),
      n,
    );
    const hulls = new InstancedMesh(
      kit.hull(
        kit.geo('rim-post', () => new CylinderGeometry(1.8, 2.4, 19, 8).translate(0, 9.5, 0)),
      ),
      kit.ink(0.9),
      n,
    );
    const lamps = new InstancedMesh(
      kit.geo('rim-lamp', () => new SphereGeometry(2, 8, 6)),
      kit.basic('#ff6a6a'),
      n,
    );
    const m = new Matrix4();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + 0.13;
      const x = Math.cos(a) * (ISLAND_R - 56);
      const z = Math.sin(a) * (ISLAND_R - 56);
      const y = this.field.heightW(x, z);
      m.makeTranslation(x, y, z);
      posts.setMatrixAt(i, m);
      hulls.setMatrixAt(i, m);
      m.makeTranslation(x, y + 20, z);
      caps.setMatrixAt(i, m);
      this.ofudaSpots.push({ x: x * 0.985, y, z: z * 0.985, yaw: -a + Math.PI / 2 });
      m.makeTranslation(x * 0.985, y + 17.5, z * 0.985);
      lamps.setMatrixAt(i, m);
    }
    posts.castShadow = true;
    for (const im of [posts, caps, hulls, lamps]) {
      im.frustumCulled = false;
      this.group.add(im);
    }
  }

  private buildOfuda(): InstancedMesh {
    const tex = this.own(ofudaTexture());
    const geo = this.own(new PlaneGeometry(6, 13).translate(0, -6.5, 0));
    const mat = this.own(
      new MeshBasicMaterial({ map: tex, side: DoubleSide, transparent: true, alphaTest: 0.5 }),
    );
    const mesh = new InstancedMesh(geo, mat, this.ofudaSpots.length);
    mesh.frustumCulled = false;
    this.group.add(mesh);
    return mesh;
  }

  private buildRocks(): void {
    const kit = this.kit;
    const geo = kit.geo('float-rock', () => {
      const g = new IcosahedronGeometry(1, 1);
      g.computeVertexNormals();
      return g;
    });
    const stone = kit.toon('#2b2538');
    const crystal = kit.toon(PALETTE.spirit, PALETTE.spirit, 0.8);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + rand01(i + 90) * 0.5;
      const r = 780 + rand01(i + 5) * 170;
      const s = 10 + rand01(i + 33) * 22;
      const mesh = kit.inked(geo, stone, 1.4);
      mesh.scale.set(s, s * (0.7 + rand01(i) * 0.4), s * 0.9);
      mesh.rotation.set(rand01(i + 1) * 3, rand01(i + 2) * 3, 0);
      if (i % 3 === 0) {
        const cr = new Mesh(
          kit.geo('float-crystal', () => new ConeGeometry(0.22, 0.9, 5)),
          crystal,
        );
        cr.position.y = 0.9;
        mesh.add(cr);
      }
      const base = new Vector3(Math.cos(a) * r, -130 + rand01(i + 11) * 120, Math.sin(a) * r);
      mesh.position.copy(base);
      this.rocks.push({ mesh, base, speed: 0.2 + rand01(i + 3) * 0.3, spin: rand01(i + 7) * TAU });
      this.group.add(mesh);
    }
  }

  private buildStars(): Points {
    const n = 1500;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const c = new Color();
    for (let i = 0; i < n; i++) {
      const u = rand01(i * 3) * 2 - 1;
      const a = rand01(i * 3 + 1) * TAU;
      const s = Math.sqrt(1 - u * u);
      const r = 3200;
      pos.set([Math.cos(a) * s * r, u * r, Math.sin(a) * s * r], i * 3);
      const warm = rand01(i * 3 + 2);
      c.set(warm < 0.2 ? '#c8aaff' : warm < 0.35 ? '#f0d58a' : '#ece2cc').multiplyScalar(
        0.25 + rand01(i + 9) * 0.75,
      );
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = this.own(new BufferGeometry());
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new Float32BufferAttribute(col, 3));
    const pts = new Points(
      geo,
      this.own(
        new PointsMaterial({
          size: 2.2,
          sizeAttenuation: false,
          vertexColors: true,
          fog: false,
          depthWrite: false,
        }),
      ),
    );
    pts.frustumCulled = false;
    pts.renderOrder = -10;
    const haze = this.kit.glowSprite('#2a1f4a', 5200, 0.35);
    haze.position.set(-900, 700, -2600);
    pts.add(haze);
    const haze2 = this.kit.glowSprite('#3a1a2c', 4200, 0.25);
    haze2.position.set(1700, -500, 2000);
    pts.add(haze2);
    this.group.add(pts);
    return pts;
  }

  private buildMotes(): { points: Points; base: Float32Array } {
    const n = 110;
    const pos = new Float32Array(n * 3);
    const base = new Float32Array(n * 5);
    const col = new Float32Array(n * 3);
    const c = new Color();
    for (let i = 0; i < n; i++) {
      const a = rand01(i * 5) * TAU;
      const r = 80 + Math.sqrt(rand01(i * 5 + 1)) * 520;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      base.set(
        [x, rand01(i * 5 + 2) * 70, z, 5 + rand01(i * 5 + 3) * 9, this.field.surfaceW(x, z)],
        i * 5,
      );
      c.set(i % 3 === 0 ? '#f0d58a' : '#c4a8f0');
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = this.own(new BufferGeometry());
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new Float32BufferAttribute(col, 3));
    const points = new Points(
      geo,
      this.own(
        new PointsMaterial({
          map: this.kit.glowTexture(),
          size: 7,
          vertexColors: true,
          transparent: true,
          opacity: 0.8,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      ),
    );
    points.frustumCulled = false;
    this.group.add(points);
    return { points, base };
  }

  /* ------------------------------ per frame ------------------------------ */

  update(time: number, cam: Vector3): void {
    this.stars.position.copy(cam);
    const p = this.motes.geometry.getAttribute('position');
    const b = this.moteBase;
    for (let i = 0; i < p.count; i++) {
      const y = (b[i * 5 + 1] + time * b[i * 5 + 3]) % 70;
      p.setXYZ(
        i,
        b[i * 5] + Math.sin(time * 0.4 + i) * 6,
        b[i * 5 + 4] + y + 4,
        b[i * 5 + 2] + Math.cos(time * 0.35 + i * 1.7) * 6,
      );
    }
    p.needsUpdate = true;

    this.ofudaSpots.forEach((s, i) => {
      _q.setFromAxisAngle(_up, s.yaw + Math.sin(time * 1.3 + i * 2) * 0.3);
      _swing.setFromAxisAngle(_right, Math.sin(time * 1.7 + i) * 0.18);
      _q.multiply(_swing);
      _m.compose(_pos.set(s.x, s.y + 16.5, s.z), _q, _one);
      this.ofuda.setMatrixAt(i, _m);
    });
    this.ofuda.instanceMatrix.needsUpdate = true;

    for (const r of this.rocks) {
      r.mesh.position.y = r.base.y + Math.sin(time * r.speed + r.base.x) * 8;
      r.mesh.rotation.y = r.spin + time * 0.05;
    }
    for (const v of this.slotViews.values()) {
      if (v.spin) v.spin.rotation.y = (time / 6.6) * v.dir * TAU * 0.25;
      const k = Math.min(1, Math.max(0, (time - v.born) / SPROUT));
      if (k < 1 || v.group.scale.y !== 1) {
        const e = 1 - (1 - k) ** 3;
        v.group.scale.y = Math.max(0.02, e);
        v.group.position.y = v.gy * (1 - v.group.scale.y);
      }
    }
    this.river.update(time);
    this.veils.update(time);
    for (const s of this.seals) s.rotation.y = time * 0.2;
    for (const sh of this.shops) {
      const hot = this.suggested.has(sh.id);
      (sh.ring.material as MeshBasicMaterial).opacity = hot
        ? 0.75 + 0.25 * Math.sin(time * 5)
        : 0.38;
      sh.lamp.scale.setScalar(24 + Math.sin(time * 4 + sh.id.length) * 2.5 + (hot ? 8 : 0));
    }
  }

  dispose(): void {
    for (const v of this.slotViews.values()) this.dropSlot(v);
    this.slotViews.clear();
    for (const d of this.bag) d.dispose();
    this.bag = [];
    this.ofuda.dispose();
    this.terrain.dispose();
    this.scenery.dispose();
    this.river.dispose();
    this.veils.dispose();
  }
}
