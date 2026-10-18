import { clamp, sqrt } from '../core/math';
import type { LaneId, MapDef } from '../content/schema';
import type { Pt } from './map';

/**
 * Walkable space. The map is solid terrain except inside these capsules: lane corridors, the
 * two bases, jungle clearings and their gate paths (only while the clearing is open, unless the
 * map has `openJungle`), the Squares and their paths, and the small clearings. The Long Board
 * adds its areas (groves, the Pit, Squares, verges, the River Road, Sally Paths); its lanes are
 * flat-ended boxes that narrow on the ramps. The sim keeps every unit inside them; the 3D view
 * builds its cliffs and walls from the same shapes.
 */
type WalkKind =
  | 'lane'
  | 'base'
  | 'slot'
  | 'port'
  | 'shop'
  | 'spot'
  | 'grove'
  | 'pit'
  | 'square'
  | 'verge'
  | 'road'
  | 'sally';

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
  /** A flat-ended box of half-width `r` along a-b instead of a capsule. */
  box?: true;
}

/** A capsule that units cannot enter: a Barricade wall (set by the sim while a gambit lasts). */
interface BlockShape {
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
  /** Board width (x). */
  size: number;
  cell: number;
  cols: number;
  rows: number;
  /** Shape indices near each grid cell, row-major. */
  cells: number[][];
  /** 1 when a shape with no jungle gate covers the whole cell (any point in it is walkable). */
  inside: Uint8Array;
  /** Shape indices that may cover part of each cell (what `walkable` tests), row-major. */
  edge: number[][];
}

type Terraces = NonNullable<MapDef['terraces']>;

/** Which jungle slots are open. A Set, or any object with `has`. */
interface OpenSlots {
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

/** Signed distance from (x, y) to a flat-ended box of half-width `r` along a-b: negative inside. */
function boxDist(s: BlockShape, x: number, y: number): number {
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const len = sqrt(dx * dx + dy * dy) || 1;
  const u = ((x - s.ax) * dx + (y - s.ay) * dy) / len;
  const v = ((x - s.ax) * -dy + (y - s.ay) * dx) / len;
  const qx = Math.abs(u - len / 2) - len / 2;
  const qy = Math.abs(v) - s.r;
  const ox = qx > 0 ? qx : 0;
  const oy = qy > 0 ? qy : 0;
  return sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0);
}

/** Signed distance from (x, y) to the shape's edge: negative inside. */
export function shapeDist(s: BlockShape & { box?: true }, x: number, y: number): number {
  if (s.box) return boxDist(s, x, y);
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const l2 = dx * dx + dy * dy;
  let f = l2 === 0 ? 0 : ((x - s.ax) * dx + (y - s.ay) * dy) / l2;
  f = f < 0 ? 0 : f > 1 ? 1 : f;
  const px = x - (s.ax + dx * f);
  const py = y - (s.ay + dy * f);
  return sqrt(px * px + py * py) - s.r;
}

/**
 * Where a lane segment from y = ay to y = by crosses the terrace edges and ramp ends, as sorted
 * fractions of the segment (0 and 1 included). `mid` is the river line, y = length / 2.
 */
export function rampCuts(terraces: Terraces, mid: number, ay: number, by: number): number[] {
  const cuts = [0, 1];
  const { river, rampLen, home } = terraces;
  for (const e of [river, river + rampLen, home, home + rampLen]) {
    for (const yy of [mid - e, mid + e]) {
      if ((ay - yy) * (by - yy) < 0) cuts.push((yy - ay) / (by - ay));
    }
  }
  return cuts.sort((a, b) => a - b);
}

/** True when a lane point `e` from the river line lies on a ramp. */
export function onRamp(terraces: Terraces, e: number): boolean {
  const { river, rampLen, home } = terraces;
  return (e > river && e < river + rampLen) || (e > home && e < home + rampLen);
}

/** Lane corridors of a terraced map: boxes, narrowed on the ramps, with a disc at each bend. */
function terracedLanes(map: MapDef, terraces: Terraces, shapes: WalkShape[]): void {
  const mid = (map.length ?? map.size) / 2;
  const ids: LaneId[] = ['top', 'mid', 'bot'];
  for (const id of ids) {
    const p = map.lanes[id];
    for (let i = 1; i < p.length; i++) {
      const [ax, ay] = p[i - 1];
      const [bx, by] = p[i];
      const cuts = rampCuts(terraces, mid, ay, by);
      for (let k = 1; k < cuts.length; k++) {
        const f0 = cuts[k - 1];
        const f1 = cuts[k];
        if (f1 - f0 < 1e-9) continue;
        const e = Math.abs(ay + (by - ay) * ((f0 + f1) / 2) - mid);
        shapes.push({
          kind: 'lane',
          ax: ax + (bx - ax) * f0,
          ay: ay + (by - ay) * f0,
          bx: ax + (bx - ax) * f1,
          by: ay + (by - ay) * f1,
          r: onRamp(terraces, e) ? terraces.rampHalf : map.walk.lane,
          slot: null,
          lane: id,
          box: true,
        });
      }
      if (i < p.length - 1)
        shapes.push({
          kind: 'lane',
          ax: bx,
          ay: by,
          bx,
          by,
          r: map.walk.lane,
          slot: null,
          lane: id,
        });
    }
  }
}

