import type { Content, MapDef, WalkShape } from '../../sim';
import { buildTerrain, shapeDist } from '../../sim';

/**
 * Board relief (view only; the sim stays flat). Lanes are the floor (y = 0); the chessboard
 * squares between them stand up as raised blocks in a two-height checker; the bases are two-tier
 * daises; jungle courts are stepped pits; every Bastion stands on a raised square tile. Units
 * sample the same heights so they walk up the ramps and down into the courts.
 */

/**
 * The relief's named areas (sim units, levels in world units, lanes = 0). Kept in this one module
 * so a later gameplay rule (high ground) can query the same data: `Relief.areaAt(x, y)` names the
 * area under a sim point and `AREA_HEIGHT` gives its level.
 */
export type ReliefArea =
  | 'frame'
  | 'lane'
  | 'block-low'
  | 'block-high'
  | 'dais'
  | 'dais-inner'
  | 'court-step'
  | 'court-floor'
  | 'bastion-tile';

/** Heights in world units. */
export const RELIEF = {
  /** Raised squares (checker of two heights). */
  blockLow: 32,
  blockHigh: 42,
  /** Bevel from the walkable edge up to the block top. */
  bevel: 22,
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

/** Level of each area (world units; the sim's flat ground is 0). */
export const AREA_HEIGHT: Record<ReliefArea, number> = {
  frame: 0,
  lane: 0,
  'block-low': RELIEF.blockLow,
  'block-high': RELIEF.blockHigh,
  dais: RELIEF.baseOuter,
  'dais-inner': RELIEF.baseInner,
  'court-step': RELIEF.courtStep,
  'court-floor': RELIEF.courtFloor,
  'bastion-tile': RELIEF.tile,
};

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

/**
 * A height grid over the board and its frame (world units, board centre = origin), sampled
 * bilinearly: `nx` × `nz` cells of side `cell` over the half extents `ex` × `ez`.
 */
export interface Ground {
  readonly nx: number;
  readonly nz: number;
  readonly ex: number;
  readonly ez: number;
  readonly cell: number;
  readonly h: Float32Array;
  /** Height of the frame around the board, the highest block top, and the base dais top. */
  readonly frameH: number;
  readonly peak: number;
  readonly dais: number;
  /** Ground height at a world point, and at a sim point. */
  at(wx: number, wz: number): number;
  atSim(x: number, y: number): number;
}

/** Bilinear sample of a grid of (nx + 1) × (nz + 1) heights; 0 outside it. */
function bilinear(g: Ground, wx: number, wz: number): number {
  const fx = (wx + g.ex) / g.cell;
  const fz = (wz + g.ez) / g.cell;
  if (fx < 0 || fz < 0 || fx >= g.nx || fz >= g.nz) return 0;
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const u = fx - i;
  const v = fz - j;
  const w = g.nx + 1;
  const H = g.h;
  const a = H[j * w + i];
  const b = H[j * w + i + 1];
  const c = H[(j + 1) * w + i];
  const d = H[(j + 1) * w + i + 1];
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/** A height grid over the board and its frame, sampled bilinearly. */
export class Relief implements Ground {
  /** Grid cells per side, and the grid's half extent (world units, centred on the board). */
  readonly n: number;
  readonly extent: number;
  readonly cell: number;
  readonly h: Float32Array;
  readonly frameH = 0;
  readonly peak: number = RELIEF.blockHigh;
  readonly dais: number = RELIEF.baseInner;
  get nx(): number {
    return this.n;
  }
  get nz(): number {
    return this.n;
  }
  get ex(): number {
    return this.extent;
  }
  get ez(): number {
    return this.extent;
  }
  private readonly half: number;
  private readonly size: number;
  private readonly flat: ReturnType<typeof buildTerrain>['shapes'];
  private readonly bases: number[][];
  private readonly R: number;
  private readonly sq: number;
  private readonly tiles: [number, number][];
  private readonly courts: { x: number; y: number; h: number }[];

  constructor(content: Content, extent: number, n = 150) {
    const map = content.map;
    const half = map.size / 2;
    this.half = half;
    this.n = n;
    this.extent = extent;
    this.cell = (extent * 2) / n;
    this.size = map.size;
    this.flat = buildTerrain(map).shapes.filter((s) => s.kind !== 'base');
    this.bases = Object.values(map.bases);
    this.R = map.walk.base;
    this.sq = map.size / 8;
    this.tiles = bastionSites(content);
    this.courts = map.slots.map((s) => ({ x: s.x, y: s.y, h: s.radius * 0.92 }));
    const H = new Float32Array((n + 1) * (n + 1));
    for (let j = 0; j <= n; j++)
      for (let i = 0; i <= n; i++) {
        const x = -extent + i * this.cell + half;
        const y = -extent + j * this.cell + half;
        H[j * (n + 1) + i] = this.sample(x, y);
      }
    this.h = H;
  }

  /** Distance outside the walkable floor (lanes, paths, courts, bases); <= 0 on it. */
  private offFloor(x: number, y: number, dBase: number): number {
    let d = dBase - this.R;
    for (const s of this.flat) {
      const v = shapeDist(s, x, y);
      if (v < d) d = v;
      if (d < 0) return d;
    }
    for (const c of this.courts) {
      const v = Math.max(Math.abs(x - c.x), Math.abs(y - c.y)) - c.h - 10;
      if (v < d) d = v;
    }
    return d;
  }

  private baseDist(x: number, y: number): number {
    let d = Infinity;
    for (const [bx, by] of this.bases) d = Math.min(d, Math.hypot(x - bx, y - by));
    return d;
  }

  /** The named area under a sim point (stepped, no bevels): the hook for high-ground rules. */
  areaAt(x: number, y: number): ReliefArea {
    const size = this.size;
    if (Math.min(x, y, size - x, size - y) <= 0) return 'frame';
    const dBase = this.baseDist(x, y);
    if (dBase < this.R * 0.5) return 'dais-inner';
    if (dBase < this.R + 4) return 'dais';
    for (const c of this.courts) {
      const cheb = Math.max(Math.abs(x - c.x), Math.abs(y - c.y));
      if (cheb < c.h * 0.58) return 'court-floor';
      if (cheb < c.h) return 'court-step';
    }
    for (const [tx, ty] of this.tiles)
      if (Math.max(Math.abs(x - tx), Math.abs(y - ty)) < RELIEF.tileHalf) return 'bastion-tile';
    if (this.offFloor(x, y, dBase) <= 0) return 'lane';
    const sq = this.sq;
    return (Math.floor(x / sq) + Math.floor(y / sq)) % 2 === 0 ? 'block-high' : 'block-low';
  }

  /** Smooth height (bevels and ramps) at a sim point; the grid samples this. */
  private sample(x: number, y: number): number {
    const { R, size, sq } = this;
    // outside the board: the frame is flat
    const edge = Math.min(x, y, size - x, size - y);
    if (edge <= 0) return 0;
    // floor: the walkable heights (base dais, court pits, Bastion tiles)
    const dBase = this.baseDist(x, y);
    let floor =
      RELIEF.baseOuter * (1 - smooth(R + 4, R + 22, dBase)) +
      (RELIEF.baseInner - RELIEF.baseOuter) * (1 - smooth(R * 0.5, R * 0.5 + 18, dBase));
    for (const c of this.courts) {
      const cheb = Math.max(Math.abs(x - c.x), Math.abs(y - c.y));
      if (cheb > c.h + 20) continue;
      floor +=
        RELIEF.courtStep * (1 - smooth(c.h - 4, c.h + 14, cheb)) +
        (RELIEF.courtFloor - RELIEF.courtStep) * (1 - smooth(c.h * 0.58, c.h * 0.58 + 14, cheb));
    }
    for (const [tx, ty] of this.tiles) {
      const cheb = Math.max(Math.abs(x - tx), Math.abs(y - ty));
      if (cheb < RELIEF.tileHalf + 16)
        floor = Math.max(
          floor,
          RELIEF.tile * (1 - smooth(RELIEF.tileHalf, RELIEF.tileHalf + 14, cheb)),
        );
    }
    // blocks: everything off the walkable shapes rises into the square it belongs to
    const d = this.offFloor(x, y, dBase);
    if (d <= 0) return floor;
    const i = Math.floor(x / sq);
    const j = Math.floor(y / sq);
    const top = (i + j) % 2 === 0 ? RELIEF.blockHigh : RELIEF.blockLow;
    const rise = smooth(0, RELIEF.bevel, d) * smooth(0, 26, edge);
    return Math.max(floor, floor + (top - floor) * rise);
  }

  /** Ground height at a world point (board centre = origin). */
  at(wx: number, wz: number): number {
    return bilinear(this, wx, wz);
  }

  /** Ground height at a sim point. */
  atSim(x: number, y: number): number {
    return this.at(x - this.half, y - this.half);
  }
}

/** Heights of the Long Board (world units; the river floor is 0, one tier is `step`). */
export const TERRACE = {
  step: 54,
  /** Open water in the river band, and the Pit floor. */
  water: -14,
  pit: -20,
  /** The slope just inside a sunken grove or the Pit. */
  bank: 26,
  /** Open ground: the chess squares stand up as blocks in a two-height checker. */
  blockLow: 18,
  blockHigh: 26,
  bevel: 22,
  /** Base dais on the home terrace: outer and inner tier. */
  daisOuter: 16,
  daisInner: 30,
  tile: 12,
} as const;

/**
 * The Long Board's relief (view only; the sim's tiers are `tierAt` in `sim/world/height.ts`):
 * the river band and its ramps are low, the midfield terrace is one `step` up, the home terrace
 * and base two. Lanes climb the 12 ramps; groves and the Pit are sunken basins with a bank; open
 * ground stands up as chess-square blocks on its terrace; the river band is water. The frame is
 * level with the home terrace, so the board reads as carved into the table.
 */
export class LongRelief implements Ground {
  readonly nx: number;
  readonly nz: number;
  readonly ex: number;
  readonly ez: number;
  readonly cell: number;
  readonly h: Float32Array;
  readonly frameH: number;
  readonly peak: number;
  readonly dais: number;
  private readonly w: number;
  private readonly l: number;
  private readonly mid: number;
  private readonly river: number;
  private readonly rampLen: number;
  private readonly home: number;
  private readonly shapes: WalkShape[];
  private readonly sunk: WalkShape[];
  private readonly bases: number[][];
  private readonly R: number;
  private readonly tiles: [number, number][];
  /** One flat lip for all dead space (the visual-language styles), or null for the checker blocks. */
  private readonly lip: { h: number; bevel: number } | null;

  constructor(
    map: MapDef,
    frame: number,
    cell = 20,
    lip: { h: number; bevel: number } | null = null,
  ) {
    const t = map.terraces!;
    this.lip = lip;
    this.w = map.size;
    this.l = map.length ?? map.size;
    this.mid = this.l / 2;
    this.river = t.river;
    this.rampLen = t.rampLen;
    this.home = t.home;
    this.ex = this.w / 2 + frame;
    this.ez = this.l / 2 + frame;
    this.cell = cell;
    this.nx = Math.round((this.ex * 2) / cell);
    this.nz = Math.round((this.ez * 2) / cell);
    const T = TERRACE.step;
    this.frameH = 2 * T;
    this.peak = 2 * T + TERRACE.blockHigh;
    this.dais = 2 * T + TERRACE.daisInner;
    this.shapes = buildTerrain(map).shapes;
    this.sunk = this.shapes.filter((s) => s.kind === 'grove' || s.kind === 'pit');
    this.bases = Object.values(map.bases);
    this.R = map.walk.base;
    const b = map.bastions;
    this.tiles = b
      ? [b.A, b.B].flatMap((side) =>
          Object.values(side).flatMap((pair) => pair.map(([x, y]) => [x, y] as [number, number])),
        )
      : [];
    const w = this.nx + 1;
    const H = new Float32Array(w * (this.nz + 1));
    for (let j = 0; j <= this.nz; j++)
      for (let i = 0; i <= this.nx; i++)
        H[j * w + i] = this.sample(
          -this.ex + i * cell + this.w / 2,
          -this.ez + j * cell + this.mid,
        );
    this.h = H;
  }

  /** Terrace height off the lanes: cliffs at the river bank and at the home edge. */
  private terrace(e: number): number {
    return e < this.river ? 0 : e < this.home ? TERRACE.step : 2 * TERRACE.step;
  }

  /** Lane floor: the terrace height, climbing linearly on the ramps. */
  private laneFloor(e: number): number {
    const T = TERRACE.step;
    const r = this.river;
    const h = this.home;
    const k = this.rampLen;
    if (e <= r) return 0;
    if (e < r + k) return (T * (e - r)) / k;
    if (e <= h) return T;
    if (e < h + k) return T + (T * (e - h)) / k;
    return 2 * T;
  }

  /** Ground height at a sim point; the grid samples this. */
  private sample(x: number, y: number): number {
    if (x <= 0 || y <= 0 || x >= this.w || y >= this.l) return this.frameH;
    const e = Math.abs(y - this.mid);
    let d = Infinity;
    let near: WalkShape | null = null;
    for (const s of this.shapes) {
      const v = shapeDist(s, x, y);
      if (v < d) {
        d = v;
        near = s;
      }
    }
    // the floor of the nearest walkable shape (a lane climbs its ramps; the rest sit on the terrace)
    let floor = near?.kind === 'lane' ? this.laneFloor(e) : this.terrace(e);
    // sunken groves and the Pit, with a bank just inside their edge
    let ds = Infinity;
    let pit = false;
    for (const s of this.sunk) {
      const v = shapeDist(s, x, y);
      if (v < ds) {
        ds = v;
        pit = s.kind === 'pit';
      }
    }
    if (ds < 0) {
      const low = pit ? TERRACE.pit : 0;
      floor = low + (floor - low) * smooth(-TERRACE.bank, 0, ds);
    }
    // base dais and Bastion tiles
    let dBase = Infinity;
    for (const [bx, by] of this.bases) dBase = Math.min(dBase, Math.hypot(x - bx, y - by));
    const R = this.R;
    floor +=
      TERRACE.daisOuter * (1 - smooth(R + 4, R + 22, dBase)) +
      (TERRACE.daisInner - TERRACE.daisOuter) * (1 - smooth(R * 0.5, R * 0.5 + 18, dBase));
    for (const [tx, ty] of this.tiles) {
      const cheb = Math.max(Math.abs(x - tx), Math.abs(y - ty));
      if (cheb < RELIEF.tileHalf + 16)
        floor += TERRACE.tile * (1 - smooth(RELIEF.tileHalf, RELIEF.tileHalf + 14, cheb));
    }
    if (d <= 0) return floor;
    // off the walkable shapes: water in the river band, chess-square blocks on the terraces
    if (e < this.river) return floor + (TERRACE.water - floor) * smooth(0, 12, d);
    if (this.lip)
      return Math.max(
        floor,
        floor + (this.terrace(e) + this.lip.h - floor) * smooth(0, this.lip.bevel, d),
      );
    const sq = this.w / 8;
    const top =
      this.terrace(e) +
      ((Math.floor(x / sq) + Math.floor(y / sq)) % 2 === 0 ? TERRACE.blockHigh : TERRACE.blockLow);
    return Math.max(floor, floor + (top - floor) * smooth(0, TERRACE.bevel, d));
  }

  at(wx: number, wz: number): number {
    return bilinear(this, wx, wz);
  }

  atSim(x: number, y: number): number {
    return this.at(x - this.w / 2, y - this.mid);
  }
}
