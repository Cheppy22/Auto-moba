export const STREAMS = [
  'mapgen',
  'ai',
  'combat',
  'loot',
  'draft',
  'events',
  'gambit',
  'relic',
] as const;
type StreamName = (typeof STREAMS)[number];
export type RngState = Record<StreamName, number>;

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A seed derived from several parts (a run's match seeds, its draw and its reward offers). */
export function mixSeed(...parts: (string | number)[]): number {
  return hashString(parts.join(':')) || 1;
}

export function seedStreams(seed: number): RngState {
  const out = {} as RngState;
  for (const name of STREAMS) {
    out[name] = (hashString(`${seed}:${name}`) ^ (seed >>> 0)) >>> 0 || 1;
  }
  return out;
}

/** One step of the generator: the next state and a number in [0, 1). */
function stepRng(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let a = Math.imul(next ^ (next >>> 15), next | 1);
  a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
  return [next, ((a ^ (a >>> 14)) >>> 0) / 4294967296];
}

export function rand(r: RngState, stream: StreamName): number {
  const [next, x] = stepRng(r[stream]);
  r[stream] = next;
  return x;
}

/**
 * A private generator from a derived seed (see `mixSeed`): the same draws for the same parts, and
 * using it never moves any match stream. Piece build offers draw from it.
 */
export function seededRng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    const [next, x] = stepRng(state);
    state = next;
    return x;
  };
}

export function pick<T>(r: RngState, stream: StreamName, arr: readonly T[]): T {
  return arr[Math.floor(rand(r, stream) * arr.length)];
}

export function shuffle<T>(r: RngState, stream: StreamName, arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand(r, stream) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function weightedPick<T>(
  r: RngState,
  stream: StreamName,
  items: readonly T[],
  weight: (t: T) => number,
): T {
  let total = 0;
  for (const it of items) total += weight(it);
  let roll = rand(r, stream) * total;
  for (const it of items) {
    roll -= weight(it);
    if (roll <= 0) return it;
  }
  return items[items.length - 1];
}

export function hashContent(value: unknown): string {
  const text = JSON.stringify(value);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}
