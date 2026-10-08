import { describe, expect, it } from 'vitest';
import { Match } from '../src/sim';
import { content } from './helpers';

describe('random drafts', () => {
  it('never repeat a hero within a match, and cover every role on both teams', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const m = Match.create(content, { seed, player: null });
      const start = m.events.find((e) => e.type === 'matchStart');
      expect(start).toBeDefined();
      const heroes = (start!.payload as { heroes: { team: string; def: string; role: string }[] })
        .heroes;
      expect(heroes).toHaveLength(10);
      expect(new Set(heroes.map((h) => h.def)).size).toBe(10);
      for (const team of ['A', 'B']) {
        const roles = heroes
          .filter((h) => h.team === team)
          .map((h) => h.role)
          .sort();
        expect(roles).toEqual(['bot', 'bot', 'mid', 'top', 'top']);
      }
    }
  });

  it('leaves the player at least five heroes to choose from', () => {
    expect(content.heroes.length - 9).toBeGreaterThanOrEqual(5);
  });
});
