import { describe, expect, it } from 'vitest';
import { Match } from '../src/sim';
import { healUnit } from '../src/sim/combat';
import { respawnTicks } from '../src/sim/systems';
import { content, liveMatch, piece } from './helpers';

const ACT = content.tuning.phaseSeconds * content.tuning.tickRate;

function openIds(m: Match): string[] {
  return m.state.slots.filter((s) => s.open).map((s) => s.id);
}

/** Thrones that cannot fall, so the match runs through every Act. */
function stalemate(seed: number): Match {
  const m = liveMatch(seed);
  for (const team of ['A', 'B'] as const) {
    const g = m.ctx.guardians[team]!;
    g.base = { ...g.base, maxHp: 1e9 };
    g.hp = 1e9;
    g.dirty = true;
  }
  return m;
}

describe('setup and Acts', () => {
  it('waits on the setup board until setupTeam, then starts Act 1 live', () => {
    const m = Match.create(content, { seed: 4 });
    expect(m.state.phase.kind).toBe('setup');
    expect(m.state.units).toHaveLength(0);
    expect(m.step(10)).toBe(0);
    expect(m.issue({ type: 'setupTeam', ...m.defaultSetup() }).ok).toBe(true);
    expect(m.state.phase).toMatchObject({ kind: 'live', n: 1 });
    expect(m.state.teams.A.heroIds).toHaveLength(5);
    expect(m.state.teams.B.heroIds).toHaveLength(5);
    expect(m.issue({ type: 'setupTeam', ...m.defaultSetup() }).ok).toBe(false);
  });

  it('runs Acts back to back with no pause between them', () => {
    const m = liveMatch(4);
    expect(m.step(ACT)).toBe(ACT);
    expect(m.state.phase).toMatchObject({ kind: 'live', n: 2, startTick: ACT });
    const end = m.events.find((e) => e.type === 'phaseEnd')!;
    const next = m.events.find((e) => e.type === 'phaseStart' && e.payload.phase === 2)!;
    expect(end.tick).toBe(next.tick);
    const snap = m.snapshot();
    expect(snap.act).toBe(2);
    expect(snap.phaseTicksLeft).toBe(ACT);
  });

  it('opens two slots per Act, 3 Acts in total, as pairs sharing a biome', () => {
    const m = liveMatch(4);
    expect(openIds(m).sort()).toEqual(['brc', 'tlc']);
    m.step(ACT);
    expect(openIds(m).sort()).toEqual(['brc', 'tla', 'tlb', 'tlc']);
    m.step(ACT);
    expect(openIds(m)).toHaveLength(6);
    const byId = Object.fromEntries(m.state.slots.map((s) => [s.id, s]));
    expect(byId.tlc.biomeId).toBe(byId.brc.biomeId);
    expect(byId.tla.biomeId).toBe(byId.tlb.biomeId);
    expect(byId.bra.biomeId).toBe(byId.brb.biomeId);
  });

  it('randomizes biomes by seed', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 12; seed++)
      seen.add(
        liveMatch(seed)
          .state.slots.map((s) => s.biomeId)
          .join(','),
      );
    expect(seen.size).toBeGreaterThan(2);
  });

  it('re-rolls the jungle and moves the Keeper every Act', () => {
    const m = liveMatch(8);
    const rolls = (): number => m.events.filter((e) => e.type === 'campsRolled').length;
    const moves = (): number => m.events.filter((e) => e.type === 'keeperMoved').length;
    const [a, k] = [rolls(), moves()];
    m.step(ACT);
    expect(rolls()).toBeGreaterThan(a);
    expect(moves()).toBeGreaterThan(k);
  });

  it('respawn time grows inside an Act and its base rises each Act', () => {
    const m = liveMatch(2);
    const hero = piece(m, 'A', 'rook');
    const early = respawnTicks(m.ctx, hero);
    m.ctx.s.tick += 4000;
    const late = respawnTicks(m.ctx, hero);
    expect(late).toBeGreaterThan(early);
    m.ctx.s.tick -= 4000;
    m.ctx.s.phase.n = 3;
    expect(respawnTicks(m.ctx, hero)).toBeGreaterThan(early);
  });

  it('a piece dead at an Act boundary stays dead into the next Act and respawns on time', () => {
    const m = liveMatch(2);
    m.step(ACT - 100);
    const hero = piece(m, 'A', 'bishop');
    hero.hp = 0;
    hero.pendingKill = { killerId: 0 };
    m.step(50);
    expect(hero.alive).toBe(false);
    const due = hero.hero!.respawnAt!;
    expect(due).toBeGreaterThan(ACT);
    m.step(60);
    expect(m.state.phase.n).toBe(2);
    expect(hero.alive).toBe(false);
    m.step(due - m.state.tick + 2);
    expect(hero.alive).toBe(true);
  });

  it('stacks pressure events in order and Endgame replaces The Kings Wake from Act 7', () => {
    const m = stalemate(5);
    const seenAt: Record<number, string[]> = {};
    for (let i = 0; i < 7 && m.state.phase.kind === 'live'; i++) {
      seenAt[m.state.phase.n] = m.state.pressure.slice();
      m.step(ACT);
    }
    seenAt[m.state.phase.n] = m.state.pressure.slice();
    expect(seenAt[3]).toEqual([]);
    expect(seenAt[4]).toEqual(['thinning_veil']);
    expect(seenAt[5]).toEqual(['thinning_veil', 'spirit_tide']);
    expect(seenAt[6]).toEqual(['thinning_veil', 'spirit_tide', 'keeper_debts']);
    expect(seenAt[7]).toEqual(['thinning_veil', 'spirit_tide', 'keeper_debts', 'endgame']);
    expect(m.state.tagMult.heal).toBe(0.5);
    expect(m.state.tagMult.curse).toBe(2);
    expect(m.state.tagMult.throneDamage).toBe(1.5);
    expect(m.state.tagMult.respawn).toBe(1.5);
    const g = m.ctx.guardians.A!;
    expect(g.x).toBe(m.ctx.world.guardianPos.A.x);
    expect(g.y).toBe(m.ctx.world.guardianPos.A.y);
  });

  it('Endgame lengthens every respawn by half', () => {
    const m = liveMatch(3);
    const hero = piece(m, 'A', 'queen');
    const before = respawnTicks(m.ctx, hero);
    m.state.tagMult.respawn = 1.5;
    expect(respawnTicks(m.ctx, hero)).toBe(Math.round(before * 1.5));
  });

  it('thinning veil halves healing', () => {
    const m = liveMatch(1);
    const hero = piece(m, 'A', 'rook');
    hero.hp = 100;
    const full = healUnit(m.ctx, null, hero, 100, 'test', false);
    hero.hp = 100;
    m.state.tagMult.heal = 0.5;
    const half = healUnit(m.ctx, null, hero, 100, 'test', false);
    expect(half).toBeCloseTo(full / 2);
  });

  it('spirit tide sends neutral spirits into the lanes', () => {
    const m = stalemate(6);
    m.step(ACT * 4 + 700);
    const tide = m.state.units.filter((u) => u.defId === 'tide_spirit');
    expect(tide.length).toBeGreaterThan(0);
    expect(tide.every((u) => u.team === 'neutral')).toBe(true);
  });

  it('ends as a draw after the last Act (a test guard, not a game rule)', () => {
    const m = stalemate(7);
    m.state.phase.n = content.tuning.maxPhases;
    m.step(ACT + 5);
    expect(m.state.phase.kind).toBe('end');
    expect(m.state.winner).toBeNull();
    expect(m.events.filter((e) => e.type === 'matchEnd')).toHaveLength(1);
  });

  it('Endgame ends real matches in checkmate within ten Acts', () => {
    for (const seed of [21, 22]) {
      const m = liveMatch(seed);
      m.runToEnd(content.tuning.maxPhases);
      expect(m.state.winner).not.toBeNull();
      expect(m.events.some((e) => e.type === 'checkmate')).toBe(true);
    }
  });
});
