import { TPS } from './combat';
import type { Ctx } from './ctx';
import type {
  AbilityDef,
  EffectDef,
  ForkOptionDef,
  ModDef,
  Path,
  PerkDef,
  StatKey,
} from './content/schema';
import { kitOf, styleDef } from './pieces';
import type { CommandResult, PlayTeam, Unit } from './types';

/** Typical size of one point of each stat, so add-mods compare with mul-mods. */
const STAT_SCALE: Partial<Record<StatKey, number>> = {
  maxHp: 1000,
  hpRegen: 20,
  armor: 100,
  resist: 100,
  bladeDmg: 100,
  soulPower: 100,
  atkSpeed: 1,
  moveSpeed: 50,
  cdr: 1,
  range: 100,
};
const OFFENSE = new Set<StatKey>(['bladeDmg', 'soulPower', 'atkSpeed']);
const DEFENSE = new Set<StatKey>(['maxHp', 'armor', 'resist', 'hpRegen', 'damageTakenMult']);
const WEIGHTS: Record<Path, Axes> = {
  offense: [1.6, 0.6, 0.9],
  defense: [0.6, 1.6, 0.9],
  utility: [0.9, 0.9, 1.6],
};
/** How much a perk adds to [offense, defense, utility]. */
type Axes = [number, number, number];

function statAxis(stat: StatKey): 0 | 1 | 2 {
  return OFFENSE.has(stat) ? 0 : DEFENSE.has(stat) ? 1 : 2;
}

function modValue(m: ModDef): number {
  const mag = m.kind === 'mul' ? m.value - 1 : m.value / (STAT_SCALE[m.stat] ?? 1);
  return m.stat === 'damageTakenMult' ? -mag : mag;
}

/** Which axis an effect serves: damage hurts, heals and shields protect, the rest is utility. */
function effectAxes(e: EffectDef, out: Axes, w: number): void {
  switch (e.type) {
    case 'damage':
    case 'dot':
      out[0] += w;
      break;
    case 'heal':
    case 'shield':
      out[1] += w;
      break;
    case 'statMod':
    case 'aura': {
      const v = e.kind === 'mul' ? e.value - 1 : e.value;
      // A debuff on an enemy (value below 1) counts as offense; a buff follows its stat.
      if (v < 0 && e.stat !== 'damageTakenMult') out[0] += w;
      else out[statAxis(e.stat)] += w;
      break;
    }
    default:
      out[2] += w;
  }
}

/** The axis an ability mostly serves, from its effects. */
function abilityAxes(a: AbilityDef | undefined): Axes {
  const out: Axes = [0, 0, 0];
  if (!a) return [0, 0, 1];
  for (const e of a.effects) effectAxes(e, out, 1);
  const sum = out[0] + out[1] + out[2] || 1;
  return [out[0] / sum, out[1] / sum, out[2] / sum];
}

const CUSTOM_AXIS: Record<string, 0 | 1 | 2> = {
  execute: 0,
  reviveOnce: 1,
  lastStand: 1,
  cooldownTick: 2,
};

/** A perk's contribution to each axis (the AI's fork choice; no randomness). */
export function perkAxes(p: PerkDef, kit: AbilityDef[] = []): Axes {
  const out: Axes = [0, 0, 0];
  if (p.ability !== undefined) {
    const ax = abilityAxes(kit[p.ability]);
    const gain = (p.powerMul - 1) * 2 + (1 - p.cooldownMul) * 1.6;
    for (let i = 0; i < 3; i++) out[i] += ax[i] * gain;
    out[2] += p.rangeMul - 1 + (p.radiusMul - 1);
  }
  for (const m of p.mods) out[statAxis(m.stat)] += modValue(m);
  for (const t of p.triggers) {
    const w = 0.12;
    if (t.custom && CUSTOM_AXIS[t.custom] !== undefined) out[CUSTOM_AXIS[t.custom]] += w;
    if (t.effects.length === 0) continue;
    for (const e of t.effects) effectAxes(e, out, w / t.effects.length);
  }
  return out;
}

