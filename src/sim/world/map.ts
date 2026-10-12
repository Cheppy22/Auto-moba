import { dist, sqrt } from '../core/math';
import type { LaneId, MapDef } from '../content/schema';
import type { PlayTeam } from '../types';
import { buildTerrain, clearLine, rampCuts, segmentBlocked, type Terrain } from './terrain';
import { buildHeight, type Height } from './height';
import { PLAY_TEAMS } from '../names';

export interface Pt {
  x: number;
  y: number;
}

interface LaneGeo {
  id: LaneId;
  pts: [number, number][];
  cum: number[];
  length: number;
}

interface NavNode {
  x: number;
  y: number;
  slot: string | null;
  edges: { to: number; w: number }[];
}

export interface World {
  map: MapDef;
  /** Map size over 1000, the size the AI's hard-coded distances were tuned on. */
  k: number;
  /** Board width (x) and length (y). */
  width: number;
  length: number;
  /** Fairness is a 180° turn (the Long Board): Black's own Left is the `bot` lane. */
  rotated: boolean;
  /** Lane progress (from White's base) of each lane's outer and inner Bastion. */
  towerFrac: Record<LaneId, { outer: number; inner: number }>;
  /** Terrace heights; null on a flat map. */
  height: Height | null;
  /** Own-seat progress of the top of each ramp in a team's own half, per lane (terraced maps). */
  rampTops: Record<PlayTeam, Record<LaneId, number[]>>;
  lanes: Record<LaneId, LaneGeo>;
  nodes: NavNode[];
  slotNode: Record<string, number>;
  shopNode: Record<string, number>;
  shopPos: Record<string, Pt>;
  baseNode: Record<PlayTeam, number>;
  towerPos: Record<PlayTeam, Record<LaneId, [Pt, Pt]>>;
  guardianPos: Record<PlayTeam, Pt>;
  basePos: Record<PlayTeam, Pt>;
  slotPos: Record<string, Pt>;
  terrain: Terrain;
}

export const LANES: LaneId[] = ['top', 'mid', 'bot'];
const LANES_TURNED: LaneId[] = ['bot', 'mid', 'top'];

/**
 * The lanes in a team's own seat order (its Left, Mid, Right), for loops whose ties pick the
 * first lane. Under the Long Board's 180° turn Black's Left is `bot`; on the mirrored map every
 * team uses `LANES`.
 */
export function seatLanes(world: World, team: PlayTeam): readonly LaneId[] {
  return world.rotated && team === 'B' ? LANES_TURNED : LANES;
}

function buildLane(id: LaneId, pts: [number, number][]): LaneGeo {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + dist(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
  }
  return { id, pts, cum, length: cum[cum.length - 1] };
}

export function lanePoint(lane: LaneGeo, t: number): Pt {
  const d = Math.max(0, Math.min(1, t)) * lane.length;
  for (let i = 1; i < lane.pts.length; i++) {
    if (d <= lane.cum[i] || i === lane.pts.length - 1) {
      const seg = lane.cum[i] - lane.cum[i - 1];
      const f = seg === 0 ? 0 : (d - lane.cum[i - 1]) / seg;
      return {
        x: lane.pts[i - 1][0] + (lane.pts[i][0] - lane.pts[i - 1][0]) * f,
        y: lane.pts[i - 1][1] + (lane.pts[i][1] - lane.pts[i - 1][1]) * f,
      };
    }
  }
  return { x: lane.pts[0][0], y: lane.pts[0][1] };
}

export function laneT(lane: LaneGeo, x: number, y: number): number {
  let best = Infinity;
  let bestD = 0;
  for (let i = 1; i < lane.pts.length; i++) {
    const [ax, ay] = lane.pts[i - 1];
    const [bx, by] = lane.pts[i];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let f = len2 === 0 ? 0 : ((x - ax) * dx + (y - ay) * dy) / len2;
    f = f < 0 ? 0 : f > 1 ? 1 : f;
    const px = ax + dx * f;
    const py = ay + dy * f;
    const d = dist(x, y, px, py);
    if (d < best) {
      best = d;
      bestD = lane.cum[i - 1] + sqrt(len2) * f;
    }
  }
  return bestD / lane.length;
}

