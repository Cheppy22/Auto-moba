import type { Content } from './content/loader';
import { PATHS, PIECE_IDS, type LaneId, type Path, type PieceDef } from './content/schema';
import { pick, rand, shuffle, type RngState } from './core/rng';
import type { Ctx } from './ctx';
import { makeHero } from './units';
import type { PlayTeam, SetupEntry, TeamSetup } from './types';

const LANE_COUNT: Record<LaneId, number> = { top: 2, bot: 2, mid: 1 };
const LANE_ORDER: LaneId[] = ['top', 'bot', 'mid'];

export function naturalPath(p: PieceDef): Path {
  if (p.defaultPath) return p.defaultPath;
  if (p.disposition === 'defender') return 'defense';
  if (p.disposition === 'attacker') return 'offense';
  return p.attackKind === 'ranged' ? 'utility' : 'offense';
}

/**
 * The AI's seeded setup (Black's pick, and White's pre-filled default): a random opening, mostly
 * each piece's natural build path, an attacker in Mid where possible and side lanes paired so each
 * holds different dispositions. (Styles are chosen later, at Rank 4.)
 */
export function aiSetup(c: Content, rng: RngState): TeamSetup {
  const opening = pick(rng, 'draft', c.openings).id;
  const out: SetupEntry[] = [];
  for (const id of PIECE_IDS) {
    const p = c.pieceById.get(id)!;
    const nat = naturalPath(p);
    const roll = rand(rng, 'draft');
    const others = PATHS.filter((x) => x !== nat);
    const path = roll < 0.5 ? nat : roll < 0.75 ? others[0] : others[1];
    out.push({ piece: id, path, lane: 'mid' });
  }
  const disp = (e: SetupEntry): string => c.pieceById.get(e.piece)!.disposition;
  let rest = shuffle(rng, 'draft', out);
  const mid = rest.find((e) => disp(e) === 'attacker') ?? rest[0];
  rest = rest.filter((e) => e !== mid);
  mid.lane = 'mid';
  const sides: LaneId[] = rand(rng, 'draft') < 0.5 ? ['top', 'bot'] : ['bot', 'top'];
  for (const lane of sides) {
    const first = rest.shift()!;
    first.lane = lane;
    const i = rest.findIndex((e) => disp(e) !== disp(first));
    const [second] = rest.splice(i >= 0 ? i : 0, 1);
    second.lane = lane;
  }
  return { opening, pieces: out };
}

export function validateSetup(c: Content, setup: unknown): string | null {
  const t = setup as TeamSetup | null;
  if (!t || typeof t.opening !== 'string' || !c.openingById.has(t.opening))
    return 'pick an opening';
  const entries: unknown = t.pieces;
  if (!Array.isArray(entries) || entries.length !== 5) return 'pick all five pieces';
  const seen = new Set<string>();
  const lanes: Record<string, number> = { top: 0, mid: 0, bot: 0 };
  for (const e of entries as SetupEntry[]) {
    const p = e && c.pieceById.get(e.piece);
    if (!p) return 'unknown piece';
    if (seen.has(p.id)) return `${p.name} is listed twice`;
    seen.add(p.id);
    if (!(PATHS as readonly string[]).includes(e.path)) return 'unknown build path';
    if (!(e.lane in lanes)) return 'unknown lane';
    lanes[e.lane]++;
  }
  for (const lane of LANE_ORDER)
    if (lanes[lane] !== LANE_COUNT[lane]) return 'lanes need 2 Left, 2 Right and 1 Mid';
  return null;
}

/** In a two-piece lane the farmer clears the jungle (the Knight if both farm). */
export function assignJunglers(ctx: Ctx, team: PlayTeam): void {
  const byLane: Record<LaneId, number[]> = { top: [], mid: [], bot: [] };
  for (const id of ctx.s.teams[team].heroIds) {
    const u = ctx.unit(id)!;
    u.hero!.jungler = false;
    byLane[u.hero!.lane ?? 'mid'].push(id);
  }
  for (const lane of LANE_ORDER) {
    const ids = byLane[lane];
    if (ids.length !== 2) continue;
    const farmers = ids.map((id) => ctx.unit(id)!).filter((u) => u.hero!.disposition === 'farmer');
    const j = farmers.find((u) => u.hero!.defId === 'knight') ?? farmers[0];
    if (j) j.hero!.jungler = true;
  }
}

export function placeTeam(ctx: Ctx, team: PlayTeam, entries: SetupEntry[]): void {
  const sorted = entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => LANE_ORDER.indexOf(a.e.lane) - LANE_ORDER.indexOf(b.e.lane) || a.i - b.i)
    .map((x) => x.e);
  sorted.forEach((e, slot) => makeHero(ctx, team, slot, { ...e }));
  assignJunglers(ctx, team);
}
