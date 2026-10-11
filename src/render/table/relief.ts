import type { Content } from '../../sim';
import { buildTerrain, shapeDist } from '../../sim';

/**
 * Board relief (view only; the sim stays flat). Lanes are the floor (y = 0); the chessboard
 * squares between them stand up as raised blocks in a two-height checker; the bases are two-tier
 * daises; jungle courts are stepped pits; every Bastion stands on a raised square tile. Units
 * sample the same heights so they walk up the ramps and down into the courts.
 */

/** Heights in world units. */
export const RELIEF = {
  /** Raised squares (checker of two heights). */
  blockLow: 32,
  blockHigh: 42,
  /** Bevel from the walkable edge up to the block top. */
  bevel: 46,
  /** Base dais: outer and inner tier. */
  baseOuter: 22,
  baseInner: 42,
  /** Court pit: outer step and floor. */
  courtStep: -9,
  courtFloor: -18,
  /** Bastion tile. */
  tile: 14,
  tileHalf: 62,
} as const;

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Point at fraction `t` of a polyline's length. */
export function lanePointAt(pts: readonly (readonly number[])[], t: number): [number, number] {
  let total = 0;
  for (let i = 1; i < pts.length; i++)
    total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let left = Math.min(1, Math.max(0, t)) * total;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const len = Math.hypot(bx - ax, by - ay);
    if (left <= len || i === pts.length - 1) {
      const f = len === 0 ? 0 : Math.min(1, left / len);
      return [ax + (bx - ax) * f, ay + (by - ay) * f];
    }
    left -= len;
  }
  return [pts[0][0], pts[0][1]];
}

/** Every Bastion site on the map (sim coordinates), as the sim places them. */
export function bastionSites(content: Content): [number, number][] {
  const map = content.map;
  const out: [number, number][] = [];
  const { outer, inner } = map.towerFractions;
  for (const lane of Object.values(map.lanes))
    for (const t of [outer, inner, 1 - outer, 1 - inner]) out.push(lanePointAt(lane, t));
  return out;
}

/** A height grid over the board and its frame, sampled bilinearly. */
export class Relief {
  /** Grid cells per side, and the grid's half extent (world units, centred on the board). */
  readonly n: number;
  readonly extent: number;
  readonly cell: number;
  readonly h: Float32Array;
  private readonly half: number;

  constructor(content: Content, extent: number, n = 150) {
    const map = content.map;
    const half = map.size / 2;
    this.half = half;
    this.n = n;
    this.extent = extent;
    this.cell = (extent * 2) / n;
    const shapes = buildTerrain(map).shapes;
    const flat = shapes.filter((s) => s.kind !== 'base');
    const bases = Object.values(map.bases);
    const R = map.walk.base;
    const sq = map.size / 8;
    const tiles = bastionSites(content);
    const courts = map.slots.map((s) => ({ x: s.x, y: s.y, h: s.radius * 0.92 }));
    const H = new Float32Array((n + 1) * (n + 1));
    for (let j = 0; j <= n; j++)
      for (let i = 0; i <= n; i++) {
        const x = -extent + i * this.cell + half;
        const y = -extent + j * this.cell + half;
        H[j * (n + 1) + i] = this.sample(x, y, flat, bases, R, sq, tiles, courts, map.size);
      }
    this.h = H;
  }

  private sample(
    x: number,
    y: number,
    flat: ReturnType<typeof buildTerrain>['shapes'],
    bases: number[][],
    R: number,
    sq: number,
    tiles: [number, number][],
    courts: { x: number; y: number; h: number }[],
    size: number,
  ): number {
    // outside the board: the frame is flat
    const edge = Math.min(x, y, size - x, size - y);
    if (edge <= 0) return 0;
    // floor: the walkable heights (base dais, court pits, Bastion tiles)
    let dBase = Infinity;
    for (const [bx, by] of bases) dBase = Math.min(dBase, Math.hypot(x - bx, y - by));
    let floor =
      RELIEF.baseOuter * (1 - smooth(R + 4, R + 22, dBase)) +
      (RELIEF.baseInner - RELIEF.baseOuter) * (1 - smooth(R * 0.5, R * 0.5 + 18, dBase));
    for (const c of courts) {
      const cheb = Math.max(Math.abs(x - c.x), Math.abs(y - c.y));
      if (cheb > c.h + 20) continue;
      floor +=
        RELIEF.courtStep * (1 - smooth(c.h - 4, c.h + 14, cheb)) +
        (RELIEF.courtFloor - RELIEF.courtStep) * (1 - smooth(c.h * 0.58, c.h * 0.58 + 14, cheb));
    }
    for (const [tx, ty] of tiles) {
      const cheb = Math.max(Math.abs(x - tx), Math.abs(y - ty));
      if (cheb < RELIEF.tileHalf + 16)
        floor = Math.max(
          floor,
          RELIEF.tile * (1 - smooth(RELIEF.tileHalf, RELIEF.tileHalf + 14, cheb)),
        );
    }
    // blocks: everything off the walkable shapes rises into the square it belongs to
    let d = Infinity;
    for (const s of flat) {
      const v = shapeDist(s, x, y);
      if (v < d) d = v;
      if (d < 0) break;
    }
    if (dBase - R < d) d = dBase - R;
    for (const c of courts) {
      const v = Math.max(Math.abs(x - c.x), Math.abs(y - c.y)) - c.h - 10;
      if (v < d) d = v;
    }
    if (d <= 0) return floor;
    const i = Math.floor(x / sq);
    const j = Math.floor(y / sq);
    const top = (i + j) % 2 === 0 ? RELIEF.blockHigh : RELIEF.blockLow;
    const rise = smooth(0, RELIEF.bevel, d) * smooth(0, 26, edge);
    return Math.max(floor, floor + (top - floor) * rise);
  }

  /** Ground height at a world point (board centre = origin). */
  at(wx: number, wz: number): number {
    const n = this.n;
    const fx = (wx + this.extent) / this.cell;
    const fz = (wz + this.extent) / this.cell;
    if (fx < 0 || fz < 0 || fx >= n || fz >= n) return 0;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const w = n + 1;
    const H = this.h;
    const a = H[j * w + i];
    const b = H[j * w + i + 1];
    const c = H[(j + 1) * w + i];
    const d = H[(j + 1) * w + i + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  /** Ground height at a sim point. */
  atSim(x: number, y: number): number {
    return this.at(x - this.half, y - this.half);
  }
}
