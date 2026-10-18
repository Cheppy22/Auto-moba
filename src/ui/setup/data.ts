import type {
  AbilityDef,
  Content,
  Disposition,
  GambitDef,
  LaneId,
  PieceId,
  School,
} from '../../sim';
import { COUNTERED_BY, COUNTERS, SCHOOL_JOB, SCHOOL_NAME, SCHOOL_ORDER } from '../schools';

/** Pure helpers behind the setup screen: all text comes from content, nothing here touches the sim. */

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

/** One enemy school against this Opening: one verdict, the own schools behind it, one line why. */
export interface Matchup {
  /** Own schools that take part (the winning side for good/weak, both sides for even). */
  mine: School[];
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
  /** Enemy schools where the Opening's gains and losses cancel out. */
  evenVs: Matchup[];
  /** Share of draws that come from the favoured schools, with this Opening and with none. */
  share: { with: number; without: number } | null;
}

/** The Opening's card line: "Opens with Fork", or the Italian Game's three schools. */
export function opensWith(c: Content, o: Opening): string {
  const card = o.openingCard ? c.gambitById.get(o.openingCard) : undefined;
  return card ? `Opens with ${card.name}` : 'Opens with three schools';
}

/** The draw pool: every card with weight, assuming all five pieces are alive. */
export function deckOf(c: Content): GambitDef[] {
  return c.gambits.filter((g) => g.weight > 0);
}

/**
 * Each enemy school gets exactly one verdict against an Opening's schools: wins are own schools
 * that counter it, losses are own schools it counters; the net decides (good, weak, or even when
 * both sides exist and cancel). Schools with no counter either way are left out.
 */
export function openingMatchups(fav: School[]): {
  strongVs: Matchup[];
  weakVs: Matchup[];
  evenVs: Matchup[];
} {
  const out = { strongVs: [] as Matchup[], weakVs: [] as Matchup[], evenVs: [] as Matchup[] };
  for (const other of SCHOOL_ORDER) {
    const wins = fav.filter((s) => COUNTERS[s].includes(other));
    const losses = fav.filter((s) => COUNTERED_BY[s].includes(other));
    if (wins.length === 0 && losses.length === 0) continue;
    const why = (list: School[], flip: boolean): string =>
      list
        .map((s) => BEATS[(flip ? `${other}>${s}` : `${s}>${other}`) as BeatKey] ?? '')
        .filter((t) => t !== '')
        .join(' ');
    if (wins.length > losses.length)
      out.strongVs.push({ mine: wins, other, text: why(wins, false) });
    else if (losses.length > wins.length)
      out.weakVs.push({ mine: losses, other, text: why(losses, true) });
    else
      out.evenVs.push({
        mine: [...wins, ...losses],
        other,
        text: `For: ${why(wins, false)} Against: ${why(losses, true)}`,
      });
  }
  return out;
}

export function openingInfo(c: Content, o: Opening): OpeningInfo {
  const fav = o.schools;
  const deck = deckOf(c);
  const sum = (f: (g: GambitDef) => number): number => deck.reduce((t, g) => t + f(g), 0);
  const base = sum((g) => g.weight);
  const favBase = sum((g) => (fav.includes(g.school) ? g.weight : 0));
  const weighted = sum((g) => g.weight * (fav.includes(g.school) ? 2 : 1));
  const favWeighted = favBase * 2;
  const { strongVs, weakVs, evenVs } = openingMatchups(fav);
  if (fav.length === 0)
    return {
      explain:
        'No school is favoured: every card in the deck is equally likely, and your first hand holds three different schools.',
      plays: 'A flexible hand. Good when you do not know what Black will do.',
      cards: [],
      strongVs: [],
      weakVs: [],
      evenVs: [],
      share: null,
    };
  const names = fav.map((s) => SCHOOL_NAME[s]);
  return {
    explain: `${names.join(' and ')} cards come up twice as often when your hand is dealt. Black picks its own Opening in secret; it is shown once the match starts.`,
    plays: fav.map((s) => `${SCHOOL_NAME[s]}: ${SCHOOL_JOB[s].toLowerCase()}.`).join(' '),
    cards: deck.filter((g) => fav.includes(g.school)).map((g) => g.name),
    strongVs,
    weakVs,
    evenVs,
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
 * Sample first hands for an Opening: `count` hands of `size` different cards. The Opening's card
 * comes first; the rest are picked by the same weights as a real draw (card weight, doubled for
 * the Opening's schools). The Italian Game has no card, so its hands hold different schools.
 * Display only.
 */
export function exampleHands(c: Content, o: Opening, count = 3, size = 3): GambitDef[][] {
  const deck = deckOf(c);
  const rnd = seededRandom(hashString(`hands:${o.id}`));
  const w = (g: GambitDef): number => g.weight * (o.schools.includes(g.school) ? 2 : 1);
  const first = o.openingCard ? c.gambitById.get(o.openingCard) : undefined;
  const hands: GambitDef[][] = [];
  for (let i = 0; i < count; i++) {
    const hand: GambitDef[] = first ? [first] : [];
    let pool = deck.filter((g) => g !== first);
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
      const pick = pool[at];
      hand.push(pick);
      // no card to open with: three different schools; otherwise just a different card
      pool = pool.filter((g) => g !== pick && (first || g.school !== pick.school));
    }
    hands.push(hand);
  }
  return hands;
}
