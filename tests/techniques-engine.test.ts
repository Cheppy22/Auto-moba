// Techniques phase 2 (SPEC-PIECE-BUILDS-2026-10-18 4.7): the engine additions, one test each — cast
// trigger, echo, recast, ready, Tempo, landing area, pawn aura filter, structure filter, the
// out-of-combat hit, per-target cooldowns, marks, push, skill rules, after-cast hits, death,
// takedown and pawnling-kill triggers, knockback and retreat-line changes, and Rank 8 without a fork.
import { describe, expect, it } from 'vitest';
import type { Match, PieceId, PlayTeam, Unit } from '../src/sim';
import {
  applyEffect,
  dealDamage,
  fireTriggers,
  performAttack,
  tickRecasts,
  tryCast,
} from '../src/sim/combat';
import { retreatLine } from '../src/sim/ai/judgement';
import { checkRank } from '../src/sim/ranks';
import { recompute } from '../src/sim/stats';
import { processDeaths } from '../src/sim/systems';
import type { HeldTechnique } from '../src/sim/types';
import { liveMatch, piece } from './helpers';

function arena(seed = 11): Match {
  return liveMatch(seed, { autoGambits: { A: false, B: false } });
}

/** Gives a piece exactly these Techniques (Plain unless named). */
function hold(m: Match, u: Unit, ...ids: (string | HeldTechnique)[]): void {
  u.hero!.techniques = ids.map((x) => (typeof x === 'string' ? { id: x, grade: 'plain' } : x));
  recompute(m.ctx, u);
}

/** Puts units at offsets from a walkable spot in the middle of the board, and rebuilds the grid. */
function place(m: Match, at: [Unit, number, number][]): void {
  const w = m.ctx.world;
  const cx = w.width / 2;
  const cy = w.length / 2;
  for (const [u, dx, dy] of at) {
    u.x = cx + dx;
    u.y = cy + dy;
    u.path = [];
  }
  m.ctx.grid.clear();
  for (const u of m.state.units) if (u.alive) m.ctx.grid.insert(u);
}

/** Moves every other piece far away so area effects see only the units under test. */
function clearBoard(m: Match, keep: Unit[]): void {
  for (const u of m.state.units)
    if (u.kind === 'hero' && !keep.includes(u)) {
      u.x = 5;
      u.y = 5;
    }
}

const P = (m: Match, team: PlayTeam, id: PieceId) => piece(m, team, id);
const ready = (u: Unit) => (u.hero!.cd = [0, 0, 0, 0]);

describe('cast triggers, echo and the landing area', () => {
  it('Family Fork: L-Leap also hits up to two other pieces where he lands', () => {
    const run = (withFork: boolean) => {
      const m = arena();
      const k = P(m, 'A', 'knight');
      const q = P(m, 'B', 'queen');
      const b = P(m, 'B', 'bishop');
      const r = P(m, 'B', 'rook');
      clearBoard(m, [k, q, b, r]);
      place(m, [
        [k, 0, 0],
        [q, 60, 0],
        [b, 90, 0],
        [r, 400, 0],
      ]);
      hold(m, k, ...(withFork ? ['family_fork'] : []));
      ready(k);
      const before = [q.hp, b.hp, r.hp];
      expect(tryCast(m.ctx, k, 0)).toBe(true);
      return [before[0] - q.hp, before[1] - b.hp, before[2] - r.hp];
    };
    const plain = run(false);
    const fork = run(true);
    expect(plain[0]).toBeGreaterThan(0);
    expect(plain[1]).toBe(0);
    expect(fork[1]).toBeGreaterThan(0);
    expect(fork[2]).toBe(0);
    // the extra strike is 80% of the leap's own
    expect(fork[1] / fork[0]).toBeGreaterThan(0.5);
  });

  it('Shared Guard: Royal Guard also shields the most wounded ally piece', () => {
    const m = arena();
    const king = P(m, 'A', 'king');
    const ally = P(m, 'A', 'queen');
    const healthy = P(m, 'A', 'rook');
    const foe = P(m, 'B', 'knight');
    clearBoard(m, [king, ally, healthy, foe]);
    place(m, [
      [king, 0, 0],
      [ally, 40, 40],
      [healthy, -40, 40],
      [foe, 60, 0],
    ]);
    ally.hp = ally.stats.maxHp * 0.4;
    hold(m, king, 'shared_guard');
    ready(king);
    ally.shields = [];
    healthy.shields = [];
    expect(tryCast(m.ctx, king, 2)).toBe(true);
    const own = king.shields.reduce((a, s) => a + s.amount, 0);
    const got = ally.shields.reduce((a, s) => a + s.amount, 0);
    expect(got).toBeCloseTo(own * 0.6, 0);
    expect(healthy.shields).toHaveLength(0);
  });
});