/** How far a point is from a lane's centre line. */
export function laneDist(lane: LaneGeo, x: number, y: number): number {
  const p = lanePoint(lane, laneT(lane, x, y));
  return dist(x, y, p.x, p.y);
}

/** How far a point is from a polyline (the nearest point on any of its segments). */
export function distToPolyline(x: number, y: number, line: readonly (readonly number[])[]): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1];
    const [bx, by] = line[i];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
}

/**
 * The key with the smallest distance, if it is closer than `maxOff`. On equal distances the first
 * key wins; with `later` the last wins and `maxOff` itself still counts as near enough.
 */
export function nearestBy<K>(
  keys: readonly K[],
  distTo: (key: K) => number,
  maxOff = Infinity,
  later = false,
): K | null {
  let best: K | null = null;
  let bestD = maxOff;
  for (const key of keys) {
    const d = distTo(key);
    if (later ? d <= bestD : d < bestD) {
      bestD = d;
      best = key;
    }
  }
  return best;
}

export function laneWaypoints(world: World, team: PlayTeam, lane: LaneId): [number, number][] {
  const pts: [number, number][] = world.lanes[lane].pts.map((p): [number, number] => [p[0], p[1]]);
  return team === 'A' ? pts : pts.reverse();
}

export function buildWorld(map: MapDef): World {
  const lanes = {
    top: buildLane('top', map.lanes.top as [number, number][]),
    mid: buildLane('mid', map.lanes.mid as [number, number][]),
    bot: buildLane('bot', map.lanes.bot as [number, number][]),
  };
  const nodes: NavNode[] = [];
  const keyToNode = new Map<string, number>();
  const addNode = (x: number, y: number, slot: string | null): number => {
    const key = `${Math.round(x)},${Math.round(y)}`;
    const found = keyToNode.get(key);
    if (found !== undefined && !slot) return found;
    nodes.push({ x, y, slot, edges: [] });
    if (!slot) keyToNode.set(key, nodes.length - 1);
    return nodes.length - 1;
  };
  const link = (a: number, b: number): void => {
    if (a === b) return;
    const w = dist(nodes[a].x, nodes[a].y, nodes[b].x, nodes[b].y);
    nodes[a].edges.push({ to: b, w });
    nodes[b].edges.push({ to: a, w });
  };

  const k = map.unitScale ?? map.size / 1000;
  const width = map.size;
  const length = map.length ?? map.size;
  const portTs: Record<LaneId, number[]> = { top: [], mid: [], bot: [] };
  for (const s of map.slots) for (const p of s.ports) portTs[p.lane].push(p.t);
  for (const s of map.shops) for (const p of s.ports) portTs[p.lane].push(p.t);
  // Long Board walkways that touch a lane (River Road fords, Sally Path ends) join it at a node.
  const walkways = map.areas.filter((a) => NAV_AREAS.includes(a.kind));
  for (const a of walkways)
    for (const [x, y] of a.pts)
      for (const id of LANES)
        if (laneDist(lanes[id], x, y) < 0.5) portTs[id].push(laneT(lanes[id], x, y));

  for (const id of LANES) {
    const lane = lanes[id];
    const ts = new Set<number>([0, 1, ...portTs[id]]);
    for (let i = 1; i < lane.pts.length; i++) ts.add(lane.cum[i] / lane.length);
    const steps = Math.ceil(lane.length / (110 * k));
    for (let i = 1; i < steps; i++) ts.add(i / steps);
    const sorted = [...ts].sort((a, b) => a - b);
    let prev = -1;
    for (const t of sorted) {
      const p = lanePoint(lane, t);
      const n = addNode(p.x, p.y, null);
      if (prev >= 0) link(prev, n);
      prev = n;
    }
  }

  const slotNode: Record<string, number> = {};
  for (const s of map.slots) {
    const n = addNode(s.x, s.y, s.id);
    slotNode[s.id] = n;
    for (const p of s.ports) {
      const pt = lanePoint(lanes[p.lane], p.t);
      link(n, addNode(pt.x, pt.y, null));
    }
  }

  const shopNode: Record<string, number> = {};
  const shopPos: Record<string, Pt> = {};
  for (const sh of map.shops) {
    nodes.push({ x: sh.x, y: sh.y, slot: null, edges: [] });
    const n = nodes.length - 1;
    shopNode[sh.id] = n;
    shopPos[sh.id] = { x: sh.x, y: sh.y };
    for (const p of sh.ports) {
      const pt = lanePoint(lanes[p.lane], p.t);
      link(n, addNode(pt.x, pt.y, null));
    }
  }

  // Walkway spines (River Road, Sally Paths, groves) as node chains, about 110k apart.
  for (const a of walkways) {
    let prev = -1;
    for (let i = 0; i < a.pts.length; i++) {
      const [x, y] = a.pts[i];
      if (i > 0) {
        const [px, py] = a.pts[i - 1];
        const steps = Math.ceil(dist(px, py, x, y) / (110 * k));
        for (let s = 1; s < steps; s++) {
          const n = addNode(px + ((x - px) * s) / steps, py + ((y - py) * s) / steps, null);
          link(prev, n);
          prev = n;
        }
      }
      const n = addNode(x, y, null);
      if (prev >= 0) link(prev, n);
      prev = n;
    }
  }

  const basePos = {
    A: { x: map.bases.A[0], y: map.bases.A[1] },
    B: { x: map.bases.B[0], y: map.bases.B[1] },
  };
  const guardianPos = {} as Record<PlayTeam, Pt>;
  for (const t of PLAY_TEAMS) {
    const b = basePos[t];
    const dx = width / 2 - b.x;
    const dy = length / 2 - b.y;
    const len = sqrt(dx * dx + dy * dy) || 1;
    guardianPos[t] = {
      x: b.x + (dx / len) * map.guardianOffset,
      y: b.y + (dy / len) * map.guardianOffset,
    };
  }
  const towerPos = { A: {}, B: {} } as World['towerPos'];
  const towerFrac = {} as World['towerFrac'];
  for (const id of LANES) {
    const lane = lanes[id];
    const b = map.bastions;
    if (b) {
      const pt = ([x, y]: readonly number[]): Pt => ({ x, y });
      towerPos.A[id] = [pt(b.A[id][0]), pt(b.A[id][1])];
      towerPos.B[id] = [pt(b.B[id][0]), pt(b.B[id][1])];
      const [o, i] = towerPos.A[id];
      towerFrac[id] = { outer: laneT(lane, o.x, o.y), inner: laneT(lane, i.x, i.y) };
    } else {
      const { outer, inner } = map.towerFractions;
      towerPos.A[id] = [lanePoint(lane, outer), lanePoint(lane, inner)];
      towerPos.B[id] = [lanePoint(lane, 1 - outer), lanePoint(lane, 1 - inner)];
      towerFrac[id] = { outer, inner };
    }
  }
  const slotPos: Record<string, Pt> = {};
  for (const s of map.slots) slotPos[s.id] = { x: s.x, y: s.y };
  const baseNode = {
    A: addNode(basePos.A.x, basePos.A.y, null),
    B: addNode(basePos.B.x, basePos.B.y, null),
  };
  const terrain = buildTerrain(map);
  if (walkways.length) linkVisible(nodes, terrain, link);
  return {
    map,
    k,
    width,
    length,
    rotated: map.symmetry === 'rotate',
    towerFrac,
    height: buildHeight(map, terrain.shapes),
    rampTops: rampTops(map, lanes),
    lanes,
    nodes,
    slotNode,
    shopNode,
    shopPos,
    baseNode,
    towerPos,
    guardianPos,
    basePos,
    slotPos,
    terrain,
  };
}

