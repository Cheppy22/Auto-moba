import type {
  AbilityDef,
  Content,
  Disposition,
  GambitDef,
  ItemDef,
  LaneId,
  Path,
  PieceId,
  School,
} from '../../sim';
import { plainText } from '../richtext';
import { COUNTERED_BY, COUNTERS, SCHOOL_JOB, SCHOOL_NAME } from '../schools';

/** Pure helpers behind the setup screen: all text comes from content, nothing here touches the sim. */

// ---------------------------------------------------------------- page 1: build paths

/** One short line per path: what the path leans on. The piece-specific part is the item list. */
export const PATH_FOCUS: Record<Path, string> = {
  offense: 'Damage and speed first',
  defense: 'Health and armor first',
  utility: 'Support and control first',
};

/** The piece's build list for a path, as items (the order the AI shopper works down). */
export function buildOrder(c: Content, piece: PieceId, path: Path): ItemDef[] {
  const def = c.pieceById.get(piece);
  if (!def) return [];
  return def.paths[path].map((id) => c.itemById.get(id)).filter((x): x is ItemDef => !!x);
}

export interface FirstBuy {
  item: ItemDef;
  /** The bigger item this purchase is a part of (null when the item is bought whole). */
  toward: ItemDef | null;
}

/**
 * The first purchases the AI shopper makes for a piece's path. This replays `nextPurchase`
 * (`src/sim/ai/shopping.ts`) with a small wallet that grows until the next buy is affordable: it
 * works down the build list, buys the item when it can pay, otherwise the first affordable
 * component, otherwise saves. Owned components are credited against the price (`src/sim/shop.ts`).
 * It ignores the counter item the AI may slip in against the enemy's damage mix, so these are
 * "typical" first buys, not a promise.
 */
export function firstBuys(c: Content, piece: PieceId, path: Path, count = 3): FirstBuy[] {
  const owned: ItemDef[] = [];
  const out: FirstBuy[] = [];
  let gold = c.tuning.startingGold;
  const chain = (it: ItemDef, id: string): boolean =>
    it.from.some((f) => f === id || (c.itemById.has(f) && chain(c.itemById.get(f)!, id)));
  const has = (id: string): boolean => owned.some((o) => o.id === id || chain(o, id));
  const price = (it: ItemDef): number =>
    it.cost -
    it.from.reduce((t, f) => t + (owned.some((o) => o.id === f) ? c.itemById.get(f)!.cost : 0), 0);
  const buy = (it: ItemDef, toward: ItemDef | null): void => {
    gold -= price(it);
    for (const f of it.from) {
      const at = owned.findIndex((o) => o.id === f);
      if (at >= 0) owned.splice(at, 1);
    }
    owned.push(it);
    out.push({ item: it, toward });
  };
  for (let guard = 0; out.length < count && guard < 400; guard++) {
    let bought = false;
    for (const target of buildOrder(c, piece, path)) {
      if (has(target.id)) continue;
      if (price(target) <= gold) {
        buy(target, null);
        bought = true;
      } else {
        const part = target.from
          .map((f) => c.itemById.get(f))
          .find((x): x is ItemDef => !!x && !has(x.id) && price(x) <= gold);
        if (part) {
          buy(part, target);
          bought = true;
        }
      }
      break;
    }
    if (!bought) gold += 50;
  }
  return out;
}

export interface Lean {
  damage: number;
  toughness: number;
  support: number;
}

/**
 * Rough stat leaning of a list of items, as shares that sum to 1. Weights turn each stat into
 * comparable "points": damage (Blade, Soul, attack speed), toughness (health, armor, resist, regen,
 * damage taken) and support (cooldowns, move speed, plus a flat bonus for items that help allies or
 * cut cooldowns).
 */
export function leanOf(items: ItemDef[]): Lean {
  let damage = 0;
  let toughness = 0;
  let support = 0;
  for (const it of items) {
    for (const m of it.mods) {
      const v = m.value;
      switch (m.stat) {
        case 'bladeDmg':
        case 'soulPower':
          damage += v;
          break;
        case 'atkSpeed':
          damage += v * 100;
          break;
        case 'maxHp':
          toughness += v / 10;
          break;
        case 'armor':
        case 'resist':
          toughness += v * 1.2;
          break;
        case 'hpRegen':
          toughness += v * 3;
          break;
        case 'damageTakenMult':
          toughness += (1 - v) * 400;
          break;
        case 'cdr':
          support += v * 200;
          break;
        case 'moveSpeed':
          support += v * 1.5;
          break;
        default:
          break;
      }
    }
    const text = plainText(it.desc);
    if (/allies|cooldowns/i.test(text)) support += 18;
  }
  const total = damage + toughness + support;
  if (total <= 0) return { damage: 0, toughness: 0, support: 0 };
  return { damage: damage / total, toughness: toughness / total, support: support / total };
}

