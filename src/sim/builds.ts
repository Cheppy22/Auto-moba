// Piece builds with Techniques (SPEC-PIECE-BUILDS-2026-10-18, phase 1): offers at Setup and each
// Act break, grades, the gold rules (reroll, upgrade, pass), the AI's pick, "Pick for me" advice
// and the read-only Builds view.
//
// Offers are drawn from a private generator per offer, seeded by (match seed, side, piece, break,
// reroll count): the same seed always gives the same offers, a reroll gives the next draw, and
// reading an offer (the UI, "AI suggests") never moves any match stream.
import type { Content } from './content/loader';
import {
  GRADES,
  TECHNIQUE_SLOTS,
  type Grade,
  type PieceId,
  type School,
  type TechniqueDef,
  type TechniqueSlot,
  type Tuning,
} from './content/schema';
import { mixSeed, seededRng } from './core/rng';
import type { Ctx } from './ctx';
import { PLAY_TEAMS } from './names';
import { abilityAxes, perkAxes, styleAxes, type Axes } from './ranks';
import {
  combinationsOf,
  gradeIndex,
  isFirstMove,
  gradeMult,
  replacedBy,
  techniqueAbility,
  techniqueText,
  withTechnique,
} from './techniques';
import { freshPieceTally } from './buildTally';
import { techniquePreview } from './preview';
import type {
  BuildAdvice,
  BuildCardView,
  BuildOffer,
  BuildSlotView,
  BuildState,
  BuildView,
  CommandResult,
  FirstMoveView,
  HeldTechnique,
  OfferCard,
  PieceTally,
  PlayTeam,
  TechTally,
  Unit,
} from './types';

export const freshBuilds = (): BuildState => ({
  open: false,
  offers: [],
  touched: [],
  brilliantUsed: [],
  freeRerolls: { A: 0, B: 0 },
  act: {},
  lastAct: {},
  match: {},
  pieces: {},
  lastPieces: {},
});

/** Everything an offer and the AI's score depend on, without needing a unit (Setup has none yet). */
export interface BuildSubject {
  seed: number;
  team: PlayTeam;
  piece: PieceId;
  style: string | null;
  rank: number;
  held: readonly HeldTechnique[];
  /** The side trails (read at the break): Dubious cards are drawn more often. */
  behind: boolean;
}

const def = (c: Content, id: string): TechniqueDef | undefined => c.techniqueById.get(id);

/** Held ids plus each held Combination's first parent (folded into it): none is offered again. */
function takenIds(c: Content, held: readonly HeldTechnique[]): Set<string> {
  const out = new Set<string>();
  for (const h of held) {
    out.add(h.id);
    const p = def(c, h.id)?.parents;
    if (p) out.add(p[0]);
  }
  return out;
}

function heldSchools(c: Content, held: readonly HeldTechnique[]): Set<School> {
  const out = new Set<School>();
  for (const h of held) {
    const d = def(c, h.id);
    if (d) out.add(d.school);
  }
  return out;
}

/** The Signature slot opens with the Rank 4 archetype. */
export const slotOpen = (subj: BuildSubject, slot: TechniqueSlot): boolean =>
  slot !== 'signature' || subj.style !== null;

function inPool(d: TechniqueDef, subj: BuildSubject): boolean {
  switch (d.pool) {
    case 'common':
      return true;
    case 'piece':
      return d.piece === subj.piece;
    case 'archetype':
      return d.piece === subj.piece && d.archetype === subj.style;
    case 'combination':
      return false;
  }
}

/** A card this piece can still be offered later (an archetype card only for its own archetype). */
function canBeOffered(d: TechniqueDef | undefined, subj: BuildSubject): boolean {
  if (!d || d.pool === 'combination') return false;
  if (d.pool === 'common') return true;
  if (d.piece !== subj.piece) return false;
  return d.pool === 'piece' || subj.style === null || d.archetype === subj.style;
}

/** Combinations whose two parents the piece holds (and it does not hold the Combination yet). */
export function readyCombinations(c: Content, subj: BuildSubject): TechniqueDef[] {
  const have = new Set(subj.held.map((h) => h.id));
  return c.techniques.filter(
    (d) =>
      d.pool === 'combination' &&
      !have.has(d.id) &&
      (!d.piece || d.piece === subj.piece) &&
      d.parents!.every((p) => have.has(p)),
  );
}

/** A Combination arrives at the higher grade of its two parents. */
function combinationGrade(d: TechniqueDef, subj: BuildSubject): Grade {
  let best = 0;
  for (const p of d.parents ?? []) {
    const h = subj.held.find((x) => x.id === p);
    if (h) best = Math.max(best, gradeIndex(h.grade));
  }
  return GRADES[best];
}