/** Area kinds whose spine is part of the nav graph. */
const NAV_AREAS: readonly string[] = ['road', 'sally', 'grove'];
/** Long Board nav: nodes this close with a straight walkable line between them are linked. */
const LINK_RADIUS = 260;

function linkVisible(
  nodes: NavNode[],
  terrain: Terrain,
  link: (a: number, b: number) => void,
): void {
  const everywhere = { has: (): boolean => true };
  for (let a = 0; a < nodes.length; a++) {
    for (let b = a + 1; b < nodes.length; b++) {
      const p = nodes[a];
      const q = nodes[b];
      if (dist(p.x, p.y, q.x, q.y) > LINK_RADIUS) continue;
      if (p.edges.some((e) => e.to === b)) continue;
      if (clearLine(terrain, everywhere, p.x, p.y, q.x, q.y)) link(a, b);
    }
  }
}

/** The top of each ramp in a team's own half, as that team's lane progress (terraced maps). */
function rampTops(map: MapDef, lanes: Record<LaneId, LaneGeo>): World['rampTops'] {
  const out: World['rampTops'] = {
    A: { top: [], mid: [], bot: [] },
    B: { top: [], mid: [], bot: [] },
  };
  const t = map.terraces;
  if (!t) return out;
  const mid = (map.length ?? map.size) / 2;
  const tops = [t.river + t.rampLen, t.home + t.rampLen];
  for (const id of LANES) {
    const lane = lanes[id];
    for (let i = 1; i < lane.pts.length; i++) {
      const [ax, ay] = lane.pts[i - 1];
      const [bx, by] = lane.pts[i];
      for (const f of rampCuts(t, mid, ay, by)) {
        const y = ay + (by - ay) * f;
        if (f <= 0 || f >= 1 || !tops.some((e) => Math.abs(Math.abs(y - mid) - e) < 1e-6)) continue;
        const along = (lane.cum[i - 1] + dist(ax, ay, ax + (bx - ax) * f, y)) / lane.length;
        if (y > mid) out.A[id].push(along);
        else out.B[id].push(1 - along);
      }
    }
    out.A[id].sort((a, b) => a - b);
    out.B[id].sort((a, b) => a - b);
  }
  return out;
}