/** What a path means for a piece, in one sentence built from the piece and its real build list. */
export function pathMeaning(c: Content, piece: PieceId, path: Path): string {
  const def = c.pieceById.get(piece);
  const order = buildOrder(c, piece, path);
  if (!def) return '';
  const names = order
    .filter((it) => it.tier >= 2)
    .slice(0, 2)
    .map((it) => it.name);
  const lead = `${PATH_FOCUS[path]}.`;
  const body = names.length ? ` The ${def.name} builds toward ${names.join(' and ')}.` : '';
  return `${lead}${body}`;
}

// ---------------------------------------------------------------- page 2: pieces and synergy

export const DISPOSITION_LABEL: Record<Disposition, string> = {
  defender: 'Defender',
  attacker: 'Attacker',
  farmer: 'Farmer',
};
/** How the AI plays a disposition in its lane (posture: defend / push / farm in `units.ts`). */
export const DISPOSITION_NOTE: Record<Disposition, string> = {
  defender: 'Holds and defends its lane',
  attacker: 'Pushes the lane and hunts pieces',
  farmer: 'Farms camps and the jungle',
};

/** The part of a passive's text after "Name: " (passives name themselves in their text). */
export function passiveParts(desc: string): { name: string; text: string } {
  const at = desc.indexOf(':');
  if (at < 0) return { name: '', text: desc };
  return { name: desc.slice(0, at).trim(), text: desc.slice(at + 1).trim() };
}

const heals = (a: AbilityDef): boolean =>
  (a.target === 'allyArea' || a.target === 'lowestAlly') &&
  a.effects.some((e) => e.type === 'heal' || e.type === 'shield');

export interface LaneNote {
  /** A short heading, such as "Healing cover". */
  title: string;
  text: string;
}

/** What an ally-targeted heal or shield skill does, in four words ("heals nearby allies"). */
function coverVerb(a: AbilityDef): string {
  const verb = a.effects.some((e) => e.type === 'heal') ? 'heals' : 'shields';
  return a.target === 'lowestAlly' ? `${verb} the most wounded ally` : `${verb} nearby allies`;
}

/**
 * Plain-language notes for two pieces that share a lane, derived from content only: an ally heal or
 * shield skill, an ally aura, and a durable melee piece in front of a ranged one. Nothing notable
 * gives an empty list.
 */
export function laneNotes(c: Content, a: PieceId, b: PieceId): LaneNote[] {
  const pa = c.pieceById.get(a);
  const pb = c.pieceById.get(b);
  if (!pa || !pb) return [];
  const notes: LaneNote[] = [];
  for (const [x, y] of [
    [pa, pb],
    [pb, pa],
  ] as const) {
    const heal = x.abilities.find(heals);
    if (heal)
      notes.push({
        title: 'Cover',
        text: `${x.name}'s ${heal.name} ${coverVerb(heal)}, the ${y.name} included.`,
      });
    for (const p of x.passives) {
      const aura = p.effects.some((e) => e.type === 'aura' && e.target === 'ally');
      if (!aura) continue;
      const parts = passiveParts(p.desc ?? '');
      notes.push({
        title: 'Aura',
        text: `${x.name}'s ${parts.name || 'aura'} reaches the ${y.name}: ${parts.text}`,
      });
    }
  }
  for (const [front, back] of [
    [pa, pb],
    [pb, pa],
  ] as const) {
    if (
      front.disposition === 'defender' &&
      front.attackKind === 'melee' &&
      back.attackKind === 'ranged'
    )
      notes.push({
        title: 'Front and back',
        text: `${front.name} is the tough front (${front.stats.maxHp} health, melee); the ${back.name} hits from ${back.stats.range} range behind it.`,
      });
  }
  return notes;
}

export const LANE_FULL: Record<LaneId, string> = { top: 'Left', mid: 'Mid', bot: 'Right' };

// ---------------------------------------------------------------- page 3: openings and example hands

type Opening = Content['openings'][number];

