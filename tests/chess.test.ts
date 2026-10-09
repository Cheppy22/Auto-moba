import { describe, expect, it } from 'vitest';
import { Match } from '../src/sim';
import type { Command, GambitDef, LaneId, PlayTeam, SetupEntry, Unit } from '../src/sim';
import { applyEffect, tryCast } from '../src/sim/combat';
import { gambitEffect } from '../src/sim/content/loader';
import { pawnCap, pawnsAlive } from '../src/sim/pawns';
import { buildListOf, attackKindOf } from '../src/sim/pieces';
import { aiForkPick } from '../src/sim/ranks';
import { aiSetup } from '../src/sim/setup';
import { seedStreams } from '../src/sim/core/rng';
import { giveGold } from '../src/sim/shop';
import { content, liveMatch, logHash, piece } from './helpers';

const TPS = content.tuning.tickRate;
const ACT = content.tuning.phaseSeconds * TPS;

/** A live match where only the test plays White (no gambit/pawn AI on White). */
const playerMatch = (seed: number, B = false): Match =>
  liveMatch(seed, { autoGambits: { A: false, B } });

function regrid(m: Match): void {
  m.ctx.grid.clear();
  for (const u of m.state.units) if (u.alive) m.ctx.grid.insert(u);
}

function kill(m: Match, u: Unit, killer = 0): void {
  u.hp = 0;
  u.pendingKill = { killerId: killer };
  m.step(1);
}

/** Puts a card in White's slot 0 with plenty of Tempo. */
function hold(m: Match, cardId: string, tempo = 100): GambitDef {
  m.state.hands.A[0] = { cardId, expireTick: m.state.tick + 9999, refillTick: null };
  m.state.tempo.A = tempo;
  return content.gambitById.get(cardId)!;
}

const cardOf = (effect: string): GambitDef =>
  content.gambits.find((g) => gambitEffect(g) === effect)!;

describe('setup', () => {
  const base = (): SetupEntry[] => Match.create(content, { seed: 1 }).defaultSetup();

  it('pre-fills a valid White setup and seeds Black from the AI pick', () => {
    const a = Match.create(content, { seed: 12 });
    const b = Match.create(content, { seed: 12 });
    expect(a.defaultSetup()).toEqual(b.defaultSetup());
    expect(a.state.setup.B).toEqual(b.state.setup.B);
    const lanes = a.defaultSetup().map((e) => e.lane);
    expect(lanes.filter((l) => l === 'top')).toHaveLength(2);
    expect(lanes.filter((l) => l === 'bot')).toHaveLength(2);
    expect(lanes.filter((l) => l === 'mid')).toHaveLength(1);
  });

  it('rejects bad setups with a reason and accepts a good one', () => {
    const m = Match.create(content, { seed: 2 });
    const bad: [SetupEntry[], RegExp][] = [
      [base().slice(0, 4), /five/],
      [base().map((e, i) => (i === 1 ? { ...e, piece: base()[0].piece } : e)), /twice/],
      [base().map((e, i) => (i === 0 ? { ...e, style: 'nope' } : e)), /style/],
      [base().map((e, i) => (i === 0 ? { ...e, path: 'nope' as never } : e)), /path/],
      [base().map((e) => ({ ...e, lane: 'mid' as LaneId })), /lanes/],
    ];
    for (const [pieces, why] of bad) {
      const r = m.issue({ type: 'setupTeam', pieces });
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(why);
    }
    expect(m.state.phase.kind).toBe('setup');
    const mine = base().map((e) => (e.piece === 'queen' ? { ...e, style: 'duelist' } : e));
    expect(m.issue({ type: 'setupTeam', pieces: mine }).ok).toBe(true);
    expect(piece(m, 'A', 'queen').hero!.style).toBe('duelist');
  });

  it('MatchConfig.setup fixes either side and starts live', () => {
    const B = aiSetup(content, seedStreams(99));
    const m = Match.create(content, { seed: 3, setup: { A: base(), B } });
    expect(m.state.phase.kind).toBe('live');
    for (const e of B) {
      const u = piece(m, 'B', e.piece);
      expect([u.hero!.style, u.hero!.path, u.hero!.lane]).toEqual([e.style, e.path, e.lane]);
    }
    expect(() => Match.create(content, { seed: 3, setup: { A: base().slice(1) } })).toThrow();
  });

  it('a style can override build lists and attack kind', () => {
    const m = playerMatch(4);
    for (const id of m.state.teams.A.heroIds) {
      const h = m.unitById(id)!.hero!;
      const st = content.styleByKey.get(`${h.defId}/${h.style}`)!;
      const pd = content.pieceById.get(h.defId)!;
      expect(buildListOf(content, h)).toEqual(st.paths?.[h.path] ?? pd.paths[h.path]);
      expect(attackKindOf(content, h)).toBe(st.attackKind ?? pd.attackKind);
    }
    const snapPiece = m.snapshot().units.find((u) => u.piece === 'queen' && u.team === 'A')!;
    expect(snapPiece.attackKind).toBe(attackKindOf(content, piece(m, 'A', 'queen').hero!));
  });

  it('setLane and setPath change White pieces only', () => {
    const m = playerMatch(5);
    const rook = piece(m, 'A', 'rook');
    expect(m.issue({ type: 'setLane', heroId: rook.id, lane: 'mid' }).ok).toBe(true);
    expect(rook.hero!.lane).toBe('mid');
    expect(m.snapshot().units.find((u) => u.id === rook.id)!.lane).toBe('mid');
    expect(m.issue({ type: 'setPath', heroId: rook.id, path: 'utility' }).ok).toBe(true);
    expect(rook.hero!.path).toBe('utility');
    const foe = piece(m, 'B', 'rook');
    expect(m.issue({ type: 'setLane', heroId: foe.id, lane: 'mid' }).ok).toBe(false);
    expect(m.issue({ type: 'setPath', heroId: rook.id, path: 'x' as never }).ok).toBe(false);
  });
});

