import { describe, expect, it } from 'vitest';
import type { Match } from '../src/sim';
import type { Command, GambitDef, LaneId, PlayTeam, Unit } from '../src/sim';
import { stepToward } from '../src/sim/behavior';
import { dealDamage } from '../src/sim/combat';
import { aiCardPick, cardBlock } from '../src/sim/gambits';
import { content, liveMatch, piece } from './helpers';

const TPS = content.tuning.tickRate;

/** A live match where only the test plays White (no gambit/pawn AI on White). */
const playerMatch = (seed: number): Match =>
  liveMatch(seed, { autoGambits: { A: false, B: false } });

function regrid(m: Match): void {
  m.ctx.grid.clear();
  for (const u of m.state.units) if (u.alive) m.ctx.grid.insert(u);
}

/** Puts one card in White's slot 0 (the other slots empty) with plenty of Tempo. */
function hold(m: Match, cardId: string, tempo = 100, team: PlayTeam = 'A'): GambitDef {
  m.state.hands[team] = m.state.hands[team].map((_, i) => ({
    cardId: i === 0 ? cardId : null,
    expireTick: m.state.tick + 9999,
    refillTick: null,
  }));
  m.state.tempo[team] = tempo;
  return content.gambitById.get(cardId)!;
}

function play(
  m: Match,
  cardId: string,
  extra: Omit<Extract<Command, { type: 'playGambit' }>, 'type' | 'slot'> = {},
) {
  hold(m, cardId);
  regrid(m);
  return m.issue({ type: 'playGambit', slot: 0, ...extra });
}

function kill(m: Match, u: Unit, killer = 0): void {
  u.hp = 0;
  u.pendingKill = { killerId: killer };
  m.step(1);
}

const card = (id: string): GambitDef => content.gambitById.get(id)!;

describe('wave-3 cards in the content', () => {
  it('are universal, weight 1.5, in the schools the spec names', () => {
    const want: [string, string, number, string][] = [
      ['breakthrough', 'march', 13, 'lane'],
      ['pin', 'initiative', 17, 'enemy'],
      ['desperado', 'initiative', 13, 'ally'],
      ['fortify', 'fortress', 17, 'lane'],
    ];
    for (const [id, school, cost, target] of want) {
      expect(card(id)).toMatchObject({ school, cost, target, piece: null, weight: 1.5 });
    }
    expect(card('breakthrough').params).toEqual({ extraMelee: 3 });
    expect(card('pin').params).toEqual({ rootSec: 3, behindR: 300, slowMul: 0.6 });
    expect(card('desperado').params).toEqual({ damageMul: 1.6, hpMax: 0.4, refund: 10 });
    expect(card('fortify').params).toEqual({ shieldPct: 0.2 });
  });
});

describe('Breakthrough', () => {
  /** Fresh pawnlings of a team in a lane after the next wave spawns. */
  function wave(m: Match, team: PlayTeam, lane: LaneId): number {
    const firstId = m.state.nextId;
    m.state.nextWaveTick = m.state.tick + 1;
    m.step(2);
    return m.state.units.filter(
      (u) => u.id >= firstId && u.team === team && u.kind === 'minion' && u.lane === lane,
    ).length;
  }

  it('adds three melee pawnlings to the next wave in that lane only, once', () => {
    const m = playerMatch(60);
    expect(play(m, 'breakthrough', { lane: 'top' }).ok).toBe(true);
    expect(m.state.breakthrough.A.top).toBe(3);
    // the same lane cannot be armed twice, another lane can
    expect(play(m, 'breakthrough', { lane: 'top' }).reason).toMatch(/already/);
    const base = content.tuning.waves;
    const plain = base.melee + base.ranged + (m.state.phase.n >= base.extraMeleeFromPhase ? 1 : 0);
    expect(wave(m, 'A', 'top')).toBe(plain + 3);
    expect(m.state.breakthrough.A.top).toBeUndefined();
    // the lane is back to its normal wave, and Black's waves never changed
    expect(wave(m, 'A', 'top')).toBe(plain);
    const b = playerMatch(60);
    expect(wave(b, 'B', 'top')).toBe(plain);
  });

  it('measures only its own extra pawnlings (3 extra, their Bastion damage)', () => {
    const m = playerMatch(61);
    play(m, 'breakthrough', { lane: 'bot' });
    wave(m, 'A', 'bot');
    const run = m.state.feedback.runs.find((r) => r.cardId === 'breakthrough')!;
    expect(run.met).toBe(3);
    expect(run.ids).toHaveLength(3);
    for (const id of run.ids) expect(m.unitById(id)!.team).toBe('A');
  });
});

