import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent, type Content, type RawContentFiles } from '../src/sim';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'content');

const readJson = (p: string): unknown => JSON.parse(readFileSync(p, 'utf8'));
const readDir = (dir: string): unknown[] =>
  readdirSync(join(root, dir))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => readJson(join(root, dir, f)));

function applyScale(raw: RawContentFiles): RawContentFiles {
  const patch = process.env.BALANCE_PATCH;
  if (patch) {
    const patches = JSON.parse(patch) as Record<string, Record<string, unknown>>;
    raw.heroes = raw.heroes.map((h) => {
      const hero = h as { id: string };
      return patches[hero.id] ? { ...hero, ...patches[hero.id] } : h;
    });
  }
  const spec = process.env.BALANCE_SCALE;
  if (!spec) return raw;
  const scale = JSON.parse(spec) as Record<string, number>;
  raw.heroes = raw.heroes.map((h) => {
    const hero = h as { id: string; stats: Record<string, number> };
    const k = scale[hero.id];
    if (!k) return h;
    return {
      ...hero,
      stats: {
        ...hero.stats,
        maxHp: hero.stats.maxHp * k,
        bladeDmg: hero.stats.bladeDmg * k,
        soulPower: hero.stats.soulPower * k,
      },
    };
  });
  return raw;
}

export function readRawContent(): RawContentFiles {
  return applyScale({
    heroes: readDir('heroes'),
    items: readDir('items'),
    upgrades: readDir('upgrades'),
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