/** The piece holds the other parent of a Combination this card leads to (and not the Combination). */
function partnerHeld(c: Content, subj: BuildSubject, id: string): boolean {
  const have = new Set(subj.held.map((h) => h.id));
  return combinationsOf(c, id).some(
    (k) =>
      (!k.piece || k.piece === subj.piece) &&
      !have.has(k.id) &&
      k.parents!.some((p) => p !== id && have.has(p)),
  );
}

function drawWeight(c: Content, t: Tuning, subj: BuildSubject, d: TechniqueDef): number {
  const w = t.builds.weights;
  // Techniques draw evenly by school: the Opening shapes only the gambit hand (owner, 2026-10-20)
  let m = 1;
  if (heldSchools(c, subj.held).has(d.school)) m *= w.held;
  m = Math.min(m, w.max);
  if (d.dubious && subj.behind) m *= w.dubiousBehind;
  if (partnerHeld(c, subj, d.id)) m *= w.partner;
  return d.weight * m;
}

function rollGrade(t: Tuning, at: number, x: number): Grade {
  const rows = t.builds.gradeOdds;
  const [p, s] = rows[Math.min(at, rows.length - 1)];
  return x < p ? 'plain' : x < p + s ? 'sharp' : 'brilliant';
}

/**
 * Draws an offer (spec 4.1): one card from the piece's own pool, one from the common pool, and a
 * wild card (a ready Combination, else any pool); never two cards for one slot, never a held card.
 * `grade` fixes the grade (a reroll keeps its offer's grade; Rank 8 gives Brilliant).
 */
export function drawOffer(
  c: Content,
  t: Tuning,
  subj: BuildSubject,
  at: number,
  rerolls: number,
  grade?: Grade,
): { grade: Grade; cards: OfferCard[] } {
  const rng = seededRng(mixSeed(subj.seed, 'build', subj.team, subj.piece, at, rerolls));
  const rolled = rollGrade(t, at, rng());
  const g = grade ?? rolled;
  const taken = takenIds(c, subj.held);
  // at Setup the only card held is a run's heirloom: the first move is drawn for another slot
  const filled = new Set(
    at === 0 ? subj.held.map((h) => def(c, h.id)?.slot).filter((x) => x !== undefined) : [],
  );
  const pool = c.techniques.filter(
    (d) =>
      d.pool !== 'combination' &&
      d.weight > 0 &&
      !taken.has(d.id) &&
      !filled.has(d.slot) &&
      slotOpen(subj, d.slot) &&
      inPool(d, subj),
  );
  const slots = new Set<TechniqueSlot>();
  const pick = (list: TechniqueDef[]): TechniqueDef | null => {
    const ok = list.filter((d) => !slots.has(d.slot));
    if (ok.length === 0) return null;
    const ws = ok.map((d) => drawWeight(c, t, subj, d));
    const total = ws.reduce((a, b) => a + b, 0);
    let roll = rng() * total;
    let chosen = ok[ok.length - 1];
    for (let i = 0; i < ok.length; i++) {
      roll -= ws[i];
      if (roll <= 0) {
        chosen = ok[i];
        break;
      }
    }
    slots.add(chosen.slot);
    const k = pool.indexOf(chosen);
    if (k >= 0) pool.splice(k, 1);
    return chosen;
  };
  const combos = readyCombinations(c, subj);
  const wild = combos.length > 0 ? pick(combos) : null;
  const own =
    pick(pool.filter((d) => d.pool === 'piece' || d.pool === 'archetype')) ?? pick(pool.slice());
  const common = pick(pool.filter((d) => d.pool === 'common')) ?? pick(pool.slice());
  const third = wild ?? pick(pool.slice());
  const cards: OfferCard[] = [];
  for (const d of [own, common, third]) {
    if (!d) continue;
    cards.push({ id: d.id, grade: d.pool === 'combination' ? combinationGrade(d, subj) : g });
  }
  return { grade: g, cards };
}

const norm = (a: Axes): Axes => {
  const v: Axes = [Math.max(0, a[0]), Math.max(0, a[1]), Math.max(0, a[2])];
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  return len > 0 ? [v[0] / len, v[1] / len, v[2] / len] : [0, 0, 0];
};

