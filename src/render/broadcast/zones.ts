import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  RepeatWrapping,
  SphereGeometry,
} from 'three';
import type { Content, LaneId, Snapshot } from '../../sim';
import { PALETTE } from '../theme';
import { BRASS, type Kit } from './kit';

type Zone = Snapshot['zones'][number];
type Pt = readonly number[];

const LANE_IDS: LaneId[] = ['top', 'mid', 'bot'];
const SANCT = 4;
const WALLS = 4;
const OUTPOSTS = 4;
/** Seconds a zone's visuals take to rise in and sink out. */
const FADE_IN = 0.7;
const FADE_OUT = 0.9;
/** Half width of the Open File strip (scene units) and its spacing along the lane. */
const STRIP_HALF = 34;
const STRIP_STEP = 26;
const STRIP_REPEAT = 130;
const STONE_LIGHT = '#9b9588';
const STONE_MID = '#7d786d';
const IRON = '#2b2b33';

/** One pooled zone visual. Kind-specific meshes are optional; everything else is shared state. */
interface Slot {
  group: Group;
  /** Fade level 0..1; the slot is free again when it falls back to 0. */
  a: number;
  live: boolean;
  /** Frame stamp of the last snapshot zone that fed this slot. */
  seen: number;
  team: number;
  x: number;
  y: number;
  radius: number;
  /** Barricade: yaw that lays the wall along the sim's angle. */
  yaw: number;
  ring?: Mesh;
  disc?: Mesh;
  pillar?: Mesh;
  /** Barricade walls or Outpost banners, one per team. */
  body?: [Mesh, Mesh];
}

interface Strip {
  mesh: Mesh;
  mat: MeshBasicMaterial;
  a: number;
  on: boolean;
}

const ease = (t: number): number => t * t * (3 - 2 * t);

/**
 * Lasting board zones from the snapshot: the Sanctuary light, the Barricade wall across a gate or
 * bridge, the Outpost banner with its ring and the Open File strip along a lane. All meshes are
 * pooled and built once; each frame only moves and fades them.
 */
export class ZoneFx {
  readonly group = new Group();
  private readonly sanct: Slot[] = [];
  private readonly walls: Slot[] = [];
  private readonly posts: Slot[] = [];
  private readonly strips: (Strip | null)[] = [null, null, null];
  private stripTex: ReturnType<Kit['texture']> | null = null;
  private frame = 0;

  constructor(
    private readonly kit: Kit,
    private readonly lanes: Content['map']['lanes'],
  ) {
    const beam = kit.beamTexture();
    const pillarGeo = kit.geo('pillar', () =>
      new CylinderGeometry(1, 1, 1, 20, 1, true).translate(0, 0.5, 0),
    );
    const slot = (): Slot => {
      const group = new Group();
      group.visible = false;
      this.group.add(group);
      return { group, a: 0, live: false, seen: -1, team: 0, x: 0, y: 0, radius: 1, yaw: 0 };
    };
    for (let i = 0; i < SANCT; i++) {
      const s = slot();
      s.ring = kit.decalRing('#8ff0b4', 1, false, 0.9);
      s.disc = kit.glowDisc('#8ff0b4', 1, 0.3);
      s.pillar = new Mesh(
        pillarGeo,
        kit.own(
          new MeshBasicMaterial({
            map: beam,
            color: '#8ff0b4',
            transparent: true,
            opacity: 0.3,
            blending: AdditiveBlending,
            depthWrite: false,
            side: DoubleSide,
            fog: false,
          }),
        ),
      );
      s.group.add(s.ring, s.disc, s.pillar);
      this.sanct.push(s);
    }
    for (let i = 0; i < WALLS; i++) {
      const s = slot();
      s.body = [
        kit.solid('zone-wall-A', () => this.wallBits(PALETTE.teamA)),
        kit.solid('zone-wall-B', () => this.wallBits(PALETTE.teamB)),
      ];
      s.group.add(s.body[0], s.body[1]);
      this.walls.push(s);
    }
    for (let i = 0; i < OUTPOSTS; i++) {
      const s = slot();
      s.body = [
        kit.inkedGlow('zone-banner-A', () => this.bannerBits(PALETTE.teamA)),
        kit.inkedGlow('zone-banner-B', () => this.bannerBits(PALETTE.teamB)),
      ];
      s.ring = kit.styleRing(i % 2 ? PALETTE.teamB : PALETTE.teamA, 1, 0.9);
      s.group.add(s.ring, s.body[0], s.body[1]);
      this.posts.push(s);
    }
  }

