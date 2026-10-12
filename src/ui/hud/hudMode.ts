import { useEffect, useState } from 'preact/hooks';

/** Which HUD to draw: the court-bar HUD, unless `?hud=old` asks for the legacy corner HUD. */
export function wantsNewHud(search: string = window.location.search): boolean {
  return new URLSearchParams(search).get('hud') !== 'old';
}

/**
 * `stack`: top bars and a bottom stack (portrait and squarish windows).
 * `side`: a slim top bar, your row down the left edge, the drawer in the bottom-right corner
 * (wide windows, where the board is height-limited and the sides are free).
 */
export type HudShape = 'stack' | 'side';

export function hudShape(w: number, h: number): HudShape {
  return w / h >= 1.3 ? 'side' : 'stack';
}

/** The HUD shape for the current window, updated when it is resized or turned. */
export function useHudShape(): HudShape {
  const read = (): HudShape => hudShape(window.innerWidth, window.innerHeight);
  const [shape, setShape] = useState<HudShape>(read);
  useEffect(() => {
    const on = (): void => setShape(read());
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);
  return shape;
}