/** The piece's lean on [damage, toughness, support]: its base kit before Rank 4, its archetype after. */
function pieceAxes(c: Content, subj: BuildSubject): Axes {
  const st = subj.style ? c.styleByKey.get(`${subj.piece}/${subj.style}`) : undefined;
  if (st) return norm(styleAxes(st));
  const out: Axes = [0, 0, 0];
  for (const a of c.pieceById.get(subj.piece)!.abilities) {
    const ax = abilityAxes(a);
    for (let i = 0; i < 3; i++) out[i] += ax[i];
  }
  return norm(out);
}

/** How well a Technique fits the piece's lean, 0-1 (cosine of the two leans). */
function fitOf(c: Content, subj: BuildSubject, d: TechniqueDef): number {
  const kit = subj.style
    ? (c.kitByKey.get(`${subj.piece}/${subj.style}`) ?? [])
    : c.pieceById.get(subj.piece)!.abilities;
  const tech = norm(perkAxes({ ...d, ability: techniqueAbility(d) ?? undefined }, kit));
  const p = pieceAxes(c, subj);
  return tech[0] * p[0] + tech[1] * p[1] + tech[2] * p[2];
}

/** Seeded 0-1 jitter per card (so ties break the same way for the same match). */
function jitter(subj: BuildSubject, at: number, id: string): number {
  return mixSeed(subj.seed, 'buildAi', subj.team, subj.piece, at, id) / 4294967296;
}

/** The AI's score for one card (spec 4.6). */
export function scoreCard(
  c: Content,
  t: Tuning,
  subj: BuildSubject,
  card: OfferCard,
  at: number,
): number {
  const a = t.builds.ai;
  const d = def(c, card.id);
  if (!d) return -Infinity;
  let s = a.grade[gradeIndex(card.grade)];
  // a Combination adds to the build (its first parent's effect is part of it), so it counts as filling
  if (d.pool === 'combination') s += a.fills + a.combination;
  else {
    const old = replacedBy(c, subj.held, d.id);
    if (!old) s += a.fills;
    else {
      s += a.replaces + a.replacesGrade * gradeIndex(old.grade);
      if (def(c, old.id)?.pool === 'combination') s += a.replacesCombination;
    }
  }
  s += a.fit * fitOf(c, subj, d);
  if (heldSchools(c, subj.held).has(d.school)) s += a.school;
  const have = new Set(subj.held.map((h) => h.id));
  let lead = 0;
  for (const combo of combinationsOf(c, d.id)) {
    if (combo.piece && combo.piece !== subj.piece) continue;
    if (have.has(combo.id)) continue;
    const partner = combo.parents!.find((p) => p !== d.id)!;
    if (have.has(partner)) lead = Math.max(lead, a.parentReady);
    else if (canBeOffered(def(c, partner), subj)) lead = Math.max(lead, a.parent);
  }
  s += lead;
  return s + a.jitter * jitter(subj, at, d.id);
}

/** The card the AI takes ("AI suggests"; "Let the AI choose" takes exactly this one). */
export function aiChoice(
  c: Content,
  t: Tuning,
  subj: BuildSubject,
  cards: readonly OfferCard[],
  at: number,
): number | null {
  let best: number | null = null;
  let bestScore = -Infinity;
  cards.forEach((card, i) => {
    const sc = scoreCard(c, t, subj, card, at);
    if (sc > bestScore + 1e-9) {
      bestScore = sc;
      best = i;
    }
  });
  return best;
}

/** Every card would replace a held Combination: the AI passes instead. */
function nothingFits(c: Content, subj: BuildSubject, cards: readonly OfferCard[]): boolean {
  return cards.every((card) => {
    if (def(c, card.id)?.pool === 'combination') return false;
    const old = replacedBy(c, subj.held, card.id);
    return !!old && def(c, old.id)?.pool === 'combination';
  });
}

// ---- "Pick for me": the AI's pick for every piece, and the 1-2 picks that matter most ----

interface AdviceInput {
  key: number;
  subj: BuildSubject;
  cards: readonly OfferCard[];
  grade: Grade;
  at: number;
  carry: boolean;
}

