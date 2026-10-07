import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
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
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  RepeatWrapping,
  ShadowMaterial,
  SphereGeometry,
  SRGBColorSpace,
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
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const WHITE = new Color('#ffffff');
export const GROUND_R = 612;
const LANE_TINT = ['#78bec8', '#e0a93e', '#c878aa'];
const LANE_NAMES = ['top', 'mid', 'bot'];
const GATE_GAP = 0.2;
const WALL_STEPS = 72;

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

function distToLanes(lanes: Pt[][], x: number, y: number): number {
  let best = Infinity;
  for (const lane of lanes) {
    for (let i = 1; i < lane.length; i++) {
      const [ax, ay] = lane[i - 1];
      const [bx, by] = lane[i];
      const dx = bx - ax;
      const dy = by - ay;
      const l2 = dx * dx + dy * dy;
      const f = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
      best = Math.min(best, Math.hypot(x - (ax + dx * f), y - (ay + dy * f)));
    }
  }
  return best;
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return [c, c.getContext('2d')!];
}

function texOf(c: HTMLCanvasElement, repeat = false): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapT = RepeatWrapping;
  return t;
}

export class Arena {
  readonly group = new Group();
  readonly half: number;
  private lanes: Pt[][];
  private slotViews = new Map<string, SlotView>();
  private slotGroup = new Group();
  private shops: ShopView[] = [];
  private suggested = new Set<string>();
  private stars: Points;
  private motes: Points;
  private moteBase: Float32Array;
  private ofuda: InstancedMesh;
  private ofudaSpots: { x: number; z: number; yaw: number }[] = [];
  private rocks: { mesh: Mesh; base: Vector3; speed: number; spin: number }[] = [];
  private seals: Mesh[] = [];
  private bag: Bag = [];

  constructor(
    private kit: Kit,
    private content: Content,
    shadows: boolean,
  ) {
    const size = content.map.size;
    this.half = size / 2;
    this.lanes = [content.map.lanes.top, content.map.lanes.mid, content.map.lanes.bot] as Pt[][];
    this.buildGround(shadows);
    this.buildLanes();
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

  world(x: number, y: number): Vector3 {
    return new Vector3(x - this.half, 0, y - this.half);
  }

  private own<T extends { dispose(): void }>(x: T): T {
    this.bag.push(x);
    return x;
  }

  /* ------------------------------ ground ------------------------------ */

  private paintGround(): CanvasTexture {
    const S = 2048;
    const [c, g] = canvas(S);
    const span = GROUND_R * 2;
    const m = this.half;
    const px = (v: number): number => ((v - m + GROUND_R) / span) * S;
    const k = S / span;
    g.save();
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2, 0, TAU);
    g.clip();
    const base = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    base.addColorStop(0, '#221e2f');
    base.addColorStop(0.6, '#1a1724');
    base.addColorStop(1, '#100f17');
    g.fillStyle = base;
    g.fillRect(0, 0, S, S);

    let seed = 424242;
    const rnd = (): number => rand01(seed++);
    g.lineCap = 'round';
    for (let i = 0; i < 1400; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const len = 40 + rnd() * 160;
      const a = -0.6 + rnd() * 0.4;
      g.strokeStyle = rnd() < 0.5 ? 'rgba(255,240,255,0.018)' : 'rgba(0,0,0,0.06)';
      g.lineWidth = 2 + rnd() * 8;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
    }
    for (let i = 0; i < 34; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const r = 90 + rnd() * 220;
      const blot = g.createRadialGradient(x, y, 0, x, y, r);
      const violet = rnd() < 0.5;
      blot.addColorStop(0, violet ? 'rgba(120,96,170,0.07)' : 'rgba(0,0,0,0.12)');
      blot.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = blot;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 2200; i++) {
      const x = m - GROUND_R + rnd() * span;
      const y = m - GROUND_R + rnd() * span;
      const kind = rnd();
      if (Math.hypot(x - m, y - m) > GROUND_R - 16 || distToLanes(this.lanes, x, y) < 38) continue;
      g.fillStyle =
        kind < 0.5
          ? 'rgba(104,128,96,0.2)'
          : kind < 0.95
            ? 'rgba(140,130,160,0.14)'
            : 'rgba(224,169,62,0.3)';
      g.beginPath();
      g.ellipse(
        px(x),
        px(y),
        (0.9 + rnd() * 1.6) * k * 2,
        (0.6 + rnd()) * k * 2,
        rnd() * 3,
        0,
        TAU,
      );
      g.fill();
    }

    const ring = (r: number, alpha: number, dash: number[] = [], w = 2): void => {
      g.beginPath();
      g.arc(S / 2, S / 2, r * k, 0, TAU);
      g.strokeStyle = `rgba(196,168,240,${alpha})`;
      g.lineWidth = w;
      g.setLineDash(dash.map((d) => d * k));
      g.stroke();
    };
    ring(470, 0.2, [], 2.5);
    ring(455, 0.14, [3, 9], 2);
    ring(300, 0.16, [], 2);
    ring(150, 0.2, [], 2.5);
    ring(62, 0.3, [], 2.5);
    g.setLineDash([]);
    for (const rot of [Math.PI / 4, Math.PI / 4 + Math.PI]) {
      g.beginPath();
      for (let i = 0; i <= 3; i++) {
        const a = rot + (i / 3) * TAU;
        const x = S / 2 + Math.cos(a) * 300 * k;
        const y = S / 2 + Math.sin(a) * 300 * k;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.strokeStyle = 'rgba(196,168,240,0.15)';
      g.lineWidth = 2;
      g.stroke();
    }
    g.fillStyle = 'rgba(196,168,240,0.3)';
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      g.beginPath();
      g.arc(
        S / 2 + Math.cos(a) * 470 * k,
        S / 2 + Math.sin(a) * 470 * k,
        (i % 6 === 0 ? 5 : 2.6) * 1.3,
        0,
        TAU,
      );
      g.fill();
    }
    g.restore();
    return texOf(c);
  }

