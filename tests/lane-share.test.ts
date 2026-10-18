import { describe, expect, it } from 'vitest';
import { measureLaneShare, METRICS, type LaneShare } from '../tools/lane-share';
import { content } from './helpers';

describe('lane discipline', () => {
  it('does not funnel hero fights and hero time into the mid lane (fixed seeds, loose bounds)', () => {
    const sum = {} as LaneShare;
    for (const m of METRICS) sum[m] = { top: 0, mid: 0, bot: 0 };
    for (const seed of [1, 2, 3]) {
      const r = measureLaneShare(content, seed);
      for (const m of METRICS) for (const l of ['top', 'mid', 'bot'] as const) sum[m][l] += r[m][l];
    }
    const share = (m: (typeof METRICS)[number], l: 'top' | 'mid' | 'bot'): number => {
      const t = sum[m].top + sum[m].mid + sum[m].bot;
      return sum[m][l] / Math.max(1, t);
    };
    // Before the lane-discipline pass mid carried ~89% of hero damage and ~66% of hero time.
    expect(share('heroDamage', 'mid')).toBeLessThan(0.62);
    expect(share('heroTime', 'mid')).toBeLessThan(0.56);
    expect(share('heroTime', 'top')).toBeGreaterThan(0.12);
    expect(share('heroTime', 'bot')).toBeGreaterThan(0.2);
  }, 120_000);
});
