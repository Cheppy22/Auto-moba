import { relicEffect } from './content/loader';
import type { GambitDef, LaneId, ModDef, RelicDef, RelicEffect } from './content/schema';
import type { Ctx } from './ctx';
import { LANES } from './world/map';
import type { HeldRelic, PlayTeam, Unit } from './types';

/** Lane move-speed bonuses from relics and cards carry this tag; together they stop at the tuning cap. */
export const LANE_SPEED_TAG = 'laneSpeed';

interface RelicMod extends ModDef {
  tags: string[];
}

interface Held {
  held: HeldRelic;
  def: RelicDef;
}

/** A held relic with nothing aimed yet. */
export const heldRelic = (id: string, aim: Partial<HeldRelic> = {}): HeldRelic => ({
  id,
  lane: null,
  piece: null,
  card: null,
  trigger: null,
  quota: null,
  reserve: null,
  ...aim,
});

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

/** The working relic of one effect a team holds, if any. */
export function workingRelic(ctx: Ctx, team: PlayTeam, effect: RelicEffect): Held | undefined {
  return working(ctx, team).find((h) => relicEffect(h.def) === effect);
}

export const param = (h: { def: RelicDef }, key: string, fallback: number): number =>
  p(h.def, key, fallback);

const LANE_NAME: Record<LaneId, string> = { top: 'Left', mid: 'Mid', bot: 'Right' };
const STANDARD: Record<LaneId, number> = { top: 2, mid: 1, bot: 2 };

export function laneCounts(ctx: Ctx, team: PlayTeam): Record<LaneId, number> {
  const out: Record<LaneId, number> = { top: 0, mid: 0, bot: 0 };
  for (const id of ctx.s.teams[team].heroIds) out[ctx.unit(id)?.hero?.lane ?? 'mid']++;
  return out;
}

/** The lane Battery allows three pieces in (while the relic is held). */
export const batteryLane = (ctx: Ctx, team: PlayTeam): LaneId | null =>
  workingRelic(ctx, team, 'battery')?.held.lane ?? null;

/** The piece counts a team's lanes must have to start an Act: 2/1/2, or 3/1/1 with Battery. */
export function formationTarget(ctx: Ctx, team: PlayTeam): Record<LaneId, number> {
  const lane = batteryLane(ctx, team);
  if (!lane) return STANDARD;
  const out: Record<LaneId, number> = { top: 1, mid: 1, bot: 1 };
  out[lane] = 3;
  return out;
}

