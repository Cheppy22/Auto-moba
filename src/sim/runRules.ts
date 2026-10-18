// The in-match half of a Tournament run (spec 1B, "Sim changes"): what a side brings into a match
// (`MatchConfig.start`), the run's relic cap, White's carried archetypes (`lockStyles`) and
// adjudication. Without those config fields `MatchState.run` is absent and nothing here acts, so an
// Exhibition match plays exactly as before.
import type { Content } from './content/loader';
import { relicEffect } from './content/loader';
import type { LaneId, PieceId, RelicDef } from './content/schema';
import { PIECE_IDS, SEALED_TRIGGERS } from './content/schema';
import type { Ctx } from './ctx';
import { checkAim, fitFormation, laneCardFor, NO_AIM, sealableUnder } from './draft';
import { PLAY_TEAMS } from './names';
import { param, tempoCap } from './relics';
import { recompute } from './stats';
import { isFirstMove, withTechnique } from './techniques';
import { LANES } from './world/map';
import type {
  CarriedRelic,
  MatchConfig,
  PlayTeam,
  RelicAim,
  RunRules,
  TeamSetup,
  TeamStart,
  Unit,
} from './types';
import { other } from './types';

/** A carried relic's aim, without its id. */
export type CarriedAim = Omit<CarriedRelic, 'id'>;

/** The run rules a config asks for, or undefined for an ordinary match (state stays as before). */
export function runRulesFor(config: MatchConfig, c: Content): RunRules | undefined {
  if (
    config.start === undefined &&
    config.lockStyles === undefined &&
    config.adjudicate === undefined &&
    config.relicMax === undefined &&
    config.relicMaxB === undefined &&
    config.aiPawnShareB === undefined
  )
    return undefined;
  const books = (t: TeamStart | undefined): string[] =>
    [...new Set(t?.books ?? [])].filter((id) => c.gambitById.has(id));
  const max = config.relicMax ?? c.tuning.relics.max;
  return {
    relicMax: max,
    relicMaxB: config.relicMaxB ?? max,
    ...(config.aiPawnShareB !== undefined ? { aiPawnShareB: config.aiPawnShareB } : {}),
    ...(config.start?.B?.signature ? { signatureB: config.start.B.signature } : {}),
    books: { A: books(config.start?.A), B: books(config.start?.B) },
    locked: { ...(config.lockStyles?.A ?? {}) },
    adjudicate: config.adjudicate ?? false,
  };
}

/** Relics a side may hold in this match. */
export const relicMax = (ctx: Ctx, team: PlayTeam): number =>
  (team === 'B' ? ctx.s.run?.relicMaxB : ctx.s.run?.relicMax) ?? ctx.t.relics.max;

/** A side's book moves (cards drawn twice as often); empty outside a run. */
export const booksOf = (ctx: Ctx, team: PlayTeam): readonly string[] =>
  ctx.s.run?.books[team] ?? [];

/**
 * Where a relic goes when nothing better is known (a reward relic, an opponent's starting relic,
 * a carried aim that no longer fits): offence at the Queen (or her lane), defence and protection
 * at the King (or his lane); a lane card from the Opening's schools; a sealed card from the
 * Opening's schools on the first trigger that has one; pawns spread evenly with the relic's reserve.
 */
export function defaultAim(c: Content, court: TeamSetup, def: RelicDef): CarriedAim {
  const laneOf = (p: PieceId): LaneId => court.pieces.find((e) => e.piece === p)?.lane ?? 'mid';
  const none: CarriedAim = { ...NO_AIM, piece: null };
  switch (def.bind) {
    case 'none':
      return none;
    case 'lane':
      return { ...none, lane: laneOf(def.aim === 'defense' ? 'king' : 'queen') };
    case 'piece':
      return { ...none, piece: def.aim === 'protect' || def.aim === 'defense' ? 'king' : 'queen' };
    case 'laneCard': {
      const card = laneCardFor(c, court.opening, def);
      const defensive = c.gambitById.get(card)?.school === 'fortress';
      return { ...none, card, lane: laneOf(defensive ? 'king' : 'queen') };
    }
    case 'sealed': {
      for (const trigger of SEALED_TRIGGERS) {
        if (trigger === 'guarded') continue;
        const card = (def.triggerCards[trigger] ?? []).find((x) =>
          sealableUnder(c, court.opening, x),
        );
        if (card) return { ...none, card, trigger };
      }
      const card = c.gambits.find((g) => sealableUnder(c, court.opening, g.id))?.id ?? null;
      return { ...none, card, trigger: card ? 'clock' : null };
    }
    case 'quota': {
      const total = Math.min(c.tuning.pawns.capBase, param({ def }, 'total', 6));
      const each = Math.floor(total / LANES.length);
      const quota = { top: each, mid: each, bot: each };
      quota.mid += total - each * LANES.length;
      return { ...none, quota, reserve: param({ def }, 'reserve', 20) };
    }
  }
}