function advise(c: Content, t: Tuning, inputs: AdviceInput[]): BuildAdvice {
  const adv = t.builds.advice;
  const pieces = inputs.map((x) => {
    const scores = x.cards.map((card) => scoreCard(c, t, x.subj, card, x.at));
    const pick = aiChoice(c, t, x.subj, x.cards, x.at);
    const combo = x.cards.some((card) => def(c, card.id)?.pool === 'combination');
    const spread = scores.length ? Math.max(...scores) - Math.min(...scores) : 0;
    const reasons: BuildAdvice['pieces'][number]['reasons'] = [];
    if (combo) reasons.push('combination');
    if (x.grade !== 'plain') reasons.push(x.grade);
    if (x.carry) reasons.push('carry');
    if (spread >= 1) reasons.push('spread');
    const stakes =
      spread +
      adv.gradeStakes[gradeIndex(x.grade)] +
      (combo ? adv.combination : 0) +
      (x.carry ? adv.carry : 0);
    return { heroId: x.key, pick, scores, stakes, reasons };
  });
  const order = pieces.slice().sort((a, b) => b.stakes - a.stakes);
  const highlight: number[] = [];
  if (order.length > 0) highlight.push(order[0].heroId);
  if (
    order.length > 1 &&
    order[0].stakes > 0 &&
    order[1].stakes >= adv.secondShare * order[0].stakes
  )
    highlight.push(order[1].heroId);
  return { pieces, highlight };
}

// ---- the match side: subjects, offers, commands ----

export function subjectOf(ctx: Ctx, u: Unit): BuildSubject {
  const h = u.hero!;
  const team = u.team as PlayTeam;
  return {
    seed: ctx.s.seed,
    team,
    piece: h.defId,
    style: h.style,
    rank: h.rank,
    held: h.techniques,
    behind: ctx.s.relics.behind[team],
  };
}

function piecesInSlotOrder(ctx: Ctx, team: PlayTeam): Unit[] {
  return ctx.s.teams[team].heroIds
    .map((id) => ctx.unit(id))
    .filter((u): u is Unit => !!u?.hero)
    .sort((a, b) => a.hero!.slot - b.hero!.slot);
}

const offerOf = (ctx: Ctx, heroId: number): BuildOffer | undefined =>
  ctx.s.builds.offers.find((o) => o.heroId === heroId);

/** Gold for the next reroll: free while the offer has an obelisk's free reroll left. */
export function rerollCost(t: Tuning, offer: BuildOffer): number {
  if (offer.free > 0) return 0;
  return t.builds.reroll.base + t.builds.reroll.step * offer.paid;
}

/** Gold to raise a held Technique one grade, or null at Brilliant. */
export function upgradeCost(t: Tuning, grade: Grade): number | null {
  const i = gradeIndex(grade);
  return i < 2 ? t.builds.upgrade[i] : null;
}

function emitOffer(ctx: Ctx, o: BuildOffer): void {
  ctx.emit('buildOffer', {
    id: o.heroId,
    team: o.team,
    at: o.at,
    grade: o.grade,
    cards: o.cards.map((x) => x.id),
    reroll: o.rerolls,
  });
}

function takeCard(ctx: Ctx, u: Unit, offer: BuildOffer, idx: number, auto: boolean): void {
  const card = offer.cards[idx];
  const d = def(ctx.c, card.id)!;
  const h = u.hero!;
  const held = h.techniques;
  const old = replacedBy(ctx.c, held, card.id);
  h.techniques = withTechnique(ctx.c, held, card.id, card.grade);
  offer.decided = 'taken';
  u.dirty = true;
  ctx.emit('technique', {
    id: u.id,
    team: u.team as PlayTeam,
    technique: card.id,
    grade: card.grade,
    slot: d.slot,
    replaced: old ? old.id : null,
    auto,
    at: offer.at,
  });
}

function passCard(ctx: Ctx, u: Unit, offer: BuildOffer): void {
  const gold = ctx.t.builds.passGold;
  u.hero!.gold += gold;
  offer.decided = 'passed';
  ctx.emit('offerPassed', { id: u.id, gold });
}

function reroll(ctx: Ctx, u: Unit, offer: BuildOffer): void {
  const cost = rerollCost(ctx.t, offer);
  u.hero!.gold -= cost;
  if (offer.free > 0) offer.free -= 1;
  else offer.paid += 1;
  offer.rerolls += 1;
  const d = drawOffer(ctx.c, ctx.t, subjectOf(ctx, u), offer.at, offer.rerolls, offer.grade);
  offer.cards = d.cards;
  emitOffer(ctx, offer);
}

function upgrade(ctx: Ctx, u: Unit, id: string): number {
  const h = u.hero!;
  const held = h.techniques.find((x) => x.id === id)!;
  const cost = upgradeCost(ctx.t, held.grade)!;
  h.gold -= cost;
  held.grade = GRADES[gradeIndex(held.grade) + 1];
  u.dirty = true;
  ctx.emit('techniqueUpgrade', { id: u.id, technique: id, grade: held.grade, cost });
  return cost;
}