describe('pawnlings and pawns', () => {
  it('pawnling waves still march every lane (not pawns)', () => {
    const m = playerMatch(6);
    m.step(content.tuning.waves.firstSec * TPS + 2);
    const lings = m.state.units.filter((u) => u.kind === 'minion' && !u.pawn && !u.ev);
    for (const lane of ['top', 'mid', 'bot'])
      expect(lings.filter((u) => u.lane === lane).length).toBeGreaterThan(0);
    expect(m.snapshot().units.some((u) => u.pawn)).toBe(false);
  });

  it('fieldPawn costs Tempo, spawns at base in that lane and respects the cap', () => {
    const m = playerMatch(7);
    const cost = content.tuning.pawns.cost;
    m.state.tempo.A = cost - 1;
    expect(m.issue({ type: 'fieldPawn', lane: 'top' }).reason).toMatch(/Tempo/);
    m.state.tempo.A = 1000;
    expect(m.issue({ type: 'fieldPawn', lane: 'bot' }).ok).toBe(true);
    expect(m.state.tempo.A).toBe(1000 - cost);
    const p = m.state.units.find((u) => u.pawn && u.team === 'A')!;
    expect(p.lane).toBe('bot');
    const b = m.ctx.world.basePos.A;
    expect(Math.hypot(p.x - b.x, p.y - b.y)).toBeLessThan(120);
    expect(p.stats.maxHp).toBeGreaterThan(content.tuning.minions.melee.hp * 2);
    const cap = pawnCap(m.ctx);
    expect(cap).toBe(content.tuning.pawns.capBase);
    while (pawnsAlive(m.ctx, 'A') < cap) m.issue({ type: 'fieldPawn', lane: 'mid' });
    expect(m.issue({ type: 'fieldPawn', lane: 'mid' }).reason).toMatch(/cap/);
    const snap = m.snapshot().pawns.A;
    expect(snap).toEqual({ alive: cap, cap, cost });
  });

  it('the cap rises by 2 per Act from Act 4', () => {
    const m = playerMatch(8);
    const p = content.tuning.pawns;
    for (const [act, want] of [
      [1, p.capBase],
      [3, p.capBase],
      [4, p.capBase + p.capPerAct],
      [6, p.capBase + 3 * p.capPerAct],
    ]) {
      m.state.phase.n = act;
      expect(pawnCap(m.ctx)).toBe(want);
    }
  });

  it('a dead pawn is gone for good and pays its killer', () => {
    const m = playerMatch(9);
    m.state.tempo.A = 100;
    m.issue({ type: 'fieldPawn', lane: 'top' });
    const p = m.state.units.find((u) => u.pawn)!;
    const killer = piece(m, 'B', 'knight');
    const gold = killer.hero!.gold;
    const tempo = m.state.tempo.B;
    kill(m, p, killer.id);
    expect(m.unitById(p.id)).toBeUndefined();
    expect(killer.hero!.gold).toBeGreaterThanOrEqual(gold + content.tuning.pawns.bounty);
    expect(m.state.tempo.B).toBeGreaterThan(tempo);
    m.step(ACT);
    expect(m.state.units.filter((u) => u.pawn && u.team === 'A')).toHaveLength(0);
  });
});