describe('Pin', () => {
  it('roots an enemy piece for three seconds; it can still be struck and is not stunned', () => {
    const m = playerMatch(62);
    const foe = piece(m, 'B', 'rook');
    expect(play(m, 'pin', { targetId: piece(m, 'A', 'rook').id }).reason).toMatch(/enemy/);
    expect(play(m, 'pin', { targetId: foe.id }).ok).toBe(true);
    expect(foe.rootUntil).toBe(m.state.tick + 3 * TPS);
    expect(foe.stunUntil).toBeUndefined();
    expect(m.snapshot().units.find((u) => u.id === foe.id)!.pinned).toBe(true);
    const [x, y] = [foe.x, foe.y];
    expect(stepToward(m.ctx, foe, x + 300, y + 300, 1, true)).toBe(0);
    expect([foe.x, foe.y]).toEqual([x, y]);
    m.state.tick += 3 * TPS;
    expect(stepToward(m.ctx, foe, x + 300, y + 300, 1, true)).toBeGreaterThan(0);
    expect(m.snapshot().units.find((u) => u.id === foe.id)!.pinned).toBeUndefined();
  });

  it('slows the enemy piece nearest behind it (toward its own base), not one in front', () => {
    const m = playerMatch(63);
    const home = m.ctx.world.basePos.B;
    const foe = piece(m, 'B', 'rook');
    const behind = piece(m, 'B', 'bishop');
    const front = piece(m, 'B', 'knight');
    // Black's base is the point they retreat to: `behind` sits nearer it than the pinned rook
    foe.x = home.x + (m.ctx.world.basePos.A.x - home.x) * 0.5;
    foe.y = home.y + (m.ctx.world.basePos.A.y - home.y) * 0.5;
    const dx = home.x - foe.x;
    const dy = home.y - foe.y;
    const l = Math.hypot(dx, dy);
    behind.x = foe.x + (dx / l) * 120;
    behind.y = foe.y + (dy / l) * 120;
    front.x = foe.x - (dx / l) * 60;
    front.y = foe.y - (dy / l) * 60;
    for (const u of m.state.teams.B.heroIds.map((id) => m.unitById(id)!))
      if (![foe, behind, front].includes(u)) {
        u.x = home.x;
        u.y = home.y;
      }
    const speed = behind.stats.moveSpeed;
    const frontSpeed = front.stats.moveSpeed;
    expect(play(m, 'pin', { targetId: foe.id }).ok).toBe(true);
    const ev = m.events.filter((e) => e.type === 'gambit').pop()!;
    expect(ev.type === 'gambit' && ev.payload.behindId).toBe(behind.id);
    m.step(1);
    expect(behind.stats.moveSpeed).toBeLessThan(speed);
    expect(front.stats.moveSpeed).toBe(frontSpeed);
    m.step(3 * TPS + 5);
    expect(behind.stats.moveSpeed).toBe(speed);
  });

  it('stops a pinned piece from recalling or dashing', () => {
    const m = playerMatch(64);
    const foe = piece(m, 'B', 'queen');
    foe.hero!.recall = {
      startTick: m.state.tick,
      endTick: m.state.tick + 99,
      dest: 'base',
      auto: false,
    };
    play(m, 'pin', { targetId: foe.id });
    expect(foe.hero!.recall).toBeNull();
  });
});

