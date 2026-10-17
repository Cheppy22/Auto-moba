import type { Content, LaneId, PieceId, RelicAim, RelicDef, Stats } from '../sim';
import { LANES, LANE_LABEL, pieceLabel } from './pieces';
import { TRIGGER_SHORT } from './relics';

/**
 * The relic draft card's plan: a headline and a "what changes" table, both from the relic's own
 * numbers in content/relics.json and the live match (the aimed lane's pieces, Tempo, pawn cap).
 * Pure, so the numbers can be checked by a unit test.
 */

/** One White piece as the plan needs it. */
export interface PlanPiece {
  id: number;
  piece: PieceId;
  lane: LaneId | null;
  stats: Stats;
}

/** What the plan reads from the match. */
export interface PlanInput {
  content: Content;
  pieces: PlanPiece[];
  /** The Act this relic starts in (the one after the break). */
  nextAct: number;
  tempo: number;
  tempoMax: number;
  pawnCap: number;
  pawnCost: number;
  handRefillSec: number;
  opening: string;
  /** White's Tempo cost for a card, less an extra discount. */
  cardCost: (cardId: string, discount: number) => number;
}

/** One before → after line. `better` colours the arrow (true good, false a cost, null neutral). */
export interface PlanRow {
  label: string;
  before: string;
  after: string;
  better: boolean | null;
}

export interface RelicPlan {
  /** What it aims at, in words: "Left lane", "Queen", "Your Bastions". */
  target: string;
  /** The aimed piece (a portrait in the card), when it has one. */
  piece: PieceId | null;
  rows: PlanRow[];
}

/** Whole numbers from 10 up (stats, health), up to two decimals below (Tempo a second). */
export const num = (v: number): string =>
  Math.abs(v) >= 10 ? String(Math.round(v)) : String(Math.round(v * 100) / 100);
const pct = (v: number): string => `${Math.round(v * 100)}%`;

