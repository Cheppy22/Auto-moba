import { dist } from '../core/math';
import { isEnemy, type Ctx } from '../ctx';
import type { PlayTeam, Unit } from '../types';

export function unitDps(u: Unit): number {
  const atk = u.stats.bladeDmg * u.stats.atkSpeed;
  if (u.kind === 'hero') return atk + u.stats.soulPower * 0.6 + u.stats.bladeDmg * 0.3;
  return atk;
}

export function unitEhp(u: Unit): number {
  return u.hp * (1 + (Math.max(0, u.stats.armor) + Math.max(0, u.stats.resist)) / 200);
}

const WEIGHT: Record<string, number> = { hero: 1, minion: 0.2, tower: 0.6, camp: 0, guardian: 0.6 };

export interface Matchup {
  ratio: number;
  allyHeroes: number;
  enemyHeroes: number;
}

export function matchupAt(
  ctx: Ctx,
  team: PlayTeam,
  x: number,
  y: number,
  self: Unit | null,
  joining: Unit | null = null,
): Matchup {
  const ai = ctx.t.ai;
  let aEhp = 0;
  let aDps = 0;
  let eEhp = 0;
  let eDps = 0;
  let allyHeroes = 0;
  let enemyHeroes = 0;
  const near = ctx.grid.query(x, y, Math.max(ai.allyRadius, ai.fightRadius));
  for (const u of near) {
    if (!u.alive) continue;
    const w = WEIGHT[u.kind] ?? 0;
    if (w === 0) continue;
    const d = dist(x, y, u.x, u.y);
    if (u.team === team) {
      if (d > ai.allyRadius) continue;
      aEhp += unitEhp(u) * w;
      aDps += unitDps(u) * (u.kind === 'tower' ? 0.8 : 1) * (u.kind === 'minion' ? 0.5 : 1);
      if (u.kind === 'hero') allyHeroes++;
    } else if (u.team !== 'neutral' && (!self || isEnemy(self, u))) {
      if (d > ai.fightRadius) continue;
      if (u.kind === 'tower' && d > u.stats.range + 40) continue;
      if (u.kind === 'guardian' && d > u.stats.range + 40) continue;
      eEhp += unitEhp(u) * w;
      eDps += unitDps(u) * (u.kind === 'minion' ? 0.5 : 1);
      if (u.kind === 'hero') enemyHeroes++;
    }
  }
  if (joining && joining.alive && dist(x, y, joining.x, joining.y) > ai.allyRadius) {
    aEhp += unitEhp(joining);
    aDps += unitDps(joining);
    allyHeroes++;
  }
  if (eEhp <= 0 || eDps <= 0) return { ratio: 9, allyHeroes, enemyHeroes };
  const ratio = (aEhp * aDps) / Math.max(1, eEhp * eDps);
  return { ratio, allyHeroes, enemyHeroes };
}