/**
 * The match starts: each piece (holding nothing, or a run's heirloom) draws its Setup offer
 * (White, then Black, in slot order). White takes its `firstMove` when it is one of the cards;
 * Black takes its court's fixed first move (`content/courts.json`) whatever the offer holds; the
 * AI picks the rest.
 */
export function startBuilds(ctx: Ctx): void {
  const b = ctx.s.builds;
  for (const team of PLAY_TEAMS) {
    for (const u of piecesInSlotOrder(ctx, team)) {
      const subj = subjectOf(ctx, u);
      const d = drawOffer(ctx.c, ctx.t, subj, 0, 0);
      const wanted = ctx.s.setup[team].pieces.find((e) => e.piece === u.hero!.defId)?.firstMove;
      // a named court's first move is fixed: its offer is that one card
      const fixed = team === 'B' && !!wanted && isFirstMove(ctx.c, u.hero!.defId, wanted);
      const cards = fixed ? [{ id: wanted!, grade: d.grade }] : d.cards;
      if (cards.length === 0) continue;
      const offer: BuildOffer = {
        heroId: u.id,
        team,
        at: 0,
        grade: d.grade,
        cards,
        rerolls: 0,
        paid: 0,
        free: 0,
        decided: null,
      };
      b.offers.push(offer);
      emitOffer(ctx, offer);
      const chosen = wanted ? cards.findIndex((x) => x.id === wanted) : -1;
      if (chosen >= 0) takeCard(ctx, u, offer, chosen, false);
      else {
        const i = aiChoice(ctx.c, ctx.t, subj, cards, 0);
        if (i !== null) takeCard(ctx, u, offer, i, true);
      }
    }
  }
}

/**
 * The Act break: last Act's tallies are kept, and both sides draw their offers (White first). A
 * side's obelisk rewards become free rerolls on each of its offers.
 */
export function openBuilds(ctx: Ctx): void {
  const b = ctx.s.builds;
  ctx.actLog.push({
    act: ctx.s.phase.n,
    techniques: Object.fromEntries(Object.entries(b.act).map(([k, v]) => [k, { ...v }])),
  });
  b.lastAct = b.act;
  b.act = {};
  b.lastPieces = b.pieces;
  b.pieces = {};
  b.open = true;
  b.touched = [];
  b.offers = [];
  const at = ctx.s.phase.n;
  for (const team of PLAY_TEAMS) {
    const free = b.freeRerolls[team];
    b.freeRerolls[team] = 0;
    for (const u of piecesInSlotOrder(ctx, team)) {
      let grade: Grade | undefined;
      const rank8 = u.hero!.rank >= 8 && !b.brilliantUsed.includes(u.id);
      if (rank8) grade = 'brilliant';
      const d = drawOffer(ctx.c, ctx.t, subjectOf(ctx, u), at, 0, grade);
      if (d.cards.length === 0) continue;
      if (rank8) b.brilliantUsed.push(u.id);
      const offer: BuildOffer = {
        heroId: u.id,
        team,
        at,
        grade: d.grade,
        cards: d.cards,
        rerolls: 0,
        paid: 0,
        free,
        decided: null,
      };
      b.offers.push(offer);
      emitOffer(ctx, offer);
    }
  }
}

/** The next Act starts: offers close. */
export function closeBuilds(ctx: Ctx): void {
  const b = ctx.s.builds;
  b.open = false;
  b.touched = [];
}

function damageLastAct(ctx: Ctx, heroId: number): number {
  return ctx.s.builds.lastPieces[String(heroId)]?.damage ?? 0;
}

function effectOf(row: TechTally | undefined): number {
  return row ? row.damage + row.heal + row.shield : 0;
}

/** The AI's gold after the pick: upgrade the held Technique that did the most last Act, while gold allows. */
function aiUpgrades(ctx: Ctx, u: Unit): void {
  const h = u.hero!;
  const b = ctx.s.builds;
  for (let guard = 0; guard < 12; guard++) {
    let best: HeldTechnique | null = null;
    let bestEffect = -1;
    for (const x of h.techniques) {
      const cost = upgradeCost(ctx.t, x.grade);
      if (cost === null || cost > h.gold) continue;
      const e = effectOf(b.lastAct[`${u.id}:${x.id}`]);
      if (e > bestEffect) {
        bestEffect = e;
        best = x;
      }
    }
    if (!best) return;
    upgrade(ctx, u, best.id);
  }
}

