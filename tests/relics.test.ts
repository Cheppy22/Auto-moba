import { describe, expect, it } from 'vitest';
import type { Match, Unit } from '../src/sim';
import { dropBoundCards } from '../src/sim/gambits';
import {
  boundCards,
  bountyMul,
  cardCost,
  LANE_SPEED_TAG,
  pawnCapBonus,
  pawnCost,
  structureMul,
} from '../src/sim/relics';
import { recompute } from '../src/sim/stats';
import { makeMinion, makePawn } from '../src/sim/units';
import { content, liveMatch, logHash, piece, toAct, toBell } from './helpers';

const relics = content.tuning.relics;

function breakMatch(seed: number): Match {
  const m = liveMatch(seed, { pauseForBreak: true });
  toBell(m, 'break');
  return m;
}

const hold = (m: Match, team: 'A' | 'B', held: Partial<Match['state']['relics']['held']['A'][0]>) =>
  m.state.relics.held[team].push({ id: '', lane: null, piece: null, card: null, ...held });

function stat(m: Match, u: Unit, key: 'moveSpeed' | 'armor' | 'maxHp' | 'bladeDmg') {
  recompute(m.ctx, u);
  return u.stats[key];
}

describe('relic draft', () => {
  it('offers three relics from three families, held ones never come back, and the same seed offers the same', () => {
    const a = breakMatch(11);
    const b = breakMatch(11);
    const offers = a.snapshot().relics.offers;
    expect(offers).toHaveLength(relics.offers);
    const families = offers.map((o) => content.relicById.get(o.id)!.family);
    expect(new Set(families).size).toBe(offers.length);
    expect(b.snapshot().relics.offers).toEqual(offers);
    expect(a.state.relics.held.B).toHaveLength(1);
    expect(a.state.relics.latest.B).toBe(a.state.relics.held.B[0].id);

    const m = a;
    const seen: string[] = [];
    for (let act = 1; act <= 4 && m.state.bell.stage === 'break'; act++) {
      const open = m.snapshot().relics.offers;
      for (const o of open) expect(m.state.relics.held.A.map((h) => h.id)).not.toContain(o.id);
      expect(new Set(m.state.relics.held.B.map((h) => h.id)).size).toBe(
        m.state.relics.held.B.length,
      );
      expect(m.issue({ type: 'resumeAct' }).ok).toBe(false);
      expect(m.issue({ type: 'autoRelic' }).ok).toBe(true);
      seen.push(...m.state.relics.held.A.map((h) => h.id));
      expect(m.state.relics.held.A.length).toBeLessThanOrEqual(relics.max);
      expect(m.issue({ type: 'resumeAct' }).ok).toBe(true);
      toBell(m, 'break');
    }
    expect(seen.length).toBeGreaterThan(0);
  });

  it('is locked until a pick, needs an aim, and a fourth relic replaces one or is declined', () => {
    const m = breakMatch(5);
    const offer = m.snapshot().relics.offers.find((o) => {
      const def = content.relicById.get(o.id)!;
      return def.bind === 'lane' || def.bind === 'piece';
    });
    expect(m.issue({ type: 'resumeAct' }).ok).toBe(false);
    expect(m.issue({ type: 'pickRelic', relicId: 'nonsense' }).ok).toBe(false);
    if (offer) {
      const bad = content.relicById.get(offer.id)!.bind === 'lane' ? { piece: 1 } : {};
      const wrong = m.issue({
        type: 'pickRelic',
        relicId: offer.id,
        lane: 'nowhere' as 'top',
        ...bad,
      });
      expect(wrong.ok).toBe(false);
    }
    expect(m.issue({ type: 'declineRelic' }).ok).toBe(false);
    const first = m.snapshot().relics.offers[0];
    expect(m.issue({ type: 'pickRelic', relicId: first.id, ...first.aim }).ok).toBe(true);
    expect(m.state.relics.held.A.map((h) => h.id)).toContain(first.id);
    expect(m.issue({ type: 'resumeAct' }).ok).toBe(true);

    const full = breakMatch(6);
    const spare = content.relics
      .map((r) => r.id)
      .filter((id) => !full.state.relics.offers.A.some((o) => o.id === id));
    for (const id of spare.slice(0, relics.max)) hold(full, 'A', { id });
    const o = full.snapshot().relics.offers[0];
    expect(full.issue({ type: 'pickRelic', relicId: o.id, ...o.aim }).reason).toMatch(/replace/);
    const drop = full.state.relics.held.A[0].id;
    expect(full.issue({ type: 'pickRelic', relicId: o.id, ...o.aim, replace: drop }).ok).toBe(true);
    expect(full.state.relics.held.A).toHaveLength(relics.max);
    expect(full.state.relics.held.A.map((h) => h.id)).not.toContain(drop);

    const decline = breakMatch(6);
    for (const id of spare.slice(0, relics.max)) hold(decline, 'A', { id });
    expect(decline.issue({ type: 'declineRelic' }).ok).toBe(true);
    expect(decline.issue({ type: 'resumeAct' }).ok).toBe(true);
  });

  it('re-aims a held relic for free at a break only', () => {
    const m = breakMatch(9);
    const o = m.snapshot().relics.offers.find((x) => content.relicById.get(x.id)!.bind === 'lane');
    const pick = o ?? m.snapshot().relics.offers[0];
    m.issue({ type: 'pickRelic', relicId: pick.id, ...pick.aim });
    const def = content.relicById.get(pick.id)!;
    if (def.bind === 'lane') {
      const lane = pick.aim.lane === 'top' ? 'bot' : 'top';
      expect(m.issue({ type: 'aimRelic', relicId: pick.id, lane }).ok).toBe(true);
      expect(m.state.relics.held.A.find((h) => h.id === pick.id)!.lane).toBe(lane);
    }
    m.issue({ type: 'resumeAct' });
    expect(m.issue({ type: 'aimRelic', relicId: pick.id, lane: 'mid' }).ok).toBe(false);
  });

  it('headless breaks resolve both picks, deterministically', () => {
    const run = (seed: number): Match => {
      const m = liveMatch(seed);
      toAct(m, 3);
      return m;
    };
    const a = run(3);
    expect(a.state.relics.held.A).toHaveLength(2);
    expect(a.state.relics.held.B).toHaveLength(2);
    expect(logHash(run(3))).toBe(logHash(a));
    const off = liveMatch(3, { relics: { A: 'none', B: 'none' } });
    toAct(off, 3);
    expect(off.state.relics.held.A).toHaveLength(0);
    expect(off.state.relics.held.B).toHaveLength(0);
    const random = liveMatch(3, { relics: { A: 'random', B: 'random' } });
    toAct(random, 3);
    expect(random.state.relics.held.A.length).toBeGreaterThan(0);
  });
});