describe('ranks and forks', () => {
  it('climbs ranks from lifetime gold and applies the style bonus', () => {
    const m = playerMatch(10);
    const u = piece(m, 'A', 'bishop');
    const th = content.tuning.ranks.goldThresholds;
    const hp1 = u.stats.maxHp;
    giveGold(m.ctx, u, th[2] - u.hero!.goldEarned, 'test');
    expect(u.hero!.rank).toBe(3);
    const ups = m.events.filter((e) => e.type === 'rankUp' && e.payload.id === u.id);
    expect(ups.map((e) => (e.type === 'rankUp' ? e.payload.rank : 0))).toEqual([2, 3]);
    const st = content.styleByKey.get(`bishop/${u.hero!.style}`)!;
    expect(ups[0].type === 'rankUp' && ups[0].payload.bonus).toBe(st.ranks['2'].name);
    expect(u.hero!.perks).toEqual([
      { rank: 2, optionId: null },
      { rank: 3, optionId: null },
    ]);
    m.step(1);
    expect(u.stats.maxHp).toBeGreaterThan(hp1);
  });

  it("White's fork waits forkSec for the player, then the AI pick applies", () => {
    const m = playerMatch(11);
    const u = piece(m, 'A', 'queen');
    giveGold(m.ctx, u, content.tuning.ranks.goldThresholds[3], 'test');
    expect(u.hero!.rank).toBe(4);
    const f = m.snapshot().forks;
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ heroId: u.id, piece: 'queen', rank: 4 });
    expect(f[0].options).toHaveLength(2);
    expect(m.snapshot().units.find((x) => x.id === u.id)!.forkPending).toBe(true);
    const want = aiForkPick(m.ctx, u, 4);
    m.step(content.tuning.ranks.forkSec * TPS + 1);
    expect(m.snapshot().forks).toHaveLength(0);
    expect(u.hero!.perks).toContainEqual({ rank: 4, optionId: want });
    const ev = m.events.find((e) => e.type === 'fork' && e.payload.id === u.id);
    expect(ev?.type === 'fork' && ev.payload.auto).toBe(true);
  });

  it('chooseFork applies the player pick; Black picks at once; several forks can queue', () => {
    const m = playerMatch(12);
    const u = piece(m, 'A', 'rook');
    giveGold(m.ctx, u, content.tuning.ranks.goldThresholds[7], 'test');
    expect(u.hero!.rank).toBe(8);
    expect(m.snapshot().forks.map((f) => f.rank)).toEqual([4, 8]);
    const opt8 = m.snapshot().forks[1].options[1].id;
    expect(m.issue({ type: 'chooseFork', heroId: u.id, optionId: 'nope' }).ok).toBe(false);
    expect(m.issue({ type: 'chooseFork', heroId: u.id, optionId: opt8 }).ok).toBe(true);
    expect(u.hero!.perks).toContainEqual({ rank: 8, optionId: opt8 });
    expect(m.snapshot().forks.map((f) => f.rank)).toEqual([4]);
    const foe = piece(m, 'B', 'rook');
    giveGold(m.ctx, foe, content.tuning.ranks.goldThresholds[3], 'test');
    expect(foe.hero!.perks.some((p) => p.rank === 4 && p.optionId !== null)).toBe(true);
    expect(m.issue({ type: 'chooseFork', heroId: foe.id, optionId: 'x' }).ok).toBe(false);
  });
});

