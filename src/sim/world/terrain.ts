import { clamp, sqrt } from '../core/math';
import type { LaneId, MapDef } from '../content/schema';
import type { Pt } from './map';

/**
 * Walkable space. The map is solid terrain except inside these capsules: lane corridors, the
 * two bases, jungle clearings and their gate paths (only while the clearing is open), the jungle
 * shops and their paths, and the Keeper's spots. The sim keeps every unit inside them; the 3D
 * view builds its cliffs and walls from the same shapes.
 */
export type WalkKind = 'lane' | 'base' | 'slot' | 'port' | 'shop' | 'spot';

export interface WalkShape {
  kind: WalkKind;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  r: number;
  /** Jungle slot that must be open for this shape to be walkable, or null. */
  slot: string | null;
  /** Lane this shape belongs to (lane corridors and gate paths). */
  lane: LaneId | null;
}

export interface Terrain {
  shapes: WalkShape[];
  size: number;
  cell: number;
  cols: number;
  /** Shape indices near each grid cell, row-major. */
  cells: number[][];
}

/** Which jungle slots are open. A Set, or any object with `has`. */
export interface OpenSlots {
  has(id: string): boolean;
}

const CELL = 25;
const REACH = 140;
const STEP = 10;

function lanePt(pts: readonly (readonly number[])[], t: number): Pt {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0];
    const dy = pts[i][1] - pts[i - 1][1];
    cum.push(cum[i - 1] + sqrt(dx * dx + dy * dy));
  }
  const d = clamp(t, 0, 1) * cum[cum.length - 1];
  for (let i = 1; i < pts.length; i++) {
    if (d <= cum[i] || i === pts.length - 1) {
      const seg = cum[i] - cum[i - 1];
      const f = seg === 0 ? 0 : (d - cum[i - 1]) / seg;
      return {
        x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f,
        y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f,
      };
    }
  }
  return { x: pts[0][0], y: pts[0][1] };
}

/** Signed distance from (x, y) to the shape's edge: negative inside. */
export function shapeDist(s: WalkShape, x: number, y: number): number {
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const l2 = dx * dx + dy * dy;
  let f = l2 === 0 ? 0 : ((x - s.ax) * dx + (y - s.ay) * dy) / l2;
  f = f < 0 ? 0 : f > 1 ? 1 : f;
  const px = x - (s.ax + dx * f);
  const py = y - (s.ay + dy * f);
  return sqrt(px * px + py * py) - s.r;
}

export function buildTerrain(map: MapDef): Terrain {
  const w = map.walk;
  const shapes: WalkShape[] = [];
  const disc = (kind: WalkKind, x: number, y: number, r: number, slot: string | null): void => {
    shapes.push({ kind, ax: x, ay: y, bx: x, by: y, r, slot, lane: null });
  };
  const ids: LaneId[] = ['top', 'mid', 'bot'];
  for (const id of ids) {
    const p = map.lanes[id];
    for (let i = 1; i < p.length; i++) {
      shapes.push({
        kind: 'lane',
        ax: p[i - 1][0],
        ay: p[i - 1][1],
        bx: p[i][0],
        by: p[i][1],
        r: w.lane,
        slot: null,
        lane: id,
      });
    }
  }
  disc('base', map.bases.A[0], map.bases.A[1], w.base, null);
  disc('base', map.bases.B[0], map.bases.B[1], w.base, null);
  const ports = (
    x: number,
    y: number,
    list: { lane: LaneId; t: number }[],
    slot: string | null,
  ): void => {
    for (const p of list) {
      const q = lanePt(map.lanes[p.lane], p.t);
      shapes.push({ kind: 'port', ax: x, ay: y, bx: q.x, by: q.y, r: w.port, slot, lane: p.lane });
    }
  };
  for (const s of map.slots) {
    disc('slot', s.x, s.y, s.radius + w.slotPad, s.id);
    ports(s.x, s.y, s.ports, s.id);
  }
  for (const s of map.shops) {
    disc('shop', s.x, s.y, s.radius + w.shopPad, null);
    ports(s.x, s.y, s.ports, null);
  }
  for (const k of map.keeperSpots) disc('spot', k.x, k.y, w.spot, null);

  const cols = Math.ceil(map.size / CELL);
  const cells: number[][] = [];
  const half = CELL * 0.71 + REACH;
  for (let r = 0; r < cols; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = (c + 0.5) * CELL;
      const cy = (r + 0.5) * CELL;
      const near: number[] = [];
      for (let i = 0; i < shapes.length; i++)
        if (shapeDist(shapes[i], cx, cy) <= half) near.push(i);
      cells.push(near);
    }
  }
  return { shapes, size: map.size, cell: CELL, cols, cells };
}

function near(t: Terrain, x: number, y: number): number[] | null {
  const c = Math.floor(x / t.cell);
  const r = Math.floor(y / t.cell);
  if (c < 0 || r < 0 || c >= t.cols || r >= t.cols) return null;
  const list = t.cells[r * t.cols + c];
  return list.length ? list : null;
}

const usable = (s: WalkShape, open: OpenSlots): boolean => s.slot === null || open.has(s.slot);

export function walkable(t: Terrain, open: OpenSlots, x: number, y: number): boolean {
  const list = near(t, x, y);
  if (!list) return false;
  for (const i of list) {
    const s = t.shapes[i];
    if (usable(s, open) && shapeDist(s, x, y) <= 0) return true;
  }
  return false;
}

/** The nearest walkable point to (x, y); (x, y) itself when it is already walkable. */
export function confine(t: Terrain, open: OpenSlots, x: number, y: number): Pt {
  const list = near(t, x, y);
  let best: WalkShape | null = null;
  let bestD = Infinity;
  const scan = (s: WalkShape): void => {
    if (!usable(s, open)) return;
    const d = shapeDist(s, x, y);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  };
  if (list) for (const i of list) scan(t.shapes[i]);
  if (!best) for (const s of t.shapes) scan(s);
  const s = best as WalkShape | null;
  if (!s || bestD <= 0) return { x, y };
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const l2 = dx * dx + dy * dy;
  let f = l2 === 0 ? 0 : ((x - s.ax) * dx + (y - s.ay) * dy) / l2;
  f = f < 0 ? 0 : f > 1 ? 1 : f;
  const cx = s.ax + dx * f;
  const cy = s.ay + dy * f;
  const ox = x - cx;
  const oy = y - cy;
  const len = sqrt(ox * ox + oy * oy) || 1;
  const r = s.r - 0.01;
  return { x: cx + (ox / len) * r, y: cy + (oy / len) * r };
}

/** True when a straight walk from a to b never leaves walkable space. */
export function clearLine(
  t: Terrain,
  open: OpenSlots,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const n = Math.max(1, Math.ceil(sqrt(dx * dx + dy * dy) / STEP));
  for (let i = 1; i <= n; i++) {
    if (!walkable(t, open, ax + (dx * i) / n, ay + (dy * i) / n)) return false;
  }
  return true;
}
