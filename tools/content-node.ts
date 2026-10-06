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

export function readRawContent(): RawContentFiles {
  return {
    heroes: readDir('heroes'),
    items: readDir('items'),
    upgrades: readDir('upgrades'),
    biomes: readDir('biomes'),
    pressure: readJson(join(root, 'pressure.json')),
    badges: readJson(join(root, 'badges.json')),
    map: readJson(join(root, 'map.json')),
    tuning: readJson(join(root, 'tuning.json')),
  };
}

export function loadNodeContent(): Content {
  return loadContent(readRawContent());
}