describe('pausing for forks', () => {
  const th = content.tuning.ranks.goldThresholds;
  const pausing = (seed: number, pauseForForks = true): Match =>
    liveMatch(seed, { autoGambits: { A: false, B: true }, pauseForForks });
  /** Leaves the Queen one gold short of Rank 4 so the next passive income opens the fork mid-step. */
  const nearFork = (m: Match): Unit => {
    const u = piece(m, 'A', 'queen');
    giveGold(m.ctx, u, th[2] - u.hero!.goldEarned, 'test');
    u.hero!.goldEarned = th[3] - 1;
    return u;
  };

  it('step halts when a fork opens, stays halted until answered, then proceeds', () => {
    const m = pausing(40);
    const u = nearFork(m);
    const want = aiForkPick(m.ctx, u, 4);
    const got = m.step(ACT);
    expect(got).toBeGreaterThan(0);
    expect(got).toBeLessThan(ACT);
    const tick = m.state.tick;
    const forks = m.snapshot().forks;
    expect(forks).toHaveLength(1);
    expect(forks[0]).toMatchObject({
      heroId: u.id,
      piece: 'queen',
      style: u.hero!.style,
      rank: 4,
      ticksLeft: null,
    });
    // Halted, far past forkSec, with no timeout.
    expect(m.step(content.tuning.ranks.forkSec * TPS * 3)).toBe(0);
    expect(m.state.tick).toBe(tick);
    expect(m.snapshot().forks).toHaveLength(1);
    expect(m.issue({ type: 'chooseFork', heroId: u.id, optionId: 'auto' }).ok).toBe(true);
    expect(u.hero!.perks).toContainEqual({ rank: 4, optionId: want });
    expect(m.step(40)).toBe(40);
    expect(m.snapshot().forks).toHaveLength(0);
  });

  it('autoForks resolves every pending fork with the AI pick; rejects when none wait', () => {
    const m = pausing(41);
    expect(m.issue({ type: 'autoForks' }).ok).toBe(false);
    const u = piece(m, 'A', 'rook');
    giveGold(m.ctx, u, th[7], 'test');
    const k = piece(m, 'A', 'king');
    giveGold(m.ctx, k, th[3], 'test');
    expect(m.snapshot().forks.map((f) => f.rank)).toEqual([4, 8, 4]);
    expect(m.step(10)).toBe(0);
    const w4 = aiForkPick(m.ctx, u, 4);
    const w8 = aiForkPick(m.ctx, u, 8);
    expect(m.issue({ type: 'autoForks' }).ok).toBe(true);
    expect(m.snapshot().forks).toHaveLength(0);
    expect(u.hero!.perks).toContainEqual({ rank: 4, optionId: w4 });
    expect(u.hero!.perks).toContainEqual({ rank: 8, optionId: w8 });
    const evs = m.events.filter((e) => e.type === 'fork');
    expect(evs.every((e) => e.type === 'fork' && e.payload.auto)).toBe(true);
    expect(m.step(10)).toBe(10);
  });

  it("optionId 'auto' equals the timeout pick", () => {
    const timed = pausing(42, false);
    const tu = piece(timed, 'A', 'queen');
    giveGold(timed.ctx, tu, th[3], 'test');
    expect(timed.snapshot().forks[0].ticksLeft).toBe(content.tuning.ranks.forkSec * TPS);
    timed.step(content.tuning.ranks.forkSec * TPS + 1);
    const a = tu.hero!.perks.find((p) => p.rank === 4)!.optionId;
    const paused = pausing(42);
    const pu = piece(paused, 'A', 'queen');
    giveGold(paused.ctx, pu, th[3], 'test');
    paused.issue({ type: 'chooseFork', heroId: pu.id, optionId: 'auto' });
    expect(pu.hero!.perks.find((p) => p.rank === 4)!.optionId).toBe(a);
  });

  it('with the flag off nothing pauses and the timeout still applies', () => {
    const m = pausing(43, false);
    const u = nearFork(m);
    expect(m.step(ACT)).toBe(ACT);
    expect(u.hero!.perks.some((p) => p.rank === 4)).toBe(true);
    expect(m.snapshot().forks).toHaveLength(0);
  });

  it('is deterministic: same seed and commands give the same log hash', () => {
    const run = (): string => {
      const m = pausing(44);
      nearFork(m);
      for (let i = 0; i < 6; i++) {
        if (m.step(ACT) === 0) m.issue({ type: 'autoForks' });
      }
      return logHash(m);
    };
    expect(run()).toBe(run());
  });
});

