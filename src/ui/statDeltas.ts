import type { Stats } from '../sim';
import { num } from './relicPlan';

/** The stats a fork or a Technique can change, in the order the preview lists them, with their names. */
const STAT_ROWS: { key: keyof Stats; label: string; fmt?: (v: number) => string }[] = [
  { key: 'maxHp', label: 'Health' },
  { key: 'bladeDmg', label: 'Blade' },
  { key: 'soulPower', label: 'Soul' },
  { key: 'range', label: 'Reach' },
  { key: 'armor', label: 'Armor' },
  { key: 'resist', label: 'Resist' },
  { key: 'atkSpeed', label: 'Attack speed', fmt: (v) => v.toFixed(2) },
  { key: 'moveSpeed', label: 'Speed' },
  { key: 'cdr', label: 'Cooldowns', fmt: (v) => `−${Math.round(v * 100)}%` },
  { key: 'hpRegen', label: 'Regen', fmt: (v) => v.toFixed(1) },
];

export interface StatDelta {
  label: string;
  before: string;
  after: string;
  up: boolean;
}

/** The stats that change, biggest change first (by share of the old value). */
export function statDeltas(p: { before: Stats; after: Stats }): StatDelta[] {
  const out: (StatDelta & { size: number })[] = [];
  for (const r of STAT_ROWS) {
    const b = p.before[r.key];
    const a = p.after[r.key];
    const fmt = r.fmt ?? num;
    if (fmt(b) === fmt(a)) continue;
    out.push({
      label: r.label,
      before: fmt(b),
      after: fmt(a),
      up: a > b,
      size: Math.abs(a - b) / Math.max(Math.abs(b), r.key === 'cdr' ? 0.1 : 1),
    });
  }
  return out.sort((x, y) => y.size - x.size).map(({ size: _size, ...d }) => d);
}
