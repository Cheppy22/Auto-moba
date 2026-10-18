import type { Stats, TechniquePreview } from '../../sim';
import { num } from '../relicPlan';

/** One "What changes" line: a number before and after; `better` colours the arrow. */
export interface LedgerRow {
  label: string;
  before: string;
  after: string;
  better: boolean;
}

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

const sec = (v: number): string => `${num(v)} s`;

/**
 * The numbers a card changes on its piece, biggest first: the changed skill's cooldown, power,
 * reach and area, then the stats that move. Nothing is listed for a rule that changes no number
 * (its text says all of it).
 */
export function ledgerRows(p: TechniquePreview, max = 4): LedgerRow[] {
  const rows: (LedgerRow & { size: number })[] = [];
  const a = p.ability;
  if (a) {
    const name = a.after.name;
    const add = (
      label: string,
      b: number,
      x: number,
      lowerIsBetter: boolean,
      fmt: (v: number) => string,
    ) => {
      if (fmt(b) === fmt(x)) return;
      rows.push({
        label: `${name} ${label}`,
        before: fmt(b),
        after: fmt(x),
        better: lowerIsBetter ? x < b : x > b,
        size: Math.abs(x - b) / Math.max(Math.abs(b), 1) + 1,
      });
    };
    add('cooldown', a.before.cooldownSec, a.after.cooldownSec, true, sec);
    add('power', a.before.power, a.after.power, false, (v) => `${Math.round(v * 100)}%`);
    add('reach', a.before.range, a.after.range, false, num);
    add('area', a.before.radius, a.after.radius, false, num);
  }
  for (const r of STAT_ROWS) {
    const b = p.before[r.key];
    const x = p.after[r.key];
    const fmt = r.fmt ?? num;
    if (fmt(b) === fmt(x)) continue;
    rows.push({
      label: r.label,
      before: fmt(b),
      after: fmt(x),
      better: x > b,
      size: Math.abs(x - b) / Math.max(Math.abs(b), r.key === 'cdr' ? 0.1 : 1),
    });
  }
  return rows
    .sort((m, n) => n.size - m.size)
    .slice(0, max)
    .map(({ size: _size, ...row }) => row);
}
