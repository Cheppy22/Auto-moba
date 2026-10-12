import { describe, expect, it } from 'vitest';
import { Match, contentFor, type LaneId } from '../src/sim';
import { buildWorld, findPath, laneWaypoints, seatLanes, type Pt } from '../src/sim/world/map';
import { clearLine, walkable } from '../src/sim/world/terrain';
import {
  attackRange,
  highGroundEdge,
  reachActive,
  sightRadius,
  tierAt,
} from '../src/sim/world/height';
import { content, liveMatch, logHash, piece } from './helpers';

const long = contentFor(content, 'long');
const map = long.map;
const W = map.size;
const L = map.length ?? map.size;
const world = buildWorld(map);
const everywhere = { has: (): boolean => true };
const allSlots: ReadonlySet<string> = new Set(map.slots.map((s) => s.id));
const turn = (p: Pt): Pt => ({ x: W - p.x, y: L - p.y });
const at = ([x, y]: readonly number[]): Pt => ({ x, y });
const near = (a: Pt, b: Pt, eps = 0.05): boolean => Math.hypot(a.x - b.x, a.y - b.y) < eps;
const SWAP: Record<LaneId, LaneId> = { top: 'bot', mid: 'mid', bot: 'top' };
const LANE_IDS: LaneId[] = ['top', 'mid', 'bot'];

function pathLength(p: [number, number][]): number {
  let n = 0;
  for (let i = 1; i < p.length; i++) n += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  return n;
}

/** A nav path whose every step is a straight walkable line, from and to visible nodes. */
function walk(from: Pt, to: Pt): [number, number][] {
  return findPath(world, from, to, allSlots, {
    from: (x, y) => clearLine(world.terrain, everywhere, from.x, from.y, x, y),
    to: (x, y) => clearLine(world.terrain, everywhere, to.x, to.y, x, y),
  });
}

