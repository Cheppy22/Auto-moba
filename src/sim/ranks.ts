import { TPS } from './combat';
import type { Ctx } from './ctx';
import type {
  AbilityDef,
  EffectDef,
  ModDef,
  Path,
  PerkDef,
  StatKey,
  StyleDef,
} from './content/schema';
import { kitOf, perkOf, pieceDef, styleDef } from './pieces';
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

/** One choice on a fork sheet: a style at Rank 4, a perk at Rank 8. */
export interface ForkChoice {
  id: string;
  name: string;
  desc: string;
}

/** Rank 4 offers the piece's three styles (the archetype); Rank 8 the style's two options. */
export function forkOptions(ctx: Ctx, u: Unit, rank: 4 | 8): ForkChoice[] {
  if (rank === 4)
    return pieceDef(ctx.c, u.hero!).styles.map((st) => ({
      id: st.id,
      name: st.name,
      desc: st.desc,
    }));
  const st = styleDef(ctx.c, u.hero!);
  return st ? st.forks['8'] : [];
}

/** What a style leans toward: its signature skill, stat tilt and passives (for the AI's pick). */
function styleAxes(st: StyleDef): Axes {
  const out: Axes = [0, 0, 0];
  const sig = abilityAxes(st.ability);
  for (let i = 0; i < 3; i++) out[i] += sig[i];
  for (const m of st.mods) out[statAxis(m.stat)] += modValue(m);
  for (const t of st.passives)
    for (const e of t.effects) effectAxes(e, out, 0.12 / Math.max(1, t.effects.length));
  return out;
}

/**
 * Black's archetype: a seeded weighted pick that favours the styles fitting the piece's build path
 * and what its team lacks (its teammates' chosen styles already cover), yet leaves every style a
 * real chance so all of them stay in use.
 */
export function aiArchetypePick(ctx: Ctx, u: Unit): string {
  const h = u.hero!;
  const styles = pieceDef(ctx.c, h).styles;
  const forced = ctx.s.forceStyles[u.team as PlayTeam][h.defId];
  if (forced && styles.some((x) => x.id === forced)) return forced;
  const have: Axes = [0, 0, 0];
  for (const id of ctx.s.teams[u.team as PlayTeam].heroIds) {
    const mate = ctx.unit(id);
    const st = mate && mate !== u && mate.hero ? styleDef(ctx.c, mate.hero) : undefined;
    if (!st) continue;
    const ax = styleAxes(st);
    for (let i = 0; i < 3; i++) have[i] += ax[i];
  }
  const need: Axes = [1 / (1 + have[0]), 1 / (1 + have[1]), 1 / (1 + have[2])];
  const needSum = need[0] + need[1] + need[2];
  const w = WEIGHTS[h.path];
  const scored = styles.map((st) => {
    const ax = styleAxes(st);
    const fit = ax[0] * w[0] + ax[1] * w[1] + ax[2] * w[2];
    const lack = (ax[0] * need[0] + ax[1] * need[1] + ax[2] * need[2]) / needSum;
    return { id: st.id, score: fit + 0.6 * lack };
  });
  const top = Math.max(...scored.map((x) => x.score));
  const weights = scored.map((x) => Math.max(0.5, 1 + (x.score - top)));
  // A seeded roll per piece (not a shared stream), so asking for the pick never changes it.
  let roll = unitRoll(ctx.s.seed, u.id) * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < scored.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return scored[i].id;
  }
  return scored[scored.length - 1].id;
}

/** A deterministic number in [0, 1) from the match seed and a unit id. */
function unitRoll(seed: number, id: number): number {
  let x = (seed ^ Math.imul(id + 1, 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 4294967296;
}

export function aiForkPick(ctx: Ctx, u: Unit, rank: 4 | 8): string {
  if (rank === 4) return aiArchetypePick(ctx, u);
  const st = styleDef(ctx.c, u.hero!);
  if (!st) return '';
  const opts = st.forks['8'];
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
  const h = u.hero!;
  if (rank === 8 && h.style === null) {
    // The skill fork can only follow an archetype: settle that first.
    applyFork(ctx, u, 4, aiArchetypePick(ctx, u), true);
    optionId = aiForkPick(ctx, u, 8);
  }
  if (rank === 4) h.style = optionId;
  h.perks.push({ rank, optionId });
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
        deadlineTick: ctx.pauseForForks ? null : ctx.s.tick + Math.round(ctx.t.ranks.forkSec * TPS),
      });
    } else applyFork(ctx, u, rank, aiForkPick(ctx, u, rank), true);
    return;
  }
  const ref = { rank, optionId: null };
  h.perks.push(ref);
  const perk = perkOf(pieceDef(ctx.c, h), styleDef(ctx.c, h), ref);
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
  if (optionId === 'auto') {
    const f = forks[0];
    ctx.s.forks.splice(ctx.s.forks.indexOf(f), 1);
    applyFork(ctx, u, f.rank, aiForkPick(ctx, u, f.rank), true);
    return { ok: true };
  }
  for (const f of forks) {
    if (forkOptions(ctx, u, f.rank).some((o) => o.id === optionId)) {
      ctx.s.forks.splice(ctx.s.forks.indexOf(f), 1);
      applyFork(ctx, u, f.rank, optionId, false);
      return { ok: true };
    }
  }
  return { ok: false, reason: 'not one of the fork options' };
}

/** Resolves every pending White fork with the AI's pick (the "Let the AI choose" button). */
export function autoForks(ctx: Ctx): CommandResult {
  const pending = ctx.s.forks;
  if (pending.length === 0) return { ok: false, reason: 'no fork waiting' };
  ctx.s.forks = [];
  for (const f of pending) {
    const u = ctx.unit(f.heroId);
    if (u?.hero) applyFork(ctx, u, f.rank, aiForkPick(ctx, u, f.rank), true);
  }
  return { ok: true };
}

/** Forks the player let run out get the AI's pick (never with `pauseForForks`: no deadline). */
export function tickForks(ctx: Ctx): void {
  const s = ctx.s;
  if (s.forks.length === 0) return;
  const isDue = (f: { deadlineTick: number | null }): boolean =>
    f.deadlineTick !== null && f.deadlineTick <= s.tick;
  const due = s.forks.filter(isDue);
  if (due.length === 0) return;
  s.forks = s.forks.filter((f) => !isDue(f));
  for (const f of due) {
    const u = ctx.unit(f.heroId);
    if (u?.hero) applyFork(ctx, u, f.rank, aiForkPick(ctx, u, f.rank), true);
  }
}
