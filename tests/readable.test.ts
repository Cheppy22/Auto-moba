import { describe, expect, it } from 'vitest';
import { FAR_BOOST, farBoost } from '../src/render/table/piece';

describe('far-shot piece boost (visuals review D1)', () => {
  it('is true size at the follow distance and closer', () => {
    expect(farBoost(1500, 2000, 6000)).toBe(1);
    expect(farBoost(2000, 2000, 6000)).toBe(1);
  });

  it('reaches the full boost at the default framing and stays clamped past it', () => {
    expect(farBoost(6000, 2000, 6000)).toBeCloseTo(FAR_BOOST);
    expect(farBoost(12000, 2000, 6000)).toBeCloseTo(FAR_BOOST);
  });

  it('grows smoothly and never shrinks as the camera pulls back', () => {
    let last = 0;
    for (let d = 1000; d <= 8000; d += 250) {
      const k = farBoost(d, 2000, 6000);
      expect(k).toBeGreaterThanOrEqual(last);
      expect(k).toBeGreaterThanOrEqual(1);
      expect(k).toBeLessThanOrEqual(FAR_BOOST);
      last = k;
    }
  });

  it('copes with a default framing no farther than the follow distance', () => {
    expect(farBoost(3000, 3000, 2500)).toBe(1);
    expect(farBoost(3500, 3000, 2500)).toBe(FAR_BOOST);
  });
});
