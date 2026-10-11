import { describe, expect, it } from 'vitest';
import { LANE_CLOSE, LANE_LEAN } from '../src/render/table/camera';
import { LaneCam } from '../src/render/table/lanecam';
import { Relief } from '../src/render/table/relief';
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
    expect(lc.update(null, half)).toBeNull();
    const m = mid('mid');
    const p = lc.update(m, half)!;
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
    const start = { ...lc.update(m, half)! };
    // a 5 px wobble is still a tap
    f.send('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 });
    f.send('pointermove', { pointerId: 1, clientX: 3, clientY: 4 });
    f.send('pointerup', { pointerId: 1 });
    expect(lc.update(m, half)).toEqual(start);
    // a long drag toward one end stops at the lane's end
    f.send('pointerdown', { pointerId: 2, clientX: 0, clientY: 0 });
    for (let i = 1; i <= 40; i++)
      f.send('pointermove', { pointerId: 2, clientX: i * 200, clientY: -i * 200 });
    f.send('pointerup', { pointerId: 2 });
    const end = lc.update(m, half)!;
    const lane = content.map.lanes.mid;
    const ends = [lane[0], lane[lane.length - 1]].map(([x, y]) => [x - half, y - half]);
    const near = Math.min(...ends.map(([x, z]) => Math.hypot(end.x - x, end.z - z)));
    expect(near).toBeLessThan(1);
  });

  it('wheel zooms between the lean-in and the closest limit; zooming out past it sits back', () => {
    const f = fakeCanvas();
    const lc = new LaneCam(content, f.canvas, ground, () => 1);
    const m = mid('top');
    lc.update(m, half);
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
    expect(lc.update(m, half)).toBeNull();
    expect(lc.update(null, half)).toBeNull();
    expect(lc.update(m, half)).not.toBeNull();
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
