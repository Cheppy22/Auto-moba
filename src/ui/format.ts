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

const ROLE_LABELS: Record<string, string> = {
  top: 'left lane',
  mid: 'mid lane',
  bot: 'right lane',
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

export const DISPOSITIONS: Record<string, { label: string; blurb: string }> = {
  farmer: {
    label: 'Farmer',
    blurb:
      'Leans toward minions and jungle camps. Grows rich, drifts into the jungle, fights when it must.',
  },
  attacker: {
    label: 'Attacker',
    blurb:
      'Leans toward fights and towers. Hunts enemy heroes and drifts to where the fighting is.',
  },
  defender: {
    label: 'Defender',
    blurb: 'Leans toward holding ground. Stays near its lane and towers and answers threats.',
  },
};

export function dispositionLabel(d: string): string {
  return DISPOSITIONS[d]?.label ?? d;
}
