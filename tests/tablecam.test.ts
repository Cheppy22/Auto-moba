import { describe, expect, it } from 'vitest';
import { contentFor, shapeDist } from '../src/sim';
import { buildWorld } from '../src/sim/world/map';
import { tierAt } from '../src/sim/world/height';
import {
  LANE_CLOSE,
  LANE_LEAN,
  SIDE_ASPECT,
  TableCamera,
  TILT_MAX,
  TILT_MIN,
} from '../src/render/table/camera';
import { LaneCam } from '../src/render/table/lanecam';
import { APRON } from '../src/render/table/board';
import { groveGates, LIP } from '../src/render/table/longlook';
import { LongRelief, Relief, TERRACE } from '../src/render/table/relief';
import { content } from './helpers';

type Handler = (e: Record<string, unknown>) => void;

/** A canvas stand-in: records listeners and fired events. */
function fakeCanvas() {
  const on = new Map<string, Handler>();
  const fired: string[] = [];
  const canvas = {
    addEventListener: (t: string, h: Handler) => on.set(t, h),
    removeEventListener: (t: string) => on.delete(t),
    dispatchEvent: (e: Event) => {
      fired.push(e.type);
      return true;
    },
    setPointerCapture: () => {},
  };
  const send = (t: string, e: Record<string, unknown>): void => on.get(t)?.(e);
  return { canvas: canvas as unknown as HTMLCanvasElement, send, fired, on };
}

const half = content.map.size / 2;
const mid = (lane: 'top' | 'mid' | 'bot') => {
  const p = content.map.lanes[lane];
  let total = 0;
  for (let i = 1; i < p.length; i++)
    total += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  let left = total / 2;
  for (let i = 1; i < p.length; i++) {
    const len = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    if (left <= len) {
      const k = left / len;
      return {
        x: p[i - 1][0] + (p[i][0] - p[i - 1][0]) * k,
        y: p[i - 1][1] + (p[i][1] - p[i - 1][1]) * k,
      };
    }
    left -= len;
  }
  return { x: p[0][0], y: p[0][1] };
};

