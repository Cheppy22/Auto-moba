import { describe, expect, it } from 'vitest';
import { buildTerrain, clearLine, confine, shapeDist, walkable } from '../src/sim';
import type { Terrain } from '../src/sim';
import { buildWorld, findPath, laneWaypoints } from '../src/sim/world/map';
import { content, liveMatch } from './helpers';

const map = content.map;
const terrain = buildTerrain(map);
const world = buildWorld(map);
const allOpen = new Set(map.slots.map((s) => s.id));
const noneOpen = new Set<string>();
const teams = ['A', 'B'] as const;
const lanes = ['top', 'mid', 'bot'] as const;

/** Distance to the nearest usable shape: <= 0 inside, small positive when just outside. */
function outside(t: Terrain, open: ReadonlySet<string>, x: number, y: number): number {
  let best = Infinity;
  for (const s of t.shapes) {
    if (s.slot !== null && !open.has(s.slot)) continue;
    best = Math.min(best, shapeDist(s, x, y));
  }
  return best;
}

const where = (name: string, x: number, y: number): string => `${name} at (${x}, ${y})`;

function expectWalkable(name: string, open: ReadonlySet<string>, x: number, y: number): void {
  expect(outside(terrain, open, x, y), where(name, x, y)).toBeLessThanOrEqual(0.01);
}

describe('spawn points are walkable', () => {
  it('bases, hero spawn and respawn offsets, recall landings', () => {
    for (const team of teams) {
      const b = world.basePos[team];
      expectWalkable(`base ${team}`, noneOpen, b.x, b.y);
      const dir = team === 'A' ? 1 : -1;
      for (let slot = 0; slot < 5; slot++) {
        // The offsets used by respawnHeroes in src/sim/systems.ts.
        expectWalkable(
          `respawn ${team}${slot}`,
          noneOpen,
          b.x + dir * (14 + slot * 7),
          b.y - dir * (14 + (slot % 2) * 9),
        );
      }
      expectWalkable(`recall ${team}`, noneOpen, b.x + dir * 16, b.y - dir * 16);
    }
  });

  it('guardians and towers', () => {
    for (const team of teams) {
      const g = world.guardianPos[team];
      expectWalkable(`guardian ${team}`, noneOpen, g.x, g.y);
      for (const lane of lanes) {
        for (const p of world.towerPos[team][lane])
          expectWalkable(`tower ${team} ${lane}`, noneOpen, p.x, p.y);
      }
    }
  });

  it('minion spawn points along the first stretch of each lane', () => {
    for (const team of teams) {
      for (const lane of lanes) {
        const path = laneWaypoints(world, team, lane);
        const [p0, p1] = path;
        const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
        // Wave offsets: up to a dozen bodies 9 apart plus the mid lane lead.
        for (let off = 0; off <= 280; off += 9) {
          const f = Math.min(off, len) / len;
          expectWalkable(
            `minion ${team} ${lane} +${off}`,
            noneOpen,
            p0[0] + (p1[0] - p0[0]) * f,
            p0[1] + (p1[1] - p0[1]) * f,
          );
        }
      }
    }
  });

  it('every camp home of every biome in every slot, mirrored or not', () => {
    for (const biome of content.biomes) {
      const maxCount = Math.max(...biome.campTypes.map((t) => t.count));
      for (const sdef of map.slots) {
        const open = new Set([sdef.id]);
        for (const mirrored of [false, true]) {
          for (const pos of biome.camps) {
            const hx = sdef.x + (mirrored ? pos.dy : pos.dx);
            const hy = sdef.y + (mirrored ? pos.dx : pos.dy);
            for (let i = 0; i < maxCount; i++) {
              const ox = maxCount > 1 ? (i - (maxCount - 1) / 2) * 14 : 0;
              expectWalkable(`camp ${biome.id} in ${sdef.id}`, open, hx + ox, hy);
            }
          }
        }
      }
    }
  });

  it('tide spirits spawn inside their slot', () => {
    for (const sdef of map.slots) {
      for (let i = 0; i < 3; i++)
        expectWalkable(`tide ${sdef.id}`, new Set([sdef.id]), sdef.x + (i - 1) * 10, sdef.y + 6);
    }
  });

  it('obelisk nodes, keeper spots, shops and slot centres', () => {
    for (const n of map.obeliskNodes)
      expectWalkable(`obelisk ${n.id}`, n.slot ? new Set([n.slot]) : noneOpen, n.x, n.y);
    for (const k of map.keeperSpots) expectWalkable(`keeper ${k.id}`, noneOpen, k.x, k.y);
    for (const s of map.shops) expectWalkable(`shop ${s.id}`, noneOpen, s.x, s.y);
    for (const s of map.slots) expectWalkable(`slot ${s.id}`, new Set([s.id]), s.x, s.y);
  });

  it('jungle event sites and routes', () => {
    // Procession routes between every pair of open slots.
    for (const a of map.slots) {
      for (const b of map.slots) {
        const pa = world.slotPos[a.id];
        const pb = world.slotPos[b.id];
        const route =
          a.id === b.id
            ? [
                [pa.x, pa.y],
                [pa.x + 60, pa.y],
                [pa.x + 60, pa.y + 60],
                [pa.x, pa.y + 60],
              ]
            : findPath(world, pa, pb, allOpen);
        for (let i = 0; i < route.length; i++) {
          expectWalkable(`route ${a.id}->${b.id}`, allOpen, route[i][0], route[i][1]);
          if (i > 0) {
            const [ax, ay] = route[i - 1];
            const [bx, by] = route[i];
            expect(clearLine(terrain, allOpen, ax, ay, bx, by), `leg ${a.id}->${b.id}`).toBe(true);
          }
        }
      }
    }
    // Parade routes: the lane's middle, then its waypoints toward either base.
    for (const lane of ['top', 'bot'] as const) {
      for (const from of teams) {
        const wps = laneWaypoints(world, from, lane);
        for (let i = 0; i < wps.length; i++) {
          expectWalkable(`parade ${lane}`, noneOpen, wps[i][0], wps[i][1]);
          if (i > 0) {
            const [ax, ay] = wps[i - 1];
            const [bx, by] = wps[i];
            expect(clearLine(terrain, noneOpen, ax, ay, bx, by)).toBe(true);
          }
        }
      }
    }
  });
});

