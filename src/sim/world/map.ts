import { dist, sqrt } from '../core/math';
import type { LaneId, MapDef } from '../content/schema';
import type { PlayTeam } from '../types';

export interface Pt {
  x: number;
  y: number;
}

export interface LaneGeo {
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
  lanes: Record<LaneId, LaneGeo>;
  nodes: NavNode[];
  slotNode: Record<string, number>;
  baseNode: Record<PlayTeam, number>;
  towerPos: Record<PlayTeam, Record<LaneId, [Pt, Pt]>>;
  guardianPos: Record<PlayTeam, Pt>;
  basePos: Record<PlayTeam, Pt>;
  slotPos: Record<string, Pt>;
}

export const LANES: LaneId[] = ['top', 'mid', 'bot'];

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

  const portTs: Record<LaneId, number[]> = { top: [], mid: [], bot: [] };
  for (const s of map.slots) for (const p of s.ports) portTs[p.lane].push(p.t);

  for (const id of LANES) {
    const lane = lanes[id];
    const ts = new Set<number>([0, 1, ...portTs[id]]);
    for (let i = 1; i < lane.pts.length; i++) ts.add(lane.cum[i] / lane.length);
    const steps = Math.ceil(lane.length / 110);
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

  const basePos = {
    A: { x: map.bases.A[0], y: map.bases.A[1] },
    B: { x: map.bases.B[0], y: map.bases.B[1] },
  };
  const centre = map.size / 2;
  const guardianPos = {} as Record<PlayTeam, Pt>;
  for (const t of ['A', 'B'] as PlayTeam[]) {
    const b = basePos[t];
    const dx = centre - b.x;
    const dy = centre - b.y;
    const len = sqrt(dx * dx + dy * dy) || 1;
    guardianPos[t] = {
      x: b.x + (dx / len) * map.guardianOffset,
      y: b.y + (dy / len) * map.guardianOffset,
    };
  }
  const towerPos = { A: {}, B: {} } as World['towerPos'];
  for (const id of LANES) {
    const lane = lanes[id];
    const { outer, inner } = map.towerFractions;
    towerPos.A[id] = [lanePoint(lane, outer), lanePoint(lane, inner)];
    towerPos.B[id] = [lanePoint(lane, 1 - outer), lanePoint(lane, 1 - inner)];
  }
  const slotPos: Record<string, Pt> = {};
  for (const s of map.slots) slotPos[s.id] = { x: s.x, y: s.y };
  const baseNode = {
    A: addNode(basePos.A.x, basePos.A.y, null),
    B: addNode(basePos.B.x, basePos.B.y, null),
  };
  return { map, lanes, nodes, slotNode, baseNode, towerPos, guardianPos, basePos, slotPos };
}

export function nearestNode(world: World, x: number, y: number, open: ReadonlySet<string>): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < world.nodes.length; i++) {
    const n = world.nodes[i];
    if (n.slot && !open.has(n.slot)) continue;
    const d = dist(x, y, n.x, n.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function findPath(
  world: World,
  from: Pt,
  to: Pt,
  open: ReadonlySet<string>,
): [number, number][] {
  const a = nearestNode(world, from.x, from.y, open);
  const b = nearestNode(world, to.x, to.y, open);
  const n = world.nodes.length;
  const d = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  d[a] = 0;
  for (let iter = 0; iter < n; iter++) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      if (!done[i] && d[i] < best) {
        best = d[i];
        u = i;
      }
    }
    if (u < 0 || u === b) break;
    done[u] = true;
    for (const e of world.nodes[u].edges) {
      const node = world.nodes[e.to];
      if (node.slot && !open.has(node.slot)) continue;
      if (d[u] + e.w < d[e.to]) {
        d[e.to] = d[u] + e.w;
        prev[e.to] = u;
      }
    }
  }
  const path: [number, number][] = [[to.x, to.y]];
  for (let cur = b; cur >= 0; cur = prev[cur]) {
    path.push([world.nodes[cur].x, world.nodes[cur].y]);
    if (cur === a) break;
  }
  path.reverse();
  return path;
}
