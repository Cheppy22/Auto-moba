// Spoils (spec 1B, "Rewards"): after each win, pick one of three cards, always one of each kind:
// a relic, an heirloom and a book move. Offers are seeded by the run seed and the round, so a
// saved run shows the same cards after a reload.
import type { Content } from '../content/loader';
import { PIECE_IDS, type ItemDef, type PieceId } from '../content/schema';
import { mixSeed, pick, seedStreams, shuffle } from '../core/rng';
import { defaultAim } from '../runRules';
import { tournamentOf } from './opponents';
import type { Reward, RunState, RunStep } from './types';

/** Heirloom candidates: tier-1 and tier-2 items up to the price limit, the piece's build first. */
function heirloomItems(c: Content, run: RunState, piece: PieceId): ItemDef[] {
  const max = tournamentOf(c).heirloomMaxPrice;
  const fits = (it: ItemDef | undefined): it is ItemDef => !!it && it.tier <= 2 && it.cost <= max;
  const path = run.court.pieces.find((e) => e.piece === piece)?.path ?? 'offense';
  const list = c.pieceById.get(piece)?.paths[path] ?? [];
  const out: ItemDef[] = [];
  for (const id of list) {
    const it = c.itemById.get(id);
    for (const part of [it, ...(it?.from ?? []).map((p) => c.itemById.get(p))])
      if (fits(part) && !out.includes(part)) out.push(part);
  }
  return out.length > 0 ? out : c.items.filter(fits);
}

/**
 * The three Spoils cards after a win. Relic: one White does not hold. Heirloom: for the piece
 * without one that ended the match holding the fewest items (ties in a seeded order), an item from
 * its build. Book move: a card from the court's Opening schools (any school for the Italian Game)
 * that is not a book move yet.
 */
export function rewardOffers(
  c: Content,
  run: RunState,
  items: Partial<Record<PieceId, number>> = {},
): Reward[] {
  const rng = seedStreams(mixSeed(run.seed, 'spoils', run.results.length));
  const out: Reward[] = [];
  const held = new Set(run.relics.map((r) => r.id));
  const relics = c.relics.filter((r) => !held.has(r.id));
  if (relics.length > 0) out.push({ kind: 'relic', relic: pick(rng, 'loot', relics).id });
  const pieces = shuffle(rng, 'loot', PIECE_IDS)
    .filter((p) => !run.heirlooms[p])
    .sort((a, b) => (items[a] ?? 0) - (items[b] ?? 0));
  if (pieces.length > 0) {
    const piece = pieces[0];
    out.push({ kind: 'heirloom', piece, item: pick(rng, 'loot', heirloomItems(c, run, piece)).id });
  }
  const schools = c.openingById.get(run.court.opening)?.schools ?? [];
  const free = c.gambits.filter((g) => g.weight > 0 && !run.books.includes(g.id));
  const inSchool = free.filter((g) => schools.length === 0 || schools.includes(g.school));
  const books = inSchool.length > 0 ? inSchool : free;
  if (books.length > 0) out.push({ kind: 'book', card: pick(rng, 'loot', books).id });
  return out;
}

const sameOffer = (a: Reward, b: Reward): boolean =>
  (a.kind === 'relic' && b.kind === 'relic' && a.relic === b.relic) ||
  (a.kind === 'heirloom' && b.kind === 'heirloom' && a.piece === b.piece && a.item === b.item) ||
  (a.kind === 'book' && b.kind === 'book' && a.card === b.card);

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
    next.heirlooms[reward.piece] = reward.item;
  } else next.books.push(reward.card);
  next.offers = null;
  return { ok: true, run: next };
}

/**
 * "Let the AI choose" (and headless runs): a relic while the row has room, else the heirloom,
 * else the book move.
 */
export function aiReward(c: Content, run: RunState): Reward | null {
  const offers = run.offers ?? [];
  const room = run.relics.length < tournamentOf(c).relicMax;
  return (
    offers.find((o) => o.kind === 'relic' && room) ??
    offers.find((o) => o.kind === 'heirloom') ??
    offers.find((o) => o.kind === 'book') ??
    null
  );
}