/** Why the lanes are not a legal formation (null when they are). */
export function formationError(ctx: Ctx, team: PlayTeam): string | null {
  const have = laneCounts(ctx, team);
  const battery = batteryLane(ctx, team);
  const fits = (want: Record<LaneId, number>): boolean => LANES.every((l) => have[l] === want[l]);
  if (fits(STANDARD) || fits(formationTarget(ctx, team))) return null;
  return battery
    ? `Lanes need 2 Left, 2 Right and 1 Mid, or 3 in ${LANE_NAME[battery]} and 1 in each other lane (Battery)`
    : 'Lanes need 2 Left, 2 Right and 1 Mid';
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
      case 'wing_gambit':
        if (u.kind === 'tower' && held.lane && u.lane === held.lane)
          out.push({
            stat: 'damageTakenMult',
            kind: 'mul',
            value: p(def, 'takenMul', 1.15),
            tags: [],
          });
        break;
      case 'curtain_wall':
        if (u.kind === 'tower')
          out.push({ stat: 'maxHp', kind: 'mul', value: p(def, 'healthMul', 1.15), tags: [] });
        break;
      case 'royal_keep':
        if (u.kind === 'guardian') {
          out.push({ stat: 'maxHp', kind: 'mul', value: p(def, 'healthMul', 1.2), tags: [] });
          out.push({ stat: 'bladeDmg', kind: 'mul', value: p(def, 'damageMul', 1.25), tags: [] });
        }
        break;
      case 'battery': {
        const counts = laneCounts(ctx, team);
        if (!piece || !held.lane || counts[held.lane] !== 3 || !lane) break;
        if (lane !== held.lane && counts[lane] === 1) {
          out.push({ stat: 'armor', kind: 'mul', value: p(def, 'armorMul', 1.1), tags: [] });
          out.push({ stat: 'resist', kind: 'mul', value: p(def, 'resistMul', 1.1), tags: [] });
        }
        break;
      }
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
  for (const { def } of working(ctx, team)) {
    const e = relicEffect(def);
    if (e === 'pawn_majority' || e === 'compensation') bonus += p(def, 'capBonus', 0);
  }
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

/** Tempo a side can hold: Spare Tempo raises the cap. */
export function tempoCap(ctx: Ctx, team: PlayTeam): number {
  const h = workingRelic(ctx, team, 'spare_tempo');
  return h ? Math.max(ctx.t.gambits.tempoMax, param(h, 'cap', 130)) : ctx.t.gambits.tempoMax;
}

/** Tempo earned per second: Quiet Move earns more, Compensation adds a trickle. */
export function tempoRate(ctx: Ctx, team: PlayTeam): number {
  let rate = ctx.t.gambits.tempoPerSec;
  const quiet = workingRelic(ctx, team, 'quiet_move');
  if (quiet) rate *= param(quiet, 'tempoMul', 1.2);
  const comp = workingRelic(ctx, team, 'compensation');
  if (comp) rate += param(comp, 'tempoPerSec', 0.25);
  return rate;
}

/** Spare Tempo: the Tempo gained at an Act start (a tenth of what is held, capped). */
export function actStartTempo(ctx: Ctx, team: PlayTeam): number {
  const h = workingRelic(ctx, team, 'spare_tempo');
  return h ? Math.min(param(h, 'bonusMax', 10), ctx.s.tempo[team] * param(h, 'share', 0.1)) : 0;
}

export function handSize(ctx: Ctx, team: PlayTeam): number {
  const h = workingRelic(ctx, team, 'quiet_move');
  return h ? param(h, 'hand', 2) : ctx.t.gambits.handSize;
}

export function refillSec(ctx: Ctx, team: PlayTeam): number {
  const h = workingRelic(ctx, team, 'quiet_move');
  return h ? param(h, 'refillSec', 4) : ctx.t.gambits.refillSec;
}

/** Endgame's extra Throne damage, softened for a Royal Keep. */
export function throneDamageMul(ctx: Ctx, tgt: Unit): number {
  const base = ctx.s.tagMult.throneDamage ?? 1;
  const team = playTeam(tgt);
  const keep = team ? workingRelic(ctx, team, 'royal_keep') : undefined;
  return keep ? Math.min(base, param(keep, 'endgameMul', 1.25)) : base;
}

/** The damage multiplier a side deals at while in Check (King's Ransom lifts the penalty). */
export function checkDamageMul(ctx: Ctx, team: PlayTeam): number {
  return workingRelic(ctx, team, 'kings_ransom') ? 1 : ctx.t.check.damageMul;
}

/** Knight's Tour: the Knight hits camps harder. */
export function campDamageMul(ctx: Ctx, src: Unit | null, tgt: Unit): number {
  if (!src || tgt.kind !== 'camp' || src.hero?.defId !== 'knight') return 1;
  const team = playTeam(src);
  const h = team ? workingRelic(ctx, team, 'knights_tour') : undefined;
  return h ? param(h, 'campMul', 1.25) : 1;
}

/** Wing Gambit: extra melee pawnlings in every wave of the lanes that are not conceded. */
export function wingMelee(ctx: Ctx, team: PlayTeam, lane: LaneId): number {
  const h = workingRelic(ctx, team, 'wing_gambit');
  return h && h.held.lane !== lane ? param(h, 'extraMelee', 1) : 0;
}