describe('targets around the victim, allies, regen and a Dubious price', () => {
  /** A Bishop beams a Queen 100 away; a Knight stands `gap` behind her. Returns each one's loss. */
  function beam(ids: string[], gap: number, marked: boolean): [number, number] {
    const m = arena();
    const bi = P(m, 'A', 'bishop');
    const q = P(m, 'B', 'queen');
    const kn = P(m, 'B', 'knight');
    clearBoard(m, [bi, q, kn]);
    place(m, [
      [bi, 0, 0],
      [q, 100, 0],
      [kn, 100 + gap, 0],
    ]);
    hold(m, bi, ...ids);
    ready(bi);
    if (marked) q.mark = { team: 'A', value: 1, untilTick: m.state.tick + 100 };
    q.shields = [];
    kn.shields = [];
    const before = [q.hp, kn.hp];
    expect(tryCast(m.ctx, bi, 0)).toBe(true);
    return [before[0] - q.hp, before[1] - kn.hp];
  }

  it('Long Diagonal: the beam also hits everything within 40 of its target', () => {
    expect(beam([], 30, false)[1]).toBe(0);
    const [q, kn] = beam(['long_diagonal'], 30, false);
    expect(kn).toBeGreaterThan(0);
    expect(kn / q).toBeGreaterThan(0.5);
    expect(beam(['long_diagonal'], 80, false)[1]).toBe(0);
  });

  it('Discovered Attack: a beam on a marked piece also strikes the enemy piece nearest it', () => {
    expect(beam(['discovered_attack'], 150, false)[1]).toBe(0);
    expect(beam(['discovered_attack'], 150, true)[1]).toBeGreaterThan(0);
  });

  it('Living Wall: Stone Skin also shields ally pieces within 150 at half strength', () => {
    const m = arena();
    const r = P(m, 'A', 'rook');
    const near = P(m, 'A', 'queen');
    const far = P(m, 'A', 'bishop');
    const foe = P(m, 'B', 'knight');
    clearBoard(m, [r, near, far, foe]);
    place(m, [
      [r, 0, 0],
      [near, -60, 0],
      [far, -300, 0],
      [foe, 60, 0],
    ]);
    hold(m, r, 'living_wall');
    ready(r);
    for (const u of [r, near, far]) u.shields = [];
    expect(tryCast(m.ctx, r, 1)).toBe(true);
    const own = r.shields.reduce((a, s) => a + s.amount, 0);
    expect(own).toBeGreaterThan(0);
    expect(near.shields.reduce((a, s) => a + s.amount, 0)).toBeCloseTo(own * 0.5, 0);
    expect(far.shields).toHaveLength(0);
  });

  it('regen gives a share of max health a second for its time; payHp never kills', () => {
    const m = arena();
    const k = P(m, 'A', 'knight');
    const sanctified = m.ctx.c.techniqueById.get('sanctified')!;
    const regen = sanctified.triggers[0].effects[1];
    expect(regen.type).toBe('regen');
    const base = k.stats.hpRegen;
    applyEffect(m.ctx, regen, { caster: k, target: k, powerMul: 1, origin: 'test' });
    recompute(m.ctx, k);
    expect(k.stats.hpRegen - base).toBeCloseTo(0.02 * k.stats.maxHp, 3);
    const price = m.ctx.c.techniqueById.get('blood_price')!.dubious!.triggers![0].effects[0];
    expect(price.type).toBe('payHp');
    k.hp = k.stats.maxHp * 0.5;
    applyEffect(m.ctx, price, { caster: k, target: k, powerMul: 1, origin: 'test' });
    expect(k.hp).toBeCloseTo(k.stats.maxHp * 0.49, 3);
    k.hp = 2;
    applyEffect(m.ctx, price, { caster: k, target: k, powerMul: 1, origin: 'test' });
    expect(k.hp).toBe(1);
  });
});