/** One piece's AI turn at a break: maybe reroll, then pick (or pass), then spend on upgrades. */
function aiPieceTurn(ctx: Ctx, u: Unit, allowReroll: boolean, spend: boolean): void {
  const offer = offerOf(ctx, u.id);
  const a = ctx.t.builds.ai;
  if (offer && offer.decided === null) {
    const h = u.hero!;
    // a free reroll (an obelisk's) needs no gold; a paid one keeps enough for an upgrade after it
    while (allowReroll && (offer.free > 0 || offer.paid < a.maxRerolls)) {
      const subj = subjectOf(ctx, u);
      const best = Math.max(...offer.cards.map((x) => scoreCard(ctx.c, ctx.t, subj, x, offer.at)));
      if (best >= a.rerollBelow) break;
      if (offer.free === 0 && h.gold < rerollCost(ctx.t, offer) + ctx.t.builds.upgrade[0]) break;
      reroll(ctx, u, offer);
    }
    const subj = subjectOf(ctx, u);
    if (allowReroll && nothingFits(ctx.c, subj, offer.cards)) passCard(ctx, u, offer);
    else {
      const i = aiChoice(ctx.c, ctx.t, subj, offer.cards, offer.at);
      if (i !== null) takeCard(ctx, u, offer, i, true);
      else passCard(ctx, u, offer);
    }
  }
  if (spend) aiUpgrades(ctx, u);
}

/** A side's AI at a break: its top-damage piece first, the rest by damage then slot. */
function aiTeamBuilds(
  ctx: Ctx,
  team: PlayTeam,
  allowReroll: boolean,
  skip: readonly number[],
): void {
  const order = piecesInSlotOrder(ctx, team).sort(
    (x, y) => damageLastAct(ctx, y.id) - damageLastAct(ctx, x.id) || x.hero!.slot - y.hero!.slot,
  );
  for (const u of order) aiPieceTurn(ctx, u, allowReroll, !skip.includes(u.id));
}

/** Headless and Black: the AI's full turn for a side (rerolls, passes, picks and upgrades). */
export function aiBuilds(ctx: Ctx, team: PlayTeam): void {
  if (!ctx.s.builds.open) return;
  aiTeamBuilds(ctx, team, true, []);
}

/**
 * Resume from the sheet: White's undecided pieces take the card the AI suggests (no reroll, so it
 * is the card the sheet showed), and the pieces the player never touched spend on upgrades.
 */
export function resumeBuilds(ctx: Ctx): void {
  const b = ctx.s.builds;
  if (!b.open) return;
  aiTeamBuilds(ctx, 'A', false, b.touched);
}

// ---- White's commands (Act break only) ----

function whiteOffer(
  ctx: Ctx,
  heroId: number,
  needOffer: boolean,
): { u: Unit; offer: BuildOffer | undefined } | string {
  const b = ctx.s.builds;
  if (!b.open || ctx.s.bell.stage !== 'break') return 'builds open only at the Act break';
  const u = ctx.unit(heroId);
  if (!u?.hero || u.team !== 'A') return 'not one of your pieces';
  const offer = offerOf(ctx, heroId);
  if (needOffer && (!offer || offer.decided !== null)) return 'no open offer for that piece';
  return { u, offer };
}

function touch(ctx: Ctx, heroId: number): void {
  const b = ctx.s.builds;
  if (!b.touched.includes(heroId)) b.touched.push(heroId);
}

export function takeTechnique(ctx: Ctx, heroId: number, cardIndex: number): CommandResult {
  const r = whiteOffer(ctx, heroId, true);
  if (typeof r === 'string') return { ok: false, reason: r };
  if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= r.offer!.cards.length)
    return { ok: false, reason: 'no such card' };
  takeCard(ctx, r.u, r.offer!, cardIndex, false);
  touch(ctx, heroId);
  return { ok: true };
}

export function passOffer(ctx: Ctx, heroId: number): CommandResult {
  const r = whiteOffer(ctx, heroId, true);
  if (typeof r === 'string') return { ok: false, reason: r };
  passCard(ctx, r.u, r.offer!);
  touch(ctx, heroId);
  return { ok: true };
}

export function rerollOffer(ctx: Ctx, heroId: number): CommandResult {
  const r = whiteOffer(ctx, heroId, true);
  if (typeof r === 'string') return { ok: false, reason: r };
  if (r.u.hero!.gold < rerollCost(ctx.t, r.offer!)) return { ok: false, reason: 'not enough gold' };
  reroll(ctx, r.u, r.offer!);
  touch(ctx, heroId);
  return { ok: true };
}

