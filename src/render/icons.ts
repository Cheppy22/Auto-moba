/** Opacities of the Cheshire Keeper's grin and eyes: grin first in, last out. */
export function cheshireFade(tick: number): { grin: number; eyes: number } {
  const ph = tick % 360;
  let grin = 1;
  if (ph >= 250 && ph < 290) grin = 1 - 0.9 * ((ph - 250) / 40);
  else if (ph >= 290 && ph < 310) grin = 0.1;
  else if (ph >= 310) grin = 0.1 + 0.9 * ((ph - 310) / 50);
  const eyes = Math.max(0, Math.min(1, (grin - 0.35) / 0.55));
  return { grin, eyes };
}
