/**
 * The high-ground eye badge blinks as fast as `SnapUnit.highGround` flips (about 1.1 s a showing),
 * too short to notice. The view keeps each badge up for at least `EYE_HOLD_SEC` after it last
 * turned on, then shrinks it away over `EYE_FADE_SEC`. Render only: the sim and snapshot are untouched.
 */
export const EYE_HOLD_SEC = 2;
export const EYE_FADE_SEC = 0.3;

export interface EyeHold {
  /** Was the flag on in the previous frame. */
  on: boolean;
  /** View time of the last rising edge, and of the last frame the flag was on. */
  since: number;
  lastOn: number;
}

export function newEyeHold(): EyeHold {
  return { on: false, since: -Infinity, lastOn: -Infinity };
}

/** One frame: how fully the badge shows (1 held, 0 gone, between while it fades). */
export function stepEyeHold(h: EyeHold, on: boolean, now: number): number {
  if (on) {
    if (!h.on) h.since = now;
    h.lastOn = now;
  }
  h.on = on;
  if (on) return 1;
  const over = now - Math.max(h.lastOn, h.since + EYE_HOLD_SEC);
  return over <= 0 ? 1 : Math.max(0, 1 - over / EYE_FADE_SEC);
}
