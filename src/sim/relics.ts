import { relicEffect } from './content/loader';
import type { GambitDef, LaneId, ModDef, RelicDef } from './content/schema';
import type { Ctx } from './ctx';
import type { HeldRelic, PlayTeam, Unit } from './types';

/** Lane move-speed bonuses from relics and cards carry this tag; together they stop at the tuning cap. */
export const LANE_SPEED_TAG = 'laneSpeed';

export interface RelicMod extends ModDef {
  tags: string[];
}

interface Held {
  held: HeldRelic;
  def: RelicDef;
}

const p = (def: { params: Record<string, number> }, key: string, fallback: number): number =>
  def.params[key] ?? fallback;

/** The relics a team holds that work right now (Rally relics only while the team is behind). */
function working(ctx: Ctx, team: PlayTeam): Held[] {
  const out: Held[] = [];
  for (const held of ctx.s.relics.held[team]) {
    const def = ctx.c.relicById.get(held.id);
    if (!def) continue;
    if (def.rally && !ctx.s.relics.behind[team]) continue;
    out.push({ held, def });
  }
  return out;
}

const playTeam = (u: Unit): PlayTeam | null => (u.team === 'A' || u.team === 'B' ? u.team : null);

/** The lane a unit fights in: a piece's assigned lane, a pawn or pawnling's lane, a Bastion's lane. */
function unitLane(u: Unit): LaneId | null {
  if (u.hero) return u.hero.lane;
  if (u.kind === 'minion' && !u.ev) return u.lane;
  return null;
}

const isPawnling = (u: Unit): boolean => u.kind === 'minion' && !u.ev && !u.pawn;

function cardMods(def: GambitDef, strength: number, stormStrength: number, u: Unit): RelicMod[] {
  const out: RelicMod[] = [];
  const grow = (key: string, fallback: number, k: number): number =>
    1 + ((def.params[key] ?? fallback) - 1) * k;
  const piece = u.kind === 'hero';
  switch (def.id) {
    case 'advance':
      out.push({
        stat: 'moveSpeed',
        kind: 'mul',
        value: grow('moveSpeedMul', 1.1, strength),
        tags: [LANE_SPEED_TAG],
      });
      break;
    case 'open_file':
      out.push({
        stat: 'moveSpeed',
        kind: 'mul',
        value: grow('moveSpeedMul', 1.25, strength),
        tags: [LANE_SPEED_TAG],
      });
      break;
    case 'hold_the_file':
      if (piece) {
        out.push({ stat: 'armor', kind: 'mul', value: grow('armorMul', 1.15, strength), tags: [] });
        out.push({
          stat: 'resist',
          kind: 'mul',
          value: grow('resistMul', 1.15, strength),
          tags: [],
        });
      }
      break;
    case 'pawn_storm':
      if (!piece) {
        out.push({
          stat: 'bladeDmg',
          kind: 'mul',
          value: grow('damageMul', 1.5, stormStrength),
          tags: [],
        });
        out.push({
          stat: 'moveSpeed',
          kind: 'mul',
          value: grow('moveSpeedMul', 1.5, stormStrength),
          tags: [],
        });
      }
      break;
  }
  return out;
}

/** Stat modifiers the unit's team gets from its relics (plugged into `recompute` with item mods). */
export function relicMods(ctx: Ctx, u: Unit): RelicMod[] {
  const team = playTeam(u);
  if (!team || ctx.s.relics.held[team].length === 0) return [];
  const out: RelicMod[] = [];
  const lane = unitLane(u);
  const piece = u.kind === 'hero';
  for (const { held, def } of working(ctx, team)) {
    switch (relicEffect(def)) {
      case 'half_open_file':
        if (held.lane && lane && (piece || u.kind === 'minion'))
          out.push({
            stat: 'moveSpeed',
            kind: 'mul',
            value: lane === held.lane ? p(def, 'speedMul', 1.12) : p(def, 'otherMul', 0.96),
            tags: [LANE_SPEED_TAG],
          });
        break;
      case 'closed_position':
        if (!held.lane) break;
        if (u.kind === 'tower' && u.lane === held.lane)
          out.push({
            stat: 'damageTakenMult',
            kind: 'mul',
            value: p(def, 'bastionTakenMul', 0.8),
            tags: [],
          });
        else if (piece && lane === held.lane) {
          out.push({ stat: 'armor', kind: 'mul', value: p(def, 'armorMul', 1.1), tags: [] });
          out.push({ stat: 'resist', kind: 'mul', value: p(def, 'resistMul', 1.1), tags: [] });
        } else if (isPawnling(u) && lane === held.lane)
          out.push({
            stat: 'bladeDmg',
            kind: 'mul',
            value: p(def, 'pawnlingDamageMul', 0.85),
            tags: [],
          });
        break;
      case 'crown_jewel':
        if (!piece || held.piece === null) break;
        if (u.id === held.piece) {
          const dmg = p(def, 'damageMul', 1.12);
          out.push({ stat: 'bladeDmg', kind: 'mul', value: dmg, tags: [] });
          out.push({ stat: 'soulPower', kind: 'mul', value: dmg, tags: [] });
          out.push({ stat: 'maxHp', kind: 'mul', value: p(def, 'healthMul', 1.08), tags: [] });
        } else {
          const others = p(def, 'othersMul', 0.97);
          out.push({ stat: 'bladeDmg', kind: 'mul', value: others, tags: [] });
          out.push({ stat: 'soulPower', kind: 'mul', value: others, tags: [] });
        }
        break;
      case 'development':
        if (piece && u.id === held.piece)
          out.push({
            stat: 'incomeMult',
            kind: 'mul',
            value: p(def, 'incomeMul', 1.2),
            tags: [],
          });
        break;
      case 'pawn_majority':
        if (u.pawn)
          out.push({ stat: 'maxHp', kind: 'mul', value: p(def, 'healthMul', 0.9), tags: [] });
        break;
      case 'standing_order': {
        const card = held.card ? ctx.c.gambitById.get(held.card) : undefined;
        if (!card || !held.lane || lane !== held.lane || !(piece || u.kind === 'minion')) break;
        out.push(...cardMods(card, p(def, 'strength', 0.5), p(def, 'stormStrength', 1 / 3), u));
        break;
      }
      default:
        break;
    }
  }
  return out;
}