export function buildTerrain(map: MapDef): Terrain {
  const w = map.walk;
  const shapes: WalkShape[] = [];
  const disc = (kind: WalkKind, x: number, y: number, r: number, slot: string | null): void => {
    shapes.push({ kind, ax: x, ay: y, bx: x, by: y, r, slot, lane: null });
  };
  const ids: LaneId[] = ['top', 'mid', 'bot'];
  if (map.terraces) terracedLanes(map, map.terraces, shapes);
  else {
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
    const gate = map.openJungle ? null : s.id;
    disc('slot', s.x, s.y, s.radius + w.slotPad, gate);
    ports(s.x, s.y, s.ports, gate);
  }
  for (const s of map.shops) {
    disc('shop', s.x, s.y, s.radius + w.shopPad, null);
    ports(s.x, s.y, s.ports, null);
  }
  for (const k of map.keeperSpots) disc('spot', k.x, k.y, w.spot, null);
  for (const a of map.areas) {
    const pts = a.pts.length === 1 ? [a.pts[0], a.pts[0]] : a.pts;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1];
      const [bx, by] = pts[i];
      const shape: WalkShape = { kind: a.kind, ax, ay, bx, by, r: a.r, slot: null, lane: null };
      if (a.box) shape.box = true;
      shapes.push(shape);
    }
  }

  const cols = Math.ceil(map.size / CELL);
  const rows = Math.ceil((map.length ?? map.size) / CELL);
  const cells: number[][] = [];
  const inside = new Uint8Array(cols * rows);
  const edge: number[][] = [];
  const half = CELL * 0.71 + REACH;
  // Every point of a cell lies within CELL * 0.71 of its centre, and shape distances change no
  // faster than distance itself, so a shape whose edge is farther than that (plus 1 for rounding)
  // either covers the whole cell or none of it. A zero-length box has no such bound: keep it.
  const cover = CELL * 0.71 + 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = (c + 0.5) * CELL;
      const cy = (r + 0.5) * CELL;
      const near: number[] = [];
      const part: number[] = [];
      for (let i = 0; i < shapes.length; i++) {
        const s = shapes[i];
        const d = shapeDist(s, cx, cy);
        if (d > half) continue;
        near.push(i);
        const point = s.box && s.ax === s.bx && s.ay === s.by;
        if (!point && s.slot === null && d <= -cover) inside[r * cols + c] = 1;
        if (point || d <= cover) part.push(i);
      }
      cells.push(near);
      edge.push(part);
    }
  }
  return { shapes, blocks: [], size: map.size, cell: CELL, cols, rows, cells, inside, edge };
}

function near(t: Terrain, x: number, y: number): number[] | null {
  const c = Math.floor(x / t.cell);
  const r = Math.floor(y / t.cell);
  if (c < 0 || r < 0 || c >= t.cols || r >= t.rows) return null;
  const list = t.cells[r * t.cols + c];
  return list.length ? list : null;
}

const usable = (s: WalkShape, open: OpenSlots): boolean => s.slot === null || open.has(s.slot);

function inBlock(t: Terrain, x: number, y: number): boolean {
  for (const b of t.blocks) if (shapeDist(b, x, y) < 0) return true;
  return false;
}

export function walkable(t: Terrain, open: OpenSlots, x: number, y: number): boolean {
  const c = Math.floor(x / t.cell);
  const r = Math.floor(y / t.cell);
  if (c < 0 || r < 0 || c >= t.cols || r >= t.rows) return false;
  if (t.blocks.length && inBlock(t, x, y)) return false;
  const k = r * t.cols + c;
  if (t.inside[k]) return true;
  for (const i of t.edge[k]) {
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
  if (s.box) return boxInside(s, x, y);
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

/** The point of a box nearest to (x, y), just inside its edges. */
function boxInside(s: WalkShape, x: number, y: number): Pt {
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const len = sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const u = clamp((x - s.ax) * ux + (y - s.ay) * uy, 0.01, len - 0.01);
  const v = clamp((x - s.ax) * -uy + (y - s.ay) * ux, 0.01 - s.r, s.r - 0.01);
  return { x: s.ax + ux * u - uy * v, y: s.ay + uy * u + ux * v };
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
    const x = ax + (dx * i) / n;
    const y = ay + (dy * i) / n;
    if (!walkable(t, open, x, y)) return false;
    if (n - i < 4 || t.blocks.length) continue;
    // Speed-up only (same answer): walk shapes and the board are convex, so when sample i and a
    // later sample j lie well inside the same shape, every sample between them does too.
    let skip = i;
    for (const k of t.edge[Math.floor(y / t.cell) * t.cols + Math.floor(x / t.cell)]) {
      const s = t.shapes[k];
      if (!usable(s, open) || !deepAt(t, s, ax, ay, dx, dy, n, i)) continue;
      // Guess the last sample inside from the geometry; if `deepAt` rejects it, search below it.
      const j = Math.min(n, Math.floor(exitAlong(s, ax, ay, dx, dy, 0.001) * n));
      if (!(j > i)) continue;
      if (deepAt(t, s, ax, ay, dx, dy, n, j)) {
        if (j > skip) skip = j;
        continue;
      }
      let lo = i;
      let hi = j - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (deepAt(t, s, ax, ay, dx, dy, n, mid)) lo = mid;
        else hi = mid - 1;
      }
      if (lo > skip) skip = lo;
    }
    i = skip;
  }
  return true;
}