describe('the nav graph stays on walkable ground', () => {
  it('every edge is walkable along its length (slot edges with their slot open)', () => {
    let edges = 0;
    world.nodes.forEach((a) => {
      for (const e of a.edges) {
        const b = world.nodes[e.to];
        const open = a.slot || b.slot ? allOpen : noneOpen;
        edges++;
        expect(
          clearLine(terrain, open, a.x, a.y, b.x, b.y),
          `edge ${a.x},${a.y} -> ${b.x},${b.y}`,
        ).toBe(true);
        // A finer walk than clearLine's own sampling.
        const n = Math.ceil(e.w / 2);
        for (let i = 0; i <= n; i++) {
          const f = i / n;
          expectWalkable('edge', open, a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f);
        }
      }
    });
    expect(edges).toBeGreaterThan(50);
  });
});

describe('terrain queries', () => {
  it('confine keeps a walkable point and moves an outside point to the boundary', () => {
    const inside = world.lanes.top.pts[1];
    expect(walkable(terrain, noneOpen, inside[0], inside[1])).toBe(true);
    expect(confine(terrain, noneOpen, inside[0], inside[1])).toEqual({
      x: inside[0],
      y: inside[1],
    });
    // Straight out from the top lane's vertical stretch.
    const out = confine(terrain, noneOpen, inside[0] + 70, 700);
    expect(walkable(terrain, noneOpen, out.x, out.y)).toBe(true);
    expect(Math.abs(out.x - (inside[0] + map.walk.lane))).toBeLessThan(0.5);
    expect(out.y).toBeCloseTo(700, 3);
  });

  it('clearLine holds along a lane and fails across solid ground between lanes', () => {
    const top = map.lanes.top;
    for (let i = 1; i < top.length; i++)
      expect(clearLine(terrain, noneOpen, top[i - 1][0], top[i - 1][1], top[i][0], top[i][1])).toBe(
        true,
      );
    // From the left lane (x = 110) straight across to the middle lane.
    expect(clearLine(terrain, noneOpen, 110, 700, 300, 700)).toBe(false);
    expect(walkable(terrain, noneOpen, 205, 700)).toBe(false);
  });

  it('closed jungle slots are solid, open ones walkable', () => {
    const s = map.slots[0];
    expect(walkable(terrain, noneOpen, s.x, s.y)).toBe(false);
    expect(walkable(terrain, new Set([s.id]), s.x, s.y)).toBe(true);
  });
});