/** Why one school beats another, in terms of card effects (docs/CHESS.md, "Gambit schools"). */
type BeatKey = `${School}>${School}`;
const BEATS: Partial<Record<BeatKey, string>> = {
  'fortress>march': 'Armor, resist and Bastion shields soak a push longer than its buff lasts.',
  'position>march':
    'Barricade seals a gate or bridge and Outpost holds a choke, so a pushing wave stalls or reroutes.',
  'fortress>initiative': 'Shields, heals and Castle save the marked or pinned piece.',
  'sacrifice>fortress':
    'Burst damage and the team damage spike break shields and armor built for a long fight.',
  'initiative>fortress': 'Picks off the healer or King before the defence holds.',
  'clock>sacrifice': 'Tempo drain and forced discards stop the costly swing card being played.',
  'position>sacrifice': 'Barricade and Regroup keep pieces away from where the swing lands.',
  'initiative>position': 'Check and Fork kill or lock the pieces holding an Outpost or Barricade.',
  'march>clock': 'Steady cheap pressure wins while Clock spends Tempo on information.',
};

export interface Matchup {
  mine: School;
  other: School;
  text: string;
}

export interface OpeningInfo {
  explain: string;
  plays: string;
  /** Cards from the favoured schools, by name. */
  cards: string[];
  strongVs: Matchup[];
  weakVs: Matchup[];
  /** Share of draws that come from the favoured schools, with this Opening and with none. */
  share: { with: number; without: number } | null;
}

/** The draw pool: every card with weight, assuming all five pieces are alive. */
export function deckOf(c: Content): GambitDef[] {
  return c.gambits.filter((g) => g.weight > 0);
}

export function openingInfo(c: Content, o: Opening): OpeningInfo {
  const fav = o.schools;
  const deck = deckOf(c);
  const sum = (f: (g: GambitDef) => number): number => deck.reduce((t, g) => t + f(g), 0);
  const base = sum((g) => g.weight);
  const favBase = sum((g) => (fav.includes(g.school) ? g.weight : 0));
  const weighted = sum((g) => g.weight * (fav.includes(g.school) ? 2 : 1));
  const favWeighted = favBase * 2;
  const matchups = (pairs: [School, School][], flip: boolean): Matchup[] =>
    pairs.map(([mine, other]) => ({
      mine,
      other,
      text: BEATS[(flip ? `${other}>${mine}` : `${mine}>${other}`) as BeatKey] ?? '',
    }));
  const strong: [School, School][] = [];
  const weak: [School, School][] = [];
  for (const s of fav) {
    for (const t of COUNTERS[s]) strong.push([s, t]);
    for (const t of COUNTERED_BY[s]) weak.push([s, t]);
  }
  if (fav.length === 0)
    return {
      explain:
        'No school is favoured: every card in the deck is equally likely, so your hand shows a bit of everything.',
      plays: 'A flexible hand. Good when you do not know what Black will do.',
      cards: [],
      strongVs: [],
      weakVs: [],
      share: null,
    };
  const names = fav.map((s) => SCHOOL_NAME[s]);
  return {
    explain: `${names.join(' and ')} cards come up twice as often when your hand is dealt. Black picks its own Opening in secret; it is shown once the match starts.`,
    plays: fav.map((s) => `${SCHOOL_NAME[s]}: ${SCHOOL_JOB[s].toLowerCase()}.`).join(' '),
    cards: deck.filter((g) => fav.includes(g.school)).map((g) => g.name),
    strongVs: matchups(strong, false),
    weakVs: matchups(weak, true),
    share: { with: favWeighted / weighted, without: favBase / base },
  };
}

/** A small seeded PRNG for the UI (mulberry32). Not the sim's streams. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Sample hands for an Opening: `count` hands of three different cards, picked by the same weights
 * as a real draw (card weight, doubled for the Opening's schools). Display only.
 */
export function exampleHands(c: Content, o: Opening, count = 3, size = 3): GambitDef[][] {
  const deck = deckOf(c);
  const rnd = seededRandom(hashString(`hands:${o.id}`));
  const w = (g: GambitDef): number => g.weight * (o.schools.includes(g.school) ? 2 : 1);
  const hands: GambitDef[][] = [];
  for (let i = 0; i < count; i++) {
    const pool = deck.slice();
    const hand: GambitDef[] = [];
    while (hand.length < size && pool.length > 0) {
      let r = rnd() * pool.reduce((t, g) => t + w(g), 0);
      let at = pool.length - 1;
      for (let k = 0; k < pool.length; k++) {
        r -= w(pool[k]);
        if (r < 0) {
          at = k;
          break;
        }
      }
      hand.push(pool.splice(at, 1)[0]);
    }
    hands.push(hand);
  }
  return hands;
}