describe('recast', () => {
  it('Echoing Decree strikes the same spot again a second later at half power', () => {
    const m = arena();
    const q = P(m, 'A', 'queen');
    const foe = P(m, 'B', 'rook');
    clearBoard(m, [q, foe]);
    place(m, [
      [q, 0, 0],
      [foe, 100, 0],
    ]);
    hold(m, q, 'echoing_decree');
    ready(q);
    const hp0 = foe.hp;
    expect(tryCast(m.ctx, q, 1)).toBe(true);
    const first = hp0 - foe.hp;
    expect(q.hero!.recasts).toHaveLength(1);
    tickRecasts(m.ctx, q);
    expect(hp0 - foe.hp).toBe(first); // not yet
    m.ctx.s.tick += 20;
    tickRecasts(m.ctx, q);
    const second = hp0 - foe.hp - first;
    expect(second / first).toBeCloseTo(0.5, 1);
    expect(q.hero!.recasts).toHaveLength(0);
  });

  it('Bind stuns a piece hit by both strikes', () => {
    const m = arena();
    const q = P(m, 'A', 'queen');
    const foe = P(m, 'B', 'rook');
    clearBoard(m, [q, foe]);
    place(m, [
      [q, 0, 0],
      [foe, 100, 0],
    ]);
    hold(m, q, 'bind', 'clamp');
    ready(q);
    tryCast(m.ctx, q, 1);
    m.ctx.s.tick += 20;
    tickRecasts(m.ctx, q);
    expect(foe.stunUntil ?? 0).toBeGreaterThan(m.ctx.s.tick);
  });
});

