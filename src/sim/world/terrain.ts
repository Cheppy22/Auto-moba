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

/** A capsule that units cannot enter: a Barricade wall (set by the sim while a gambit lasts). */
export interface BlockShape {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  r: number;
}

export interface Terrain {
  shapes: WalkShape[];
  /** Temporary walls; empty unless a Barricade stands. */
  blocks: BlockShape[];
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
export function shapeDist(s: BlockShape, x: number, y: number): number {
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
  return { shapes, blocks: [], size: map.size, cell: CELL, cols, cells };
}

function near(t: Terrain, x: number, y: number): number[] | null {
  const c = Math.floor(x / t.cell);
  const r = Math.floor(y / t.cell);
  if (c < 0 || r < 0 || c >= t.cols || r >= t.cols) return null;
  const list = t.cells[r * t.cols + c];
  return list.length ? list : null;
}

const usable = (s: WalkShape, open: OpenSlots): boolean => s.slot === null || open.has(s.slot);

function inBlock(t: Terrain, x: number, y: number): boolean {
  for (const b of t.blocks) if (shapeDist(b, x, y) < 0) return true;
  return false;
}

export function walkable(t: Terrain, open: OpenSlots, x: number, y: number): boolean {
  const list = near(t, x, y);
  if (!list) return false;
  if (t.blocks.length && inBlock(t, x, y)) return false;
  for (const i of list) {
    const s = t.shapes[i];
    if (usable(s, open) && shapeDist(s, x, y) <= 0) return true;
  }
  return false;
}

/** The nearest walkable point to (x, y); (x, y) itself when it is already walkable. */
export function confine(t: Terrain, open: OpenSlots, x: number, y: number): Pt {
  let p = confineShapes(t, open, x, y);
  if (t.blocks.length === 0) return p;
  for (let pass = 0; pass < 2; pass++) {
    let moved = false;
    for (const b of t.blocks) {
      if (shapeDist(b, p.x, p.y) >= 0) continue;
      // Step out across the wall's face: along the corridor the wall seals.
      const dx = b.bx - b.ax;
      const dy = b.by - b.ay;
      const l2 = dx * dx + dy * dy;
      let f = l2 === 0 ? 0 : ((p.x - b.ax) * dx + (p.y - b.ay) * dy) / l2;
      f = f < 0 ? 0 : f > 1 ? 1 : f;
      const cx = b.ax + dx * f;
      const cy = b.ay + dy * f;
      let ox = p.x - cx;
      let oy = p.y - cy;
      let len = sqrt(ox * ox + oy * oy);
      if (len < 1e-6) {
        const l = sqrt(l2) || 1;
        ox = -dy / l;
        oy = dx / l;
        len = 1;
      }
      p = { x: cx + (ox / len) * (b.r + 0.01), y: cy + (oy / len) * (b.r + 0.01) };
      moved = true;
    }
    if (!moved) break;
    p = confineShapes(t, open, p.x, p.y);
  }
  return p;
}

function confineShapes(t: Terrain, open: OpenSlots, x: number, y: number): Pt {
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

function segPointD2(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let f = l2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / l2;
  f = f < 0 ? 0 : f > 1 ? 1 : f;
  const qx = px - (ax + dx * f);
  const qy = py - (ay + dy * f);
  return qx * qx + qy * qy;
}

function segmentsCross(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): boolean {
  const o = (px: number, py: number, qx: number, qy: number, rx: number, ry: number): number =>
    (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const d1 = o(cx, cy, dx, dy, ax, ay);
  const d2 = o(cx, cy, dx, dy, bx, by);
  const d3 = o(ax, ay, bx, by, cx, cy);
  const d4 = o(ax, ay, bx, by, dx, dy);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** True when the straight segment a-b touches a Barricade wall (the nav graph skips such edges). */
export function segmentBlocked(
  t: Terrain,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  for (const b of t.blocks) {
    if (segmentsCross(ax, ay, bx, by, b.ax, b.ay, b.bx, b.by)) return true;
    const r2 = b.r * b.r;
    if (
      segPointD2(ax, ay, b.ax, b.ay, b.bx, b.by) < r2 ||
      segPointD2(bx, by, b.ax, b.ay, b.bx, b.by) < r2 ||
      segPointD2(b.ax, b.ay, ax, ay, bx, by) < r2 ||
      segPointD2(b.bx, b.by, ax, ay, bx, by) < r2
    )
      return true;
  }
  return false;
}
