import { describe, expect, it } from 'vitest';
import { Match, type Command } from '../src/sim';
import { grantSpecial } from '../src/sim/curses';
import { recompute } from '../src/sim/stats';
import { content } from './helpers';

function playerMatch(seed: number): Match {
  return Match.create(content, { seed, player: { heroId: 'smelter', role: 'top' } });
}

function pickAnyUpgrade(m: Match): void {
  const id = m.state.playerHeroId!;
  const offer = m.state.upgradeOffers[id];
  if (offer?.length) m.issue({ type: 'pickUpgrade', upgradeId: offer[0] });
}

function answerPrep(m: Match): void {
  pickAnyUpgrade(m);
  const id = m.state.playerHeroId!;
  if (m.state.curseOffers.some((o) => o.heroId === id && !o.resolved))
    m.issue({ type: 'refuseCurse' });
}

function playPhase(m: Match, extra: Command[] = []): void {
  pickAnyUpgrade(m);
  const id = m.state.playerHeroId!;
  if (m.state.curseOffers.some((o) => o.heroId === id && !o.resolved))
    m.issue({ type: 'refuseCurse' });
  for (const c of extra) m.issue(c);
  expect(m.issue({ type: 'startPhase' }).ok).toBe(true);
  m.step(4800);
}

describe('keeper', () => {
  it('moves each phase and stocks three tier-3 items', () => {
    const m = playerMatch(31);
    const first = m.state.keeper.spot;
    expect(m.state.keeper.stock).toHaveLength(3);
    for (const id of m.state.keeper.stock) expect(content.itemById.get(id)!.tier).toBe(3);
    playPhase(m);
    m.issue({ type: 'continue' });
    expect(m.state.keeper.spot).not.toBe(first);
  });

  it('recall to the keeper gives access to its stock in a phase', () => {
    const m = playerMatch(32);
    pickAnyUpgrade(m);
    m.issue({ type: 'startPhase' });
    const p = m.unitById(m.state.playerHeroId!)!;
    p.hero!.gold = 5000;
    const stocked = m.state.keeper.stock[0];
    expect(m.issue({ type: 'buy', itemId: stocked }).ok).toBe(false);
    expect(m.issue({ type: 'recall', dest: 'keeper' }).ok).toBe(true);
    m.step(135);
    const k = m.unitById(m.state.keeper.unitId)!;
    expect(Math.hypot(p.x - k.x, p.y - k.y)).toBeLessThan(40);
    expect(m.issue({ type: 'buy', itemId: stocked }).ok).toBe(true);
    expect(p.hero!.items).toContain(stocked);
  });

  it('recall is interrupted by damage', () => {
    const m = playerMatch(33);
    pickAnyUpgrade(m);
    m.issue({ type: 'startPhase' });
    const p = m.unitById(m.state.playerHeroId!)!;
    expect(m.issue({ type: 'recall', dest: 'base' }).ok).toBe(true);
    p.lastDamagedTick = m.state.tick + 1;
    m.step(5);
    expect(p.hero!.recall).toBeNull();
    expect(m.events.some((e) => e.type === 'recall' && e.payload.stage === 'interrupted')).toBe(
      true,
    );
  });
});