describe('ready, Tempo and the kill-side triggers', () => {
  it('Hit and Run: Spur Away readies L-Leap at once', () => {
    const m = arena();
    const k = P(m, 'A', 'knight');
    const foe = P(m, 'B', 'rook');
    clearBoard(m, [k, foe]);
    place(m, [
      [k, 0, 0],
      [foe, 50, 0],
    ]);
    hold(m, k, 'hit_and_run');
    k.hero!.cd = [120, 0, 0, 0];
    k.hp = k.stats.maxHp * 0.3;
    expect(tryCast(m.ctx, k, 2)).toBe(true);
    expect(k.hero!.cd[0]).toBe(0);
    expect(k.hero!.cd[2]).toBeGreaterThan(0);
  });

  it('Tempo Thief: a takedown (kill or assist) gives the side Tempo', () => {
    const m = arena();
    const k = P(m, 'A', 'knight');
    const foe = P(m, 'B', 'rook');
    hold(m, k, 'tempo_thief');
    m.state.tempo.A = 10;
    fireTriggers(m.ctx, k, 'takedown', { victim: foe });
    expect(m.state.tempo.A).toBeCloseTo(14);
  });

  it('a real kill fires takedown for the killer; the dead piece fires death (Poisoned Piece)', () => {
    const m = arena();
    const k = P(m, 'A', 'knight');
    const foe = P(m, 'B', 'bishop');
    hold(m, k, 'tempo_thief');
    hold(m, foe, 'poisoned_piece');
    m.state.tempo.A = 10;
    const khp = k.hp;
    dealDamage(m.ctx, k, foe, 1e6, 'true', 'test');
    processDeaths(m.ctx);
    expect(foe.alive).toBe(false);
    expect(m.state.tempo.A).toBeGreaterThan(14 - 1e-9);
    expect(khp - k.hp).toBeCloseTo(foe.stats.maxHp * 0.25, 0);
  });

  it('Smothered Mate: a piece killed by L-Leap readies it', () => {
    const m = arena();
    const k = P(m, 'A', 'knight');
    const foe = P(m, 'B', 'bishop');
    clearBoard(m, [k, foe]);
    place(m, [
      [k, 0, 0],
      [foe, 60, 0],
    ]);
    hold(m, k, 'smothered_mate', 'ambush');
    ready(k);
    foe.hp = 5;
    foe.shields = [];
    expect(tryCast(m.ctx, k, 0)).toBe(true);
    expect(k.hero!.cd[0]).toBeGreaterThan(0);
    processDeaths(m.ctx);
    expect(foe.alive).toBe(false);
    expect(k.hero!.cd[0]).toBe(0);
  });

  it('Tithe: a pawnling killed near the King gives Tempo, one far away does not', () => {
    const m = arena();
    m.step(20 * 40);
    const king = P(m, 'A', 'king');
    hold(m, king, 'tithe');
    const pawnling = m.state.units.find((u) => u.kind === 'minion' && u.team === 'B' && !u.pawn)!;
    expect(pawnling).toBeDefined();
    const t0 = (m.state.tempo.A = 10);
    king.x = pawnling.x + 100;
    king.y = pawnling.y;
    fireTriggers(m.ctx, king, 'pawnlingKill', { victim: pawnling });
    expect(m.state.tempo.A).toBeCloseTo(t0 + 0.5);
    king.x = pawnling.x + 900;
    fireTriggers(m.ctx, king, 'pawnlingKill', { victim: pawnling });
    expect(m.state.tempo.A).toBeCloseTo(t0 + 0.5);
  });
});

