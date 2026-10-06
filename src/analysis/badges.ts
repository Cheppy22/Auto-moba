import type { BadgeDef } from '../sim';
import type { HeroModel } from './index';

export interface BadgeAward {
  id: string;
  label: string;
  metric: string;
  heroId: number;
  value: number;
}

export function metricValue(h: HeroModel, metric: string): number {
  switch (metric) {
    case 'damageTaken':
      return h.damageTaken;
    case 'damageDealt':
      return h.damageDealt;
    case 'objectiveDamage':
      return h.objectiveDamage;
    case 'goldEarned':
      return h.goldEarned;
    case 'kills':
      return h.kills;
    case 'deaths':
      return h.deaths;
    case 'healingDone':
      return h.healingDone;
    case 'taken.blade':
      return h.taken.blade;
    case 'taken.soul':
      return h.taken.soul;
    case 'taken.true':
      return h.taken.true;
    case 'distance':
      return h.distance;
    default:
      return 0;
  }
}

export function computeBadges(defs: BadgeDef[], heroes: HeroModel[]): BadgeAward[] {
  const out: BadgeAward[] = [];
  for (const d of defs) {
    let best: HeroModel | null = null;
    let bestV = 0;
    let tie = false;
    for (const h of heroes) {
      const v = metricValue(h, d.metric);
      if (!best) {
        best = h;
        bestV = v;
        continue;
      }
      if (v === bestV) tie = true;
      else if (d.rank === 'max' ? v > bestV : v < bestV) {
        best = h;
        bestV = v;
        tie = false;
      }
    }
    if (!best || tie) continue;
    if (d.rank === 'max' && bestV <= 0) continue;
    out.push({
      id: d.id,
      label: d.label,
      metric: d.metric,
      heroId: best.id,
      value: Math.round(bestV),
    });
  }
  return out;
}