describe('cursed items', () => {
  function cursedSetup(): { m: Match; id: number } {
    const m = playerMatch(41);
    const id = m.state.playerHeroId!;
    playPhase(m);
    for (const t of ['A', 'B'] as const) {
      for (const hid of m.state.teams[t].heroIds) {
        const u = m.unitById(hid)!;
        u.hero!.items = [];
        u.hero!.gold = t === 'A' ? (hid === id ? 0 : 3000) : 6000;
        u.dirty = true;
      }
    }
    m.issue({ type: 'continue' });
    return { m, id };
  }

  it('offers a curse to the furthest-behind hero on the losing team, once', () => {
    const { m, id } = cursedSetup();
    const offers = m.state.curseOffers.filter((o) => o.phase === 2);
    expect(offers).toHaveLength(1);
    expect(offers[0].heroId).toBe(id);
    expect(m.state.teams.A.curseOffers).toBe(1);
  });

  it('blocks the phase until answered, reveals the flaw only on accept, and the boon applies', () => {
    const { m, id } = cursedSetup();
    pickAnyUpgrade(m);
    const r = m.issue({ type: 'startPhase' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/curse/);
    const offer = m.state.curseOffers.find((o) => o.heroId === id && !o.resolved)!;
    const p = m.unitById(id)!;
    expect(p.hero!.flaws[offer.itemId]).toBeUndefined();
    const before = { ...p.stats };
    m.issue({ type: 'acceptCurse' });
    expect(p.hero!.items).toContain(offer.itemId);
    expect(p.hero!.flaws[offer.itemId]).toBeDefined();
    recompute(m.ctx, p);
    expect(JSON.stringify(p.stats)).not.toBe(JSON.stringify(before));
    expect(m.events.some((e) => e.type === 'curseAccepted')).toBe(true);
    expect(m.issue({ type: 'startPhase' }).ok).toBe(true);
  });

  it('can be refused and then nothing changes', () => {
    const { m, id } = cursedSetup();
    pickAnyUpgrade(m);
    m.issue({ type: 'refuseCurse' });
    const p = m.unitById(id)!;
    expect(p.hero!.items).toHaveLength(0);
    expect(m.events.some((e) => e.type === 'curseRefused')).toBe(true);
    expect(m.issue({ type: 'startPhase' }).ok).toBe(true);
  });

  it('supports a Fallen Saint: holy and cursed together', () => {
    const { m, id } = cursedSetup();
    pickAnyUpgrade(m);
    m.issue({ type: 'acceptCurse' });
    const p = m.unitById(id)!;
    grantSpecial(m.ctx, p, content.holy[0].id);
    const held = p.hero!.items;
    expect(held.some((x) => content.cursedById.has(x))).toBe(true);
    expect(held.some((x) => content.holyById.has(x))).toBe(true);
    recompute(m.ctx, p);
    expect(p.stats.maxHp).toBeGreaterThan(0);
  });

  it('keeper debts doubles both the boon and the flaw', () => {
    const m = playerMatch(42);
    const p = m.unitById(m.state.playerHeroId!)!;
    p.hero!.items = ['hungry_mask'];
    p.hero!.flaws.hungry_mask = 'gnaw';
    recompute(m.ctx, p);
    const dmg1 = p.stats.bladeDmg;
    const taken1 = p.stats.damageTakenMult;
    m.state.tagMult.curse = 2;
    recompute(m.ctx, p);
    expect(p.stats.bladeDmg / dmg1).toBeCloseTo(2.0 / 1.5, 5);
    expect(p.stats.damageTakenMult / taken1).toBeCloseTo(1.5 / 1.25, 5);
  });

  it('revives once with the Lantern of the Drowned', () => {
    const m = playerMatch(43);
    const p = m.unitById(m.state.playerHeroId!)!;
    p.hero!.items = ['lantern_of_the_drowned'];
    p.hero!.flaws.lantern_of_the_drowned = 'slow_flame';
    recompute(m.ctx, p);
    pickAnyUpgrade(m);
    m.issue({ type: 'startPhase' });
    p.hp = 0;
    p.pendingKill = { killerId: 0 };
    m.step(2);
    expect(p.alive).toBe(true);
    expect(p.hero!.revived).toBe(true);
    p.hp = 0;
    p.pendingKill = { killerId: 0 };
    m.step(2);
    expect(p.alive).toBe(false);
  });
});

describe('holy auction', () => {
  it('keeps bids sealed, resolves at phase 3, and lets the winning player choose the carrier', () => {
    const m = playerMatch(51);
    const id = m.state.playerHeroId!;
    const p = m.unitById(id)!;
    p.hero!.gold = 5000;
    expect(m.issue({ type: 'bid', points: 0, gold: 5000 }).ok).toBe(true);
    expect(p.hero!.gold).toBe(0);
    expect(m.issue({ type: 'bid', points: 5, gold: 0 }).ok).toBe(false);
    playPhase(m);
    m.issue({ type: 'continue' });
    playPhase(m);
    m.issue({ type: 'continue' });
    expect(m.state.auction.resolved).toBe(false);
    answerPrep(m);
    const r = m.issue({ type: 'startPhase' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/holy/);
    expect(m.state.auction.winner).toBe('A');
    const carrier = m.state.teams.A.heroIds[1];
    expect(m.issue({ type: 'chooseHolyRecipient', heroId: m.state.teams.B.heroIds[0] }).ok).toBe(
      false,
    );
    expect(m.issue({ type: 'chooseHolyRecipient', heroId: carrier }).ok).toBe(true);
    expect(m.unitById(carrier)!.hero!.items).toContain(m.state.auction.holyId);
    expect(m.issue({ type: 'startPhase' }).ok).toBe(true);
    const resolved = m.events.find((e) => e.type === 'auctionResolved');
    expect(resolved).toBeDefined();
    expect(m.issue({ type: 'bid', points: 0, gold: 1 }).ok).toBe(false);
  });

  it('refunds half the losing side gold and spends the points', () => {
    const m = playerMatch(52);
    const id = m.state.playerHeroId!;
    const p = m.unitById(id)!;
    p.hero!.gold = 400;
    expect(m.issue({ type: 'bid', points: 0, gold: 400 }).ok).toBe(true);
    playPhase(m);
    m.issue({ type: 'continue' });
    playPhase(m);
    for (const hid of m.state.teams.B.heroIds) m.unitById(hid)!.hero!.gold = 20000;
    m.issue({ type: 'continue' });
    answerPrep(m);
    const before = p.hero!.gold;
    const go = m.issue({ type: 'startPhase' });
    expect(go.reason ?? 'ok').toBe('ok');
    expect(m.state.auction.winner).toBe('B');
    expect(p.hero!.gold).toBe(before + 200);
  });

  it('AI teams bid by themselves', () => {
    const m = Match.create(content, { seed: 53, player: null });
    for (const t of ['A', 'B'] as const) m.state.teams[t].points = 10;
    m.issue({ type: 'startPhase' });
    m.step(4800);
    m.issue({ type: 'continue' });
    m.issue({ type: 'startPhase' });
    m.step(4800);
    m.issue({ type: 'continue' });
    m.issue({ type: 'startPhase' });
    expect(m.state.auction.resolved).toBe(true);
    expect(m.events.some((e) => e.type === 'bid')).toBe(true);
    expect(m.state.auction.recipient).not.toBeNull();
  });
});

function isolate(m: Match, keep: number[]): void {
  m.state.units = m.state.units.filter((u) => u.kind !== 'minion');
  m.ctx.idx.clear();
  for (const u of m.state.units) m.ctx.idx.set(u.id, u);
  m.state.nextWaveTick = 1e9;
  for (const t of ['A', 'B'] as const) {
    for (const hid of m.state.teams[t].heroIds) {
      if (keep.includes(hid)) continue;
      const u = m.unitById(hid)!;
      u.x = 0;
      u.y = 0;
      u.hero!.recall = { startTick: m.state.tick, endTick: m.state.tick + 99999, dest: 'base' };
    }
  }
}

function hold(m: Match, ids: number[], x: number, y: number, ticks: number): void {
  for (let i = 0; i < ticks / 5; i++) {
    for (const id of ids) {
      const u = m.unitById(id)!;
      u.x = x;
      u.y = y;
      u.hp = u.stats.maxHp;
    }
    m.step(5);
  }
}

describe('obelisks', () => {
  it('spawn on schedule and are claimed by holding the radius', () => {
    const m = Match.create(content, { seed: 61, player: null });
    m.issue({ type: 'startPhase' });
    m.step(1010);
    const ob = m.state.units.find((u) => u.kind === 'obelisk')!;
    expect(ob).toBeDefined();
    const hero = m.state.teams.A.heroIds[0];
    isolate(m, [hero]);
    const pts = m.state.teams.A.points;
    hold(m, [hero], ob.x, ob.y, 130);
    expect(m.events.some((e) => e.type === 'obeliskClaimed' && e.payload.team === 'A')).toBe(true);
    expect(m.state.teams.A.points).toBeGreaterThanOrEqual(pts + content.tuning.obelisk.points);
  });

  it('are contested when both teams stand there', () => {
    const m = Match.create(content, { seed: 62, player: null });
    m.issue({ type: 'startPhase' });
    m.step(1010);
    const ob = m.state.units.find((u) => u.kind === 'obelisk')!;
    const a = m.state.teams.A.heroIds[0];
    const b = m.state.teams.B.heroIds[0];
    isolate(m, [a, b]);
    hold(m, [a, b], ob.x, ob.y, 130);
    expect(m.events.some((e) => e.type === 'obeliskClaimed')).toBe(false);
  });

  it('only spawn during phases one to three', () => {
    const m = Match.create(content, { seed: 63, player: null });
    for (let i = 0; i < 3; i++) {
      m.issue({ type: 'startPhase' });
      m.step(4800);
      m.issue({ type: 'continue' });
    }
    const before = m.events.filter((e) => e.type === 'obeliskSpawn').length;
    m.issue({ type: 'startPhase' });
    m.step(4800);
    expect(m.events.filter((e) => e.type === 'obeliskSpawn').length).toBe(before);
    expect(before).toBeGreaterThan(0);
  });
});