describe('Desperado', () => {
  it('needs one of your pieces under 40% health, then lifts its damage and nothing else', () => {
    const m = playerMatch(65);
    const rook = piece(m, 'A', 'rook');
    hold(m, 'desperado');
    expect(m.snapshot().hand[0].usable).toBe(false);
    expect(cardBlock(m.ctx, 'A', 0)).toMatch(/under 40%/);
    rook.hp = rook.stats.maxHp * 0.5;
    expect(play(m, 'desperado', { targetId: rook.id }).ok).toBe(false);
    rook.hp = rook.stats.maxHp * 0.3;
    const blade = rook.stats.bladeDmg;
    expect(play(m, 'desperado', { targetId: piece(m, 'B', 'rook').id }).reason).toMatch(/your/);
    expect(play(m, 'desperado', { targetId: rook.id }).ok).toBe(true);
    m.step(1);
    expect(rook.stats.bladeDmg / blade).toBeCloseTo(1.6, 2);
    expect(m.snapshot().units.find((u) => u.id === rook.id)!.desperate).toBe(true);
    m.step(6 * TPS + 2);
    expect(rook.stats.bladeDmg / blade).toBeCloseTo(1, 2);
  });

  it('returns 10 Tempo if the piece falls while it lasts, and not afterwards', () => {
    const m = playerMatch(66);
    const rook = piece(m, 'A', 'rook');
    rook.hp = rook.stats.maxHp * 0.2;
    play(m, 'desperado', { targetId: rook.id });
    m.state.tempo.A = 0;
    kill(m, rook, piece(m, 'B', 'queen').id);
    // 10 back (the clock may also have ticked one Tempo of income in that step)
    expect(m.state.tempo.A).toBeGreaterThanOrEqual(10);
    expect(m.state.tempo.A).toBeLessThanOrEqual(11);

    const n = playerMatch(67);
    const q = piece(n, 'A', 'queen');
    q.hp = q.stats.maxHp * 0.2;
    play(n, 'desperado', { targetId: q.id });
    n.step(6 * TPS + 2);
    n.state.tempo.A = 0;
    kill(n, q, piece(n, 'B', 'queen').id);
    expect(n.state.tempo.A).toBeLessThanOrEqual(1);
  });

  it('is measured: its extra damage and whether the piece fell', () => {
    const m = playerMatch(68);
    const rook = piece(m, 'A', 'rook');
    rook.hp = rook.stats.maxHp * 0.3;
    play(m, 'desperado', { targetId: rook.id });
    const run = m.state.feedback.runs.find((r) => r.cardId === 'desperado')!;
    expect(run.ids).toEqual([rook.id]);
    expect(run.attr).toMatchObject({ on: 'dealt', mul: 1.6 });
    kill(m, rook, piece(m, 'B', 'queen').id);
    expect(run.fell).toBe(true);
  });
});

describe('Fortify', () => {
  const outer = (m: Match, lane: LaneId): Unit => m.ctx.towers.A[lane][0]!;
  const shield = (u: Unit): number => u.shields.reduce((a, s) => a + s.amount, 0);

  it('shields the front Bastion of the lane for 20% of its health for 20 seconds', () => {
    const m = playerMatch(69);
    const tower = outer(m, 'top');
    expect(shield(tower)).toBe(0);
    expect(play(m, 'fortify', { lane: 'top' }).ok).toBe(true);
    expect(shield(tower)).toBeCloseTo(tower.stats.maxHp * 0.2, 3);
    expect(tower.shields[0].expiresTick).toBe(m.state.tick + 20 * TPS);
    expect(shield(m.ctx.towers.A.mid[0]!)).toBe(0);
    // a Bastion that is already shielded is not shielded again
    expect(play(m, 'fortify', { lane: 'top' }).reason).toMatch(/already/);
    m.step(20 * TPS + 2);
    expect(shield(tower)).toBe(0);
  });

  it('falls back to the inner Bastion, then to the Throne', () => {
    const m = playerMatch(70);
    const [o, inner] = m.ctx.towers.A.bot;
    o!.alive = false;
    expect(play(m, 'fortify', { lane: 'bot' }).ok).toBe(true);
    expect(shield(inner!)).toBeGreaterThan(0);
    inner!.alive = false;
    const throne = m.ctx.guardians.A!;
    expect(play(m, 'fortify', { lane: 'bot' }).ok).toBe(true);
    expect(shield(throne)).toBeCloseTo(throne.stats.maxHp * 0.2, 3);
  });

  it('soaks damage before the Bastion loses health, and says how much', () => {
    const m = playerMatch(71);
    const tower = outer(m, 'mid');
    play(m, 'fortify', { lane: 'mid' });
    const soak = shield(tower);
    const hp = tower.hp;
    const foe = piece(m, 'B', 'queen');
    // one hit bigger than the shield, past the structure cap (as Pawn Sacrifice's is)
    dealDamage(m.ctx, foe, tower, soak * 3, 'true', 'test', true);
    expect(shield(tower)).toBe(0);
    expect(hp - tower.hp).toBeGreaterThan(0);
    expect(hp - tower.hp).toBeLessThan(soak * 3 - soak + 1);
    const run = m.state.feedback.runs.find((r) => r.cardId === 'fortify')!;
    expect(run.prevented).toBeCloseTo(soak, 3);
  });
});