  private buildGround(shadows: boolean): void {
    const kit = this.kit;
    const tex = this.own(this.paintGround());
    const top = new Mesh(
      this.own(new CircleGeometry(GROUND_R, 128).rotateX(-Math.PI / 2)),
      this.own(new MeshBasicMaterial({ map: tex })),
    );
    this.group.add(top);
    const side = new Mesh(
      this.own(new CylinderGeometry(GROUND_R, GROUND_R - 8, 26, 96, 1, true)),
      kit.toon('#1d1824'),
    );
    side.position.y = -13;
    this.group.add(side);

    const pts: Vector2[] = [];
    const prof: [number, number][] = [
      [GROUND_R - 8, -26],
      [GROUND_R - 40, -70],
      [520, -140],
      [430, -210],
      [330, -290],
      [220, -360],
      [120, -440],
      [40, -520],
      [0, -560],
    ];
    for (const [r, y] of prof) pts.push(new Vector2(r, y));
    const under = new LatheGeometry(pts, 36);
    const p = under.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const y = p.getY(i);
      const a = Math.atan2(z, x);
      const j = 0.9 + 0.06 * Math.sin(a * 7 + y * 0.03) + 0.04 * Math.sin(a * 13 - y * 0.05);
      p.setXYZ(i, x * j, y + Math.sin(a * 5 + y * 0.02) * 10, z * j);
    }
    const faceted = this.own(under.toNonIndexed());
    faceted.computeVertexNormals();
    this.group.add(new Mesh(faceted, kit.toon('#241f2e')));

