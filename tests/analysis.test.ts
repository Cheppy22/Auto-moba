import { describe, expect, it } from 'vitest';
import { buildReport, inputFromMatch, mostTakenType } from '../src/analysis';
import { Match } from '../src/sim';
import { content, runAi } from './helpers';

const m = runAi(3, 9);
const input = inputFromMatch(m, content);
const whole = buildReport(input, { kind: 'match' });

describe('analysis', () => {
  it('kills, deaths and gold trace back to the event log', () => {
    const heroDeaths = m.events.filter((e) => e.type === 'death' && e.payload.kind === 'hero');
    expect(whole.heroes.reduce((a, h) => a + h.deaths, 0)).toBe(heroDeaths.length);
    const heroKills = heroDeaths.filter(
      (e) => e.type === 'death' && whole.heroes.some((h) => h.id === e.payload.killer),
    );
    expect(whole.heroes.reduce((a, h) => a + h.kills, 0)).toBe(heroKills.length);
    const goldEvents = m.events.filter((e) => e.type === 'gold');
    const goldSum = goldEvents.reduce((a, e) => a + (e.type === 'gold' ? e.payload.amount : 0), 0);
    expect(whole.heroes.reduce((a, h) => a + h.goldEarned, 0)).toBe(goldSum);
    for (const h of whole.heroes) {
      expect(Object.values(h.goldBySource).reduce((a, b) => a + b, 0)).toBe(h.goldEarned);
    }
  });

  it('phase reports partition the match', () => {
    const phases = whole.phases;
    expect(phases.length).toBeGreaterThan(0);
    const slices = phases.map((n) => buildReport(input, { kind: 'phase', n }));
    const kills = slices.reduce((a, r) => a + r.heroes.reduce((x, h) => x + h.kills, 0), 0);
    expect(kills).toBeLessThanOrEqual(whole.heroes.reduce((a, h) => a + h.kills, 0));
    const buys = (r: ReturnType<typeof buildReport>): number =>
      r.heroes.reduce((a, h) => a + h.purchases.length, 0);
    expect(slices.reduce((a, r) => a + buys(r), 0)).toBe(buys(whole));
    const picks = (r: ReturnType<typeof buildReport>): number =>
      r.heroes.reduce((a, h) => a + h.upgrades.length, 0);
    expect(slices.reduce((a, r) => a + picks(r), 0)).toBe(picks(whole));
    const dealt = slices.reduce((a, r) => a + r.heroes.reduce((x, h) => x + h.damageDealt, 0), 0);
    expect(Math.abs(dealt - whole.heroes.reduce((a, h) => a + h.damageDealt, 0))).toBeLessThan(1);
    for (const r of slices) {
      expect(r.toTick).toBeGreaterThanOrEqual(r.fromTick);
      for (const h of r.heroes)
        for (const p of h.path) expect(p.tick).toBeGreaterThanOrEqual(r.fromTick);
    }
  });

  it('derives fights with participants from both sides', () => {
    expect(whole.fights.length).toBeGreaterThan(0);
    for (const f of whole.fights) {
      expect(f.sideA.length).toBeGreaterThan(0);
      expect(f.sideB.length).toBeGreaterThan(0);
      expect(f.endTick).toBeGreaterThanOrEqual(f.startTick);
    }
  });

  it('badges are facts drawn from hero models', () => {
    for (const b of whole.badges) {
      const h = whole.heroes.find((x) => x.id === b.heroId);
      expect(h).toBeDefined();
      expect(b.label.length).toBeGreaterThan(0);
    }
  });

  it('reports the damage type a hero took most of', () => {
    const h = whole.heroes.find((x) => x.damageTaken > 0)!;
    const r = mostTakenType(h)!;
    expect(r.share).toBeGreaterThan(0);
    expect(r.share).toBeLessThanOrEqual(1);
  });
});

describe('sealed auction in reports', () => {
  it('hides the other side bids until the auction resolves', () => {
    const live = Match.create(content, { seed: 81, player: { heroId: 'smelter', role: 'top' } });
    const id = live.state.playerHeroId!;
    live.unitById(id)!.hero!.gold = 800;
    live.issue({ type: 'bid', points: 0, gold: 300 });
    const offer = live.state.upgradeOffers[id];
    if (offer?.length) live.issue({ type: 'pickUpgrade', upgradeId: offer[0] });
    live.issue({ type: 'startPhase' });
    live.step(4800);
    const inp = inputFromMatch(live, content);
    const hasBids = (r: ReturnType<typeof buildReport>, team: string): boolean =>
      r.special.bids.some((b) => b.team === team);
    const all = buildReport(inp, { kind: 'phase', n: 1 });
    const seen = buildReport(inp, { kind: 'phase', n: 1 }, 'A');
    expect(hasBids(all, 'B')).toBe(true);
    expect(hasBids(seen, 'A')).toBe(true);
    expect(hasBids(seen, 'B')).toBe(false);
    expect(seen.teams.B.pointsSpent).toBe(0);
  });
});
