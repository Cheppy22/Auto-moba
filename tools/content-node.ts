import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent, type Content, type RawContentFiles } from '../src/sim';

const root =
  process.env.CONTENT_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'content');

const readJson = (p: string): unknown => JSON.parse(readFileSync(p, 'utf8'));
const readDir = (dir: string): unknown[] =>
  readdirSync(join(root, dir))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => readJson(join(root, dir, f)));

function deepMerge(base: unknown, patch: unknown): unknown {
  if (typeof base !== 'object' || base === null || typeof patch !== 'object' || patch === null)
    return patch;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>))
    out[k] = deepMerge(out[k], v);
  return out;
}

// BALANCE_TUNING deep-merges a JSON patch into tuning.json; BALANCE_PATCH shallow-merges a patch per
// piece id (e.g. {"knight":{"stats":{...}}}); BALANCE_SCALE scales a piece's health, Blade damage and
// Soul power (e.g. {"queen":0.95}).
function applyScale(raw: RawContentFiles): RawContentFiles {
  if (process.env.BALANCE_TUNING)
    raw.tuning = deepMerge(raw.tuning, JSON.parse(process.env.BALANCE_TUNING));
  const patch = process.env.BALANCE_PATCH;
  if (patch) {
    const patches = JSON.parse(patch) as Record<string, Record<string, unknown>>;
    raw.pieces = raw.pieces.map((p) => {
      const piece = p as { id: string };
      return patches[piece.id] ? deepMerge(piece, patches[piece.id]) : p;
    });
  }
  const spec = process.env.BALANCE_SCALE;
  if (!spec) return raw;
  const scale = JSON.parse(spec) as Record<string, number>;
  raw.pieces = raw.pieces.map((p) => {
    const piece = p as { id: string; stats: Record<string, number> };
    const k = scale[piece.id];
    if (!k) return p;
    return {
      ...piece,
      stats: {
        ...piece.stats,
        maxHp: piece.stats.maxHp * k,
        bladeDmg: piece.stats.bladeDmg * k,
        soulPower: piece.stats.soulPower * k,
      },
    };
  });
  return raw;
}

export function readRawContent(): RawContentFiles {
  return applyScale({
    pieces: readDir('pieces'),
    gambits: readJson(join(root, 'gambits.json')),
    items: readDir('items'),
    events: readDir('events'),
    biomes: readDir('biomes'),
    pressure: readJson(join(root, 'pressure.json')),
    badges: readJson(join(root, 'badges.json')),
    map: readJson(join(root, 'map.json')),
    tuning: readJson(join(root, 'tuning.json')),
  });
}

export function loadNodeContent(): Content {
  return loadContent(readRawContent());
}