    if (shadows) {
      const catcher = new Mesh(
        this.own(new CircleGeometry(GROUND_R, 64).rotateX(-Math.PI / 2)),
        this.own(new ShadowMaterial({ color: '#05030a', opacity: 0.5 })),
      );
      catcher.position.y = 1.2;
      catcher.receiveShadow = true;
      catcher.renderOrder = 10;
      this.group.add(catcher);
    }
  }

  /* ------------------------------ lanes ------------------------------ */

  private ribbon(pts: Pt[], width: number, y: number, vScale: number): BufferGeometry {
    const n = pts.length;
    const pos = new Float32Array(n * 6);
    const uv = new Float32Array(n * 4);
    const idx: number[] = [];
    let dist = 0;
    for (let i = 0; i < n; i++) {
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(n - 1, i + 1)];
      const cur = pts[i];
      let tx = next[0] - prev[0];
      let ty = next[1] - prev[1];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      let miter = 1;
      if (i > 0 && i < n - 1) {
        const ax = cur[0] - prev[0];
        const ay = cur[1] - prev[1];
        const al = Math.hypot(ax, ay) || 1;
        miter = 1 / Math.max(0.6, (ax / al) * tx + (ay / al) * ty);
      }
      if (i > 0) dist += Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
      const nx = -ty * (width / 2) * miter;
      const ny = tx * (width / 2) * miter;
      pos.set([cur[0] + nx - this.half, y, cur[1] + ny - this.half], i * 6);
      pos.set([cur[0] - nx - this.half, y, cur[1] - ny - this.half], i * 6 + 3);
      uv.set([0, dist / vScale, 1, dist / vScale], i * 4);
      if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }

  private decal(geo: BufferGeometry, mat: Material, order: number, bag: Bag): Mesh {
    bag.push(geo, mat);
    const m = new Mesh(geo, mat);
    m.renderOrder = order;
    return m;
  }

  private pathTexture(): CanvasTexture {
    const [c, g] = canvas(256);
    g.fillStyle = '#2b2639';
    g.fillRect(0, 0, 256, 256);
    let seed = 99;
    for (let i = 0; i < 260; i++) {
      const x = 30 + rand01(seed++) * 196;
      const y = rand01(seed++) * 256;
      g.fillStyle = rand01(seed++) < 0.5 ? 'rgba(160,148,180,0.18)' : 'rgba(10,8,16,0.28)';
      g.beginPath();
      g.ellipse(x, y, 4 + rand01(seed++) * 9, 3 + rand01(seed++) * 6, rand01(seed++) * 3, 0, TAU);
      g.fill();
    }
    const edge = g.createLinearGradient(0, 0, 256, 0);
    edge.addColorStop(0, 'rgba(8,6,12,0.85)');
    edge.addColorStop(0.14, 'rgba(8,6,12,0)');
    edge.addColorStop(0.86, 'rgba(8,6,12,0)');
    edge.addColorStop(1, 'rgba(8,6,12,0.85)');
    g.fillStyle = edge;
    g.fillRect(0, 0, 256, 256);
    g.globalCompositeOperation = 'destination-in';
    const a = g.createLinearGradient(0, 0, 256, 0);
    a.addColorStop(0, 'rgba(0,0,0,0)');
    a.addColorStop(0.08, 'rgba(0,0,0,1)');
    a.addColorStop(0.92, 'rgba(0,0,0,1)');
    a.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = a;
    g.fillRect(0, 0, 256, 256);
    return texOf(c, true);
  }

  private softTexture(): CanvasTexture {
    const [c, g] = canvas(64);
    const a = g.createLinearGradient(0, 0, 64, 0);
    a.addColorStop(0, 'rgba(255,255,255,0)');
    a.addColorStop(0.5, 'rgba(255,255,255,1)');
    a.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = a;
    g.fillRect(0, 0, 64, 64);
    return texOf(c);
  }

  private dashTexture(): CanvasTexture {
    const [c, g] = canvas(64);
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 64, 28);
    return texOf(c, true);
  }

  private buildLanes(): void {
    const path = this.own(this.pathTexture());
    const soft = this.own(this.softTexture());
    const dash = this.own(this.dashTexture());
    this.lanes.forEach((lane, li) => {
      const tint = LANE_TINT[li];
      const glow = this.decal(
        this.ribbon(lane, 50, 0.3, 50),
        new MeshBasicMaterial({
          map: soft,
          color: tint,
          transparent: true,
          opacity: 0.32,
          depthWrite: false,
          side: DoubleSide,
        }),
        1,
        this.bag,
      );
      const body = this.decal(
        this.ribbon(lane, 32, 0.45, 64),
        new MeshBasicMaterial({
          map: path,
          transparent: true,
          depthWrite: false,
          side: DoubleSide,
        }),
        2,
        this.bag,
      );
      const line = this.decal(
        this.ribbon(lane, 1.8, 0.6, 28),
        new MeshBasicMaterial({
          map: dash,
          color: tint,
          transparent: true,
          opacity: 0.8,
          depthWrite: false,
          side: DoubleSide,
        }),
        3,
        this.bag,
      );
      this.group.add(glow, body, line);
    });
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
  ): CanvasTexture {
    const [c, g] = canvas(512);
    const k = 256 / (R * 1.3);
    const cx = 256;
    if (!pal) {
      g.fillStyle = 'rgba(10,8,16,0.85)';
      g.beginPath();
      g.arc(cx, cx, R * k, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(196,168,240,0.3)';
      g.lineWidth = 3;
      g.setLineDash([12, 18]);
      g.stroke();
      return texOf(c);
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
    } else {
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
    return texOf(c);
  }

  /** Sets `bits` down at (x, z) turned by `yaw`, as if they had been built around the origin. */
  private placed(bits: Bit[], x: number, z: number, yaw: number): Bit[] {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    return bits.map((b) => {
      const [bx, by, bz] = b.at ?? [0, 0, 0];
      const [rx, ry, rz] = b.rot ?? [0, 0, 0];
      return {
        ...b,
        at: [x + bx * c + bz * s, by, z - bx * s + bz * c],
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
    } else {
      solid.push(
        { geo: new BoxGeometry(9, 1.2, 2.2), color: '#3a2f48', at: [0, 0.6, 0] },
        { geo: new CylinderGeometry(0.5, 0.5, 4, 5), color: '#2c2538', at: [0, 2, 0] },
      );
      glow.push({ geo: new SphereGeometry(1.2, 8, 6), color: WHITE, at: [0, 4, 0] });
    }
    return { solid: this.placed(solid, x, z, yaw), glow: this.placed(glow, x, z, yaw) };
  }

  private buildSlot(slot: Snapshot['slots'][number]): SlotView {
    const kit = this.kit;
    const group = new Group();
    const bag: Bag = [];
    const biome = slot.open && slot.biomeId ? this.content.biomeById.get(slot.biomeId) : undefined;
    const R = slot.radius;
    const center = this.world(slot.x, slot.y);
    const art = this.paintSlot(biome ? slot.biomeId : null, R, biome?.palette ?? null);
    bag.push(art);
    const floor = this.decal(
      new CircleGeometry(R * 1.3, 64).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ map: art, transparent: true, depthWrite: false }),
      1,
      bag,
    );
    floor.position.set(center.x, 0.2, center.z);
    group.add(floor);
    const view: SlotView = { key: '', group, bag, spin: null, dir: slot.x > slot.y ? 1 : -1 };
    if (!biome) return view;

    const pal = biome.palette;
    const geo = this.gate(slot.id);
    const spin = kit.decalRing(pal.glow, R * 0.82, true, 0.6);
    spin.position.set(center.x, 0.7, center.z);
    group.add(spin);
    view.spin = spin;
    if (!geo) return view;

    const gaps = geo.ports.map((p) => p.ang);
    const inGap = (a: number): boolean =>
      gaps.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < GATE_GAP);
    const wallR = R * 1.04;
    const spots: number[] = [];
    for (let i = 0; i < WALL_STEPS; i++) {
      const a = ((i + 0.5) / WALL_STEPS) * TAU;
      if (!inGap(a)) spots.push(a);
    }
    const len = ((TAU * wallR) / WALL_STEPS) * 1.06;
    const wallGeo = kit.geo('wall', () => new BoxGeometry(1, 1, 1));
    const walls = new InstancedMesh(
      wallGeo,
      kit.toon(new Color(pal.ground).lerp(new Color(STONE), 0.55).multiplyScalar(0.9)),
      spots.length,
    );
    const caps = new InstancedMesh(wallGeo, kit.basic(pal.accent), spots.length);
    const hulls = new InstancedMesh(kit.hull(wallGeo), kit.ink(0.8), spots.length);
    const mat = new Matrix4();
    const q = new Quaternion();
    const yAxis = new Vector3(0, 1, 0);
    spots.forEach((a, i) => {
      const h = 4.6 + rand01(hash(slot.id) + i) * 2.4;
      q.setFromAxisAngle(yAxis, -a + Math.PI / 2);
      const p = new Vector3(center.x + Math.cos(a) * wallR, h / 2, center.z + Math.sin(a) * wallR);
      mat.compose(p, q, new Vector3(len, h, 4.4));
      walls.setMatrixAt(i, mat);
      hulls.setMatrixAt(i, mat);
      p.y = h + 0.4;
      mat.compose(p, q, new Vector3(len * 0.98, 0.8, 5));
      caps.setMatrixAt(i, mat);
    });
    walls.castShadow = true;
    for (const im of [walls, caps, hulls]) {
      im.frustumCulled = false;
      group.add(im);
    }
    bag.push(walls, caps, hulls);

    const solid: Bit[] = [];
    const glow: Bit[] = [];
    const trails: Pt[][] = [];
    for (const p of geo.ports) {
      trails.push([
        [p.gx, p.gy],
        [p.ex, p.ey],
      ]);
      const w = this.world(p.ex, p.ey);
      const gold = p.lane === 1;
      solid.push(
        ...this.placed(
          this.toriiBits(gold ? PALETTE.gold : BRASS),
          w.x,
          w.z,
          Math.atan2(Math.cos(p.ang), Math.sin(p.ang)),
        ),
      );
      const lamp = gold ? PALETTE.gold : pal.glow;
      for (const side of [-1, 1]) {
        const a = p.ang + side * GATE_GAP;
        glow.push({
          geo: new SphereGeometry(1.8, 8, 6),
          color: pal.glow,
          at: [center.x + Math.cos(a) * wallR, 8.8, center.z + Math.sin(a) * wallR],
        });
      }
      glow.push({ geo: new SphereGeometry(1.2, 8, 6), color: lamp, at: [w.x, 13, w.z] });
    }
    const kind = biome.id === 'shrine' ? 'lantern' : biome.id === 'foundry' ? 'slag' : 'tie';
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
    const trail = this.decal(
      mergeGeometries(trails.map((t) => this.ribbon(t, 11, 0.5, 14)))!,
      new MeshBasicMaterial({
        color: '#30291f',
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        side: DoubleSide,
      }),
      3,
      bag,
    );
    group.add(trail);
    return view;
  }

  /** Rebuilds only the slots whose open state or biome changed. */
  sync(snap: Snapshot): void {
    for (const slot of snap.slots) {
      const key = `${slot.open ? slot.biomeId : '-'}`;
      const cur = this.slotViews.get(slot.id);
      if (cur && cur.key === key) continue;
      if (cur) this.dropSlot(cur);
      const view = this.buildSlot(slot);
      view.key = key;
      this.slotViews.set(slot.id, view);
      this.slotGroup.add(view.group);
    }
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

  private buildBases(): void {
    const kit = this.kit;
    for (const team of ['A', 'B'] as const) {
      const [bx, by] = this.content.map.bases[team];
      const c = this.world(bx, by);
      const col = teamColor(team);
      const g = new Group();
      g.position.set(c.x, 0, c.z);
      g.add(
        kit.solid(
          `base:${team}`,
          () => {
            const bits: Bit[] = [
              { geo: new CylinderGeometry(50, 54, 4.4, 6), color: '#2c2838', at: [0, 2.2, 0] },
              { geo: new CylinderGeometry(40, 44, 2, 6), color: '#38334a', at: [0, 5.4, 0] },
            ];
            for (let i = 0; i < 6; i++) {
              const a = (i / 6) * TAU + Math.PI / 6;
              bits.push({
                geo: new CylinderGeometry(1.8, 2.3, 9, 6),
                color: STONE_DARK,
                at: [Math.cos(a) * 47, 8.9, Math.sin(a) * 47],
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
              at: [Math.cos(a) * 47, 15, Math.sin(a) * 47] as [number, number, number],
            };
          }),
        ),
      );
      const inlay = kit.decalRing(col, 44, false, 0.8);
      inlay.position.y = 6.6;
      const inlay2 = kit.decalRing(col, 31, true, 0.55);
      inlay2.position.y = 6.7;
      const pool = kit.glowDisc(col, 96, 0.4);
      pool.position.y = 0.7;
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
      g.position.set(c.x, 0, c.z);
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
      const trails: Pt[][] = [];
      for (const p of sh.ports) {
        const lane = this.lanes[LANE_NAMES.indexOf(p.lane)];
        const [lx, ly] = laneAt(lane, p.t);
        const d = Math.hypot(lx - sh.x, ly - sh.y) || 1;
        trails.push([
          [lx, ly],
          [sh.x + ((lx - sh.x) / d) * sh.radius * 0.5, sh.y + ((ly - sh.y) / d) * sh.radius * 0.5],
        ]);
      }
      this.group.add(
        this.decal(
          mergeGeometries(trails.map((t) => this.ribbon(t, 9, 0.5, 14)))!,
          new MeshBasicMaterial({
            color: '#30291f',
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
            side: DoubleSide,
          }),
          3,
          this.bag,
        ),
      );
    }
  }

  /* ------------------------------ rim, void, atmosphere ------------------------------ */

  private buildRim(): void {
    const kit = this.kit;
    const rim = new Mesh(
      this.own(new TorusGeometry(GROUND_R, 2, 8, 160).rotateX(Math.PI / 2)),
      this.own(new MeshBasicMaterial({ color: BRASS })),
    );
    rim.position.y = 0.5;
    this.group.add(rim);
    const inner = new Mesh(
      this.own(new TorusGeometry(GROUND_R - 15, 1, 6, 160).rotateX(Math.PI / 2)),
      this.own(new MeshBasicMaterial({ color: BRASS, transparent: true, opacity: 0.35 })),
    );
    inner.position.y = 0.4;
    this.group.add(inner);
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
      const x = Math.cos(a) * (GROUND_R - 8);
      const z = Math.sin(a) * (GROUND_R - 8);
      m.makeTranslation(x, 0, z);
      posts.setMatrixAt(i, m);
      hulls.setMatrixAt(i, m);
      m.makeTranslation(x, 20, z);
      caps.setMatrixAt(i, m);
      this.ofudaSpots.push({ x: x * 0.985, z: z * 0.985, yaw: -a + Math.PI / 2 });
      m.makeTranslation(x * 0.985, 17.5, z * 0.985);
      lamps.setMatrixAt(i, m);
    }
    posts.castShadow = true;
    for (const im of [posts, caps, hulls, lamps]) {
      im.frustumCulled = false;
      this.group.add(im);
    }
  }

  private buildOfuda(): InstancedMesh {
    const [c, g] = canvas(128);
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
    const tex = this.own(texOf(c));
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
      const r = 680 + rand01(i + 5) * 160;
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
    const base = new Float32Array(n * 4);
    const col = new Float32Array(n * 3);
    const c = new Color();
    for (let i = 0; i < n; i++) {
      const a = rand01(i * 5) * TAU;
      const r = 80 + Math.sqrt(rand01(i * 5 + 1)) * 520;
      base.set(
        [Math.cos(a) * r, rand01(i * 5 + 2) * 110, Math.sin(a) * r, 5 + rand01(i * 5 + 3) * 9],
        i * 4,
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
      const y = (b[i * 4 + 1] + time * b[i * 4 + 3]) % 110;
      p.setXYZ(
        i,
        b[i * 4] + Math.sin(time * 0.4 + i) * 6,
        y + 2,
        b[i * 4 + 2] + Math.cos(time * 0.35 + i * 1.7) * 6,
      );
    }
    p.needsUpdate = true;

    this.ofudaSpots.forEach((s, i) => {
      _q.setFromAxisAngle(_up, s.yaw + Math.sin(time * 1.3 + i * 2) * 0.3);
      _swing.setFromAxisAngle(_right, Math.sin(time * 1.7 + i) * 0.18);
      _q.multiply(_swing);
      _m.compose(_pos.set(s.x, 16.5, s.z), _q, _one);
      this.ofuda.setMatrixAt(i, _m);
    });
    this.ofuda.instanceMatrix.needsUpdate = true;

    for (const r of this.rocks) {
      r.mesh.position.y = r.base.y + Math.sin(time * r.speed + r.base.x) * 8;
      r.mesh.rotation.y = r.spin + time * 0.05;
    }
    for (const v of this.slotViews.values())
      if (v.spin) v.spin.rotation.y = (time / 6.6) * v.dir * TAU * 0.25;
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
  }
}