function unitOf(ctx: Ctx, team: PlayTeam, piece: PieceId | null): Unit | undefined {
  if (piece === null) return undefined;
  for (const id of ctx.s.teams[team].heroIds) {
    const u = ctx.unit(id);
    if (u?.hero?.defId === piece) return u;
  }
  return undefined;
}

/** A carried aim as the match's aim (piece type to unit id), or why it does not fit this match. */
function liveAim(ctx: Ctx, team: PlayTeam, def: RelicDef, a: CarriedAim): RelicAim | string {
  const unit = unitOf(ctx, team, a.piece);
  if (def.bind === 'piece' && !unit) return 'unknown piece';
  return checkAim(ctx, team, def, { ...a, piece: unit ? unit.id : null }, NO_AIM);
}

function placeRelics(ctx: Ctx, team: PlayTeam, carried: CarriedRelic[]): void {
  const held = ctx.s.relics.held[team];
  for (const r of carried) {
    if (held.length >= relicMax(ctx, team)) break;
    const def = ctx.c.relicById.get(r.id);
    if (!def || held.some((h) => h.id === r.id)) continue;
    let aim = liveAim(ctx, team, def, r);
    if (typeof aim === 'string')
      aim = liveAim(ctx, team, def, defaultAim(ctx.c, ctx.s.setup[team], def));
    if (typeof aim === 'string') continue;
    held.push({ id: def.id, ...aim });
  }
  if (held.some((h) => relicEffect(ctx.c.relicById.get(h.id)!) === 'battery'))
    fitFormation(ctx, team);
}

/** Heirloom Techniques: held at Plain grade from the start (a Setup card of the piece's own). */
function giveHeirlooms(
  ctx: Ctx,
  team: PlayTeam,
  heirlooms: Partial<Record<PieceId, string>>,
): void {
  for (const piece of PIECE_IDS) {
    const id = heirlooms[piece];
    const u = unitOf(ctx, team, piece);
    if (!id || !u?.hero || !isFirstMove(ctx.c, piece, id)) continue;
    u.hero.techniques = withTechnique(ctx.c, u.hero.techniques, id, 'plain');
    recompute(ctx, u);
    u.hp = u.stats.maxHp;
  }
}

/**
 * Applies `MatchConfig.start` once both courts are placed and Tempo is set: held relics (working
 * from Act 1), heirloom Techniques, and extra starting Tempo. Book moves are read by the deck draw.
 */
export function applyStart(ctx: Ctx, start: MatchConfig['start']): void {
  if (!start || !ctx.s.run) return;
  for (const team of PLAY_TEAMS) {
    const st = start[team];
    if (!st) continue;
    if (st.relics?.length) placeRelics(ctx, team, st.relics);
    if (st.heirlooms) giveHeirlooms(ctx, team, st.heirlooms);
    if (st.tempoBonus && st.tempoBonus > 0)
      ctx.s.tempo[team] = Math.min(tempoCap(ctx, team), ctx.s.tempo[team] + st.tempoBonus);
  }
}

/** White's carried archetype for a piece (a run), when it is one of the piece's styles. */
export function lockedStyle(ctx: Ctx, u: Unit): string | null {
  if (u.team !== 'A' || !u.hero) return null;
  const style = ctx.s.run?.locked[u.hero.defId];
  if (!style) return null;
  return ctx.c.pieceById.get(u.hero.defId)?.styles.some((st) => st.id === style) ? style : null;
}

const bastionsTaken = (ctx: Ctx, team: PlayTeam): number =>
  LANES.reduce((n, lane) => n + ctx.towers[other(team)][lane].filter((t) => !t.alive).length, 0);

const throneHp = (ctx: Ctx, team: PlayTeam): number => {
  const g = ctx.guardians[team];
  return g && g.alive ? g.hp : 0;
};

/** No Checkmate: more enemy Bastions destroyed wins, then more Throne health left; a dead tie is null. */
export function adjudicate(ctx: Ctx): PlayTeam | null {
  const a = bastionsTaken(ctx, 'A');
  const b = bastionsTaken(ctx, 'B');
  if (a !== b) return a > b ? 'A' : 'B';
  const ha = throneHp(ctx, 'A');
  const hb = throneHp(ctx, 'B');
  if (ha !== hb) return ha > hb ? 'A' : 'B';
  return null;
}