const START_SLACK = 140;

/** Tells whether a straight walk from (x, y) to a node's position stays on walkable ground. */
type SeesNode = (nodeX: number, nodeY: number) => boolean;

function candidateNodes(
  world: World,
  x: number,
  y: number,
  open: ReadonlySet<string>,
  sees?: SeesNode,
): { node: number; d: number }[] {
  const all: { node: number; d: number }[] = [];
  for (let i = 0; i < world.nodes.length; i++) {
    const n = world.nodes[i];
    if (n.slot && !open.has(n.slot)) continue;
    all.push({ node: i, d: dist(x, y, n.x, n.y) });
  }
  if (!sees) {
    let best = Infinity;
    for (const c of all) if (c.d < best) best = c.d;
    return all.filter((c) => c.d <= best + START_SLACK * world.k);
  }
  // Only nodes a unit can walk to directly count as ways onto the graph.
  all.sort((a, b) => a.d - b.d || a.node - b.node);
  const out: { node: number; d: number }[] = [];
  let best = Infinity;
  for (const c of all) {
    if (c.d > best + START_SLACK * world.k) break;
    const n = world.nodes[c.node];
    if (!sees(n.x, n.y)) continue;
    if (c.d < best) best = c.d;
    out.push(c);
  }
  return out.length ? out : candidateNodes(world, x, y, open);
}

export function findPath(
  world: World,
  from: Pt,
  to: Pt,
  open: ReadonlySet<string>,
  /** Optional line-of-walk tests from the start and the end; they narrow the entry nodes. */
  sees?: { from: SeesNode; to: SeesNode },
): [number, number][] {
  const n = world.nodes.length;
  const d = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  for (const c of candidateNodes(world, from.x, from.y, open, sees?.from)) d[c.node] = c.d;
  const ends = candidateNodes(world, to.x, to.y, open, sees?.to);
  for (let iter = 0; iter < n; iter++) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      if (!done[i] && d[i] < best) {
        best = d[i];
        u = i;
      }
    }
    if (u < 0) break;
    done[u] = true;
    for (const e of world.nodes[u].edges) {
      const node = world.nodes[e.to];
      if (node.slot && !open.has(node.slot)) continue;
      if (
        world.terrain.blocks.length &&
        segmentBlocked(world.terrain, world.nodes[u].x, world.nodes[u].y, node.x, node.y)
      )
        continue;
      if (d[u] + e.w < d[e.to]) {
        d[e.to] = d[u] + e.w;
        prev[e.to] = u;
      }
    }
  }
  let end = -1;
  let endCost = Infinity;
  for (const c of ends) {
    const cost = d[c.node] + c.d;
    if (cost < endCost) {
      endCost = cost;
      end = c.node;
    }
  }
  const path: [number, number][] = [[to.x, to.y]];
  for (let cur = end; cur >= 0; cur = prev[cur])
    path.push([world.nodes[cur].x, world.nodes[cur].y]);
  path.reverse();
  return path;
}