  /** A stone plinth, iron bars with spear tips, end posts and a brass rail; long axis x, -1..1. */
  private wallBits(accent: string) {
    const bits: Parameters<Kit['merge']>[0] = [
      { geo: new BoxGeometry(2.04, 12, 11), color: STONE_MID, at: [0, 6, 0] },
      { geo: new BoxGeometry(2.06, 2.2, 12.6), color: STONE_LIGHT, at: [0, 13, 0] },
      { geo: new BoxGeometry(2, 1.4, 1.8), color: BRASS, at: [0, 27, 0] },
      { geo: new BoxGeometry(2, 1.2, 1.4), color: IRON, at: [0, 17.5, 0] },
    ];
    const bars = 15;
    for (let i = 0; i < bars; i++) {
      const x = -0.94 + (1.88 * i) / (bars - 1);
      bits.push(
        { geo: new BoxGeometry(0.012, 16, 1.5), color: IRON, at: [x, 22, 0] },
        {
          geo: new CylinderGeometry(0, 1.9, 5, 4).scale(0.012 / 1.9, 1, 1),
          color: IRON,
          at: [x, 32.5, 0],
        },
      );
    }
    for (const side of [-1, 1]) {
      bits.push(
        { geo: new BoxGeometry(0.08, 34, 9), color: STONE_LIGHT, at: [side * 0.98, 17, 0] },
        { geo: new BoxGeometry(0.1, 2.4, 10.6), color: BRASS, at: [side * 0.98, 35.2, 0] },
        { geo: new BoxGeometry(0.05, 8, 1.2), color: accent, at: [side * 0.98, 26, 5.4] },
      );
    }
    return bits;
  }

  /** A stone footing, a tall pole, a team-colour pennant and a brass finial. */
  private bannerBits(cloth: string) {
    return [
      {
        geo: new CylinderGeometry(7, 9, 5, 8),
        color: STONE_MID,
        at: [0, 2.5, 0] as [number, number, number],
      },
      {
        geo: new CylinderGeometry(2.2, 2.6, 78, 6),
        color: '#5a4630',
        at: [0, 44, 0] as [number, number, number],
      },
      {
        geo: new SphereGeometry(3.4, 8, 6),
        color: BRASS,
        at: [0, 85, 0] as [number, number, number],
      },
      { geo: new BoxGeometry(2, 3, 26), color: BRASS, at: [0, 76, 11] as [number, number, number] },
      {
        geo: new BoxGeometry(1.4, 34, 24),
        color: cloth,
        at: [0, 58, 12] as [number, number, number],
      },
      {
        geo: new BoxGeometry(1.8, 4, 24.6),
        color: BRASS,
        at: [0, 41.5, 12] as [number, number, number],
      },
      {
        geo: new BoxGeometry(1.8, 4, 24.6),
        color: BRASS,
        at: [0, 74, 12] as [number, number, number],
      },
    ];
  }

