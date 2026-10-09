import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  Quaternion,
  SphereGeometry,
  Sprite,
  Vector2,
  Vector3,
} from 'three';
import { type Content, shapeDist, type Snapshot } from '../../sim';
import { PALETTE, teamColor } from '../theme';
import { type Bit, BRASS, hash, type Kit, put, rand01 } from './kit';
import { Scenery } from './scenery';
import { type TerrainField, TerrainView } from './terrain';
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

  /**
   * A clearing's floor: a sunken court laid in the board's own squares (so the grid carries on
   * across it), a shaded rim, and a low stone wall with a gap at each gate path. Open courts take
   * a hint of their biome; sealed ones are dim and plain under the mist.
   */
  private paintCourt(
    slot: Snapshot['slots'][number],
    pal: { ground: string; accent: string; glow: string } | null,
    gaps: number[],
  ): HTMLCanvasElement {
    const [c, g] = canvas(512);
    const pad = this.content.map.walk.slotPad;
    const Rw = slot.radius + pad;
    const k = 256 / (slot.radius * 1.3);
    const cx = 256;
    const TILE = this.field.ws.tile;
    const mix = (a: string, b: string, t: number): string =>
      new Color(a).lerp(new Color(b), t).getStyle();
    const light = pal ? mix('#d2c6a2', pal.glow, 0.06) : '#aaa391';
    const dark = pal ? mix('#4d424a', pal.accent, 0.07) : '#5d5860';
    g.save();
    g.beginPath();
    g.arc(cx, cx, Rw * k - 1, 0, TAU);
    g.clip();
    const x0 = slot.x - cx / k;
    const y0 = slot.y - cx / k;
    const x1 = slot.x + cx / k;
    const y1 = slot.y + cx / k;
    for (let j = Math.floor(y0 / TILE); j * TILE < y1; j++)
      for (let i = Math.floor(x0 / TILE); i * TILE < x1; i++) {
        g.fillStyle = (i + j) % 2 === 0 ? light : dark;
        g.fillRect((i * TILE - x0) * k, (j * TILE - y0) * k, TILE * k + 0.6, TILE * k + 0.6);
      }
    // a thin brass inlay ring, then the shade where the floor drops below the wall
    g.strokeStyle = 'rgba(201,163,90,0.7)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(cx, cx, Rw * k * 0.9, 0, TAU);
    g.stroke();
    const shade = g.createRadialGradient(cx, cx, Rw * k * 0.74, cx, cx, Rw * k);
    shade.addColorStop(0, 'rgba(24,16,8,0)');
    shade.addColorStop(1, 'rgba(24,16,8,0.5)');
    g.fillStyle = shade;
    g.fillRect(0, 0, 512, 512);
    if (!pal) {
      g.fillStyle = 'rgba(70,64,60,0.22)';
      g.fillRect(0, 0, 512, 512);
    }
    g.restore();
    // the wall's coping, broken at each gate path
    const open = Math.asin(Math.min(0.95, (this.content.map.walk.port - 3) / Rw));
    const sorted = [...gaps].sort((a, b) => a - b);
    const arcs: [number, number][] = [];
    if (!sorted.length) arcs.push([0, TAU]);
    else
      sorted.forEach((a, i) => {
        const next = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + TAU;
        arcs.push([a + open, next - open]);
      });
    g.lineCap = 'butt';
    for (const [w, col, r] of [
      [10, 'rgba(30,22,14,0.55)', Rw * k + 1],
      [7, '#cfc6ae', Rw * k],
      [2.5, '#efe8d6', Rw * k - 1.5],
    ] as const) {
      g.strokeStyle = col;
      g.lineWidth = w;
      for (const [s0, s1] of arcs) {
        g.beginPath();
        g.arc(cx, cx, r, s0, s1);
        g.stroke();
      }
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

  /** A marble lamp post and a flowering urn: the two things a court is dressed with. */
  private courtProp(
    kind: 'lamp' | 'urn',
    x: number,
    z: number,
    seed: number,
  ): { solid: Bit[]; glow: Bit[] } {
    const solid: Bit[] = [];
    const glow: Bit[] = [];
    const marble = '#e2dac6';
    if (kind === 'lamp') {
      solid.push(
        { geo: new CylinderGeometry(3, 3.6, 2, 6), color: '#cdc5b0', at: [0, 1, 0] },
        { geo: new CylinderGeometry(0.9, 1.3, 9, 6), color: '#35383a', at: [0, 6.5, 0] },
        { geo: new BoxGeometry(3.8, 3.4, 3.8), color: '#35383a', at: [0, 12.2, 0] },
        {
          geo: new ConeGeometry(3.4, 2.6, 4).rotateY(Math.PI / 4),
          color: '#cdc5b0',
          at: [0, 15.2, 0],
        },
      );
      glow.push({ geo: new SphereGeometry(1.6, 8, 6), color: WHITE, at: [0, 12.2, 0] });
    } else {
      solid.push(
        {
          geo: new LatheGeometry(
            [
              [0.01, 0],
              [3.2, 0],
              [3.4, 1.2],
              [2.2, 3.2],
              [3.6, 6.4],
              [4.2, 7.8],
              [3.4, 7.9],
              [0.01, 7],
            ].map(([r, y]) => new Vector2(r, y)),
            8,
          ),
          color: marble,
        },
        {
          geo: new SphereGeometry(1, 7, 5),
          color: '#3a6040',
          at: [0, 8.2, 0],
          scale: [4.2, 2.6, 4.2],
        },
      );
      glow.push({
        geo: new SphereGeometry(1.1, 6, 4),
        color: WHITE,
        at: [Math.cos(seed * 5) * 1.6, 10.2, Math.sin(seed * 5) * 1.6],
      });
    }
    const y = this.field.heightW(x, z);
    return {
      solid: this.placed(solid, x, z, seed * 3, y),
      glow: this.placed(glow, x, z, seed * 3, y),
    };
  }

  private buildSlot(slot: Snapshot['slots'][number]): SlotView {
    const kit = this.kit;
    const group = new Group();
    const bag: Bag = [];
    const biome = slot.open && slot.biomeId ? this.content.biomeById.get(slot.biomeId) : undefined;
    const R = slot.radius;
    const center = this.world(slot.x, slot.y);
    const geo = this.gate(slot.id);
    const gaps = geo ? geo.ports.map((p) => p.ang) : [];
    this.terrain.setSlotArt(slot.id, this.paintCourt(slot, biome?.palette ?? null, gaps));
    const view: SlotView = {
      key: '',
      group,
      bag,
      spin: null,
      dir: slot.x > slot.y ? 1 : -1,
      born: -1e9,
      gy: center.y,
    };
    if (!biome || !geo) return view;

    const pal = biome.palette;
    const inGap = (a: number): boolean =>
      gaps.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < GATE_GAP);
    const lampR = R * 1.04;
    const solid: Bit[] = [];
    const glow: Bit[] = [];
    // a lamp either side of every gate path
    for (const p of geo.ports)
      for (const side of [-1, 1]) {
        const a = p.ang + side * GATE_GAP * 1.4;
        const pb = this.courtProp(
          'lamp',
          center.x + Math.cos(a) * lampR,
          center.z + Math.sin(a) * lampR,
          a,
        );
        solid.push(...pb.solid);
        for (const g of pb.glow) glow.push({ ...g, color: pal.glow });
      }
    // urns round the rim, the only place the biome's colour shows
    for (let i = 0; i < 6; i++) {
      const a = rand01(hash(slot.id) * 3 + i) * TAU;
      if (inGap(a) || inGap(a + 0.15) || inGap(a - 0.15)) continue;
      const r = R * (0.78 + rand01(hash(slot.id) + i * 17) * 0.1);
      const pb = this.courtProp('urn', center.x + Math.cos(a) * r, center.z + Math.sin(a) * r, a);
      solid.push(...pb.solid);
      for (const g of pb.glow) glow.push({ ...g, color: pal.accent });
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
  }

  private dropSlot(v: SlotView): void {
    this.slotGroup.remove(v.group);
    for (const d of v.bag) d.dispose();
  }

  /* ------------------------------ bases & shops ------------------------------ */

  /** The throne dais floor: an 8x8 ivory and ebony board in the team's pair. */
  private boardMaterial(team: 'A' | 'B'): MeshBasicMaterial {
    const white = team === 'A';
    const tex = this.kit.texture(`base-board:${team}`, 256, 256, (g) => {
      const n = 8;
      const t = 256 / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          g.fillStyle =
            (i + j) % 2 ? (white ? '#4a3f50' : '#aeb8cb') : white ? '#efe6cf' : '#14111a';
          g.fillRect(i * t, j * t, t, t);
        }
    });
    return this.own(new MeshBasicMaterial({ map: tex }));
  }

  /** Angles (from the base outwards) at which each lane leaves the base. */
  private exits(bx: number, by: number): number[] {
    const out: number[] = [];
    const reach = this.content.map.walk.base * 1.05;
    for (const lane of this.lanes) {
      const first = Math.hypot(lane[0][0] - bx, lane[0][1] - by);
      const last = Math.hypot(lane[lane.length - 1][0] - bx, lane[lane.length - 1][1] - by);
      for (let t = 0; t <= 1; t += 0.01) {
        const [x, y] = laneAt(lane, first < last ? t : 1 - t);
        if (Math.hypot(x - bx, y - by) > reach) {
          out.push(Math.atan2(y - by, x - bx));
          break;
        }
      }
    }
    return out;
  }

  /**
   * Each base is a castle throne platform: a crenellated curtain wall round the dais with a stair
   * at every lane gate, round towers between the gates, and a banner in the team's colour on each.
   */
  private buildBases(): void {
    const kit = this.kit;
    const bk = this.field.ws.baseK;
    for (const team of ['A', 'B'] as const) {
      const [bx, by] = this.content.map.bases[team];
      const c = this.world(bx, by);
      const col = teamColor(team);
      const white = team === 'A';
      const g = new Group();
      g.position.set(c.x, c.y, c.z);
      const marble = white ? '#e2d8bd' : '#4a4540';
      const marbleDark = white ? '#b3a78a' : '#34302d';
      const metal = white ? PALETTE.whiteTrim : PALETTE.blackTrim;
      const exits = this.exits(bx, by);
      const nearGate = (a: number, w: number): boolean =>
        exits.some((e) => Math.abs(Math.atan2(Math.sin(a - e), Math.cos(a - e))) < w);
      g.add(
        kit.solid(
          `base:${team}`,
          () => {
            const bits: Bit[] = [];
            const R = 46 * bk;
            const N = 30;
            const seg = ((TAU * R) / N) * 1.04;
            // the curtain wall: stone, merlons on top, open at the lane gates
            for (let i = 0; i < N; i++) {
              const a = ((i + 0.5) / N) * TAU;
              if (nearGate(a, 0.27)) continue;
              const yaw = Math.atan2(-Math.cos(a), -Math.sin(a));
              const x = Math.cos(a) * R;
              const z = Math.sin(a) * R;
              const tx = -Math.sin(a);
              const tz = Math.cos(a);
              bits.push({
                geo: new BoxGeometry(seg, 7, 3.4),
                color: marble,
                at: [x, 3.5, z],
                rot: [0, yaw, 0],
              });
              for (const o of [-0.26, 0.26])
                bits.push({
                  geo: new BoxGeometry(seg * 0.3, 2.4, 3.8),
                  color: marbleDark,
                  at: [x + tx * seg * o, 8.2, z + tz * seg * o],
                  rot: [0, yaw, 0],
                });
            }
            // a stair of three treads at each gate, climbing from the lane to the dais
            for (const e of exits)
              for (let s = 0; s < 3; s++) {
                const r = R + 5 + s * 4.5;
                bits.push({
                  geo: new BoxGeometry(5, 3.2 - s * 1, 26 + s * 4),
                  color: s % 2 ? marble : marbleDark,
                  at: [Math.cos(e) * r, (3.2 - s * 1) / 2, Math.sin(e) * r],
                  rot: [0, -e, 0],
                });
              }
            // round towers at the corners, under a cone of the team's metal
            for (let i = 0; i < 6; i++) {
              const a = (i / 6) * TAU + Math.PI / 6;
              if (nearGate(a, 0.45)) continue;
              const x = Math.cos(a) * R;
              const z = Math.sin(a) * R;
              bits.push(
                { geo: new CylinderGeometry(5.6, 6.2, 17, 10), color: marble, at: [x, 8.5, z] },
                { geo: new CylinderGeometry(6.6, 6.6, 2, 10), color: marbleDark, at: [x, 17.6, z] },
                { geo: new ConeGeometry(6.4, 8, 10), color: metal, at: [x, 22.6, z] },
                { geo: new CylinderGeometry(0.28, 0.28, 11, 4), color: '#35383a', at: [x, 31, z] },
                { geo: new BoxGeometry(7, 4, 0.3), color: col, at: [x + 3.6, 33.2, z] },
              );
            }
            return bits;
          },
          1.4,
        ),
      );
      const board = new Mesh(
        kit.geo('base-board', () => new CircleGeometry(35, 48).rotateX(-Math.PI / 2)),
        this.boardMaterial(team),
      );
      board.position.y = 0.5;
      board.renderOrder = 5;
      g.add(board);
      const inlay = kit.decalRing(col, 44, false, 0.8);
      inlay.position.y = 0.6;
      const inlay2 = kit.decalRing(col, 31, true, 0.55);
      inlay2.position.y = 0.7;
      g.add(inlay, inlay2);
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
              { geo: new CylinderGeometry(15, 16, 1.8, 8), color: '#cdc5b0', at: [0, 0.9, 0] },
              {
                geo: new ConeGeometry(21, 8, 4).rotateY(Math.PI / 4),
                color: '#9c8a62',
                at: [0, 20.2, 0],
                scale: [1, 1, 0.8],
              },
              { geo: new BoxGeometry(18, 5, 5), color: '#6b5a44', at: [0, 4.3, 5] },
              {
                geo: new BoxGeometry(4, 4, 4),
                color: '#8a7a5e',
                at: [-8, 3.8, -4],
                rot: [0, 0.4, 0],
              },
              {
                geo: new BoxGeometry(4, 4, 4),
                color: '#8a7a5e',
                at: [7, 3.8, -5],
                rot: [0, -0.3, 0],
              },
              { geo: new BoxGeometry(14, 5.5, 0.4), color: '#c9a35a', at: [0, 14, 8.2] },
            ];
            for (const x of [-1, 1])
              for (const z of [-1, 1])
                bits.push({
                  geo: new CylinderGeometry(0.8, 0.9, 15, 6),
                  color: '#e2dac6',
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

  /* ------------------------------ void, atmosphere ------------------------------ */

  private buildRocks(): void {
    const kit = this.kit;
    const geo = kit.geo('float-rock', () => {
      const g = new IcosahedronGeometry(1, 1);
      g.computeVertexNormals();
      return g;
    });
    const stone = kit.toon('#3d342b');
    const crystal = kit.toon(BRASS, BRASS, 0.5);
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
      c.set(warm < 0.15 ? '#cfd6e6' : warm < 0.4 ? '#f0d58a' : '#ece2cc').multiplyScalar(
        0.2 + rand01(i + 9) * 0.6,
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
    const haze = this.kit.glowSprite('#4a3622', 5200, 0.3);
    haze.position.set(-900, 700, -2600);
    pts.add(haze);
    const haze2 = this.kit.glowSprite('#2e2a36', 4200, 0.22);
    haze2.position.set(1700, -500, 2000);
    pts.add(haze2);
    this.group.add(pts);
    return pts;
  }

  private buildMotes(): { points: Points; base: Float32Array } {
    // calm board: a few motes, and none drifting over a lane
    const n = 44;
    const pos = new Float32Array(n * 3);
    const base = new Float32Array(n * 5);
    const col = new Float32Array(n * 3);
    const c = new Color();
    const lanes = this.field.shapes.filter((sh) => sh.kind === 'lane');
    const h = this.field.half;
    for (let i = 0; i < n; i++) {
      let x = 0;
      let z = 0;
      for (let k = 0; k < 8; k++) {
        const a = rand01(i * 5 + k * 977) * TAU;
        const r = (80 + Math.sqrt(rand01(i * 5 + 1 + k * 977)) * 520) * this.field.ws.k;
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
        if (lanes.every((sh) => shapeDist(sh, x + h, z + h) > 24)) break;
      }
      base.set(
        [x, rand01(i * 5 + 2) * 70, z, 5 + rand01(i * 5 + 3) * 9, this.field.surfaceW(x, z)],
        i * 5,
      );
      c.set(i % 3 === 0 ? '#f0d58a' : '#f1e6c8');
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
          size: 6,
          vertexColors: true,
          transparent: true,
          opacity: 0.55,
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
    this.terrain.dispose();
    this.scenery.dispose();
    this.river.dispose();
    this.veils.dispose();
  }
}
