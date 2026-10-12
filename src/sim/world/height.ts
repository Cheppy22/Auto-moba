import type { MapDef } from '../content/schema';
import type { Ctx } from '../ctx';
import type { Unit } from '../types';
import { shapeDist, walkable, type Terrain, type WalkShape } from './terrain';

/**
 * Heights of a terraced map (the Long Board): 0 is the river and the sunken groves and Pit, 1 the
 * midfield terrace, 2 the high home terrace. A ramp counts as its lower tier. Built once per
 * world; the sunken floors are cached per 25-unit cell, the terrace tier comes straight from the
 * distance to the river line. Maps without `terraces` have no heights (every point is tier 0).
 */
export type Tier = 0 | 1 | 2;

export interface Height {
  /** The river line, y = length / 2. */
  mid: number;
  /** Below this distance from the river line: tier 0 (the river band and its ramps). */
  low: number;
  /** From this distance on: tier 2 (the home terrace). */
  high: number;
  cell: number;
  cols: number;
  rows: number;
  /** 1 where the cell centre lies on a grove or Pit floor. */
  sunk: Uint8Array;
  /** The groves (their pines block sight), each with its bounding box. */
  groves: Grove[];
}

interface Grove {
  shape: WalkShape;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const CELL = 25;

export function buildHeight(map: MapDef, shapes: readonly WalkShape[]): Height | null {
  const t = map.terraces;
  if (!t) return null;
  const length = map.length ?? map.size;
  const cols = Math.ceil(map.size / CELL);
  const rows = Math.ceil(length / CELL);
  const floors = shapes.filter((s) => s.kind === 'grove' || s.kind === 'pit');
  const sunk = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) * CELL;
      const y = (r + 0.5) * CELL;
      if (floors.some((s) => shapeDist(s, x, y) <= 0)) sunk[r * cols + c] = 1;
    }
  }
  const groves = shapes
    .filter((s) => s.kind === 'grove')
    .map((shape) => ({
      shape,
      x0: Math.min(shape.ax, shape.bx) - shape.r,
      x1: Math.max(shape.ax, shape.bx) + shape.r,
      y0: Math.min(shape.ay, shape.by) - shape.r,
      y1: Math.max(shape.ay, shape.by) + shape.r,
    }));
  return {
    mid: length / 2,
    low: t.river + t.rampLen,
    high: t.home + t.rampLen,
    cell: CELL,
    cols,
    rows,
    sunk,
    groves,
  };
}

/** The tier at (x, y); always 0 on a map without heights. */
export function tierAt(h: Height | null, x: number, y: number): Tier {
  if (!h) return 0;
  const c = Math.floor(x / h.cell);
  const r = Math.floor(y / h.cell);
  if (c >= 0 && r >= 0 && c < h.cols && r < h.rows && h.sunk[r * h.cols + c]) return 0;
  const e = Math.abs(y - h.mid);
  return e < h.low ? 0 : e < h.high ? 1 : 2;
}

// ------------------------------------------------------------------ high-ground rules

/**
 * Reach: an attacker on a higher tier than its target shoots `height.reachMul` farther. Only
 * attackers with a base range of at least `height.reachMinRange`; never structures.
 */
export function reachActive(ctx: Ctx, u: Unit, t: Unit): boolean {
  const h = ctx.world.height;
  if (!h || u.kind === 'tower' || u.kind === 'guardian') return false;
  if (u.atkRange < ctx.t.height.reachMinRange) return false;
  return tierAt(h, u.x, u.y) > tierAt(h, t.x, t.y);
}

/** The attack range of `u` against `t`, with Reach. */
export function attackRange(ctx: Ctx, u: Unit, t: Unit): number {
  return reachActive(ctx, u, t) ? u.stats.range * ctx.t.height.reachMul : u.stats.range;
}

/**
 * Sight: how far a unit on tier `from` picks targets on tier `to`. Looking down it sees
 * `height.sightMul` farther than the flat aggro radius, looking up only within its attack range
 * plus `height.sightUpPad`; on the same tier the flat scan `radius`.
 */
export function sightRadius(ctx: Ctx, u: Unit, from: Tier, to: Tier, radius: number): number {
  const ht = ctx.t.height;
  if (from > to) return Math.max(ctx.t.ai.aggroRadius * ht.sightMul, u.stats.range + 20);
  if (from < to) return u.stats.range + ht.sightUpPad;
  return radius;
}

/**
 * Slope: a hit from a unit on a higher tier than its target deals `height.slopeDmg` more, from a
 * lower tier that much less. Never for structures.
 */
export function slopeMul(ctx: Ctx, src: Unit, tgt: Unit): number {
  const h = ctx.world.height;
  const s = ctx.t.height.slopeDmg;
  if (!h || s === 0 || src.kind === 'tower' || src.kind === 'guardian') return 1;
  const a = tierAt(h, src.x, src.y);
  const b = tierAt(h, tgt.x, tgt.y);
  return a > b ? 1 + s : a < b ? 1 - s : 1;
}

/**
 * The eye icon (display only): a piece whose current target stands below it, so Reach or Sight
 * gives it the edge.
 */
export function highGroundEdge(ctx: Ctx, u: Unit): boolean {
  const h = ctx.world.height;
  if (!h || !u.hero || !u.alive || u.targetId === null) return false;
  const t = ctx.unit(u.targetId);
  return !!t && t.alive && tierAt(h, u.x, u.y) > tierAt(h, t.x, t.y);
}

// ------------------------------------------------------------------ line of sight

const LOS_STEP = 10;

/**
 * Line of sight: a grove's pines block sight across its edge, except where walkable ground
 * carries on outside it (its gates, the River Road, the Sally spur and the seam with the Pit).
 * So a unit outside a grove cannot see or hit a unit inside it, nor the other way round, unless
 * the line between them crosses the edge in an opening. Always true on maps without heights.
 */
export function lineOfSight(
  h: Height | null,
  terrain: Terrain,
  open: { has(id: string): boolean },
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  if (!h) return true;
  for (const g of h.groves) {
    if (Math.max(ax, bx) < g.x0 || Math.min(ax, bx) > g.x1) continue;
    if (Math.max(ay, by) < g.y0 || Math.min(ay, by) > g.y1) continue;
    const s = g.shape;
    let prevIn = shapeDist(s, ax, ay) <= 0;
    // a grove is convex: a line between two points inside it stays inside
    if (prevIn && shapeDist(s, bx, by) <= 0) continue;
    const dx = bx - ax;
    const dy = by - ay;
    const n = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / LOS_STEP));
    let prevF = 0;
    for (let i = 1; i <= n; i++) {
      const f = i / n;
      const isIn = shapeDist(s, ax + dx * f, ay + dy * f) <= 0;
      if (isIn !== prevIn) {
        // the edge lies between the two samples: find it, then look just outside it
        let fin = isIn ? f : prevF;
        let fout = isIn ? prevF : f;
        for (let k = 0; k < 6; k++) {
          const fm = (fin + fout) / 2;
          if (shapeDist(s, ax + dx * fm, ay + dy * fm) <= 0) fin = fm;
          else fout = fm;
        }
        if (!walkable(terrain, open, ax + dx * fout, ay + dy * fout)) return false;
      }
      prevIn = isIn;
      prevF = f;
    }
  }
  return true;
}

/** True when `u` has a line of sight to `t` (see `lineOfSight`). */
export function sees(ctx: Ctx, u: Unit, t: Unit): boolean {
  return lineOfSight(ctx.world.height, ctx.world.terrain, ctx.open, u.x, u.y, t.x, t.y);
}