export function upgradeTechnique(ctx: Ctx, heroId: number, techniqueId: string): CommandResult {
  const r = whiteOffer(ctx, heroId, false);
  if (typeof r === 'string') return { ok: false, reason: r };
  const held = r.u.hero!.techniques.find((x) => x.id === techniqueId);
  if (!held) return { ok: false, reason: 'the piece does not hold that Technique' };
  const cost = upgradeCost(ctx.t, held.grade);
  if (cost === null) return { ok: false, reason: 'already Brilliant' };
  if (r.u.hero!.gold < cost) return { ok: false, reason: 'not enough gold' };
  upgrade(ctx, r.u, techniqueId);
  touch(ctx, heroId);
  return { ok: true };
}

/** "Let the AI choose" (one piece) / "AI picks for all" (null): takes the card the AI suggests. */
export function autoBuild(ctx: Ctx, heroId: number | null): CommandResult {
  const b = ctx.s.builds;
  if (!b.open || ctx.s.bell.stage !== 'break')
    return { ok: false, reason: 'builds open only at the Act break' };
  const ids = heroId === null ? piecesInSlotOrder(ctx, 'A').map((u) => u.id) : [heroId];
  let done = 0;
  for (const id of ids) {
    const r = whiteOffer(ctx, id, true);
    if (typeof r === 'string') {
      if (heroId !== null) return { ok: false, reason: r };
      continue;
    }
    const i = aiChoice(ctx.c, ctx.t, subjectOf(ctx, r.u), r.offer!.cards, r.offer!.at);
    if (i === null) continue;
    takeCard(ctx, r.u, r.offer!, i, true);
    done++;
  }
  return done > 0 || heroId === null ? { ok: true } : { ok: false, reason: 'nothing to pick' };
}

// ---- read-only views ----

function slotName(c: Content, piece: PieceId, style: string | null, slot: TechniqueSlot): string {
  const idx = SLOT_NAMES[slot];
  if (typeof idx === 'string') return idx;
  const kit = style ? c.kitByKey.get(`${piece}/${style}`) : c.pieceById.get(piece)!.abilities;
  return kit?.[idx]?.name ?? 'Signature';
}
const SLOT_NAMES: Record<TechniqueSlot, string | number> = {
  attack: 'Attack',
  skill1: 0,
  skill2: 1,
  skill3: 2,
  signature: 3,
  trait: 'Trait',
};

function cardView(
  c: Content,
  t: Tuning,
  subj: BuildSubject,
  card: OfferCard,
  suggested: boolean,
  score: number,
  preview: BuildCardView['preview'],
): BuildCardView {
  const d = def(c, card.id)!;
  const text = techniqueText(d, gradeMult(t, card.grade));
  const old = replacedBy(c, subj.held, card.id);
  const have = new Set(subj.held.map((h) => h.id));
  return {
    id: d.id,
    name: d.name,
    school: d.school,
    grade: card.grade,
    slot: d.slot,
    slotName: slotName(c, subj.piece, subj.style, d.slot),
    replaces: old ? (def(c, old.id)?.name ?? old.id) : null,
    playsLike: d.playsLike,
    desc: text.desc,
    price: text.price,
    combination: d.pool === 'combination',
    leadsTo: combinationsOf(c, d.id)
      .filter((k) => !k.piece || k.piece === subj.piece)
      .map((k) => {
        const partner = k.parents!.find((p) => p !== d.id)!;
        return {
          id: k.id,
          name: k.name,
          partner,
          partnerName: def(c, partner)?.name ?? partner,
          partnerHeld: have.has(partner),
        };
      }),
    suggested,
    score,
    preview,
  };
}

const zeroTally = (): TechTally => ({ damage: 0, heal: 0, shield: 0, procs: 0 });