describe('Check and Checkmate', () => {
  it('King death with the Throne up puts the team in Check until he respawns', () => {
    const m = playerMatch(13);
    const king = piece(m, 'A', 'king');
    const queen = piece(m, 'A', 'queen');
    const foe = piece(m, 'B', 'rook');
    kill(m, king);
    expect(m.state.check.A).toBe(true);
    expect(m.snapshot().check).toEqual({ A: true, B: false });
    expect(m.events.some((e) => e.type === 'check' && e.payload.team === 'A')).toBe(true);
    // A team in Check deals less damage.
    foe.shields = [];
    const hp = foe.hp;
    applyHit(m, queen, foe);
    const inCheck = hp - foe.hp;
    m.state.check.A = false;
    foe.hp = hp;
    applyHit(m, queen, foe);
    const free = hp - foe.hp;
    expect(inCheck / free).toBeCloseTo(content.tuning.check.damageMul, 2);
    m.state.check.A = true;
    const due = king.hero!.respawnAt!;
    m.step(due - m.state.tick + 1);
    expect(king.alive).toBe(true);
    expect(m.state.check.A).toBe(false);
    expect(m.state.winner).toBeNull();
  });

  it('Throne first, King later: the King cannot respawn and his death is checkmate', () => {
    const m = playerMatch(14);
    const g = m.ctx.guardians.A!;
    kill(m, g);
    expect(m.state.throneDown.A).toBe(true);
    expect(m.events.some((e) => e.type === 'throneDown' && e.payload.team === 'A')).toBe(true);
    expect(m.state.phase.kind).toBe('live');
    const king = piece(m, 'A', 'king');
    kill(m, king);
    expect(m.state.phase.kind).toBe('end');
    expect(m.state.winner).toBe('B');
    expect(king.hero!.respawnAt).toBeNull();
    const mate = m.events.filter((e) => e.type === 'checkmate');
    expect(mate).toHaveLength(1);
    expect(mate[0].type === 'checkmate' && mate[0].payload.winner).toBe('B');
  });

  it('King first, Throne later: the Throne falling while he is down is checkmate', () => {
    const m = playerMatch(15);
    kill(m, piece(m, 'B', 'king'));
    expect(m.state.check.B).toBe(true);
    kill(m, m.ctx.guardians.B!);
    expect(m.state.winner).toBe('A');
    expect(m.state.phase.kind).toBe('end');
    expect(m.events.filter((e) => e.type === 'matchEnd')).toHaveLength(1);
  });

  it('Endgame makes Thrones take 50% more damage', () => {
    const m = playerMatch(16);
    const g = m.ctx.guardians.B!;
    for (const lane of ['top', 'mid', 'bot'] as const) m.ctx.towers.B[lane][1]!.alive = false;
    const q = piece(m, 'A', 'queen');
    const hp = g.hp;
    applyHit(m, q, g);
    const plain = hp - g.hp;
    g.hp = hp;
    g.structWindow = undefined;
    m.state.tagMult.throneDamage = 1.5;
    applyHit(m, q, g);
    expect((hp - g.hp) / plain).toBeCloseTo(1.5, 1);
  });
});

function applyHit(m: Match, src: Unit, tgt: Unit): void {
  applyEffect(
    m.ctx,
    { type: 'damage', dmgType: 'true', base: 100, bladeScale: 0, soulScale: 0 },
    {
      caster: src,
      target: tgt,
      powerMul: 1,
      origin: 'test',
    },
  );
}