describe('symmetry of the walk shapes', () => {
  const near = (x1: number, y1: number, x2: number, y2: number): boolean =>
    Math.hypot(x1 - x2, y1 - y2) < 1.5;
  /** True when some shape of the same kind and size is `s` carried over by `f`, either way round. */
  const hasTwin = (s: Terrain['shapes'][number], f: (x: number, y: number) => [number, number]) => {
    const [pax, pay] = f(s.ax, s.ay);
    const [pbx, pby] = f(s.bx, s.by);
    return terrain.shapes.find(
      (o) =>
        o.kind === s.kind &&
        Math.abs(o.r - s.r) < 0.01 &&
        ((near(o.ax, o.ay, pax, pay) && near(o.bx, o.by, pbx, pby)) ||
          (near(o.ax, o.ay, pbx, pby) && near(o.bx, o.by, pax, pay))),
    );
  };

  it('lanes, bases, jungle clearings and Keeper spots mirror across y = x', () => {
    for (const s of terrain.shapes) {
      if (s.kind === 'shop' || (s.kind === 'port' && !s.slot)) continue;
      const twin = hasTwin(s, (x, y) => [y, x]);
      expect(twin, `${s.kind} shape (${s.ax},${s.ay})-(${s.bx},${s.by})`).toBeDefined();
      if (twin && s.slot !== null) {
        const a = map.slots.find((d) => d.id === s.slot)!;
        const b = map.slots.find((d) => d.id === twin.slot)!;
        expect(near(a.x, a.y, b.y, b.x)).toBe(true);
        expect(a.openPhase).toBe(b.openPhase);
      }
    }
  });

  it('the two jungle shops and their paths are point-symmetric about the map centre', () => {
    const shops = terrain.shapes.filter((s) => s.kind === 'shop' || (s.kind === 'port' && !s.slot));
    expect(shops.length).toBeGreaterThan(0);
    for (const s of shops) {
      const twin = hasTwin(s, (x, y) => [map.size - x, map.size - y]);
      expect(twin, `shop shape (${s.ax},${s.ay})-(${s.bx},${s.by})`).toBeDefined();
    }
  });
});

describe('units stay inside walkable space during full matches', () => {
  for (const seed of [11, 22, 33]) {
    it(`seed ${seed}: every living unit is walkable at every 10th tick`, () => {
      const m = liveMatch(seed);
      const open = m.ctx.open;
      let samples = 0;
      let worst = -Infinity;
      let worstWhere = '';
      {
        while (m.state.phase.kind === 'live') {
          m.step(10);
          for (const u of m.state.units) {
            if (!u.alive) continue;
            const d = outside(terrain, open, u.x, u.y);
            samples++;
            if (d > worst) {
              worst = d;
              worstWhere = `${u.kind} ${u.defId} at (${u.x.toFixed(1)}, ${u.y.toFixed(1)}) tick ${m.state.tick}`;
            }
          }
        }
      }
      expect(samples).toBeGreaterThan(10000);
      expect(worst, worstWhere).toBeLessThanOrEqual(0.01);
    }, 60000);
  }
});