describe('filters and conditions', () => {
  it('Escort: the aura reaches pawns and pawnlings, not pieces', () => {
    const m = arena();
    m.step(20 * 40);
    const p = P(m, 'A', 'rook');
    const ally = P(m, 'A', 'queen');
    const pawnling = m.state.units.find((u) => u.kind === 'minion' && u.team === 'A' && !u.ev)!;
    p.x = pawnling.x;
    p.y = pawnling.y + 20;
    ally.x = pawnling.x;
    ally.y = pawnling.y - 20;
    m.ctx.grid.clear();
    for (const u of m.state.units) if (u.alive) m.ctx.grid.insert(u);
    hold(m, p, 'escort');
    fireTriggers(m.ctx, p, 'periodic', {});
    const def = m.ctx.c.techniqueById.get('escort')!;
    for (const e of def.triggers[0].effects)
      applyEffect(m.ctx, e, { caster: p, target: p, powerMul: 1, origin: 'test' });
    expect(pawnling.mods.some((x) => x.stat === 'bladeDmg')).toBe(true);
    expect(ally.mods.some((x) => x.stat === 'bladeDmg' && x.id.startsWith('aura:'))).toBe(false);
    expect(p.mods.some((x) => x.stat === 'bladeDmg' && x.id.startsWith('aura:'))).toBe(false);
  });

  it('Battering Hits: extra damage only on Bastions and Thrones', () => {
    const m = arena();
    const p = P(m, 'A', 'rook');
    const foe = P(m, 'B', 'rook');
    const tower = m.ctx.towers.B.mid[0]!;
    hold(m, p, 'battering_hits');
    const t0 = tower.hp;
    fireTriggers(m.ctx, p, 'hit', { victim: tower, damage: 100, hitType: 'blade' });
    expect(tower.hp).toBeLessThan(t0);
    const f0 = foe.hp;
    fireTriggers(m.ctx, p, 'hit', { victim: foe, damage: 100, hitType: 'blade' });
    expect(foe.hp).toBe(f0);
  });

  it('Ambush: the first hit after 3 s out of combat hits harder', () => {
    const m = arena();
    const k = P(m, 'A', 'knight');
    const foe = P(m, 'B', 'rook');
    hold(m, k, 'ambush');
    m.ctx.s.tick += 200;
    k.lastDamagedTick = 0;
    k.hero!.lastDealtTick = 0;
    foe.shields = [];
    const h0 = foe.hp;
    performAttack(m.ctx, k, foe);
    const quiet = h0 - foe.hp;
    const h1 = foe.hp;
    performAttack(m.ctx, k, foe);
    const busy = h1 - foe.hp;
    expect(quiet / busy).toBeCloseTo(1.6, 1);
  });

  it("Hunter's Mark: cooldown per target; marked pieces take more from the marker's side only", () => {
    const m = arena();
    const k = P(m, 'A', 'knight');
    const a = P(m, 'B', 'rook');
    const b = P(m, 'B', 'bishop');
    hold(m, k, 'hunters_mark');
    fireTriggers(m.ctx, k, 'hit', { victim: a, damage: 10 });
    expect(a.mark?.team).toBe('A');
    const until = a.mark!.untilTick;
    m.ctx.s.tick += 5;
    fireTriggers(m.ctx, k, 'hit', { victim: a, damage: 10 });
    expect(a.mark!.untilTick).toBe(until); // on cooldown for this piece
    fireTriggers(m.ctx, k, 'hit', { victim: b, damage: 10 });
    expect(b.mark?.team).toBe('A'); // another piece is not
    a.shields = [];
    const ally = P(m, 'A', 'queen');
    const marked = dealDamage(m.ctx, ally, a, 100, 'true', 'test');
    const foeSide = dealDamage(m.ctx, P(m, 'B', 'queen'), b, 100, 'true', 'test');
    expect(marked).toBeCloseTo(110, 3);
    expect(foeSide).toBeCloseTo(100, 3);
  });

  it('Zwischenzug: the first hit after a skill hits harder', () => {
    const m = arena();
    const k = P(m, 'A', 'knight');
    const foe = P(m, 'B', 'rook');
    hold(m, k, 'zwischenzug');
    foe.shields = [];
    k.hero!.castSinceHit = true;
    const h0 = foe.hp;
    performAttack(m.ctx, k, foe);
    const after = h0 - foe.hp;
    const h1 = foe.hp;
    performAttack(m.ctx, k, foe);
    expect(after / (h1 - foe.hp)).toBeCloseTo(1.4, 1);
  });

  it('Quake: Rampart Slam casts on one enemy and stuns', () => {
    const run = (withQuake: boolean) => {
      const m = arena();
      const r = P(m, 'A', 'rook');
      const foe = P(m, 'B', 'knight');
      clearBoard(m, [r, foe]);
      place(m, [
        [r, 0, 0],
        [foe, 50, 0],
      ]);
      hold(m, r, ...(withQuake ? ['quake'] : []));
      ready(r);
      const cast = tryCast(m.ctx, r, 2);
      return { cast, stunned: (foe.stunUntil ?? 0) > m.ctx.s.tick };
    };
    expect(run(false)).toEqual({ cast: false, stunned: false });
    expect(run(true)).toEqual({ cast: true, stunned: true });
  });

  it('Steamroller: File Charge may charge a Bastion and hits it for more', () => {
    const m = arena();
    const r = P(m, 'A', 'rook');
    const tower = m.ctx.towers.B.mid[0]!;
    clearBoard(m, [r]);
    for (const u of m.state.units) if (u.kind === 'minion') u.alive = false;
    r.x = tower.x - 80;
    r.y = tower.y;
    m.ctx.grid.clear();
    for (const u of m.state.units) if (u.alive) m.ctx.grid.insert(u);
    ready(r);
    hold(m, r, 'rook_lift');
    expect(tryCast(m.ctx, r, 0)).toBe(false);
    hold(m, r, 'steamroller', 'battering_hits');
    const t0 = tower.hp;
    expect(tryCast(m.ctx, r, 0)).toBe(true);
    expect(tower.hp).toBeLessThan(t0);
  });

  it('Rallying Cry: Rally frees allies from slows and replaces its own speed-up', () => {
    const m = arena();
    const king = P(m, 'A', 'king');
    const ally = P(m, 'A', 'rook');
    const foe = P(m, 'B', 'knight');
    clearBoard(m, [king, ally, foe]);
    place(m, [
      [king, 0, 0],
      [ally, 50, 0],
      [foe, 100, 0],
    ]);
    ally.hp = ally.stats.maxHp * 0.5;
    applyEffect(
      m.ctx,
      { type: 'statMod', stat: 'moveSpeed', kind: 'mul', value: 0.5, durationSec: 5, tags: [] },
      { caster: foe, target: ally, powerMul: 1, origin: 'slow' },
    );
    hold(m, king, 'rallying_cry');
    ready(king);
    expect(tryCast(m.ctx, king, 1)).toBe(true);
    expect(ally.mods.some((x) => x.id === 'slow:moveSpeed')).toBe(false);
    const rally = ally.mods.filter((x) => x.id === 'ability:rally:moveSpeed');
    expect(rally).toHaveLength(1);
    expect(rally[0].value).toBeCloseTo(1.25);
  });
});

