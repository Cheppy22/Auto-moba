import { describe, expect, it } from 'vitest';
import { buildWorld } from '../src/sim/world/map';
import { content } from './helpers';

const reflect = (p: { x: number; y: number }): { x: number; y: number } => ({ x: p.y, y: p.x });
const near = (a: { x: number; y: number }, b: { x: number; y: number }): boolean =>
  Math.hypot(a.x - b.x, a.y - b.y) < 1.5;

describe('map fairness (reflection across the line y = x swaps the teams)', () => {
  const world = buildWorld(content.map);

  it('bases, guardians and towers mirror each other', () => {
    expect(near(reflect(world.basePos.A), world.basePos.B)).toBe(true);
    expect(near(reflect(world.guardianPos.A), world.guardianPos.B)).toBe(true);
    for (const lane of ['top', 'mid', 'bot'] as const) {
      for (const i of [0, 1] as const) {
        expect(near(reflect(world.towerPos.A[lane][i]), world.towerPos.B[lane][i])).toBe(true);
      }
    }
  });

  it('each lane maps onto itself with the ends swapped', () => {
    for (const lane of ['top', 'mid', 'bot'] as const) {
      const pts = content.map.lanes[lane];
      for (const [x, y] of pts) {
        const r = reflect({ x, y });
        expect(pts.some(([qx, qy]) => near({ x: qx, y: qy }, r))).toBe(true);
      }
    }
  });

  it('biome slots open as mirrored pairs (or sit on the axis)', () => {
    for (const s of content.map.slots) {
      const r = reflect(s);
      const onAxis = near(s, r);
      const twin = content.map.slots.find((o) => o.id !== s.id && near(o, r));
      if (onAxis) {
        const sameGroup = content.map.slots.filter((o) => o.openPhase === s.openPhase);
        expect(sameGroup.length).toBe(2);
      } else {
        expect(twin).toBeDefined();
        expect(twin!.openPhase).toBe(s.openPhase);
      }
    }
  });

  it('obelisk nodes and keeper spots have mirrored twins', () => {
    for (const n of content.map.obeliskNodes) {
      expect(content.map.obeliskNodes.some((o) => near(o, reflect(n)))).toBe(true);
    }
    for (const k of content.map.keeperSpots) {
      expect(content.map.keeperSpots.some((o) => near(o, reflect(k)))).toBe(true);
    }
  });
});
