import { laneResult } from './ai/replan';
import { allCallouts, type Callout } from './callouts';
import { RELIC_FAMILIES } from './content/schema';
import type { RelicDef, RelicFamily } from './content/schema';
import { pick, rand, shuffle } from './core/rng';
import type { Ctx } from './ctx';
import { dropBoundCards } from './gambits';
import { LANES } from './world/map';
import type {
  ActReport,
  CommandResult,
  HeldRelic,
  LaneId,
  PlayTeam,
  RelicAim,
  RelicMode,
  RelicOffer,
} from './types';
import { other } from './types';

const TEAMS: PlayTeam[] = ['A', 'B'];
const NO_AIM: RelicAim = { lane: null, piece: null, card: null };

/** The relic family each coach finding is answered with (docs/RELICS.md, "Tailored slot"). */
function familyOf(c: Callout): RelicFamily | null {
  const id = c.id;
  if (id === 'throne-lost' || id === 'bastion-lost' || id === 'clean' || id === 'bastion-taken')
    return 'siege';
  if (
    id.startsWith('died-') ||
    id.startsWith('fell-') ||
    id === 'low-damage' ||
    id === 'carry-damage' ||
    id === 'damage-behind'
  )
    return 'carry';
  if (id.startsWith('pawnlings-') || id.startsWith('fights-lost-')) return 'lane';
  if (id === 'tempo-behind') return 'pawns';
  if (id === 'tempo-idle') return 'orders';
  return null;
}

const standing = (ctx: Ctx, team: PlayTeam): number =>
  LANES.reduce((n, lane) => n + ctx.towers[team][lane].filter((t) => t?.alive).length, 0);

/** Behind: a fallen Throne, fewer Bastions standing, or 40+ less Tempo earned in the Act. */
function computeBehind(ctx: Ctx, report: ActReport): Record<PlayTeam, boolean> {
  const out = { A: false, B: false };
  for (const team of TEAMS) {
    const foe = other(team);
    out[team] =
      ctx.s.throneDown[team] ||
      standing(ctx, team) < standing(ctx, foe) ||
      report.teams[foe].tempo - report.teams[team].tempo >= ctx.t.relics.behindTempo;
  }
  return out;
}

function sortedLanes(report: ActReport, team: PlayTeam): LaneId[] {
  return [...LANES].sort((a, b) => laneResult(report, team, b) - laneResult(report, team, a));
}

const bestLane = (report: ActReport, team: PlayTeam): LaneId => sortedLanes(report, team)[0];
const worstLane = (report: ActReport, team: PlayTeam): LaneId =>
  sortedLanes(report, team)[LANES.length - 1];

/** The piece that dealt the most damage this Act (ties by lower id). */
function carryPiece(report: ActReport, team: PlayTeam): number {
  return [...report.teams[team].pieces].sort((a, b) => b.damage - a.damage || a.id - b.id)[0].id;
}

/** The piece that fell most this Act (ties by lower damage). */
function beatenPiece(report: ActReport, team: PlayTeam): number {
  return [...report.teams[team].pieces].sort(
    (a, b) => b.deaths - a.deaths || a.damage - b.damage || a.id - b.id,
  )[0].id;
}

/** Tags the AI matches relics against: its Opening's schools, its styles, how it spent Tempo. */
function sideTags(ctx: Ctx, team: PlayTeam, report: ActReport): Set<string> {
  const tags = new Set<string>(['opening']);
  for (const school of ctx.c.openingById.get(ctx.s.opening[team])?.schools ?? []) tags.add(school);
  for (const id of ctx.s.teams[team].heroIds) {
    const style = ctx.unit(id)?.hero?.style;
    if (style) tags.add(style);
  }
  const t = report.teams[team];
  if (t.pawns > t.gambits) tags.add('pawn-heavy');
  else if (t.gambits > 0) tags.add('gambit-heavy');
  return tags;
}

interface Hint {
  callout: Callout;
  family: RelicFamily;
  lane: LaneId | null;
  piece: number | null;
}

/** What went wrong (or right) in the Act: the worst finding that the draft can answer. */
function tailoredHint(ctx: Ctx, team: PlayTeam, report: ActReport): Hint | null {
  const list = allCallouts(report, team);
  const c =
    list.find((x) => x.tone !== 'good' && familyOf(x) !== null) ??
    list.find((x) => x.id === 'clean' || x.id === 'bastion-taken');
  if (!c) return null;
  const family = familyOf(c);
  if (!family) return null;
  const topDamage = c.id === 'low-damage' || c.id === 'carry-damage' || c.id === 'damage-behind';
  const pieceId = topDamage
    ? carryPiece(report, team)
    : c.piece
      ? (report.teams[team].pieces.find((p) => p.piece === c.piece)?.id ?? null)
      : null;
  return { callout: c, family, lane: c.lane ?? null, piece: pieceId };
}