describe('movement, retreat and Rank 8', () => {
  it('Shove: heavy hits knock pieces back three times as far (cap included)', () => {
    const kb = (withShove: boolean) => {
      const m = arena();
      const r = P(m, 'A', 'rook');
      const foe = P(m, 'B', 'queen');
      place(m, [
        [r, 0, 0],
        [foe, 30, 0],
      ]);
      hold(m, r, ...(withShove ? ['shove'] : []));
      foe.shields = [];
      dealDamage(m.ctx, r, foe, foe.stats.maxHp * 0.1, 'true', 'test');
      return Math.hypot(foe.knock?.x ?? 0, foe.knock?.y ?? 0);
    };
    const base = kb(false);
    expect(base).toBeGreaterThan(0);
    expect(kb(true)).toBeCloseTo(base * 3, 3);
  });

  it('Rook Lift: File Charge dashes farther and pushes its target', () => {
    const m = arena();
    const r = P(m, 'A', 'rook');
    const foe = P(m, 'B', 'bishop');
    clearBoard(m, [r, foe]);
    place(m, [
      [r, 0, 0],
      [foe, 190, 0],
    ]);
    hold(m, r, 'rook_lift');
    ready(r);
    const x0 = r.x;
    expect(tryCast(m.ctx, r, 0)).toBe(true);
    expect(r.x - x0).toBeGreaterThan(121); // a plain File Charge dashes at most 120
    expect(foe.knock?.x ?? 0).toBeCloseTo(40);
  });

  it('Counterplay halves the retreat line', () => {
    const m = arena();
    const k = P(m, 'A', 'knight');
    hold(m, k);
    const line = retreatLine(m.ctx, k);
    hold(m, k, 'counterplay');
    expect(retreatLine(m.ctx, k)).toBeCloseTo(line * 0.5);
  });

  it('Rank 8 opens no fork (the next offer is Brilliant instead)', () => {
    const m = arena();
    const k = P(m, 'B', 'knight');
    k.hero!.goldEarned = 1e7;
    checkRank(m.ctx, k);
    expect(k.hero!.rank).toBeGreaterThanOrEqual(8);
    expect(k.hero!.perks.some((p) => p.rank === 8)).toBe(false);
    expect(k.hero!.style).not.toBeNull(); // Rank 4 still chooses the archetype
  });
});