describe('gambits', () => {
  it('deals the same hands for the same seed, from the gambit stream only', () => {
    const hands = (seed: number): string[] =>
      Match.create(content, { seed, setup: { A: Match.create(content, { seed }).defaultSetup() } })
        .snapshot()
        .hand.map((h) => h.cardId);
    expect(hands(21)).toEqual(hands(21));
    expect(hands(21)).toHaveLength(content.tuning.gambits.handSize);
    const seen = new Set<string>();
    for (let s = 1; s < 12; s++) seen.add(hands(s).join());
    expect(seen.size).toBeGreaterThan(3);
  });

  it('starts teams with tempoStart and earns Tempo over time', () => {
    const m = playerMatch(22);
    expect(m.state.tempo.A).toBe(content.tuning.gambits.tempoStart);
    m.step(10 * TPS);
    expect(m.state.tempo.A).toBeGreaterThan(content.tuning.gambits.tempoStart);
    expect(m.snapshot().tempo.A).toBeLessThanOrEqual(content.tuning.gambits.tempoMax);
  });

  it('refills a played slot after refillSec and replaces an unplayed card after expireSec', () => {
    const m = playerMatch(23);
    hold(m, 'advance');
    expect(m.issue({ type: 'playGambit', slot: 0, lane: 'top' }).ok).toBe(true);
    const snap = m.snapshot().hand[0];
    expect(snap.cardId).toBe('');
    expect(snap.refillTicks).toBe(content.tuning.gambits.refillSec * TPS);
    m.step(content.tuning.gambits.refillSec * TPS + 1);
    expect(m.state.hands.A[0].cardId).not.toBeNull();
    const held = m.state.hands.A[1];
    const exp = held.expireTick;
    m.step(exp - m.state.tick + 1);
    expect(m.state.hands.A[1].expireTick).toBeGreaterThan(exp);
  });

  it('validates slot, Tempo, target and dead signature pieces', () => {
    const m = playerMatch(24);
    expect(m.issue({ type: 'playGambit', slot: 9 }).ok).toBe(false);
    hold(m, 'advance', 0);
    expect(m.issue({ type: 'playGambit', slot: 0, lane: 'top' }).reason).toMatch(/Tempo/);
    hold(m, 'advance');
    expect(m.issue({ type: 'playGambit', slot: 0 }).reason).toMatch(/lane/);
    hold(m, cardOf('check').id);
    const ally = piece(m, 'A', 'rook');
    expect(m.issue({ type: 'playGambit', slot: 0, targetId: ally.id }).reason).toMatch(/enemy/);
    hold(m, cardOf('regroup').id);
    expect(m.issue({ type: 'playGambit', slot: 0 }).reason).toMatch(/point/);
    hold(m, cardOf('queens_gambit').id);
    kill(m, piece(m, 'A', 'queen'));
    expect(m.snapshot().hand[0]).toMatchObject({ usable: false });
    expect(m.issue({ type: 'playGambit', slot: 0 }).reason).toMatch(/down/);
    const t = m.state.tempo.A;
    expect(t).toBeGreaterThan(0);
  });

  it('each card does what it says', () => {
    const m = playerMatch(25);
    m.step(40);
    const play = (
      effect: string,
      extra: Omit<Extract<Command, { type: 'playGambit' }>, 'type' | 'slot'> = {},
    ): GambitDef => {
      const def = hold(m, cardOf(effect).id);
      regrid(m);
      const r = m.issue({ type: 'playGambit', slot: 0, ...extra });
      expect(r.reason ?? 'ok', effect).toBe('ok');
      return def;
    };
    const A = (id: Parameters<typeof piece>[2]): Unit => piece(m, 'A', id);
    const B = (id: Parameters<typeof piece>[2]): Unit => piece(m, 'B', id);
    const mod = (u: Unit, id: string) => u.mods.find((x) => x.id.startsWith(id));

    // Advance: lane pieces get a push order and move speed.
    const topPiece = m.state.teams.A.heroIds
      .map((id) => m.unitById(id)!)
      .find((u) => u.hero!.lane === 'top')!;
    play('advance', { lane: 'top' });
    expect(topPiece.hero!.order?.kind).toBe('push');
    expect(mod(topPiece, 'gambit:advance')?.stat).toBe('moveSpeed');

    // Hold the File: defend order, armor and resist.
    play('hold_the_file', { lane: 'top' });
    expect(topPiece.hero!.order?.kind).toBe('defend');
    expect(mod(topPiece, 'gambit:hold_the_file:a')?.stat).toBe('armor');
    expect(mod(topPiece, 'gambit:hold_the_file:r')?.stat).toBe('resist');

    // Regroup: every living piece gathers.
    const pt = m.ctx.world.basePos.A;
    play('regroup', { x: pt.x, y: pt.y });
    for (const id of m.state.teams.A.heroIds)
      expect(m.unitById(id)!.hero!.order?.kind).toBe('gather');

    // Pawn Storm: lane pawns and pawnlings hit harder and move faster.
    m.state.tempo.A = 100;
    m.issue({ type: 'fieldPawn', lane: 'mid' });
    const pawn = m.state.units.find((u) => u.pawn && u.team === 'A')!;
    play('pawn_storm', { lane: 'mid' });
    expect(mod(pawn, 'gambit:pawn_storm:d')?.stat).toBe('bladeDmg');
    expect(mod(pawn, 'gambit:pawn_storm:m')?.stat).toBe('moveSpeed');

    // Check: the mark raises damage taken and shows on the snapshot.
    const mark = B('queen');
    play('check', { targetId: mark.id });
    expect(mod(mark, 'gambit:check')?.stat).toBe('damageTakenMult');
    expect(m.snapshot().units.find((u) => u.id === mark.id)!.marked).toBe(true);

    // Castle: King and Rook swap places.
    const k = A('king');
    const r = A('rook');
    k.x = 300;
    k.y = 700;
    r.x = 200;
    r.y = 800;
    play('castle');
    expect([k.x, k.y, r.x, r.y]).toEqual([200, 800, 300, 700]);

    // Queen's Gambit: up now, a backlash afterwards.
    const q = A('queen');
    const qg = play('queens_gambit');
    expect(mod(q, 'gambit:queens_gambit:b')?.value).toBeGreaterThan(1);
    m.step(Math.round(qg.durationSec * TPS) + 2);
    expect(mod(q, 'gambit:queens_gambit:after')?.value).toBeLessThan(1);

    // Siege: the Rook gets a structure multiplier and a push order on the target.
    const bastion = m.ctx.towers.B.top[0]!;
    play('siege', { targetId: bastion.id });
    expect(A('rook').hero!.structMul?.value).toBeGreaterThan(1);
    expect(A('rook').hero!.order).toMatchObject({ kind: 'push', targetId: bastion.id });

    // Sanctuary: a zone heals allies inside it.
    const hurt = A('bishop');
    hurt.hp = hurt.stats.maxHp * 0.3;
    play('sanctuary', { x: hurt.x, y: hurt.y });
    expect(m.snapshot().zones).toHaveLength(1);
    const before = hurt.hp;
    hurt.lastDamagedTick = m.state.tick;
    m.step(TPS);
    expect(hurt.hp).toBeGreaterThan(before);

    // Fork: the Knight leaps to an enemy piece in reach and stuns it.
    const kn = A('knight');
    const prey = B('bishop');
    kn.x = 500;
    kn.y = 500;
    prey.x = 600;
    prey.y = 520;
    play('fork', { targetId: prey.id });
    expect(Math.hypot(kn.x - prey.x, kn.y - prey.y)).toBeLessThan(80);
    expect(prey.stunUntil!).toBeGreaterThan(m.state.tick);
    expect(m.snapshot().units.find((u) => u.id === prey.id)!.stunned).toBe(true);
    const gambits = m.events.filter((e) => e.type === 'gambit').length;
    expect(gambits).toBe(10);
  });

  it('the AI plays gambits and fields pawns for Black (and White only when asked)', () => {
    const m = playerMatch(26, true);
    m.step(ACT);
    const by = (t: PlayTeam): number =>
      m.events.filter(
        (e) => (e.type === 'gambit' || e.type === 'pawnFielded') && e.payload.team === t,
      ).length;
    expect(by('B')).toBeGreaterThan(0);
    expect(by('A')).toBe(0);
  });
});

