import { useEffect, useState } from 'preact/hooks';

/**
 * Which HUD to draw. The new court-bar HUD is the default under the Tournament Table look
 * (`?look=table`) and can be forced anywhere with `?hud=new`; `?hud=old` forces the corner HUD.
 */
export function wantsNewHud(search: string = window.location.search): boolean {
  const q = new URLSearchParams(search);
  const hud = q.get('hud');
  if (hud === 'new') return true;
  if (hud === 'old') return false;
  return q.get('look') === 'table';
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
