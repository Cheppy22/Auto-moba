import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { BY_ID, GLOSSARY, GLOSSARY_GROUPS, findTerms } from '../src/ui/glossaryData';

const schema = z.array(
  z.strictObject({
    id: z.string().regex(/^[a-z]+(-[a-z]+)*$/),
    term: z.string().min(1),
    aliases: z.array(z.string().min(1)).min(1),
    short: z.string().min(1),
    more: z.string().min(1).optional(),
    see: z.array(z.string()).max(3).optional(),
    group: z.enum(GLOSSARY_GROUPS),
  }),
);

const words = (s: string): number => s.trim().split(/\s+/).length;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const json = (p: string): Record<string, Record<string, number>> =>
  JSON.parse(readFileSync(p, 'utf8'));

describe('glossary content', () => {
  it('matches its schema', () => {
    expect(() =>
      schema.parse(JSON.parse(readFileSync('content/glossary.json', 'utf8'))),
    ).not.toThrow();
  });

  it('has unique ids and no alias shared by two terms', () => {
    expect(new Set(GLOSSARY.map((e) => e.id)).size).toBe(GLOSSARY.length);
    const seen = new Map<string, string>();
    for (const e of GLOSSARY) {
      expect(
        e.aliases.map((a) => a.toLowerCase()),
        `${e.id} lists its own name`,
      ).toContain(e.term.toLowerCase());
      for (const a of e.aliases) {
        expect(seen.get(a), `alias "${a}" of ${e.id}`).toBeUndefined();
        seen.set(a, e.id);
      }
    }
  });

  it('writes every short as one sentence of at most 25 words', () => {
    for (const e of GLOSSARY) {
      expect(e.short, e.id).toMatch(/[.]$/);
      expect(e.short.slice(0, -1), `${e.id} has a second sentence`).not.toMatch(/[.!?] [A-Z]/);
      expect(words(e.short), e.id).toBeLessThanOrEqual(25);
      if (e.more) expect(words(e.more), `${e.id} more`).toBeLessThanOrEqual(45);
    }
  });

  it('points "see also" only at real terms, never at itself', () => {
    for (const e of GLOSSARY) {
      for (const id of e.see ?? []) {
        expect(BY_ID.has(id), `${e.id} sees ${id}`).toBe(true);
        expect(id).not.toBe(e.id);
      }
    }
  });

  it('is complete: the review list plus the words the game shows', () => {
    const ids = [
      'tempo',
      'gambit',
      'fork',
      'relic',
      'pawn',
      'pawnling',
      'act',
      'bastion',
      'throne',
      'check',
      'checkmate',
      'high-ground',
      'eye-badge',
      'line-of-sight',
      'opening',
      'archetype',
      'rank',
      'school',
    ];
    for (const id of ids) expect(BY_ID.has(id), id).toBe(true);
  });

  it('uses only ids that exist wherever a screen marks a word', () => {
    const files = walk('src/ui').filter((f) => /\.tsx$/.test(f));
    let uses = 0;
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/<Term\s+id="([a-z-]+)"/g)) {
        uses++;
        expect(BY_ID.has(m[1]), `${f}: <Term id="${m[1]}">`).toBe(true);
      }
      for (const m of text.matchAll(/skip=\{\[([^\]]*)\]\}/g)) {
        for (const q of m[1].matchAll(/'([a-z-]+)'/g))
          expect(BY_ID.has(q[1]), `${f}: skip ${q[1]}`).toBe(true);
      }
    }
    expect(uses).toBeGreaterThan(20);
  });

  it('only defines words the player can reach: shown in the game, or one tap from a word that is', () => {
    const sources = [...walk('src/ui'), ...walk('src/analysis'), ...walk('content')]
      .filter((f) => !f.endsWith('glossary.json') && !f.endsWith('glossaryData.ts'))
      .filter((f) => /\.(tsx?|json)$/.test(f))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    const shown = new Set(
      GLOSSARY.filter((e) => e.aliases.some((a) => sources.includes(a))).map((e) => e.id),
    );
    const linked = new Set(GLOSSARY.filter((e) => shown.has(e.id)).flatMap((e) => e.see ?? []));
    for (const e of GLOSSARY) {
      expect(shown.has(e.id) || linked.has(e.id), `${e.id} is in no screen text`).toBe(true);
    }
  });

  it('keeps its numbers in step with the rules', () => {
    const tuning = json('content/tuning.json');
    const long = JSON.parse(readFileSync('content/map-long.json', 'utf8')).tuning.height as {
      slopeDmg: number;
      reachMul: number;
    };
    const text = (id: string): string => `${BY_ID.get(id)!.short} ${BY_ID.get(id)!.more ?? ''}`;
    // high ground and the eye badge: +20% damage downhill, +30% reach
    expect(long.slopeDmg).toBe(0.2);
    expect(long.reachMul).toBe(1.3);
    expect(text('high-ground')).toContain('20%');
    expect(text('high-ground')).toContain('30%');
    expect(text('eye-badge')).toContain('20%');
    expect(text('eye-badge')).toContain('30%');
    // Tempo: a 0-100 meter that starts at 30 and gains 1 a second
    expect(tuning.gambits.tempoMax).toBe(100);
    expect(tuning.gambits.tempoStart).toBe(30);
    expect(tuning.gambits.tempoPerSec).toBe(1);
    expect(text('tempo')).toContain('0–100');
    expect(text('tempo')).toContain('30');
    // Check: the team hits 10% softer
    expect(tuning.check.damageMul).toBe(0.9);
    expect(text('check')).toContain('10%');
    // a hand of three gambits
    expect(tuning.gambits.handSize).toBe(3);
    expect(text('gambit')).toContain('hand of three');
    // relics: pick one of three
    expect(tuning.relics.offers).toBe(3);
    expect(text('relic')).toContain('one of three');
  });
});

describe('findTerms', () => {
  const ids = (text: string, skip: string[] = [], max = 3): string[] =>
    findTerms(text, skip, max).map((f) => f.id);

  it('marks only the first appearance of a word', () => {
    expect(ids('Tempo pays for gambits, and Tempo fills over time.')).toEqual(['tempo', 'gambit']);
  });

  it('caps the number of words and honours skip', () => {
    const text = 'Tempo buys a gambit, a pawn and a relic.';
    expect(ids(text)).toEqual(['tempo', 'gambit', 'pawn']);
    expect(ids(text, [], 1)).toEqual(['tempo']);
    expect(ids(text, ['tempo', 'gambit'])).toEqual(['pawn', 'relic']);
  });

  it('prefers the longer phrase and returns exact positions', () => {
    const text = 'Stand on high ground to get the eye badge.';
    const found = findTerms(text);
    expect(found.map((f) => f.id)).toEqual(['high-ground', 'eye-badge']);
    expect(text.slice(found[0].start, found[0].end)).toBe('high ground');
  });

  it('leaves card and relic names alone', () => {
    expect(ids("Queen's Gambit and Pawn Storm and Spare Tempo-ish")).toEqual([]);
    expect(ids('Compensation is a Rally relic')).toEqual(['rally', 'relic']);
  });

  it('does not match inside longer words', () => {
    expect(ids('React to the pawnship and the actors')).toEqual([]);
  });
});