function chooseCard(ctx: Ctx, team: PlayTeam, def: RelicDef): string {
  const favoured = ctx.c.openingById.get(ctx.s.opening[team])?.schools ?? [];
  let best = def.cards[0];
  let bestScore = -Infinity;
  for (const id of def.cards) {
    const school = ctx.c.gambitById.get(id)?.school;
    const score = (school && favoured.includes(school) ? 1 : 0) + (school === 'fortress' ? 0 : 0.5);
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

/**
 * Where a relic goes by the AI's rule: offence at the lane that went best, defence at the one
 * that went worst; the carry or the most beaten piece. A coach hint (the problem the tailored
 * offer answers) wins over the rule.
 */
function aimFor(
  ctx: Ctx,
  team: PlayTeam,
  def: RelicDef,
  report: ActReport,
  hint: Pick<Hint, 'lane' | 'piece'> | null = null,
  keepCard: string | null = null,
): RelicAim {
  switch (def.bind) {
    case 'none':
      return NO_AIM;
    case 'lane':
      return {
        ...NO_AIM,
        lane:
          hint?.lane ?? (def.aim === 'defense' ? worstLane(report, team) : bestLane(report, team)),
      };
    case 'piece':
      return {
        ...NO_AIM,
        piece:
          hint?.piece ??
          (def.aim === 'protect' ? beatenPiece(report, team) : carryPiece(report, team)),
      };
    case 'laneCard': {
      const card = keepCard ?? chooseCard(ctx, team, def);
      const defensive = ctx.c.gambitById.get(card)?.school === 'fortress';
      return {
        ...NO_AIM,
        card,
        lane: hint?.lane ?? (defensive ? worstLane(report, team) : bestLane(report, team)),
      };
    }
  }
}

const hintSeverity = (hint: Hint | null): number =>
  hint && hint.callout.tone === 'bad' ? hint.callout.severity : 0;

interface Drawn {
  offers: RelicOffer[];
  /** Severity of the worst bad finding the tailored offer answers (0 when it is not tailored). */
  severity: number;
}

/**
 * Three relics: slot 1 answers the Act's worst finding (a Rally relic when the side is behind),
 * slots 2 and 3 are random from two other families. A relic already held is never offered.
 */
function drawOffers(ctx: Ctx, team: PlayTeam, report: ActReport): Drawn {
  const held = new Set(ctx.s.relics.held[team].map((h) => h.id));
  const pool = ctx.c.relics.filter((r) => !held.has(r.id));
  const families = RELIC_FAMILIES.filter((f) => pool.some((r) => r.family === f));
  if (families.length === 0) return { offers: [], severity: 0 };
  const order = shuffle(ctx.s.rng, 'relic', families);
  const behind = ctx.s.relics.behind[team];
  const hint = tailoredHint(ctx, team, report);
  const rally = pool.filter((r) => r.rally);
  const inFamily = hint ? pool.filter((r) => r.family === hint.family) : [];
  const rallyHere = rally.filter((r) => r.family === hint?.family);
  const cands = behind && rally.length > 0 ? (rallyHere.length > 0 ? rallyHere : rally) : inFamily;
  const chosen: { def: RelicDef; tailored: boolean; why: string | null }[] = [];
  if (cands.length > 0) {
    const def = pick(ctx.s.rng, 'relic', cands);
    const trailing = 'You are behind: a Rally relic works while you trail.';
    const why = !hint
      ? trailing
      : def.family === hint.family
        ? hint.callout.text
        : `${hint.callout.text} ${trailing}`;
    chosen.push({ def, tailored: true, why });
  }
  for (const family of order) {
    if (chosen.length >= ctx.t.relics.offers) break;
    if (chosen.some((c) => c.def.family === family)) continue;
    chosen.push({
      def: pick(
        ctx.s.rng,
        'relic',
        pool.filter((r) => r.family === family),
      ),
      tailored: false,
      why: null,
    });
  }
  const offers = chosen.map((c) => ({
    id: c.def.id,
    tailored: c.tailored,
    why: c.why,
    aim: aimFor(ctx, team, c.def, report, c.tailored ? hint : null),
  }));
  return { offers, severity: chosen[0]?.tailored ? hintSeverity(hint) : 0 };
}

/** Pieces and lanes a relic may be aimed at; returns the aim or why it is refused. */
function checkAim(
  ctx: Ctx,
  team: PlayTeam,
  def: RelicDef,
  want: Partial<RelicAim>,
  base: RelicAim,
): RelicAim | string {
  const aim: RelicAim = { ...NO_AIM };
  if (def.bind === 'lane' || def.bind === 'laneCard') {
    const lane = want.lane ?? base.lane;
    if (!lane || !LANES.includes(lane)) return 'aim it at a lane';
    aim.lane = lane;
  }
  if (def.bind === 'piece') {
    const piece = want.piece ?? base.piece;
    if (piece === null || piece === undefined || !ctx.s.teams[team].heroIds.includes(piece))
      return 'aim it at one of your pieces';
    aim.piece = piece;
  }
  if (def.bind === 'laneCard') {
    const card = want.card ?? base.card;
    if (!card || !def.cards.includes(card)) return 'pick a lane card';
    aim.card = card;
  }
  return aim;
}

function take(
  ctx: Ctx,
  team: PlayTeam,
  def: RelicDef,
  aim: RelicAim,
  replace: string | null,
  auto: boolean,
): void {
  const r = ctx.s.relics;
  if (replace) r.held[team] = r.held[team].filter((h) => h.id !== replace);
  r.held[team].push({ id: def.id, ...aim });
  r.offers[team] = [];
  r.settled[team] = true;
  r.latest[team] = def.id;
  dropBoundCards(ctx, team);
  ctx.emit('relicTaken', { team, relic: def.id, ...aim, replaced: replace, auto });
}

function decline(ctx: Ctx, team: PlayTeam): void {
  ctx.s.relics.offers[team] = [];
  ctx.s.relics.settled[team] = true;
  ctx.emit('relicDeclined', { team });
}

function tagScore(ctx: Ctx, def: RelicDef, tags: Set<string>): number {
  const ai = ctx.t.relics.ai;
  let score = ai.base;
  for (const t of def.tags) if (tags.has(t)) score += ai.tag;
  return score;
}

/** The weakest relic held by the AI's reckoning (the one a better offer replaces). */
function weakest(ctx: Ctx, team: PlayTeam, tags: Set<string>): { held: HeldRelic; score: number } {
  let best: { held: HeldRelic; score: number } | null = null;
  for (const held of ctx.s.relics.held[team]) {
    const def = ctx.c.relicById.get(held.id);
    const score = def ? tagScore(ctx, def, tags) : 0;
    if (!best || score < best.score) best = { held, score };
  }
  return best!;
}

/** Scores each offer (base, the tailored bonus, matching tags, seeded jitter), takes the best. */
function aiPick(
  ctx: Ctx,
  team: PlayTeam,
  report: ActReport,
  severity: number,
  auto: boolean,
): void {
  const r = ctx.s.relics;
  const ai = ctx.t.relics.ai;
  const tags = sideTags(ctx, team, report);
  let best: { offer: RelicOffer; def: RelicDef; score: number } | null = null;
  for (const offer of r.offers[team]) {
    const def = ctx.c.relicById.get(offer.id);
    if (!def) continue;
    const bonus = offer.tailored && severity >= ai.tailoredSeverity ? ai.tailored : 0;
    const score = tagScore(ctx, def, tags) + bonus + ai.jitter * rand(ctx.s.rng, 'relic');
    if (!best || score > best.score) best = { offer, def, score };
  }
  if (!best) return decline(ctx, team);
  const full = r.held[team].length >= ctx.t.relics.max;
  if (full) {
    const weak = weakest(ctx, team, tags);
    if (best.score <= weak.score) return decline(ctx, team);
    take(ctx, team, best.def, best.offer.aim, weak.held.id, auto);
    return;
  }
  take(ctx, team, best.def, best.offer.aim, null, auto);
}

function randomPick(ctx: Ctx, team: PlayTeam): void {
  const r = ctx.s.relics;
  const offer = pick(ctx.s.rng, 'relic', r.offers[team]);
  const def = ctx.c.relicById.get(offer.id)!;
  if (r.held[team].length < ctx.t.relics.max) return take(ctx, team, def, offer.aim, null, false);
  if (rand(ctx.s.rng, 'relic') < 0.5) return decline(ctx, team);
  take(ctx, team, def, offer.aim, pick(ctx.s.rng, 'relic', r.held[team]).id, false);
}

/** The AI re-aims its lane relics at the lane the Act's report favours (a held relic's piece stays). */
function reaim(ctx: Ctx, team: PlayTeam, report: ActReport): void {
  for (const held of ctx.s.relics.held[team]) {
    const def = ctx.c.relicById.get(held.id);
    if (!def || (def.bind !== 'lane' && def.bind !== 'laneCard')) continue;
    const aim = aimFor(ctx, team, def, report, null, held.card);
    held.lane = aim.lane;
    ctx.emit('relicAimed', { team, relic: held.id, ...aim });
  }
}

/**
 * Run at the start of an Act break (after the AI lane re-plans): works out who is behind, draws
 * both sides' offers (White first), and lets every side that is not the player take its pick.
 */
export function resolveDraft(ctx: Ctx, report: ActReport): void {
  const r = ctx.s.relics;
  r.behind = computeBehind(ctx, report);
  const drawn: Record<PlayTeam, Drawn> = {
    A: { offers: [], severity: 0 },
    B: { offers: [], severity: 0 },
  };
  for (const team of TEAMS) {
    r.latest[team] = null;
    if (r.mode[team] !== 'manual') reaim(ctx, team, report);
    drawn[team] = drawOffers(ctx, team, report);
    r.offers[team] = drawn[team].offers;
    r.settled[team] = drawn[team].offers.length === 0;
    ctx.emit('relicOffered', { team, ids: drawn[team].offers.map((o) => o.id) });
  }
  for (const team of TEAMS) {
    if (r.settled[team]) continue;
    const mode: RelicMode = r.mode[team];
    if (mode === 'manual') continue;
    if (mode === 'ai') aiPick(ctx, team, report, drawn[team].severity, false);
    else if (mode === 'random') randomPick(ctx, team);
    else decline(ctx, team);
  }
}

/** The draft is closed when the Act resumes. */
export function closeDraft(ctx: Ctx): void {
  for (const team of TEAMS) {
    ctx.s.relics.offers[team] = [];
    ctx.s.relics.settled[team] = true;
  }
}

/** The resume button waits for this: White has an open draft and has not answered it. */
export const draftOpen = (ctx: Ctx): boolean =>
  !ctx.s.relics.settled.A && ctx.s.relics.offers.A.length > 0;

function atBreak(ctx: Ctx): string | null {
  return ctx.s.phase.kind === 'live' && ctx.s.bell.stage === 'break'
    ? null
    : 'relics are taken at the Act break';
}

export function pickRelic(
  ctx: Ctx,
  relicId: string,
  want: Partial<RelicAim>,
  replace: string | undefined,
): CommandResult {
  const early = atBreak(ctx);
  if (early) return { ok: false, reason: early };
  const r = ctx.s.relics;
  if (!draftOpen(ctx)) return { ok: false, reason: 'no relic draft is open' };
  const offer = r.offers.A.find((o) => o.id === relicId);
  const def = ctx.c.relicById.get(relicId);
  if (!offer || !def) return { ok: false, reason: 'not one of the offered relics' };
  if (r.held.A.length >= ctx.t.relics.max) {
    if (!replace || !r.held.A.some((h) => h.id === replace))
      return { ok: false, reason: 'you hold three relics: replace one, or decline' };
  } else if (replace) return { ok: false, reason: 'you have a free slot: nothing to replace' };
  const aim = checkAim(ctx, 'A', def, want, offer.aim);
  if (typeof aim === 'string') return { ok: false, reason: aim };
  take(ctx, 'A', def, aim, replace ?? null, false);
  return { ok: true };
}

export function declineRelic(ctx: Ctx): CommandResult {
  const early = atBreak(ctx);
  if (early) return { ok: false, reason: early };
  if (!draftOpen(ctx)) return { ok: false, reason: 'no relic draft is open' };
  if (ctx.s.relics.held.A.length < ctx.t.relics.max)
    return { ok: false, reason: 'you have a free slot: take a relic' };
  decline(ctx, 'A');
  return { ok: true };
}

/** "Let the AI choose" for White: the AI rule picks one of the offers, aims it, and may replace. */
export function autoRelic(ctx: Ctx): CommandResult {
  const early = atBreak(ctx);
  const report = ctx.s.bell.report;
  if (early) return { ok: false, reason: early };
  if (!draftOpen(ctx) || !report) return { ok: false, reason: 'no relic draft is open' };
  const tailored = ctx.s.relics.offers.A.some((o) => o.tailored);
  aiPick(ctx, 'A', report, tailored ? hintSeverity(tailoredHint(ctx, 'A', report)) : 0, true);
  return { ok: true };
}

/** Re-aims a held relic for free (at a break only). */
export function aimRelic(ctx: Ctx, relicId: string, want: Partial<RelicAim>): CommandResult {
  const early = atBreak(ctx);
  if (early) return { ok: false, reason: early };
  const held = ctx.s.relics.held.A.find((h) => h.id === relicId);
  const def = ctx.c.relicById.get(relicId);
  if (!held || !def) return { ok: false, reason: 'you do not hold that relic' };
  if (def.bind === 'none') return { ok: false, reason: 'that relic has nothing to aim' };
  const aim = checkAim(ctx, 'A', def, want, held);
  if (typeof aim === 'string') return { ok: false, reason: aim };
  held.lane = aim.lane;
  held.piece = aim.piece;
  held.card = aim.card;
  dropBoundCards(ctx, 'A');
  ctx.emit('relicAimed', { team: 'A', relic: relicId, ...aim });
  return { ok: true };
}
