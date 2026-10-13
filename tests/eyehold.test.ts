import { describe, expect, it } from 'vitest';
import { EYE_FADE_SEC, EYE_HOLD_SEC, newEyeHold, stepEyeHold } from '../src/render/table/eyehold';

/** Feed a flag over time at 60 frames a second; returns the show level at the end. */
function run(flags: (t: number) => boolean, until: number): number {
  const h = newEyeHold();
  let show = 0;
  for (let t = 0; t <= until + 1e-9; t += 1 / 60) show = stepEyeHold(h, flags(t), t);
  return show;
}

describe('eye badge hold', () => {
  it('is hidden when the flag never turned on', () => {
    expect(run(() => false, 5)).toBe(0);
  });

  it('stays fully visible for 2 s after a brief flash, then fades out', () => {
    const flash = (t: number): boolean => t < 0.3;
    expect(run(flash, 0.2)).toBe(1);
    expect(run(flash, EYE_HOLD_SEC - 0.05)).toBe(1);
    const mid = run(flash, EYE_HOLD_SEC + EYE_FADE_SEC / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(run(flash, EYE_HOLD_SEC + EYE_FADE_SEC + 0.2)).toBe(0);
  });

  it('a showing that turns on again restarts the hold', () => {
    // on 0-0.3 s and 1.5-1.6 s: the second rising edge holds it until 3.5 s
    const blink = (t: number): boolean => t < 0.3 || (t >= 1.5 && t < 1.6);
    expect(run(blink, 3.3)).toBe(1);
    expect(run(blink, 3.5 + EYE_FADE_SEC + 0.2)).toBe(0);
  });

  it('a long showing stays up while on and fades right after it ends', () => {
    const long = (t: number): boolean => t < 5;
    expect(run(long, 4.9)).toBe(1);
    expect(run(long, 5 + EYE_FADE_SEC + 0.1)).toBe(0);
  });
});
