// The Tournament run's save on this device (spec 1B, decision 8): the run between matches, and
// one best-finish line that outlives it. A match in progress is not saved; a run saved as
// `playing` restarts that round's match from its beginning. Every read and write is wrapped:
// storage can be missing or blocked (private windows, previews), and a bad or old save is dropped
// with a warning, never a crash.
import type { BestFinish, Content, RunState } from '../../sim';

export const RUN_KEY = 'automoba.run';
export const BEST_KEY = 'automoba.best';

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