export function perkScore(p: PerkDef, path: Path, kit: AbilityDef[] = []): number {
  const ax = perkAxes(p, kit);
  const w = WEIGHTS[path];
  return ax[0] * w[0] + ax[1] * w[1] + ax[2] * w[2];
}

export function forkOptions(ctx: Ctx, u: Unit, rank: 4 | 8): ForkOptionDef[] {
  const st = styleDef(ctx.c, u.hero!);
  return rank === 4 ? st.forks['4'] : st.forks['8'];
}

export function aiForkPick(ctx: Ctx, u: Unit, rank: 4 | 8): string {
  const opts = forkOptions(ctx, u, rank);
  let best = opts[0];
  let bestScore = -Infinity;
  const kit = kitOf(ctx.c, u.hero!);
  for (const o of opts) {
    const sc = perkScore(o, u.hero!.path, kit);
    if (sc > bestScore + 1e-9) {
      bestScore = sc;
      best = o;
    }
  }
  return best.id;
}

function applyFork(ctx: Ctx, u: Unit, rank: 4 | 8, optionId: string, auto: boolean): void {
  u.hero!.perks.push({ rank, optionId });
  u.dirty = true;
  ctx.emit('fork', { id: u.id, rank, optionId, auto });
}

/** White's forks wait for the player unless the AI plays White (headless runs). */
function playerDecides(ctx: Ctx, team: PlayTeam): boolean {
  return team === 'A' && !ctx.s.autoForks.A;
}

function rankTo(ctx: Ctx, u: Unit, rank: number): void {
  const h = u.hero!;
  h.rank = rank;
  u.dirty = true;
  if (rank === 4 || rank === 8) {
    ctx.emit('rankUp', { id: u.id, rank, bonus: '' });
    const team = u.team as PlayTeam;
    if (playerDecides(ctx, team)) {
      ctx.s.forks.push({
        heroId: u.id,
        rank,
        deadlineTick: ctx.s.tick + Math.round(ctx.t.ranks.forkSec * TPS),
      });
    } else applyFork(ctx, u, rank, aiForkPick(ctx, u, rank), true);
    return;
  }
  h.perks.push({ rank, optionId: null });
  const st = styleDef(ctx.c, h);
  const perk = st.ranks[String(rank) as keyof typeof st.ranks];
  ctx.emit('rankUp', { id: u.id, rank, bonus: perk?.name ?? '' });
}

/** Called whenever a piece earns gold: climbs every rank its lifetime gold now reaches. */
export function checkRank(ctx: Ctx, u: Unit): void {
  const h = u.hero;
  if (!h) return;
  const th = ctx.t.ranks.goldThresholds;
  while (h.rank < th.length && h.goldEarned >= th[h.rank]) rankTo(ctx, u, h.rank + 1);
}

export function chooseFork(ctx: Ctx, heroId: number, optionId: string): CommandResult {
  const forks = ctx.s.forks.filter((f) => f.heroId === heroId);
  if (forks.length === 0) return { ok: false, reason: 'no fork waiting for that piece' };
  const u = ctx.unit(heroId);
  if (!u || !u.hero) return { ok: false, reason: 'unknown piece' };
  for (const f of forks) {
    if (forkOptions(ctx, u, f.rank).some((o) => o.id === optionId)) {
      ctx.s.forks.splice(ctx.s.forks.indexOf(f), 1);
      applyFork(ctx, u, f.rank, optionId, false);
      return { ok: true };
    }
  }
  return { ok: false, reason: 'not one of the fork options' };
}

/** Forks the player let run out get the AI's pick. */
export function tickForks(ctx: Ctx): void {
  const s = ctx.s;
  if (s.forks.length === 0) return;
  const due = s.forks.filter((f) => f.deadlineTick <= s.tick);
  if (due.length === 0) return;
  s.forks = s.forks.filter((f) => f.deadlineTick > s.tick);
  for (const f of due) {
    const u = ctx.unit(f.heroId);
    if (u?.hero) applyFork(ctx, u, f.rank, aiForkPick(ctx, u, f.rank), true);
  }
}