describe('engine effects', () => {
  it('stun stops moving, attacking and casting; taunt forces the target onto the caster', () => {
    const m = playerMatch(30);
    m.step(1);
    const a = piece(m, 'A', 'rook');
    const b = piece(m, 'B', 'queen');
    applyEffect(
      m.ctx,
      { type: 'stun', durationSec: 1 },
      { caster: a, target: b, powerMul: 1, origin: 't' },
    );
    const [x, y] = [b.x, b.y];
    b.hero!.cd = [0, 0, 0, 0];
    m.step(10);
    expect([b.x, b.y]).toEqual([x, y]);
    m.step(TPS);
    applyEffect(
      m.ctx,
      { type: 'taunt', durationSec: 2 },
      { caster: a, target: b, powerMul: 1, origin: 't' },
    );
    m.step(3);
    expect(b.targetId).toBe(a.id);
  });

  it('Knight dashes leap solid terrain and land on walkable ground', async () => {
    const { walkable, clearLine } = await import('../src/sim');
    const m = playerMatch(31);
    const kn = piece(m, 'A', 'knight');
    const t = m.ctx.world.terrain;
    // Find a short line from a walkable point across solid ground to another walkable point.
    let found: { sx: number; sy: number; ex: number; ey: number } | null = null;
    for (let x = 100; x < 900 && !found; x += 20)
      for (let y = 100; y < 900 && !found; y += 20) {
        const ex = x + 120;
        if (
          walkable(t, m.ctx.open, x, y) &&
          walkable(t, m.ctx.open, ex, y) &&
          !clearLine(t, m.ctx.open, x, y, ex, y)
        )
          found = { sx: x, sy: y, ex, ey: y };
      }
    expect(found).not.toBeNull();
    const f = found!;
    kn.x = f.sx;
    kn.y = f.sy;
    const dummy = { ...piece(m, 'B', 'knight'), x: f.ex + 40, y: f.ey };
    applyEffect(
      m.ctx,
      { type: 'dash', distance: 140, toward: 'target', leap: false },
      {
        caster: kn,
        target: dummy as Unit,
        powerMul: 1,
        origin: 't',
      },
    );
    expect(kn.x).toBeGreaterThan(f.sx + 60);
    expect(walkable(t, m.ctx.open, kn.x, kn.y)).toBe(true);
    // A non-leaping piece stops at the cliff.
    const rook = piece(m, 'A', 'rook');
    rook.x = f.sx;
    rook.y = f.sy;
    applyEffect(
      m.ctx,
      { type: 'dash', distance: 140, toward: 'target', leap: false },
      {
        caster: rook,
        target: dummy as Unit,
        powerMul: 1,
        origin: 't',
      },
    );
    expect(clearLine(t, m.ctx.open, f.sx, f.sy, rook.x, rook.y)).toBe(true);
  });

  it('ally skills count nearby enemies for minEnemyHeroes', () => {
    const m = playerMatch(32);
    const caster = piece(m, 'A', 'king');
    const kit = content.kitByKey.get(`king/${caster.hero!.style}`)!;
    const idx = kit.findIndex((a) => a.target === 'allyArea');
    expect(idx).toBeGreaterThanOrEqual(0);
    const saved = kit[idx];
    kit[idx] = {
      ...saved,
      condition: { ...saved.condition, minEnemyHeroes: 1, allyHpBelow: undefined },
    };
    try {
      for (const u of m.state.units) if (u.kind !== 'keeper') u.x = u.y = 0;
      caster.x = 500;
      caster.y = 500;
      const foe = piece(m, 'B', 'rook');
      caster.hero!.cd = [0, 0, 0, 0];
      regrid(m);
      expect(tryCast(m.ctx, caster, idx)).toBe(false);
      foe.x = 540;
      foe.y = 500;
      regrid(m);
      expect(tryCast(m.ctx, caster, idx)).toBe(true);
    } finally {
      kit[idx] = saved;
    }
  });
});

describe('determinism with the chess systems', () => {
  it('same seed and commands give the same log hash', () => {
    const run = (): string => {
      const m = Match.create(content, { seed: 40 });
      m.issue({ type: 'setupTeam', pieces: m.defaultSetup() });
      m.step(400);
      m.issue({ type: 'fieldPawn', lane: 'bot' });
      m.step(ACT);
      return logHash(m);
    };
    expect(run()).toBe(run());
  });
});