/** Everything the Builds tab draws for one piece (either side); null when the id is not a piece. */
export function buildView(ctx: Ctx, heroId: number): BuildView | null {
  const b = ctx.s.builds;
  const u = ctx.unit(heroId);
  if (!u?.hero || u.team === 'neutral') return null;
  const h = u.hero;
  const subj = subjectOf(ctx, u);
  const c = ctx.c;
  const slots: BuildSlotView[] = TECHNIQUE_SLOTS.map((slot) => {
    const heldHere = subj.held.find((x) => def(c, x.id)?.slot === slot) ?? null;
    let held: BuildSlotView['held'] = null;
    if (heldHere) {
      const d = def(c, heldHere.id)!;
      const text = techniqueText(d, gradeMult(ctx.t, heldHere.grade));
      const cost = upgradeCost(ctx.t, heldHere.grade);
      const have = new Set(subj.held.map((x) => x.id));
      held = {
        id: d.id,
        name: d.name,
        school: d.school,
        grade: heldHere.grade,
        desc: text.desc,
        price: text.price,
        combination: d.pool === 'combination',
        upgradeCost: cost,
        nextGrade: cost === null ? null : GRADES[gradeIndex(heldHere.grade) + 1],
        did: {
          lastAct: { ...(b.lastAct[`${heroId}:${d.id}`] ?? zeroTally()) },
          match: { ...(b.match[`${heroId}:${d.id}`] ?? zeroTally()) },
        },
        oneAway: combinationsOf(c, d.id)
          .filter((k) => (!k.piece || k.piece === h.defId) && !have.has(k.id))
          .filter((k) => !k.parents!.every((p) => have.has(p)))
          .map((k) => k.name),
      };
    }
    return {
      slot,
      name: slotName(c, h.defId, h.style, slot),
      locked: !slotOpen(subj, slot),
      held,
    };
  });
  const o = offerOf(ctx, heroId);
  let offer: BuildView['offer'] = null;
  if (o && b.open) {
    const pick = o.decided === null ? aiChoice(c, ctx.t, subj, o.cards, o.at) : null;
    offer = {
      at: o.at,
      grade: o.grade,
      rerolls: o.rerolls,
      freeRerolls: o.free,
      rerollCost: rerollCost(ctx.t, o),
      passGold: ctx.t.builds.passGold,
      decided: o.decided,
      suggested: pick,
      cards: o.cards.map((card, i) =>
        cardView(
          c,
          ctx.t,
          subj,
          card,
          i === pick,
          scoreCard(c, ctx.t, subj, card, o.at),
          techniquePreview(ctx, heroId, card.id, card.grade),
        ),
      ),
    };
  }
  const last: PieceTally = { ...(b.lastPieces[String(heroId)] ?? freshPieceTally()) };
  return {
    heroId,
    piece: h.defId,
    team: u.team as PlayTeam,
    gold: h.gold,
    rank: h.rank,
    open: b.open,
    touched: b.touched.includes(heroId),
    slots,
    offer,
    lastAct: last,
  };
}

/** "Pick for me" at a break: the AI's pick for each of a side's open offers and the 1-2 that matter most. */
export function buildAdvice(ctx: Ctx, team: PlayTeam): BuildAdvice {
  const b = ctx.s.builds;
  if (!b.open) return { pieces: [], highlight: [] };
  const units = piecesInSlotOrder(ctx, team);
  let carry: number | null = null;
  let most = 0;
  for (const u of units) {
    const d = damageLastAct(ctx, u.id);
    if (d > most) {
      most = d;
      carry = u.id;
    }
  }
  const inputs: AdviceInput[] = [];
  for (const u of units) {
    const o = offerOf(ctx, u.id);
    if (!o || o.decided !== null || o.cards.length === 0) continue;
    inputs.push({
      key: u.id,
      subj: subjectOf(ctx, u),
      cards: o.cards,
      grade: o.grade,
      at: o.at,
      carry: carry === u.id,
    });
  }
  return advise(ctx.c, ctx.t, inputs);
}

/**
 * Setup's First moves (before the match starts, so there are no units yet): each White piece's
 * offer, the AI's pick, and which 1-2 picks matter most. Equal to what the match deals at start.
 */
export function firstMoves(
  c: Content,
  t: Tuning,
  seed: number,
  pieces: readonly PieceId[],
  heirlooms: Partial<Record<PieceId, string>> = {},
): FirstMoveView {
  const rows = pieces.map((piece, i) => {
    // a run's heirloom is held first (Plain grade), so the first move is drawn for another slot
    const heirloom = heirlooms[piece];
    const subj: BuildSubject = {
      seed,
      team: 'A',
      piece,
      style: null,
      rank: 1,
      held: heirloom && isFirstMove(c, piece, heirloom) ? [{ id: heirloom, grade: 'plain' }] : [],
      behind: false,
    };
    const d = drawOffer(c, t, subj, 0, 0);
    return { i, piece, subj, d };
  });
  const advice = advise(
    c,
    t,
    rows.map((r) => ({
      key: r.i,
      subj: r.subj,
      cards: r.d.cards,
      grade: r.d.grade,
      at: 0,
      carry: false,
    })),
  );
  return {
    pieces: rows.map((r) => {
      const a = advice.pieces.find((p) => p.heroId === r.i)!;
      return {
        piece: r.piece,
        grade: r.d.grade,
        suggested: a.pick,
        highlight: advice.highlight.includes(r.i),
        reasons: a.reasons,
        cards: r.d.cards.map((card, j) =>
          cardView(c, t, r.subj, card, j === a.pick, a.scores[j], null),
        ),
      };
    }),
  };
}
