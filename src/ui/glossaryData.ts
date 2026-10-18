import raw from '../../content/glossary.json';

/** One game word (`content/glossary.json`). */
export interface GlossEntry {
  id: string;
  term: string;
  aliases: string[];
  short: string;
  more?: string;
  see?: string[];
  group: string;
}

export const GLOSSARY: readonly GlossEntry[] = raw;
export const GLOSSARY_GROUPS = ['Match', 'Board', 'Pieces', 'Gambits', 'Break', 'Run'] as const;

export const BY_ID = new Map(GLOSSARY.map((e) => [e.id, e]));
const BY_ALIAS = new Map(GLOSSARY.flatMap((e) => e.aliases.map((a) => [a, e.id] as const)));
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Longest alias first, so "high ground" wins over anything shorter that starts alike. */
const ALIAS_RE = new RegExp(
  `(?<![\\w'’-])(${[...BY_ALIAS.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escapeRe)
    .join('|')})(?![\\w'’-])`,
  'g',
);

export interface Found {
  id: string;
  start: number;
  end: number;
}

/**
 * The game words to mark in a line of text: the first appearance of each word only, at most `max`
 * of them, and none from `skip` (words the same panel already marks elsewhere).
 */
export function findTerms(text: string, skip: readonly string[] = [], max = 3): Found[] {
  const seen = new Set(skip);
  const out: Found[] = [];
  for (const m of text.matchAll(ALIAS_RE)) {
    const id = BY_ALIAS.get(m[0]);
    if (!id || seen.has(id)) continue;
    if (out.length >= max) break;
    seen.add(id);
    out.push({ id, start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  return out;
}