describe('Long Board map data: a 180° turn about the Pit swaps the teams', () => {
  it('is 2000 × 4000 with the river across the middle', () => {
    expect(W).toBe(2000);
    expect(L).toBe(4000);
    expect(world.rotated).toBe(true);
    expect(world.k).toBe(1.95);
  });

  it('Mid maps onto itself and the Left lane onto the Right one, ends swapped', () => {
    const mid = map.lanes.mid.map(at);
    expect(
      mid
        .map(turn)
        .reverse()
        .every((p, i) => near(p, mid[i])),
    ).toBe(true);
    const top = map.lanes.top.map(at);
    const bot = map.lanes.bot.map(at);
    expect(
      top
        .map(turn)
        .reverse()
        .every((p, i) => near(p, bot[i])),
    ).toBe(true);
  });

  it('bases, Thrones and Bastions are twins (White top is Black bot)', () => {
    expect(near(turn(world.basePos.A), world.basePos.B)).toBe(true);
    expect(near(turn(world.guardianPos.A), world.guardianPos.B)).toBe(true);
    for (const lane of LANE_IDS)
      for (const i of [0, 1] as const)
        expect(near(turn(world.towerPos.A[lane][i]), world.towerPos.B[SWAP[lane]][i])).toBe(true);
  });

  it('clearings open in twin pairs with twin gates', () => {
    for (const s of map.slots) {
      const twin = map.slots.find((o) => o.id !== s.id && near(at([o.x, o.y]), turn(s)));
      expect(twin, s.id).toBeDefined();
      expect(twin!.openPhase).toBe(s.openPhase);
      expect(twin!.radius).toBe(s.radius);
      for (const p of s.ports) {
        const q = twin!.ports.find(
          (o) => o.lane === SWAP[p.lane] && Math.abs(o.t - (1 - p.t)) < 1e-5,
        );
        expect(q, `${s.id} ${p.lane}`).toBeDefined();
      }
    }
    // home ends first, then the middles, then the river tips
    const phase = (id: string): number => map.slots.find((s) => s.id === id)!.openPhase;
    expect([phase('w1'), phase('e1'), phase('w2'), phase('e2'), phase('w3'), phase('e3')]).toEqual([
      1, 1, 2, 2, 3, 3,
    ]);
  });

  it('every area, obelisk node, Keeper spot and shop has a twin', () => {
    for (const a of map.areas) {
      const pts = a.pts.map(at).map(turn);
      const twin = map.areas.find(
        (o) =>
          o.kind === a.kind &&
          o.r === a.r &&
          o.box === a.box &&
          o.pts.length === pts.length &&
          (o.pts.every((p, i) => near(at(p), pts[i])) ||
            o.pts.every((p, i) => near(at(p), pts[pts.length - 1 - i]))),
      );
      expect(twin, a.id).toBeDefined();
    }
    for (const n of map.obeliskNodes) {
      const twin = map.obeliskNodes.find((o) => near(at([o.x, o.y]), turn(n)));
      expect(twin, n.id).toBeDefined();
      expect(!!twin!.slot).toBe(!!n.slot);
    }
    for (const k of map.keeperSpots)
      expect(map.keeperSpots.some((o) => near(at([o.x, o.y]), turn(k)))).toBe(true);
    for (const s of map.shops)
      expect(map.shops.some((o) => near(at([o.x, o.y]), turn(s)))).toBe(true);
    expect(near(turn(map.neutralSite!), map.neutralSite!)).toBe(true);
  });

  it('walkable ground and heights are the same from both seats', () => {
    let checked = 0;
    for (let y = 3.1; y < L; y += 19) {
      for (let x = 2.7; x < W; x += 19) {
        const p = { x, y };
        const q = turn(p);
        expect(walkable(world.terrain, everywhere, x, y)).toBe(
          walkable(world.terrain, everywhere, q.x, q.y),
        );
        expect(tierAt(world.height, x, y)).toBe(tierAt(world.height, q.x, q.y));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20000);
  });

  it('seat order: Black reads its Left lane as bot', () => {
    expect(seatLanes(world, 'A')).toEqual(['top', 'mid', 'bot']);
    expect(seatLanes(world, 'B')).toEqual(['bot', 'mid', 'top']);
    expect(seatLanes(buildWorld(content.map), 'B')).toEqual(['top', 'mid', 'bot']);
  });
});

describe('Long Board terrain and paths', () => {
  it('heights: home terrace, midfield terrace, river; groves and ramps are low', () => {
    const tier = (x: number, y: number): number => tierAt(world.height, x, y);
    expect(tier(1000, 3740)).toBe(2); // White's base
    expect(tier(1000, 2600)).toBe(1); // White's Mid outer Bastion
    expect(tier(1000, 2000)).toBe(0); // the Pit
    expect(tier(1000, 2300)).toBe(0); // river ramp (counts as its lower tier)
    expect(tier(1000, 3050)).toBe(1); // home ramp
    expect(tier(715, 1300)).toBe(0); // West Grove floor, sunken
    expect(tier(502, 1300)).toBe(1); // the verge beside it looks down into it
    expect(tier(375, 1300)).toBe(1);
    expect(tierAt(buildWorld(content.map).height, 1000, 3740)).toBe(0); // the square map is flat
  });

  it('lanes narrow on the ramps; verges join the lane; groves sit behind a lip', () => {
    const ok = (x: number, y: number): boolean => walkable(world.terrain, everywhere, x, y);
    expect(ok(375 + 80, 1500)).toBe(true); // lane edge on the terrace
    expect(ok(375 + 80, 1700)).toBe(false); // the river ramp is 130 wide
    expect(ok(375 + 60, 1700)).toBe(true);
    expect(ok(502, 1300)).toBe(true); // verge
    expect(ok(555, 1300)).toBe(false); // the lip between verge and grove
    expect(ok(600, 1300)).toBe(true); // grove floor
    expect(clearLine(world.terrain, everywhere, 375, 1300, 715, 1300)).toBe(false);
    expect(clearLine(world.terrain, everywhere, 375, 1165, 715, 1165)).toBe(true); // gate W1
  });

  it('every lane is walkable end to end for both teams', () => {
    for (const team of ['A', 'B'] as const)
      for (const lane of LANE_IDS) {
        const wps = laneWaypoints(world, team, lane);
        for (let i = 1; i < wps.length; i++) {
          const [ax, ay] = wps[i - 1];
          const [bx, by] = wps[i];
          expect(clearLine(world.terrain, everywhere, ax, ay, bx, by)).toBe(true);
        }
      }
  });

  it('paths reach every goal from both bases, as long from either seat', () => {
    const goals: Pt[] = [
      world.basePos.B,
      ...map.slots.map((s) => at([s.x, s.y])),
      ...map.shops.map((s) => at([s.x, s.y])),
      ...map.keeperSpots.map((s) => at([s.x, s.y])),
      ...map.obeliskNodes.map((s) => at([s.x, s.y])),
    ];
    for (const g of goals) {
      const a = walk(world.basePos.A, g);
      const b = walk(world.basePos.B, turn(g));
      expect(near(at(a[a.length - 1]), g)).toBe(true);
      for (let i = 1; i < a.length; i++) {
        const [ax, ay] = a[i - 1];
        const [bx, by] = a[i];
        expect(
          clearLine(world.terrain, everywhere, ax, ay, bx, by),
          `${g.x},${g.y} step ${i}`,
        ).toBe(true);
      }
      expect(Math.abs(pathLength(a) - pathLength(b))).toBeLessThan(1);
    }
  });

  it('the Sally Path links the Left lane to the Square, and its spur reaches the enemy grove tip', () => {
    const lane = { x: 375, y: 2900 };
    const square = { x: 1000, y: 2850 };
    expect(pathLength(walk(lane, square))).toBeLessThan(800);
    const tip = { x: 715, y: 2300 };
    expect(pathLength(walk({ x: 640, y: 2760 }, tip))).toBeLessThan(500);
  });
});

describe('Long Board high ground: Reach and Sight', () => {
  const setup = (): {
    m: Match;
    queen: ReturnType<typeof piece>;
    king: ReturnType<typeof piece>;
  } => {
    const m = liveMatch(5, { map: 'long' });
    return { m, queen: piece(m, 'A', 'queen'), king: piece(m, 'B', 'king') };
  };

  it('Reach: a ranged piece shooting down a tier reaches 15% farther; melee and same tier do not', () => {
    const { m, queen, king } = setup();
    const ctx = m.ctx;
    queen.x = 1000;
    queen.y = 2420; // terrace, tier 1
    king.x = 1000;
    king.y = 2330; // river ramp, tier 0
    expect(queen.atkRange).toBeGreaterThanOrEqual(60);
    expect(reachActive(ctx, queen, king)).toBe(true);
    expect(attackRange(ctx, queen, king)).toBeCloseTo(queen.stats.range * 1.15, 6);
    expect(reachActive(ctx, king, queen)).toBe(false);
    king.y = 2450; // same tier
    expect(attackRange(ctx, queen, king)).toBe(queen.stats.range);
    const rook = piece(m, 'A', 'rook');
    rook.x = 1000;
    rook.y = 2420;
    king.y = 2330;
    expect(reachActive(ctx, rook, king)).toBe(false); // melee
    const bastion = ctx.towers.A.mid[0]!;
    expect(reachActive(ctx, bastion, king)).toBe(false); // structures never
  });

  it('Sight: looking down spots 25% farther, looking up only within range + 20', () => {
    const { m, queen } = setup();
    const r = 150;
    expect(sightRadius(m.ctx, queen, 1, 0, r)).toBeCloseTo(150 * 1.25, 6);
    expect(sightRadius(m.ctx, queen, 0, 1, r)).toBe(queen.stats.range + 20);
    expect(sightRadius(m.ctx, queen, 1, 1, r)).toBe(r);
  });

  it('the eye-icon flag shows on a piece whose target stands below it', () => {
    const { m, queen, king } = setup();
    queen.x = 1000;
    queen.y = 2420;
    king.x = 1000;
    king.y = 2330;
    queen.targetId = king.id;
    expect(highGroundEdge(m.ctx, queen)).toBe(true);
    expect(m.snapshot().units.find((u) => u.id === queen.id)!.highGround).toBe(true);
    queen.targetId = null;
    expect(m.snapshot().units.find((u) => u.id === queen.id)!.highGround).toBeUndefined();
    // never on the square map
    const flat = liveMatch(5);
    flat.step(2400);
    expect(flat.snapshot().units.some((u) => u.highGround)).toBe(false);
  });
});

describe('Long Board determinism', () => {
  for (const seed of [29000, 31000]) {
    it(`seed ${seed}: the match ends, and its replay reproduces it exactly`, () => {
      const m = Match.create(content, { seed, autoGambits: { A: true, B: true }, map: 'long' });
      m.runToEnd(12);
      expect(m.state.phase.kind).toBe('end');
      expect(m.state.winner === 'A' || m.state.winner === 'B' || m.state.winner === null).toBe(
        true,
      );
      for (const u of m.state.units)
        expect(Number.isFinite(u.x) && Number.isFinite(u.y)).toBe(true);
      const again = Match.fromReplay(content, JSON.parse(JSON.stringify(m.exportReplay())));
      expect(again.state.tick).toBe(m.state.tick);
      expect(logHash(again)).toBe(logHash(m));
    }, 240_000);
  }
});