  /** A ribbon of two vertices per step along the lane, riding the ground. */
  private buildStrip(lane: LaneId, half: number, ground: (x: number, z: number) => number): Strip {
    const pts = this.lanes[lane] as readonly Pt[];
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    let dist = 0;
    let n = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const ax = pts[i][0];
      const ay = pts[i][1];
      const dx = pts[i + 1][0] - ax;
      const dy = pts[i + 1][1] - ay;
      const len = Math.hypot(dx, dy) || 1;
      const steps = Math.max(1, Math.round(len / STRIP_STEP));
      // the first point of each later segment repeats the last of the one before
      for (let k = i === 0 ? 0 : 1; k <= steps; k++) {
        const f = k / steps;
        const x = ax + dx * f - half;
        const z = ay + dy * f - half;
        const nx = -dy / len;
        const nz = dx / len;
        for (const side of [-1, 1]) {
          const px = x + nx * STRIP_HALF * side;
          const pz = z + nz * STRIP_HALF * side;
          pos.push(px, ground(px, pz) + 2.4, pz);
          uv.push((dist + len * f) / STRIP_REPEAT, side < 0 ? 0 : 1);
        }
        if (n > 0) {
          const a = (n - 1) * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
        n++;
      }
      dist += len;
    }
    const geo = this.kit.own(new BufferGeometry());
    geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    if (!this.stripTex) {
      const t = this.kit.texture('open-file-strip', 128, 64, (g) => {
        const across = g.createLinearGradient(0, 0, 0, 64);
        across.addColorStop(0, 'rgba(255,255,255,0)');
        across.addColorStop(0.5, 'rgba(255,255,255,0.55)');
        across.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = across;
        g.fillRect(0, 0, 128, 64);
        // chevrons that point down the lane, towards the enemy
        g.strokeStyle = 'rgba(255,255,255,0.95)';
        g.lineWidth = 7;
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.beginPath();
        g.moveTo(52, 18);
        g.lineTo(80, 32);
        g.lineTo(52, 46);
        g.stroke();
      });
      t.wrapS = RepeatWrapping;
      this.stripTex = t;
    }
    const mat = this.kit.own(
      new MeshBasicMaterial({
        map: this.stripTex,
        color: BRASS,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: DoubleSide,
        fog: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    const mesh = new Mesh(geo, mat);
    mesh.renderOrder = 6;
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.group.add(mesh);
    return { mesh, mat, a: 0, on: false };
  }

  /** The pooled slot already showing this zone, else a free one, else the faintest. */
  private claim(pool: Slot[], z: Zone, team: number): Slot {
    let free: Slot | null = null;
    let faint = pool[0];
    for (const s of pool) {
      if (s.live && s.seen !== this.frame && s.team === team && s.x === z.x && s.y === z.y)
        return s;
      if (!s.live && !free) free = s;
      if (s.a < faint.a) faint = s;
    }
    const s = free ?? faint;
    s.live = true;
    s.a = 0;
    s.team = team;
    s.x = z.x;
    s.y = z.y;
    return s;
  }

  /** Fade a slot towards shown (fed this frame) or gone, and report whether it is visible. */
  private fade(s: Slot, dt: number): boolean {
    const on = s.seen === this.frame;
    s.a = on ? Math.min(1, s.a + dt / FADE_IN) : Math.max(0, s.a - dt / FADE_OUT);
    if (!on && s.a === 0) s.live = false;
    s.group.visible = s.live && s.a > 0.001;
    return s.group.visible;
  }

  setZones(
    zones: readonly Zone[],
    half: number,
    ground: (x: number, z: number) => number,
    time: number,
    dt: number,
  ): void {
    this.frame++;
    for (const t of this.strips) if (t) t.on = false;
    for (const z of zones) {
      const kind = z.kind;
      const team = z.team === 'B' ? 1 : 0;
      if (kind === 'openFile') {
        const lane = z.lane ?? 'mid';
        const i = LANE_IDS.indexOf(lane);
        this.strips[i] ??= this.buildStrip(lane, half, ground);
        this.strips[i].on = true;
        continue;
      }
      const pool = kind === 'barricade' ? this.walls : kind === 'outpost' ? this.posts : this.sanct;
      const s = this.claim(pool, z, team);
      if (s.seen !== this.frame && s.a === 0) {
        if (kind === 'outpost') {
          (s.ring!.material as MeshBasicMaterial).color.set(team ? PALETTE.teamB : PALETTE.teamA);
        }
      }
      s.seen = this.frame;
      s.radius = z.radius;
      // the sim's angle runs along the wall in map space; the model's long axis is x
      s.yaw = -(z.angle ?? 0);
    }
    const pulse = 0.5 + 0.5 * Math.sin(time * 4);

    for (const s of this.sanct) {
      if (!this.fade(s, dt)) continue;
      const wx = s.x - half;
      const wz = s.y - half;
      const y = ground(wx, wz);
      const r = s.radius;
      const k = ease(s.a);
      s.ring!.position.set(wx, y + 1.5, wz);
      s.disc!.position.set(wx, y + 1.2, wz);
      s.pillar!.position.set(wx, y, wz);
      s.ring!.scale.set(r * 2, 1, r * 2);
      s.ring!.rotation.y = time * 0.5;
      s.disc!.scale.set(r * 2.1, 1, r * 2.1);
      s.pillar!.scale.set(r * 0.8, 44 * k, r * 0.8);
      (s.ring!.material as MeshBasicMaterial).opacity = 0.9 * k;
      (s.disc!.material as MeshBasicMaterial).opacity = (0.25 + 0.12 * pulse) * k;
    }

    for (const s of this.walls) {
      if (!this.fade(s, dt)) continue;
      const wx = s.x - half;
      const wz = s.y - half;
      const k = ease(s.a);
      s.group.position.set(wx, ground(wx, wz) - 1 - (1 - k) * 30, wz);
      s.group.rotation.y = s.yaw;
      s.group.scale.set(s.radius, 0.2 + 0.8 * k, 1);
      s.body![0].visible = s.team === 0;
      s.body![1].visible = s.team === 1;
    }

    for (const s of this.posts) {
      if (!this.fade(s, dt)) continue;
      const wx = s.x - half;
      const wz = s.y - half;
      const k = ease(s.a);
      const y = ground(wx, wz);
      s.group.position.set(wx, y, wz);
      const r = s.radius;
      // the ring's painted band ends at 121/128 of its half size, so it spans the zone radius
      const rr = r * 2.116;
      s.ring!.position.set(0, 1.6, 0);
      s.ring!.scale.set(rr, 1, rr);
      (s.ring!.material as MeshBasicMaterial).opacity = (0.7 + 0.2 * pulse) * k;
      for (let i = 0; i < 2; i++) {
        const b = s.body![i];
        b.visible = s.team === i;
        b.scale.set(1, 0.05 + 0.95 * k, 1);
        b.rotation.y = Math.sin(time * 1.6 + s.x) * 0.12;
      }
    }

    const tex = this.stripTex;
    if (tex) tex.offset.x = (tex.offset.x - dt * 0.7) % 1;
    for (const t of this.strips) {
      if (!t) continue;
      t.a = t.on ? Math.min(1, t.a + dt / FADE_IN) : Math.max(0, t.a - dt / FADE_OUT);
      t.mesh.visible = t.a > 0.001;
      t.mat.opacity = ease(t.a) * (0.5 + 0.15 * pulse);
    }
  }

  clear(): void {
    for (const pool of [this.sanct, this.walls, this.posts]) {
      for (const s of pool) {
        s.live = false;
        s.a = 0;
        s.seen = -1;
        s.group.visible = false;
      }
    }
    for (const t of this.strips) {
      if (!t) continue;
      t.on = false;
      t.a = 0;
      t.mesh.visible = false;
    }
  }
}
