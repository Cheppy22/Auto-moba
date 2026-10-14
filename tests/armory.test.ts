import { describe, expect, it } from 'vitest';
import { Match, type MatchConfig, type Unit } from '../src/sim';
import { breakShop, nextPurchase } from '../src/sim/ai/shopping';
import { quote } from '../src/sim/shop';
import { content, liveMatch, logHash, piece, toAct, toBell } from './helpers';

const masterwork = content.items.find((i) => i.tier === 3 && i.from.length >= 2)!;
const tier1 = content.items.find((i) => i.tier === 1)!;
const cursed = content.cursed[0].id;

/** A browser-style match at its first Act break (White's relic picked by the AI so Resume is open). */
function atBreak(seed: number, config: Partial<MatchConfig> = {}): Match {
  const m = liveMatch(seed, { pauseForBreak: true, relics: { A: 'ai' }, ...config });
  toBell(m, 'break');
  return m;
}

const breakBuys = (m: Match, ids: number[]) =>
  m.events.filter(
    (e) => e.type === 'purchase' && e.payload.at === 'break' && ids.includes(e.payload.id),
  );

describe('the armory (Act break shop)', () => {
  it('sells every tier, Masterworks included, only at the break', () => {
    const m = liveMatch(5, { pauseForBreak: true, relics: { A: 'ai' } });
    const q = piece(m, 'A', 'queen');
    expect('error' in quote(m.ctx, q, masterwork.id, 'break')).toBe(true);
    expect(m.issue({ type: 'buy', heroId: q.id, item: tier1.id }).reason).toMatch(/Act break/);
    toBell(m, 'break');
    expect(m.state.armory.open).toBe(true);
    q.hero!.items = [];
    q.hero!.gold = 9000;
    expect(m.issue({ type: 'buy', heroId: q.id, item: masterwork.id }).ok).toBe(true);
    expect(q.hero!.items).toContain(masterwork.id);
    const view = m.armoryView(q.id)!;
    expect(view.tiles).toHaveLength(content.items.length);
    expect(view.tiles.filter((t) => t.tier === 3 && t.blocked === null).length).toBeGreaterThan(0);
    expect(view.tiles.find((t) => t.id === masterwork.id)!.blocked).toBe('already owned');
    // Black's pieces are not White's to command
    const bq = piece(m, 'B', 'queen');
    expect(m.issue({ type: 'buy', heroId: bq.id, item: tier1.id }).ok).toBe(false);
    m.issue({ type: 'resumeAct' });
    expect(m.state.armory.open).toBe(false);
    expect(m.issue({ type: 'buy', heroId: q.id, item: tier1.id }).ok).toBe(false);
  });

  it('refuses duplicates and a full bag', () => {
    const m = atBreak(6);
    const q = piece(m, 'A', 'queen');
    q.hero!.items = [];
    q.hero!.gold = 20000;
    expect(m.issue({ type: 'buy', heroId: q.id, item: tier1.id }).ok).toBe(true);
    expect(m.issue({ type: 'buy', heroId: q.id, item: tier1.id }).reason).toBe('already owned');
    q.hero!.items = content.items
      .filter((i) => i.tier === 1)
      .map((i) => i.id)
      .slice(0, 6);
    const other = content.items.find((i) => i.tier === 1 && !q.hero!.items.includes(i.id))!;
    expect(m.issue({ type: 'buy', heroId: q.id, item: other.id }).reason).toBe('no free slot');
  });

  it('consumes owned parts and takes their price off', () => {
    const m = atBreak(7);
    const q = piece(m, 'A', 'queen');
    q.hero!.items = [...masterwork.from];
    q.hero!.gold = 9000;
    const partsCost = masterwork.from.reduce((a, id) => a + content.itemById.get(id)!.cost, 0);
    const price = masterwork.cost - partsCost;
    expect(m.armoryQuote(q.id, masterwork.id)).toEqual({
      price,
      consumed: [...masterwork.from],
    });
    expect(m.issue({ type: 'buy', heroId: q.id, item: masterwork.id }).ok).toBe(true);
    expect(q.hero!.items).toEqual([masterwork.id]);
    expect(q.hero!.gold).toBe(9000 - price);
  });

  it('sells for half the price; cursed items cannot be sold', () => {
    const m = atBreak(8);
    const q = piece(m, 'A', 'queen');
    q.hero!.items = [tier1.id, cursed];
    q.hero!.gold = 0;
    expect(m.armoryView(q.id)!.sellRefund).toEqual({
      [tier1.id]: Math.round(tier1.cost * content.tuning.shop.sellRefund),
      [cursed]: null,
    });
    expect(m.issue({ type: 'sell', heroId: q.id, item: tier1.id }).ok).toBe(true);
    expect(q.hero!.gold).toBe(Math.round(tier1.cost * 0.5));
    expect(m.issue({ type: 'sell', heroId: q.id, item: cursed }).reason).toMatch(/cursed/);
    expect(q.hero!.items).toEqual([cursed]);
    expect(m.state.armory.touched).toEqual([q.id]);
  });

  it('a plan drives what the piece buys, during the break and the next Act', () => {
    const m = atBreak(9);
    const q = piece(m, 'A', 'queen');
    const h = q.hero!;
    const plan = content.items
      .filter((i) => i.tier === 1 && !h.items.includes(i.id))
      .slice(0, 6)
      .map((i) => i.id);
    expect(m.issue({ type: 'setPlan', heroId: q.id, plan: plan.slice(0, 5) }).ok).toBe(false);
    expect(
      m.issue({ type: 'setPlan', heroId: q.id, plan: [plan[0], plan[0], ...plan.slice(2)] }).ok,
    ).toBe(false);
    expect(m.issue({ type: 'setPlan', heroId: q.id, plan: [cursed, ...plan.slice(1)] }).ok).toBe(
      false,
    );
    expect(m.issue({ type: 'setPlan', heroId: q.id, plan }).ok).toBe(true);
    h.gold = 10000;
    expect(m.armoryView(q.id)).toMatchObject({ plan, customPlan: true, suggestion: plan[0] });
    expect(m.nextBuy(q.id)).toBe(plan[0]);
    expect(nextPurchase(m.ctx, q, 'base')?.id).toBe(plan[0]);
    // changing the path resets the plan to the path's list
    const other = h.path === 'offense' ? 'defense' : 'offense';
    m.issue({ type: 'setPath', heroId: q.id, path: other });
    expect(h.plan).toBeNull();
    expect(m.armoryView(q.id)!.customPlan).toBe(false);
  });

  it('untouched pieces shop on Resume; a piece you shopped for keeps its gold', () => {
    const m = atBreak(10);
    const white = m.state.teams.A.heroIds.map((id) => m.unitById(id)!);
    for (const u of white) u.hero!.gold = 3000;
    const q = piece(m, 'A', 'queen');
    const cheap = content.items.find(
      (i) => i.tier === 1 && !q.hero!.items.includes(i.id) && !i.from.length,
    )!;
    expect(m.issue({ type: 'buy', heroId: q.id, item: cheap.id }).ok).toBe(true);
    expect(breakBuys(m, m.state.teams.A.heroIds)).toHaveLength(1);
    expect(m.issue({ type: 'resumeAct' }).ok).toBe(true);
    expect(q.hero!.gold).toBe(3000 - cheap.cost);
    for (const u of white.filter((x) => x.id !== q.id)) expect(u.hero!.gold).toBeLessThan(3000);
    expect(breakBuys(m, [q.id])).toHaveLength(1);
  });

  it('"Let the AI shop" buys for one piece now, like the break shop', () => {
    const m = atBreak(11);
    const q = piece(m, 'A', 'queen');
    q.hero!.gold = 4000;
    const want = m.armoryView(q.id)!.suggestion;
    expect(want).not.toBeNull();
    expect(m.issue({ type: 'autoShop', heroId: q.id }).ok).toBe(true);
    expect(breakBuys(m, [q.id]).map((e) => e.type === 'purchase' && e.payload.item)[0]).toBe(want);
    expect(q.hero!.gold).toBeLessThan(4000);
  });

  it('Black shops at the break by the AI, before the sheet; headless, White shops first', () => {
    const m = atBreak(12);
    const black = m.state.teams.B.heroIds;
    const n = breakBuys(m, black).length;
    expect(n).toBeGreaterThan(0);
    expect(breakBuys(m, m.state.teams.A.heroIds)).toHaveLength(0);

    const h = liveMatch(12);
    toAct(h, 2);
    const order = h.events
      .filter((e) => e.type === 'purchase' && e.payload.at === 'break')
      .map((e) =>
        e.type === 'purchase' && h.state.teams.A.heroIds.includes(e.payload.id) ? 'A' : 'B',
      );
    expect(order.length).toBeGreaterThan(0);
    expect(order.join('')).toMatch(/^A*B*$/);
  });

  it('the break shop is the same for either side (180° rule)', () => {
    const probe = Match.create(content, { seed: 13 });
    const setup = probe.defaultSetup();
    const m = Match.create(content, { seed: 13, setup: { A: setup, B: setup } });
    m.state.armory.open = true;
    const buys = (u: Unit): string[] => {
      u.hero!.items = [];
      u.hero!.gold = 6000;
      breakShop(m.ctx, u);
      return u.hero!.items.slice();
    };
    for (const id of ['queen', 'rook', 'bishop'] as const) {
      const a = piece(m, 'A', id);
      const b = piece(m, 'B', id);
      b.hero!.path = a.hero!.path;
      expect(buys(b)).toEqual(buys(a));
      expect(b.hero!.gold).toBe(a.hero!.gold);
    }
  });

  it('replays a match with buys, sells and plan changes exactly', () => {
    const m = atBreak(14);
    const q = piece(m, 'A', 'queen');
    const r = piece(m, 'A', 'rook');
    m.issue({ type: 'buy', heroId: q.id, item: tier1.id });
    if (q.hero!.items.length) m.issue({ type: 'sell', heroId: q.id, item: q.hero!.items[0] });
    const plan = content.items
      .filter((i) => i.tier === 2)
      .slice(0, 6)
      .map((i) => i.id);
    m.issue({ type: 'setPlan', heroId: r.id, plan });
    m.issue({ type: 'autoShop', heroId: r.id });
    m.issue({ type: 'resumeAct' });
    toBell(m, 'break');
    m.issue({ type: 'resumeAct' });
    m.step(600);
    const again = Match.fromReplay(content, JSON.parse(JSON.stringify(m.exportReplay())));
    expect(logHash(again)).toBe(logHash(m));
    expect(again.state.tick).toBe(m.state.tick);
    expect(piece(again, 'A', 'rook').hero!.plan).toEqual(plan);
  });
});