describe('table lane camera', () => {
  // screen px map 1:1 onto world x / z (a top-down stand-in for the real ground pick)
  const ground = (cx: number, cy: number, out: { x: number; z: number }): boolean => {
    out.x = cx;
    out.z = cy;
    return true;
  };

  it('leans in on the picked lane middle and sits back without a focus', () => {
    const f = fakeCanvas();
    const lc = new LaneCam(content, f.canvas, ground, () => 1);
    expect(lc.update(null)).toBeNull();
    const m = mid('mid');
    const p = lc.update(m)!;
    expect(p.x).toBeCloseTo(m.x - half, 3);
    expect(p.z).toBeCloseTo(m.y - half, 3);
    expect(lc.zoom).toBe(LANE_LEAN);
    lc.dispose();
    expect(f.on.size).toBe(0);
  });

  it('a drag slides along the lane (clamped to its ends); a short press does not', () => {
    const f = fakeCanvas();
    const lc = new LaneCam(content, f.canvas, ground, () => 1);
    const m = mid('mid');
    const start = { ...lc.update(m)! };
    // a 5 px wobble is still a tap
    f.send('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 });
    f.send('pointermove', { pointerId: 1, clientX: 3, clientY: 4 });
    f.send('pointerup', { pointerId: 1 });
    expect(lc.update(m)).toEqual(start);
    // a long drag toward one end stops at the lane's end
    f.send('pointerdown', { pointerId: 2, clientX: 0, clientY: 0 });
    for (let i = 1; i <= 40; i++)
      f.send('pointermove', { pointerId: 2, clientX: i * 200, clientY: -i * 200 });
    f.send('pointerup', { pointerId: 2 });
    const end = lc.update(m)!;
    const lane = content.map.lanes.mid;
    const ends = [lane[0], lane[lane.length - 1]].map(([x, y]) => [x - half, y - half]);
    const near = Math.min(...ends.map(([x, z]) => Math.hypot(end.x - x, end.z - z)));
    expect(near).toBeLessThan(1);
  });

  it('wheel zooms between the lean-in and the closest limit; zooming out past it sits back', () => {
    const f = fakeCanvas();
    const lc = new LaneCam(content, f.canvas, ground, () => 1);
    const m = mid('top');
    lc.update(m);
    const wheel = (deltaY: number) =>
      f.send('wheel', {
        deltaY,
        deltaX: 0,
        deltaMode: 0,
        shiftKey: false,
        preventDefault: () => {},
      });
    for (let i = 0; i < 20; i++) wheel(-100);
    expect(lc.zoom).toBe(LANE_CLOSE);
    for (let i = 0; i < 20 && f.fired.length === 0; i++) wheel(100);
    expect(f.fired).toEqual(['table-sitback']);
    expect(lc.update(m)).toBeNull();
    expect(lc.update(null)).toBeNull();
    expect(lc.update(m)).not.toBeNull();
  });
});

describe('table relief areas', () => {
  const r = new Relief(content, half + 130);
  it('names the raised areas the LOOK doc lists', () => {
    for (const [x, y] of Object.values(content.map.bases))
      expect(r.areaAt(x, y)).toBe('dais-inner');
    const m = mid('mid');
    expect(r.areaAt(m.x, m.y)).toBe('lane');
    for (const s of content.map.slots) expect(r.areaAt(s.x, s.y)).toBe('court-floor');
    expect(r.areaAt(-5, 100)).toBe('frame');
  });
});

describe('the Long Board in the table view', () => {
  const long = contentFor(content, 'long');
  const map = long.map;
  const W = map.size;
  const L = map.length!;
  const t = map.terraces!;
  const r = new LongRelief(map, APRON, 20, LIP);
  const T = TERRACE.step;
  const world = buildWorld(map);
  const shapes = world.terrain.shapes;
  const ground = (cx: number, cy: number, out: { x: number; z: number }): boolean => {
    out.x = cx;
    out.z = cy;
    return true;
  };

  it('raises the three tiers where the sim puts them: units stand at their tier height', () => {
    let checked = 0;
    for (let y = 40; y < L; y += 37)
      for (let x = 40; x < W; x += 37) {
        const e = Math.abs(y - L / 2);
        // skip the ramps and cliff edges, the dais, Bastion tiles and the banks of sunken floors
        if (Math.abs(e - t.river) < 135 || Math.abs(e - t.home) < 135) continue;
        if (Object.values(map.bases).some(([bx, by]) => Math.hypot(x - bx, y - by) < 280)) continue;
        const sites = Object.values(map.bastions!).flatMap((s) => Object.values(s).flat());
        if (sites.some(([bx, by]) => Math.max(Math.abs(x - bx), Math.abs(y - by)) < 95)) continue;
        if (!shapes.some((s) => shapeDist(s, x, y) < -30)) continue;
        if (
          shapes.some(
            (s) => (s.kind === 'grove' || s.kind === 'pit') && Math.abs(shapeDist(s, x, y)) < 45,
          )
        )
          continue;
        const pit =
          shapeDist(
            shapes.find((s) => s.kind === 'pit')!,
            x,
            y,
          ) < 0;
        const want = pit ? TERRACE.pit : tierAt(world.height, x, y) * T;
        expect(Math.abs(r.atSim(x, y) - want), `(${x}, ${y})`).toBeLessThan(3);
        checked++;
      }
    expect(checked).toBeGreaterThan(400);
  });

  it('lanes climb the ramps; open ground stands above its terrace; the river is water', () => {
    const [lx] = map.lanes.top[1];
    const ramp = (e: number): number => r.atSim(lx, L / 2 + e);
    expect(ramp(t.river - 20)).toBeCloseTo(0, 0);
    expect(ramp(t.river + t.rampLen / 2)).toBeGreaterThan(T * 0.3);
    expect(ramp(t.river + t.rampLen / 2)).toBeLessThan(T * 0.7);
    expect(ramp(t.home + t.rampLen + 30)).toBeCloseTo(2 * T, 0);
    // dead space between the Sally spur and the Mid lane on the midfield terrace, and open water
    expect(r.atSim(810, L / 2 + 450)).toBeGreaterThan(T + LIP.h - 2);
    expect(r.atSim(60, L / 2)).toBeLessThan(0);
    // past the edge the apron carries on the home terrace's floor and the river's water
    expect(r.atSim(-50, 100)).toBeCloseTo(2 * T + LIP.h, 3);
    expect(r.atSim(-50, L / 2)).toBe(TERRACE.water);
  });

  it('all dead space stands one flat lip over its terrace', () => {
    expect(r.atSim(810, L / 2 + 450)).toBeCloseTo(T + LIP.h, 0);
    expect(r.atSim(200, L / 2 + 1600)).toBeCloseTo(2 * T + LIP.h, 0);
  });

  it('a gate arch stands wherever a path crosses a grove edge, matching the sim', () => {
    const gates = groveGates(map);
    // each grove: the five clearing gate paths, a Sally spur, the River Road on its outer side
    expect(gates.filter((g) => g.kind === 'sally')).toHaveLength(2);
    expect(gates.filter((g) => g.kind === 'port')).toHaveLength(10);
    expect(gates.filter((g) => g.kind === 'road')).toHaveLength(2);
    expect(gates).toHaveLength(14);
    const groves = shapes.filter((s) => s.kind === 'grove');
    for (const g of gates) {
      // on a grove's edge, as wide as the path through it, and the path really is walkable there
      expect(Math.min(...groves.map((s) => Math.abs(shapeDist(s, g.x, g.y))))).toBeLessThan(2);
      expect(g.half).toBeGreaterThan(30);
      expect(g.half).toBeLessThan(110);
      expect(
        shapes.some((s) => s.kind === g.kind && shapeDist(s, g.x + g.nx * 6, g.y + g.ny * 6) < 0),
      ).toBe(true);
    }
    // the spurs end in the river-tip clearings (W3, E3): their gates are on those clearings
    for (const id of ['w3', 'e3']) {
      const sl = map.slots.find((s) => s.id === id)!;
      const g = gates.find((x) => x.kind === 'sally' && Math.hypot(x.x - sl.x, x.y - sl.y) < 160);
      expect(g, id).toBeDefined();
    }
  });

  it('the lane camera leans in on the long lanes and drags to their ends', () => {
    const f = { on: new Map<string, (e: Record<string, unknown>) => void>() };
    const canvas = {
      addEventListener: (k: string, h: (e: Record<string, unknown>) => void) => f.on.set(k, h),
      removeEventListener: () => {},
      dispatchEvent: () => true,
      setPointerCapture: () => {},
    } as unknown as HTMLCanvasElement;
    const lc = new LaneCam(long, canvas, ground, () => 1);
    const p = lc.update({ x: 375, y: L / 2 })!;
    expect(p.x).toBeCloseTo(375 - W / 2, 3);
    expect(p.z).toBeCloseTo(0, 3);
    const send = (k: string, e: Record<string, unknown>): void => f.on.get(k)?.(e);
    send('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 });
    for (let i = 1; i <= 40; i++)
      send('pointermove', { pointerId: 1, clientX: 0, clientY: -i * 200 });
    send('pointerup', { pointerId: 1 });
    // dragging the board up pulls the view toward White's end, down the lane to White's base
    const end = lc.update({ x: 375, y: L / 2 })!;
    expect(
      Math.hypot(end.x - (map.bases.A[0] - W / 2), end.z - (map.bases.A[1] - L / 2)),
    ).toBeLessThan(1);
  });

  it('portrait starts behind White, wide screens side-on (White left); zooming out frames the whole board', () => {
    const cam = new TableCamera(long, 200, 400);
    const toScreen = (x: number, y: number, w: number, h: number): [number, number] => {
      const v = cam.camera.position
        .clone()
        .set(x - W / 2, 0, y - L / 2)
        .project(cam.camera);
      return [((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h];
    };
    const bases = (w: number, h: number) => ({
      a: toScreen(...(map.bases.A as [number, number]), w, h),
      b: toScreen(...(map.bases.B as [number, number]), w, h),
    });
    for (const [w, h, bottom] of [
      [390, 844, 136],
      [844, 390, 0],
      [1280, 800, 0],
    ] as const) {
      cam.fit(w, h);
      const { a, b } = bases(w, h);
      if (w / h < SIDE_ASPECT) {
        // White's base low on the screen, above the bottom HUD; Black's base farther up the screen
        expect(a[1], `${w}x${h}`).toBeLessThan(h - bottom);
        expect(a[1], `${w}x${h}`).toBeGreaterThan(h * 0.45);
        expect(b[1], `${w}x${h}`).toBeLessThan(a[1] - 100);
        // both outer lanes, where they turn up the board, are on screen
        for (const x of [375 - 90, 1625 + 90]) {
          const [sx] = toScreen(x, 3150, w, h);
          expect(sx, `${w}x${h} lane at ${x}`).toBeGreaterThan(0);
          expect(sx, `${w}x${h} lane at ${x}`).toBeLessThan(w);
        }
      } else {
        // side-on: White's base on the left, Black's on the right, level with each other, both in view
        expect(cam.home.yaw).toBeCloseTo(Math.PI / 2, 5);
        expect(a[0], `${w}x${h}`).toBeGreaterThan(0);
        expect(a[0], `${w}x${h}`).toBeLessThan(w * 0.3);
        expect(b[0], `${w}x${h}`).toBeGreaterThan(w * 0.7);
        expect(b[0], `${w}x${h}`).toBeLessThan(w);
        expect(Math.abs(a[1] - b[1]), `${w}x${h}`).toBeLessThan(h * 0.08);
        // lean-ins keep the end-on distances
        expect(cam.laneDist(0.5)).toBeGreaterThan(cam.wholeDist * 0.5);
      }
      expect(cam.turned).toBe(false);
      // pinched all the way out over the middle, both bases are in view
      Object.assign(cam.goal, { x: 0, z: 0, d: 1e9 });
      cam.update(10, 100);
      for (const [bx, bz] of [map.bases.A, map.bases.B]) {
        const [sx, sy] = toScreen(bx, bz, w, h);
        expect(sx).toBeGreaterThan(0);
        expect(sx).toBeLessThan(w);
        expect(sy).toBeGreaterThan(0);
        expect(sy).toBeLessThan(h);
      }
      cam.goHome();
      cam.update(10, 100);
    }
  });

  it('a phone turned to landscape follows the side-on default; the compass returns to it', () => {
    const cam = new TableCamera(long, 200, 400);
    cam.fit(390, 844);
    expect(cam.home.yaw).toBe(0);
    expect(cam.orient).toBe('portrait');
    cam.fit(844, 390);
    expect(cam.goal.yaw).toBeCloseTo(Math.PI / 2, 5);
    expect(cam.orient).toBe('landscape');
    cam.update(10, 100);
    cam.goal.yaw += 0.8;
    cam.goal.tilt -= 0.2;
    expect(cam.turned).toBe(true);
    cam.resetAngle();
    cam.update(10, 100);
    expect(cam.turned).toBe(false);
    expect(cam.pose.yaw).toBeCloseTo(Math.PI / 2, 3);
  });

  it('the camera stays on the map and in its tilt range; the compass resets the angle', () => {
    const cam = new TableCamera(long, 200, 400);
    cam.fit(390, 844);
    Object.assign(cam.goal, { x: 99999, z: -99999, d: 1, tilt: 0 });
    cam.update(10, 100);
    expect(cam.pose.x).toBeCloseTo(W / 2, 3);
    expect(cam.pose.z).toBeCloseTo(-L / 2, 3);
    expect(cam.pose.d).toBe(cam.minD);
    expect(cam.pose.tilt).toBeCloseTo((TILT_MIN * Math.PI) / 180, 5);
    cam.goal.tilt = 3;
    cam.update(10, 100);
    expect(cam.pose.tilt).toBeCloseTo((TILT_MAX * Math.PI) / 180, 5);
    cam.goal.yaw += 1;
    expect(cam.turned).toBe(true);
    cam.resetAngle();
    cam.update(10, 100);
    expect(cam.turned).toBe(false);
  });
});
