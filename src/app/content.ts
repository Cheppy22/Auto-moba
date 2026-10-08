import { loadContent, type Content, type RawContentFiles } from '../sim';

function dir(mods: Record<string, unknown>): unknown[] {
  return Object.keys(mods)
    .sort()
    .map((k) => mods[k]);
}

export function loadBrowserContent(): Content {
  const raw: RawContentFiles = {
    pieces: dir(import.meta.glob('/content/pieces/*.json', { eager: true, import: 'default' })),
    gambits: Object.values(
      import.meta.glob('/content/gambits.json', { eager: true, import: 'default' }),
    )[0],
    items: dir(import.meta.glob('/content/items/*.json', { eager: true, import: 'default' })),
    events: dir(import.meta.glob('/content/events/*.json', { eager: true, import: 'default' })),
    biomes: dir(import.meta.glob('/content/biomes/*.json', { eager: true, import: 'default' })),
    pressure: Object.values(
      import.meta.glob('/content/pressure.json', { eager: true, import: 'default' }),
    )[0],
    badges: Object.values(
      import.meta.glob('/content/badges.json', { eager: true, import: 'default' }),
    )[0],
    map: Object.values(
      import.meta.glob('/content/map.json', { eager: true, import: 'default' }),
    )[0],
    tuning: Object.values(
      import.meta.glob('/content/tuning.json', { eager: true, import: 'default' }),
    )[0],
  };
  return loadContent(raw);
}
