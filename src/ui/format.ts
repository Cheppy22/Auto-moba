export const mmss = (ticks: number): string => {
  const s = Math.max(0, Math.round(ticks / 20));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const pct = (v: number): string => `${Math.round(v * 100)}%`;
export const n0 = (v: number): string => Math.round(v).toLocaleString('en-US');

const ROLE_LABELS: Record<string, string> = {
  top: 'left lane',
  mid: 'mid lane',
  bot: 'right lane',
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}
