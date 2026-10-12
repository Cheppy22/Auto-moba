import type { MapDef } from '../content/schema';
import { shapeDist, type WalkShape } from './terrain';

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
  return {
    mid: length / 2,
    low: t.river + t.rampLen,
    high: t.home + t.rampLen,
    cell: CELL,
    cols,
    rows,
    sunk,
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