/** The headline with its aim filled in ("your Left lane", "your Queen"), first letter capitalised. */
export function relicHeadline(
  content: Content,
  def: RelicDef,
  aim: Partial<RelicAim>,
  piece: PieceId | null,
): string {
  const lane = aim.lane ? `your ${LANE_LABEL[aim.lane]} lane` : 'one lane';
  const who = piece ? `your ${pieceLabel(content, piece)}` : 'one piece';
  const text = def.headline.replace(/\{lane\}/g, lane).replace(/\{piece\}/g, who);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function p(def: RelicDef, key: string): number {
  const v = def.params[key];
  if (v === undefined) throw new Error(`relic ${def.id} has no param ${key}`);
  return v;
}

/** The main damage stat of a piece: Soul power for casters, Blade for the rest. */
function damageOf(s: Stats): { label: string; value: number } {
  return s.soulPower > s.bladeDmg
    ? { label: 'Soul power', value: s.soulPower }
    : { label: 'Blade damage', value: s.bladeDmg };
}

export function relicPlan(input: PlanInput, def: RelicDef, aim: RelicAim): RelicPlan {
  const { content: c, pieces } = input;
  const t = c.tuning;
  const rows: PlanRow[] = [];
  const row = (
    label: string,
    before: string,
    after: string,
    better: boolean | null = true,
  ): void => {
    rows.push({ label, before, after, better });
  };
  const name = (u: PlanPiece): string => pieceLabel(c, u.piece);
  const aimed = aim.piece !== null ? (pieces.find((u) => u.id === aim.piece) ?? null) : null;
  const inLane = aim.lane ? pieces.filter((u) => u.lane === aim.lane) : [];
  const laneName = aim.lane ? `${LANE_LABEL[aim.lane]} lane` : 'Pick a lane';
  const knight = pieces.find((u) => u.piece === 'knight') ?? null;
  let target = laneName;
  let piece: PieceId | null = null;

  switch (def.effect ?? def.id) {
    case 'half_open_file': {
      const up = p(def, 'speedMul');
      const down = p(def, 'otherMul');
      for (const u of inLane)
        row(`${name(u)} speed`, num(u.stats.moveSpeed), num(u.stats.moveSpeed * up));
      row(
        'Pawnling speed here',
        num(t.minions.melee.moveSpeed),
        num(t.minions.melee.moveSpeed * up),
      );
      const other = pieces.find((u) => u.lane !== null && u.lane !== aim.lane);
      if (other)
        row(
          `${name(other)} speed (other lane)`,
          num(other.stats.moveSpeed),
          num(other.stats.moveSpeed * down),
          false,
        );
      break;
    }
    case 'closed_position': {
      row('Bastion damage taken', '100%', pct(p(def, 'bastionTakenMul')));
      for (const u of inLane)
        row(`${name(u)} armor`, num(u.stats.armor), num(u.stats.armor * p(def, 'armorMul')));
      row('Pawnling damage here', '100%', pct(p(def, 'pawnlingDamageMul')), false);
      break;
    }
    case 'crown_jewel':
    case 'development':
    case 'guarded_piece': {
      target = aimed ? name(aimed) : 'Pick a piece';
      piece = aimed?.piece ?? null;
      if (!aimed) break;
      const s = aimed.stats;
      if (def.id === 'crown_jewel') {
        const d = damageOf(s);
        row(d.label, num(d.value), num(d.value * p(def, 'damageMul')));
        row('Health', num(s.maxHp), num(s.maxHp * p(def, 'healthMul')));
        row('Other pieces’ damage', '100%', pct(p(def, 'othersMul')), false);
      } else if (def.id === 'development') {
        row('Gold earned', '100%', pct(p(def, 'incomeMul')));
        row('Bounty for killing it', '100%', pct(p(def, 'bountyMul')), false);
      } else {
        row('Damage taken near a friend', '100%', pct(p(def, 'takenMul')));
        row('Health to burn through', num(s.maxHp), num(s.maxHp / p(def, 'takenMul')));
      }
      break;
    }
    case 'pawn_majority': {
      target = 'Your pawns';
      row(
        'Pawn cost',
        `${num(input.pawnCost)} Tempo`,
        `${num(Math.min(input.pawnCost, p(def, 'cost')))} Tempo`,
      );
      row('Pawn cap', num(input.pawnCap), num(input.pawnCap + p(def, 'capBonus')));
      row('Pawn health', '100%', pct(p(def, 'healthMul')), false);
      break;
    }
    case 'pawn_lever': {
      const pawnHit = t.pawns.damage * t.pawns.structureMul;
      row('Pawn hit on a Bastion', num(pawnHit), num(pawnHit * p(def, 'structureMul')));
      row('Pawnling damage to Bastions', '100%', pct(p(def, 'structureMul')));
      break;
    }
    case 'opening_theory': {
      target = 'Your cards';
      const schools = c.openingById.get(input.opening)?.schools ?? [];
      const italian = input.opening === 'italian';
      const deck = c.gambits.filter((g) => g.weight > 0);
      const mine = deck.filter((g) => italian || schools.includes(g.school)).slice(0, 2);
      const other = italian ? [] : deck.filter((g) => !schools.includes(g.school)).slice(0, 1);
      const floor = t.gambits.minCost;
      const delta = italian ? p(def, 'italian') : p(def, 'favoured');
      for (const g of mine) {
        const now = input.cardCost(g.id, 0);
        row(g.name, num(now), num(Math.max(floor, now + delta)));
      }
      for (const g of other) {
        const now = input.cardCost(g.id, 0);
        row(g.name, num(now), num(Math.max(floor, now + p(def, 'other'))), false);
      }
      break;
    }
    case 'standing_order': {
      const card = aim.card ? (c.gambitById.get(aim.card)?.name ?? aim.card) : 'Lane card';
      const share = aim.card === 'pawn_storm' ? p(def, 'stormStrength') : p(def, 'strength');
      row(`${card} here`, 'Tap to play', `Always on, ${pct(share)}`);
      row(`${card} in your hand`, 'In deck', 'Leaves deck', false);
      break;
    }
    case 'sealed_move': {
      target = 'One card';
      if (aim.card) {
        const card = c.gambitById.get(aim.card)?.name ?? aim.card;
        row(
          `${card} cost`,
          num(input.cardCost(aim.card, 0)),
          num(input.cardCost(aim.card, p(def, 'discount'))),
        );
        if (aim.trigger) row(`${card} plays`, 'By hand', TRIGGER_SHORT[aim.trigger]);
      }
      break;
    }
    case 'pawn_structure': {
      target = 'Your pawns';
      row('Auto pawn cost', num(input.pawnCost), num(input.pawnCost - p(def, 'discount')));
      const q = aim.quota;
      if (q)
        row('Pawns fielded', 'By hand', LANES.map((l) => `${LANE_LABEL[l][0]}${q[l]}`).join(' '));
      break;
    }
    case 'wing_gambit': {
      row('Bastion damage taken here', '100%', pct(p(def, 'takenMul')), false);
      const w = t.waves;
      const act = input.nextAct;
      const extra =
        act >= w.extraMeleeFromPhase
          ? w.extraMeleePerPhaseAfter * (act - w.extraMeleeFromPhase + 1)
          : 0;
      const melee = w.melee + extra;
      row('Melee pawnlings a wave, other lanes', num(melee), num(melee + p(def, 'extraMelee')));
      break;
    }
    case 'strong_square': {
      for (const u of inLane) {
        row(
          `${name(u)} armor at the banner`,
          num(u.stats.armor),
          num(u.stats.armor + p(def, 'armor')),
        );
        row(
          `${name(u)} resist at the banner`,
          num(u.stats.resist),
          num(u.stats.resist + p(def, 'resist')),
        );
      }
      if (inLane.length === 0)
        row('Armor and resist at the banner', '+0', `+${num(p(def, 'armor'))}`);
      break;
    }
    case 'knights_tour': {
      target = 'Your Knight';
      piece = 'knight';
      if (knight)
        row(
          'Speed out of combat',
          num(knight.stats.moveSpeed),
          num(knight.stats.moveSpeed * p(def, 'speedMul')),
        );
      row('Damage to camps', '100%', pct(p(def, 'campMul')));
      row('Tempo per camp', '0', `+${num(p(def, 'tempo'))}`);
      break;
    }
    case 'kings_ransom': {
      target = 'Your court in Check';
      row('Court damage in Check', pct(t.check.damageMul), '100%');
      row('Damage taken in Check', '100%', pct(p(def, 'takenMul')));
      break;
    }
    case 'pawn_chain': {
      target = 'Your pawns';
      const most = p(def, 'max');
      row(
        'Pawn damage, 3 pawns together',
        num(t.pawns.damage),
        num(t.pawns.damage * (1 + Math.min(most, 2 * p(def, 'perPawn')))),
      );
      row('Pawn damage and armor, largest bonus', '100%', pct(1 + most));
      break;
    }
    case 'spare_tempo': {
      target = 'Your Tempo';
      row('Tempo cap', num(input.tempoMax), num(Math.max(input.tempoMax, p(def, 'cap'))));
      const bonus = Math.min(p(def, 'bonusMax'), Math.floor(input.tempo * p(def, 'share')));
      row('Tempo at the next Act start', num(input.tempo), num(input.tempo + bonus));
      break;
    }
    case 'compensation': {
      target = 'Your pawns and Tempo';
      row('Pawn cap', num(input.pawnCap), num(input.pawnCap + p(def, 'capBonus')));
      const rate = t.gambits.tempoPerSec;
      row('Tempo a second', num(rate), num(rate + p(def, 'tempoPerSec')));
      break;
    }
    case 'curtain_wall': {
      target = 'Your Bastions';
      const hp = t.tower.hp;
      row('Outer Bastion health', num(hp), num(hp * p(def, 'healthMul')));
      row(
        'Inner Bastion health',
        num(hp * t.tower.innerHpMul),
        num(hp * t.tower.innerHpMul * p(def, 'healthMul')),
      );
      row(
        'Mending when left alone',
        '0 a second',
        `${num(hp * p(def, 'healthMul') * p(def, 'regen'))} a second`,
      );
      break;
    }
    case 'royal_keep': {
      target = 'Your Throne';
      row('Throne health', num(t.guardian.hp), num(t.guardian.hp * p(def, 'healthMul')));
      row('Throne damage', num(t.guardian.damage), num(t.guardian.damage * p(def, 'damageMul')));
      row('Extra damage taken in Endgame', '+50%', `+${pct(p(def, 'endgameMul') - 1)}`);
      break;
    }
    case 'quiet_move': {
      target = 'Your hand';
      row('Cards in hand', num(t.gambits.handSize), num(p(def, 'hand')), false);
      row('Refill', `${num(input.handRefillSec)} s`, `${num(p(def, 'refillSec'))} s`);
      row(
        'Tempo a second',
        num(t.gambits.tempoPerSec),
        num(t.gambits.tempoPerSec * p(def, 'tempoMul')),
      );
      break;
    }
    case 'battery': {
      row('Lanes', '2 / 2 / 1', aim.lane ? `3 in ${LANE_LABEL[aim.lane]}` : '3 / 1 / 1');
      const lone = pieces.filter((u) => u.lane !== null && u.lane !== aim.lane).slice(0, 2);
      for (const u of lone)
        row(
          `${name(u)} armor (alone)`,
          num(u.stats.armor),
          num(u.stats.armor * p(def, 'armorMul')),
        );
      break;
    }
    case 'sortie': {
      target = 'Your Bastions';
      row(
        'Help when a Bastion drops below half',
        'None',
        `A piece for ${num(p(def, 'defendSec'))} s`,
      );
      row(
        'Damage in that lane',
        '100%',
        `${pct(p(def, 'damageMul'))} for ${num(p(def, 'buffSec'))} s`,
      );
      break;
    }
  }
  return { target, piece, rows };
}
