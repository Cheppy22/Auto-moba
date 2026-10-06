export const mmss = (ticks: number): string => {
  const s = Math.max(0, Math.round(ticks / 20));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const pct = (v: number): string => `${Math.round(v * 100)}%`;
export const n0 = (v: number): string => Math.round(v).toLocaleString('en-US');

const KEEPER_PLACES: Record<string, string> = {
  k_west: 'lower mid',
  k_east: 'upper mid',
  k_nw: 'the left side',
  k_se: 'the right side',
  k_core: 'the centre',
};

export function keeperPlace(spot: string): string {
  return KEEPER_PLACES[spot] ?? spot.replace('k_', '');
}