describe('wave 1 relic effects', () => {
  const fresh = (): Match => liveMatch(21);

  it('Half-Open File speeds the bound lane and slows the others, under the lane speed cap', () => {
    const m = fresh();
    const u = piece(m, 'A', 'queen');
    const lane = u.hero!.lane!;
    const before = stat(m, u, 'moveSpeed');
    hold(m, 'A', { id: 'half_open_file', lane });
    expect(stat(m, u, 'moveSpeed') / before).toBeCloseTo(1.12, 5);
    m.state.relics.held.A[0].lane = lane === 'top' ? 'bot' : 'top';
    expect(stat(m, u, 'moveSpeed') / before).toBeCloseTo(0.96, 5);

    m.state.relics.held.A[0].lane = lane;
    hold(m, 'A', { id: 'standing_order', lane, card: 'open_file' });
    u.mods.push({
      id: 'gambit:advance',
      stat: 'moveSpeed',
      kind: 'mul',
      value: 1.1,
      source: 'test',
      tags: [LANE_SPEED_TAG],
      expiresTick: null,
    });
    expect(stat(m, u, 'moveSpeed') / before).toBeCloseTo(1 + relics.laneSpeedCap, 5);
  });

  it('Closed Position works only while behind: Bastions take less, pieces gain armor, pawnlings hit softer', () => {
    const m = fresh();
    const u = piece(m, 'A', 'rook');
    const lane = u.hero!.lane!;
    const tower = m.ctx.towers.A[lane][0];
    const before = { armor: stat(m, u, 'armor'), taken: tower.stats.damageTakenMult };
    const pawnling = makeMinion(m.ctx, 'A', lane, 'melee', 1, 0);
    const dmg = pawnling.stats.bladeDmg;
    hold(m, 'A', { id: 'closed_position', lane });
    expect(stat(m, u, 'armor')).toBe(before.armor);
    m.state.relics.behind.A = true;
    expect(stat(m, u, 'armor') / before.armor).toBeCloseTo(1.1, 5);
    recompute(m.ctx, tower);
    expect(tower.stats.damageTakenMult / before.taken).toBeCloseTo(0.8, 5);
    expect(stat(m, pawnling, 'bladeDmg') / dmg).toBeCloseTo(0.85, 5);
  });

  it('Crown Jewel lifts one piece and costs the other four', () => {
    const m = fresh();
    const king = piece(m, 'A', 'king');
    const queen = piece(m, 'A', 'queen');
    const hp = stat(m, king, 'maxHp');
    const dmg = stat(m, king, 'bladeDmg');
    const other = stat(m, queen, 'bladeDmg');
    hold(m, 'A', { id: 'crown_jewel', piece: king.id });
    expect(stat(m, king, 'maxHp') / hp).toBeCloseTo(1.08, 5);
    expect(stat(m, king, 'bladeDmg') / dmg).toBeCloseTo(1.12, 5);
    expect(stat(m, queen, 'bladeDmg') / other).toBeCloseTo(0.97, 5);
  });

  it('Development pays the piece more gold and its killer more bounty', () => {
    const m = fresh();
    const u = piece(m, 'A', 'bishop');
    expect(stat(m, u, 'maxHp')).toBeGreaterThan(0);
    expect(u.stats.incomeMult).toBe(1);
    hold(m, 'A', { id: 'development', piece: u.id });
    recompute(m.ctx, u);
    expect(u.stats.incomeMult).toBeCloseTo(1.2, 5);
    expect(bountyMul(m.ctx, u)).toBe(1.5);
    expect(bountyMul(m.ctx, piece(m, 'A', 'king'))).toBe(1);
  });

  it('Pawn Majority cheapens pawns, adds at most two to the cap, and thins their health', () => {
    const m = fresh();
    const plain = makePawn(m.ctx, 'A', 'mid').stats.maxHp;
    expect(pawnCost(m.ctx, 'A')).toBe(content.tuning.pawns.cost);
    hold(m, 'A', { id: 'pawn_majority' });
    expect(pawnCost(m.ctx, 'A')).toBe(12);
    expect(pawnCapBonus(m.ctx, 'A')).toBe(2);
    expect(makePawn(m.ctx, 'A', 'mid').stats.maxHp / plain).toBeCloseTo(0.9, 5);
    hold(m, 'A', { id: 'pawn_majority' });
    expect(pawnCapBonus(m.ctx, 'A')).toBe(relics.pawnCapMax);
  });

  it('Pawn Lever hits structures harder from the bound lane only', () => {
    const m = fresh();
    const pawn = makePawn(m.ctx, 'A', 'top');
    expect(structureMul(m.ctx, pawn)).toBe(1);
    hold(m, 'A', { id: 'pawn_lever', lane: 'top' });
    expect(structureMul(m.ctx, pawn)).toBe(1.2);
    expect(structureMul(m.ctx, makeMinion(m.ctx, 'A', 'top', 'melee', 1, 0))).toBe(1.2);
    expect(structureMul(m.ctx, makePawn(m.ctx, 'A', 'bot'))).toBe(1);
    expect(structureMul(m.ctx, makePawn(m.ctx, 'B', 'top'))).toBe(1);
  });

  it('Opening Theory trims the Opening schools and charges the rest; Italian is a flat discount', () => {
    const m = fresh();
    const card = (id: string) => content.gambitById.get(id)!;
    m.state.opening.A = 'sicilian';
    expect(cardCost(m.ctx, 'A', card('advance'))).toBe(card('advance').cost);
    hold(m, 'A', { id: 'opening_theory' });
    expect(cardCost(m.ctx, 'A', card('advance'))).toBe(card('advance').cost - 5);
    expect(cardCost(m.ctx, 'A', card('hold_the_file'))).toBe(card('hold_the_file').cost + 5);
    m.state.opening.A = 'italian';
    expect(cardCost(m.ctx, 'A', card('advance'))).toBe(card('advance').cost - 2);
  });

  it('Standing Order keeps a lane card on at half strength and out of the deck', () => {
    const m = fresh();
    const u = piece(m, 'A', 'rook');
    const lane = u.hero!.lane!;
    const before = stat(m, u, 'armor');
    const storm = makePawn(m.ctx, 'A', lane);
    const dmg = storm.stats.bladeDmg;
    hold(m, 'A', { id: 'standing_order', lane, card: 'hold_the_file' });
    const strong = content.gambitById.get('hold_the_file')!.params.armorMul;
    expect(stat(m, u, 'armor') / before).toBeCloseTo(1 + (strong - 1) / 2, 5);
    m.state.relics.held.A[0].card = 'pawn_storm';
    const stormMul = content.gambitById.get('pawn_storm')!.params.damageMul;
    expect(stat(m, storm, 'bladeDmg') / dmg).toBeCloseTo(1 + (stormMul - 1) * 0.3333, 3);

    m.state.relics.held.A[0].card = 'advance';
    expect(boundCards(m.ctx, 'A')).toEqual(['advance']);
    dropBoundCards(m.ctx, 'A');
    for (let i = 0; i < 6; i++) {
      m.step(600);
      expect(m.state.hands.A.map((h) => h.cardId)).not.toContain('advance');
    }
  });
});