describe('wave-3 AI plans', () => {
  /** What White's AI would play from a hand holding only this card. */
  function pick(m: Match, cardId: string): { slot: number; target: unknown } | null {
    hold(m, cardId);
    regrid(m);
    const best = aiCardPick(m.ctx, 'A');
    return best ? { slot: best.slot, target: best.plan.target } : null;
  }
  const fight = (m: Match, ...us: Unit[]): void => {
    for (const u of us) u.lastDamagedTick = m.state.tick;
  };

  it('Desperado: a hurt piece in a fight with an enemy in reach; quiet when healthy or alone', () => {
    const m = playerMatch(72);
    const rook = piece(m, 'A', 'rook');
    const foe = piece(m, 'B', 'rook');
    foe.x = rook.x + 60;
    foe.y = rook.y;
    fight(m, rook);
    expect(pick(m, 'desperado')).toBeNull();
    rook.hp = rook.stats.maxHp * 0.25;
    expect(pick(m, 'desperado')?.target).toEqual({ targetId: rook.id });
    foe.x = rook.x + 3000;
    expect(pick(m, 'desperado')).toBeNull();
  });

  it('Pin: an enemy piece in a fight with two of ours near; quiet with fewer', () => {
    const m = playerMatch(73);
    const foe = piece(m, 'B', 'rook');
    const mine = (['rook', 'queen', 'knight'] as const).map((p) => piece(m, 'A', p));
    for (const u of mine) {
      u.x = foe.x + 40;
      u.y = foe.y;
    }
    mine[2].x = 5;
    mine[2].y = 5;
    mine[1].x = 6;
    mine[1].y = 6;
    fight(m, foe);
    expect(pick(m, 'pin')).toBeNull();
    mine[1].x = foe.x - 40;
    mine[1].y = foe.y;
    mine[2].x = foe.x;
    mine[2].y = foe.y + 40;
    expect(pick(m, 'pin')?.target).toEqual({ targetId: foe.id });
    foe.rootUntil = m.state.tick + 100;
    expect(pick(m, 'pin')).toBeNull();
  });

  it('Fortify: a hurt front Bastion with two enemy pieces near; quiet when whole or alone', () => {
    const m = playerMatch(74);
    const tower = m.ctx.towers.A.top[0]!;
    const foes = [piece(m, 'B', 'rook'), piece(m, 'B', 'queen')];
    for (const f of foes) {
      f.x = tower.x + 100;
      f.y = tower.y;
    }
    expect(pick(m, 'fortify')).toBeNull();
    tower.hp = tower.stats.maxHp * 0.6;
    expect(pick(m, 'fortify')?.target).toEqual({ lane: 'top' });
    foes[1].x = tower.x + 4000;
    expect(pick(m, 'fortify')).toBeNull();
    foes[1].x = tower.x + 100;
    tower.shields.push({ amount: 50, expiresTick: m.state.tick + 100 });
    expect(pick(m, 'fortify')).toBeNull();
  });

  it('Breakthrough: the lane where our pieces push at a weak Bastion; quiet without pieces there', () => {
    const m = playerMatch(75);
    const lanes = m.state.teams.A.heroIds
      .map((id) => m.unitById(id)!)
      .filter((u) => u.hero!.lane === 'top');
    expect(lanes.length).toBeGreaterThanOrEqual(2);
    const wick = m.ctx.towers.B.top[0]!;
    wick.hp = wick.stats.maxHp * 0.7;
    expect(pick(m, 'breakthrough')?.target).toEqual({ lane: 'top' });
    m.state.breakthrough.A.top = 3;
    expect(pick(m, 'breakthrough')?.target).not.toEqual({ lane: 'top' });
    for (const u of lanes) u.hero!.lane = 'mid';
    m.state.breakthrough.A = {};
    const none = pick(m, 'breakthrough');
    expect(none?.target).not.toEqual({ lane: 'top' });
  });
});
