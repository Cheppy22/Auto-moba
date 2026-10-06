export const STREAMS = ['mapgen', 'ai', 'combat', 'loot', 'keeper', 'draft'] as const;
export type StreamName = (typeof STREAMS)[number];
export type RngState = Record<StreamName, number>;

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seedStreams(seed: number): RngState {
  const out = {} as RngState;
  for (const name of STREAMS) {
    out[name] = (hashString(`${seed}:${name}`) ^ (seed >>> 0)) >>> 0 || 1;
  }
  return out;
}

export function rand(r: RngState, stream: StreamName): number {
  let a = (r[stream] = (r[stream] + 0x6d2b79f5) >>> 0);
  a = Math.imul(a ^ (a >>> 15), a | 1);
  a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
  return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
}

export function randInt(
  r: RngState,
  stream: StreamName,
  min: number,
  maxInclusive: number,
): number {
  return min + Math.floor(rand(r, stream) * (maxInclusive - min + 1));
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
