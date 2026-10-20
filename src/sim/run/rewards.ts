// Spoils (spec 1B, "Rewards"): after each win, pick one of three cards, always one of each kind:
// a relic, an heirloom and a book move. Offers are seeded by the run seed and the round, so a
// saved run shows the same cards after a reload.
import type { Content } from '../content/loader';
import { PIECE_IDS, type PieceId } from '../content/schema';
import { mixSeed, pick, seedStreams, shuffle } from '../core/rng';
import { defaultAim } from '../runRules';
import { techniqueValue } from '../builds';
import { isFirstMove } from '../techniques';
import { tournamentOf } from './opponents';
import type { Reward, RunState, RunStep } from './types';

/** Heirloom candidates: the Setup cards (common or the piece's own) the piece held at the end. */
const heirloomCards = (c: Content, piece: PieceId, held: readonly string[]): string[] =>
  held.filter((id) => isFirstMove(c, piece, id));

/**
 * The three Spoils cards after a win. Relic: one White does not hold. Heirloom: for the piece
 * without one that ended the match holding the fewest Techniques (ties in a seeded order), one of
 * the Techniques it held (not an archetype card or a Combination, which need more than the piece).
 * Book move: a card from the court's Opening schools (any school for the Italian Game) that is not
 * a book move yet.
 */
export function rewardOffers(
  c: Content,
  run: RunState,
  techniques: Partial<Record<PieceId, string[]>> = {},
): Reward[] {
  const rng = seedStreams(mixSeed(run.seed, 'spoils', run.results.length));
  const out: Reward[] = [];
  const held = new Set(run.relics.map((r) => r.id));
  const relics = c.relics.filter((r) => !held.has(r.id));
  if (relics.length > 0) out.push({ kind: 'relic', relic: pick(rng, 'loot', relics).id });
  const kept = (p: PieceId): string[] => techniques[p] ?? [];
  const pieces = shuffle(rng, 'loot', PIECE_IDS)
    .filter((p) => !run.heirlooms[p] && heirloomCards(c, p, kept(p)).length > 0)
    .sort((a, b) => kept(a).length - kept(b).length);
  if (pieces.length > 0) {
    const piece = pieces[0];
    const technique = pick(rng, 'loot', heirloomCards(c, piece, kept(piece)));
    out.push({ kind: 'heirloom', piece, technique });
  }
  // book move (owner decision C, 2026-10-20): three different gambit cards to choose from, never
  // the court's Opening card (it opens the hand already) or the book move held now
  const opening = c.openingById.get(run.court.opening)?.openingCard ?? null;
  let free = c.gambits.filter((g) => g.weight > 0 && g.id !== opening && !run.books.includes(g.id));
  const cards: string[] = [];
  while (cards.length < BOOK_CHOICES && free.length > 0) {
    const g = pick(rng, 'loot', free);
    cards.push(g.id);
    free = free.filter((x) => x !== g);
  }
  if (cards.length > 0) out.push({ kind: 'book', cards });
  return out;
}

/** Cards a book move Spoils card offers. */
export const BOOK_CHOICES = 3;

const sameCards = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

const sameOffer = (a: Reward, b: Reward): boolean =>
  (a.kind === 'relic' && b.kind === 'relic' && a.relic === b.relic) ||
  (a.kind === 'heirloom' &&
    b.kind === 'heirloom' &&
    a.piece === b.piece &&
    a.technique === b.technique) ||
  (a.kind === 'book' && b.kind === 'book' && sameCards(a.cards, b.cards));

/**
 * Takes one of the open Spoils cards. A relic card with the relic row full must name the held
 * relic it `replaces`; a new relic gets the default aim (the Run kit can re-aim it).
 */
export function applyReward(c: Content, run: RunState, reward: Reward): RunStep {
  if (!run.offers) return { ok: false, reason: 'no Spoils are open' };
  if (!run.offers.some((o) => sameOffer(o, reward)))
    return { ok: false, reason: 'not one of the offered rewards' };
  const next: RunState = structuredClone(run);
  if (reward.kind === 'relic') {
    const def = c.relicById.get(reward.relic);
    if (!def) return { ok: false, reason: 'unknown relic' };
    const full = next.relics.length >= tournamentOf(c).relicMax;
    if (full) {
      if (!reward.replaces || !next.relics.some((r) => r.id === reward.replaces))
        return { ok: false, reason: 'your relic row is full: pick one to swap' };
      next.relics = next.relics.filter((r) => r.id !== reward.replaces);
    } else if (reward.replaces) return { ok: false, reason: 'you have a free relic slot' };
    next.relics.push({ id: def.id, ...defaultAim(c, next.court, def) });
  } else if (reward.kind === 'heirloom') {
    if (next.heirlooms[reward.piece]) return { ok: false, reason: 'that piece has an heirloom' };
    next.heirlooms[reward.piece] = reward.technique;
  } else {
    // the run holds one book move: a new one takes the old one's place
    if (!reward.card || !reward.cards.includes(reward.card))
      return { ok: false, reason: 'pick one of the book move’s cards' };
    next.books = [reward.card];
  }
  next.offers = null;
  return { ok: true, run: next };
}

/**
 * The card the AI takes from a book move: one of its Opening's schools if offered (it is drawn with
 * them all match), then the cheapest (it can be played soonest from the first second).
 */
export function aiBookCard(c: Content, run: RunState, cards: readonly string[]): string | null {
  const schools = c.openingById.get(run.court.opening)?.schools ?? [];
  let best: string | null = null;
  let bestKey = Infinity;
  for (const id of cards) {
    const g = c.gambitById.get(id);
    if (!g) continue;
    const key = (schools.includes(g.school) ? 0 : 1000) + g.cost;
    if (key < bestKey) {
      bestKey = key;
      best = id;
    }
  }
  return best;
}

/**
 * "Let the AI choose" (and headless runs): a relic while the row has room; otherwise the heirloom
 * or the book move, whichever is worth more gold: the heirloom `tournament.aiHeirloomGold` plus
 * `aiValueGold` per unit of its Technique's measured worth (`content/technique-values.json`), the
 * book move `aiBookGold`. So a strong Technique stays an heirloom and a weak one loses to a card
 * that opens every hand.
 */
export function aiReward(c: Content, run: RunState): Reward | null {
  const offers = run.offers ?? [];
  const t = tournamentOf(c);
  const relic = offers.find((o) => o.kind === 'relic');
  if (relic && run.relics.length < t.relicMax) return relic;
  const worth = (o: Reward): number =>
    o.kind === 'heirloom'
      ? t.aiHeirloomGold + t.aiValueGold * techniqueValue(c, o.technique, 'plain')
      : t.aiBookGold;
  let best: Reward | null = null;
  for (const o of offers) if (o.kind !== 'relic' && (!best || worth(o) > worth(best))) best = o;
  if (best?.kind === 'book') {
    const card = aiBookCard(c, run, best.cards);
    return card ? { ...best, card } : null;
  }
  return best;
}