/**
 * How far along the line a + f·(dx, dy) (f = 1 at its end) it stays inside shape s shrunk by m,
 * going forward from a point inside; -Infinity when it never enters.
 */
function exitAlong(
  s: WalkShape,
  ax: number,
  ay: number,
  dx: number,
  dy: number,
  m: number,
): number {
  const r = s.r - m;
  const sx = s.bx - s.ax;
  const sy = s.by - s.ay;
  const len = sqrt(sx * sx + sy * sy);
  if (len === 0) return s.box ? -Infinity : discExit(s.ax, s.ay, r, ax, ay, dx, dy);
  // The line in the shape's frame: u along a-b, v across it.
  const ux = sx / len;
  const uy = sy / len;
  const u0 = (ax - s.ax) * ux + (ay - s.ay) * uy;
  const du = dx * ux + dy * uy;
  const v0 = (ay - s.ay) * ux - (ax - s.ax) * uy;
  const dv = dy * ux - dx * uy;
  // The straight part (the whole shape for a box): where m <= u <= len - m (0 <= u <= len for a
  // capsule) and |v| <= r.
  const lo = s.box ? m : 0;
  const hi = s.box ? len - m : len;
  const enter = Math.max(slabIn(u0, du, lo, hi), slabIn(v0, dv, -r, r));
  const exit = Math.min(slabOut(u0, du, lo, hi), slabOut(v0, dv, -r, r));
  const straight = enter <= exit ? exit : -Infinity;
  return s.box ? straight : Math.max(straight, capsEnds(s, r, ax, ay, dx, dy));
}

/** Where the line p0 + f·dp enters [min, max] (-Infinity: always inside, Infinity: never). */
function slabIn(p0: number, dp: number, min: number, max: number): number {
  if (dp === 0) return p0 < min || p0 > max ? Infinity : -Infinity;
  return Math.min((min - p0) / dp, (max - p0) / dp);
}

/** Where the line p0 + f·dp leaves [min, max] (Infinity: always inside, -Infinity: never). */
function slabOut(p0: number, dp: number, min: number, max: number): number {
  if (dp === 0) return p0 < min || p0 > max ? -Infinity : Infinity;
  return Math.max((min - p0) / dp, (max - p0) / dp);
}

/** `exitAlong` for the two end discs of a capsule. */
function capsEnds(s: WalkShape, r: number, ax: number, ay: number, dx: number, dy: number): number {
  return Math.max(discExit(s.ax, s.ay, r, ax, ay, dx, dy), discExit(s.bx, s.by, r, ax, ay, dx, dy));
}

/** Where the line a + f·(dx, dy) leaves the disc of radius r at c (-Infinity if it misses). */
function discExit(
  cx: number,
  cy: number,
  r: number,
  ax: number,
  ay: number,
  dx: number,
  dy: number,
): number {
  const a = dx * dx + dy * dy;
  const b = (ax - cx) * dx + (ay - cy) * dy;
  const c = (ax - cx) * (ax - cx) + (ay - cy) * (ay - cy) - r * r;
  const disc = b * b - a * c;
  if (a === 0 || disc < 0) return -Infinity;
  return (-b + sqrt(disc)) / a;
}

/** Margin for `deepAt`: far above rounding error, far below any distance that matters. */
const DEEP = 1e-6;

/** True when `clearLine`'s sample i of n lies inside shape s and the board, with margin. */
function deepAt(
  t: Terrain,
  s: WalkShape,
  ax: number,
  ay: number,
  dx: number,
  dy: number,
  n: number,
  i: number,
): boolean {
  const x = ax + (dx * i) / n;
  const y = ay + (dy * i) / n;
  if (x < DEEP || y < DEEP || x > t.cols * t.cell - DEEP || y > t.rows * t.cell - DEEP)
    return false;
  return shapeDist(s, x, y) <= -DEEP;
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