/** Elite pawn cost: Pawn Majority lowers it. */
export function pawnCost(ctx: Ctx, team: PlayTeam): number {
  let cost = ctx.t.pawns.cost;
  for (const { def } of working(ctx, team))
    if (relicEffect(def) === 'pawn_majority') cost = Math.min(cost, p(def, 'cost', cost));
  return cost;
}

/** Extra living pawns allowed; relic bonuses never add up to more than the tuning cap. */
export function pawnCapBonus(ctx: Ctx, team: PlayTeam): number {
  let bonus = 0;
  for (const { def } of working(ctx, team))
    if (relicEffect(def) === 'pawn_majority') bonus += p(def, 'capBonus', 0);
  return Math.min(ctx.t.relics.pawnCapMax, bonus);
}

/** A card's Tempo cost with Opening Theory: the Opening's schools cheaper, the others dearer. */
export function cardCost(ctx: Ctx, team: PlayTeam, def: GambitDef): number {
  let cost = def.cost;
  for (const { def: relic } of working(ctx, team)) {
    if (relicEffect(relic) !== 'opening_theory') continue;
    const schools = ctx.c.openingById.get(ctx.s.opening[team])?.schools ?? [];
    if (schools.length === 0) cost += p(relic, 'italian', -2);
    else cost += schools.includes(def.school) ? p(relic, 'favoured', -5) : p(relic, 'other', 5);
  }
  return Math.max(0, cost);
}

/** Extra bounty the killer earns for a fallen piece (Development makes its piece worth more). */
export function bountyMul(ctx: Ctx, victim: Unit): number {
  const team = playTeam(victim);
  if (!team || !victim.hero) return 1;
  let mul = 1;
  for (const { held, def } of working(ctx, team))
    if (relicEffect(def) === 'development' && held.piece === victim.id)
      mul *= p(def, 'bountyMul', 1.5);
  return mul;
}

/** Pawn Lever: pawns and pawnlings in the bound lane hit Bastions and the Throne harder. */
export function structureMul(ctx: Ctx, src: Unit): number {
  const team = playTeam(src);
  if (!team || src.kind !== 'minion' || src.ev || ctx.s.relics.held[team].length === 0) return 1;
  let mul = 1;
  for (const { held, def } of working(ctx, team))
    if (relicEffect(def) === 'pawn_lever' && held.lane === src.lane)
      mul *= p(def, 'structureMul', 1.2);
  return mul;
}

/** Lane cards that Standing Orders keep always on: they leave the team's deck. */
export function boundCards(ctx: Ctx, team: PlayTeam): string[] {
  const out: string[] = [];
  for (const h of ctx.s.relics.held[team]) if (h.card) out.push(h.card);
  return out;
}

/** Whether a piece carries Crown Jewel or Development (the AI's Rank 4 pick leans to offence). */
export function carriesRelic(ctx: Ctx, u: Unit): boolean {
  const team = playTeam(u);
  if (!team || !u.hero) return false;
  return ctx.s.relics.held[team].some((h) => {
    const def = ctx.c.relicById.get(h.id);
    if (!def || h.piece !== u.id) return false;
    const e = relicEffect(def);
    return e === 'crown_jewel' || e === 'development';
  });
}
