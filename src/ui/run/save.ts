// The Tournament run's save on this device (spec 1B, decision 8): the run between matches, and
// one best-finish line that outlives it. A match in progress is saved separately (see "A match in
// progress" below): the command log and a fingerprint, so a reload can replay it back to where it
// stood; without that save a run saved as `playing` restarts the round's match from its beginning.
// Every read and write is wrapped:
// storage can be missing or blocked (private windows, previews), and a bad or old save is dropped
// with a warning, never a crash.
import type { BestFinish, Content, Replay, RunState } from '../../sim';

export const RUN_KEY = 'automoba.run';
export const BEST_KEY = 'automoba.best';
const MATCH_KEY = 'automoba.match';

/** The parts of `Storage` the save uses (tests pass a stand-in). */
export type SaveStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function store(): SaveStore | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function read(key: string, at: SaveStore | null): unknown {
  if (!at) return null;
  try {
    const text = at.getItem(key);
    return text === null ? null : (JSON.parse(text) as unknown);
  } catch (err) {
    console.warn(`Save "${key}" could not be read; it is ignored.`, err);
    return null;
  }
}

function write(key: string, value: unknown, at: SaveStore | null): void {
  if (!at) return;
  try {
    if (value === null) at.removeItem(key);
    else at.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`Save "${key}" could not be written.`, err);
  }
}

/** Whether a parsed save still fits this build: version 1 and the content it names exists. */
function validRun(c: Content, x: unknown): x is RunState {
  const r = x as RunState | null;
  if (!r || typeof r !== 'object' || r.v !== 1) return false;
  if (!Number.isFinite(r.seed) || !Number.isInteger(r.round) || r.round < 0 || r.round > 3)
    return false;
  if (!['between', 'playing', 'champion', 'out'].includes(r.status)) return false;
  if (!Array.isArray(r.opponents) || r.opponents.length !== 4) return false;
  if (!r.court || !c.openingById.has(r.court.opening) || !Array.isArray(r.court.pieces))
    return false;
  if (r.opponents.some((o) => !o?.setup || !c.openingById.has(o.setup.opening))) return false;
  if (!Array.isArray(r.relics) || r.relics.some((x) => !c.relicById.has(x?.id))) return false;
  if (!Array.isArray(r.books) || r.books.some((id) => !c.gambitById.has(id))) return false;
  if (!r.heirlooms || Object.values(r.heirlooms).some((id) => !c.itemById.has(id ?? '')))
    return false;
  return Array.isArray(r.results) && typeof r.archetypes === 'object';
}

/** The saved run, or null (none, unreadable, an old version, or content this build lacks). */
export function loadRun(c: Content, at: SaveStore | null = store()): RunState | null {
  const raw = read(RUN_KEY, at);
  if (raw === null) return null;
  if (validRun(c, raw)) return raw;
  console.warn('The saved Tournament run does not fit this version of the game; it was dropped.');
  write(RUN_KEY, null, at);
  return null;
}

/** Saves the run; an ended run (champion or out) deletes the save instead. */
export function saveRun(run: RunState | null, at: SaveStore | null = store()): void {
  const over = !run || run.status === 'champion' || run.status === 'out';
  write(RUN_KEY, over ? null : run, at);
}

export function loadBest(at: SaveStore | null = store()): BestFinish | null {
  const b = read(BEST_KEY, at) as BestFinish | null;
  if (b && b.v === 1 && Number.isInteger(b.round) && typeof b.champion === 'boolean') return b;
  if (b !== null) write(BEST_KEY, null, at);
  return null;
}

export function saveBest(best: BestFinish | null, at: SaveStore | null = store()): void {
  write(BEST_KEY, best, at);
}

// ------------------------------------------------------------ a match in progress

/**
 * A live match on this device: the sim is deterministic, so its seed, setup and command log (the
 * `Replay`) are enough to play it back to the same position. `check` is a fingerprint of that
 * position; a replay that does not reproduce it is dropped, never resumed half-right.
 */
export interface MatchSave {
  v: 1;
  replay: Replay;
  tick: number;
  /** The Act, for the Title's "Resume" line. */
  act: number;
  /** The Tournament run this match belongs to (its seed and round), or null for an Exhibition. */
  run: { seed: number; round: number } | null;
  /** The speed the match was running at (1, 2, 4 or 8). */
  speed: number;
  check: string;
}

/**
 * The match save's key. It names the folder the game is served from (`/` or `/v2/`): both games
 * live on one site and so share one `localStorage`, and a match of the other game must never be
 * read (or deleted) as this one's.
 */
export function matchKey(): string {
  try {
    return `${MATCH_KEY}:${new URL('./', document.baseURI).pathname}`;
  } catch {
    return MATCH_KEY; // no page (unit tests)
  }
}

function validMatch(c: Content, x: unknown): x is MatchSave {
  const m = x as MatchSave | null;
  if (!m || typeof m !== 'object' || m.v !== 1) return false;
  if (!Number.isInteger(m.tick) || m.tick < 1 || !Number.isInteger(m.act)) return false;
  if (typeof m.check !== 'string' || !Number.isFinite(m.speed)) return false;
  if (m.run !== null && (!Number.isFinite(m.run?.seed) || !Number.isInteger(m.run?.round)))
    return false;
  const r = m.replay;
  if (!r || r.contentHash !== c.hash || !Number.isFinite(r.config?.seed)) return false;
  return (
    Array.isArray(r.ops) &&
    r.ops.every((o) =>
      o?.op === 'step'
        ? Number.isInteger(o.ticks) && o.ticks > 0
        : o?.op === 'issue' && typeof o.cmd?.type === 'string',
    )
  );
}

/** The saved match in progress, or null (none, unreadable, or recorded against other content). */
export function loadMatch(c: Content, at: SaveStore | null = store()): MatchSave | null {
  const raw = read(matchKey(), at);
  if (raw === null) return null;
  if (validMatch(c, raw)) return raw;
  console.warn('The saved match does not fit this version of the game; it was dropped.');
  write(matchKey(), null, at);
  return null;
}

export function saveMatch(match: MatchSave | null, at: SaveStore | null = store()): void {
  write(matchKey(), match, at);
}
