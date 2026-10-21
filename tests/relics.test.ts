import { describe, expect, it } from 'vitest';
import type { HeldRelic, Match, Unit } from '../src/sim';
import { aimFor, type Hint } from '../src/sim/draft';
import { dropBoundCards } from '../src/sim/gambits';
import { fitFormation } from '../src/sim/draft';
import {
  actStartTempo,
  boundCards,
  bountyMul,
  campDamageMul,
  cardCost,
  checkDamageMul,
  formationError,
  handSize,
  heldRelic,
  LANE_SPEED_TAG,
  laneCounts,
  pawnCapBonus,
  pawnCost,
  refillSec,
  structureMul,
  tempoCap,
  tempoRate,
  throneDamageMul,
  wingMelee,
} from '../src/sim/relics';
import { onActStart, onCampCleared } from '../src/sim/relicsLive';
import { recompute } from '../src/sim/stats';
import { makeMinion, makePawn } from '../src/sim/units';
import { content, liveMatch, logHash, piece, toAct, toBell } from './helpers';

const relics = content.tuning.relics;

function breakMatch(seed: number): Match {
  const m = liveMatch(seed, { pauseForBreak: true });
  toBell(m, 'break');
  return m;
}

const hold = (m: Match, team: 'A' | 'B', held: Partial<HeldRelic> & { id: string }) =>
  m.state.relics.held[team].push(heldRelic(held.id, held));

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
      // a lane relic with a stray piece, a piece relic aimed at no piece of yours
      const bad = content.relicById.get(offer.id)!.bind === 'lane' ? { piece: 1 } : { piece: -1 };
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

  it('a problem hint aims defensive relics only: carry relics never land on the piece that fed', () => {
    const m = breakMatch(11);
    for (const team of ['A', 'B'] as const) {
      const report = structuredClone(m.state.bell.report!);
      const foe = team === 'A' ? 'B' : 'A';
      const me = report.teams[team];
      me.bastionsLost = [];
      report.teams[foe].bastionsLost = [];
      me.pawnlingsLost = { top: 30, mid: 0, bot: 0 };
      report.teams[foe].pawnlingsLost = { top: 0, mid: 20, bot: 0 };
      for (const p of me.pieces) Object.assign(p, { kills: 0, deaths: 0, damage: 100 });
      const king = me.pieces.find((p) => p.piece === 'king')!;
      const rook = me.pieces.find((p) => p.piece === 'rook')!;
      king.damage = 900;
      Object.assign(rook, { deaths: 4, lane: 'top' });
      const died: Hint = {
        callout: { id: 'died-rook', severity: 0.75, tone: 'bad', text: '', piece: 'rook' },
        family: 'carry',
        lane: null,
        piece: rook.id,
      };
      const bled: Hint = {
        callout: { id: 'pawnlings-top', severity: 0.6, tone: 'bad', text: '', lane: 'top' },
        family: 'lane',
        lane: 'top',
        piece: null,
      };
      const aim = (id: string, hint: Hint) =>
        aimFor(m.ctx, team, content.relicById.get(id)!, report, hint);
      expect(aim('crown_jewel', died).piece).toBe(king.id);
      expect(aim('development', died).piece).toBe(king.id);
      expect(aim('closed_position', bled).lane).toBe('top');
      expect(aim('half_open_file', bled).lane).toBe('mid');
      expect(aim('guarded_piece', died).piece).toBe(rook.id);
      expect(aim('wing_gambit', bled).lane).toBe('top');
      expect(aim('strong_square', bled).lane).toBe('top');
      expect(aim('battery', bled).lane).toBe('mid');
    }
  });

  it('headless breaks resolve both picks, deterministically', () => {
    const run = (seed: number): Match => {
      const m = liveMatch(seed);
      toAct(m, 3);
      return m;
    };
    // a seed whose match reaches Act 3 (a quick Checkmate in Act 2 has had only one break)
    let seed = 5;
    let a = run(seed);
    while (a.state.phase.n < 3 && seed < 20) a = run(++seed);
    expect(a.state.relics.held.A).toHaveLength(2);
    expect(a.state.relics.held.B).toHaveLength(2);
    expect(logHash(run(seed))).toBe(logHash(a));
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
    expect(stat(m, u, 'moveSpeed') / before).toBeCloseTo(1.08, 5);
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
    expect(stat(m, king, 'bladeDmg') / dmg).toBeCloseTo(1.08, 5);
    expect(stat(m, queen, 'bladeDmg') / other).toBeCloseTo(0.97, 5);
  });

  it('Development pays the piece more gold and its killer more bounty', () => {
    const m = fresh();
    const u = piece(m, 'A', 'bishop');
    expect(stat(m, u, 'maxHp')).toBeGreaterThan(0);
    expect(u.stats.incomeMult).toBe(1);
    hold(m, 'A', { id: 'development', piece: u.id });
    recompute(m.ctx, u);
    expect(u.stats.incomeMult).toBeCloseTo(1.15, 5);
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

  it('relic discounts never bring a card below 3 Tempo', () => {
    const m = fresh();
    // the cheapest card (Increment, 7)
    const sac = content.gambits.reduce((a, b) => (b.cost < a.cost ? b : a));
    const min = content.tuning.gambits.minCost;
    expect(min).toBe(3);
    // Opening Theory's 5 off the cheapest card in the Opening's schools
    m.state.opening.A = content.openings.find((o) => o.schools.includes(sac.school))!.id;
    hold(m, 'A', { id: 'opening_theory' });
    expect(cardCost(m.ctx, 'A', sac)).toBe(min);
    // and Sealed Move's 10 off on top
    expect(cardCost(m.ctx, 'A', sac, 10)).toBe(min);
    expect(m.cardCost(sac.id, 10)).toBe(min);
    expect(cardCost(m.ctx, 'A', content.gambitById.get('fork')!, 10)).toBeGreaterThan(min);
  });

  it('Standing Order keeps a lane card on at 40% strength and out of the deck', () => {
    const m = fresh();
    const u = piece(m, 'A', 'rook');
    const lane = u.hero!.lane!;
    const before = stat(m, u, 'armor');
    const storm = makePawn(m.ctx, 'A', lane);
    const dmg = storm.stats.bladeDmg;
    hold(m, 'A', { id: 'standing_order', lane, card: 'hold_the_file' });
    const strong = content.gambitById.get('hold_the_file')!.params.armorMul;
    expect(stat(m, u, 'armor') / before).toBeCloseTo(1 + (strong - 1) * 0.4, 5);
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

describe('wave 2 relic effects', () => {
  const quiet = (seed = 21): Match =>
    liveMatch(seed, { autoGambits: { A: false, B: false }, relics: { A: 'none', B: 'none' } });
  const put = (u: Unit, x: number, y: number): void => {
    u.x = x;
    u.y = y;
    u.px = x;
    u.py = y;
  };
  const events = (m: Match, type: string) => m.events.filter((e) => e.type === type);
  const outcomes = (m: Match): string[] =>
    m.events.flatMap((e) => (e.type === 'sealedMove' ? [e.payload.outcome] : []));

  it('names 23 relics, four of them Rally', () => {
    expect(content.relics).toHaveLength(23);
    expect(
      content.relics
        .filter((r) => r.rally)
        .map((r) => r.id)
        .sort(),
    ).toEqual(['closed_position', 'compensation', 'kings_ransom', 'sortie']);
  });

  it('Wing Gambit weakens the conceded lane and adds a melee pawnling to the others', () => {
    const m = quiet();
    const tower = m.ctx.towers.A.top[0];
    const before = tower.stats.damageTakenMult;
    hold(m, 'A', { id: 'wing_gambit', lane: 'top' });
    recompute(m.ctx, tower);
    expect(tower.stats.damageTakenMult / before).toBeCloseTo(1.15, 5);
    expect(wingMelee(m.ctx, 'A', 'top')).toBe(0);
    expect(wingMelee(m.ctx, 'A', 'mid')).toBe(1);
    expect(wingMelee(m.ctx, 'B', 'mid')).toBe(0);
  });

  it('Strong Square buffs allies at the crossing and a lone enemy topples it in five seconds', () => {
    const m = quiet();
    hold(m, 'A', { id: 'strong_square', lane: 'top' });
    onActStart(m.ctx);
    const b = m.state.relics.run.banner.A!;
    expect(m.snapshot().zones.some((z) => z.kind === 'outpost' && z.team === 'A')).toBe(true);
    const ally = piece(m, 'A', 'rook');
    const foe = piece(m, 'B', 'rook');
    const armor = stat(m, ally, 'armor');
    put(ally, b.x, b.y);
    m.step(10);
    expect(stat(m, ally, 'armor')).toBeCloseTo(armor + 10, 5);
    put(ally, m.ctx.world.basePos.A.x, m.ctx.world.basePos.A.y);
    for (let i = 0; i < 40 && !b.toppled; i++) {
      put(foe, b.x, b.y);
      m.step(5);
    }
    expect(b.toppled).toBe(true);
    expect(events(m, 'relicTriggered')).toHaveLength(1);
  });

  it('Guarded Piece takes less damage only with a friend within 300', () => {
    const m = quiet();
    const king = piece(m, 'A', 'king');
    const queen = piece(m, 'A', 'queen');
    hold(m, 'A', { id: 'guarded_piece', piece: king.id });
    put(queen, king.x + 100, king.y);
    m.step(10);
    recompute(m.ctx, king);
    expect(king.stats.damageTakenMult).toBeCloseTo(0.88, 5);
    for (const id of m.state.teams.A.heroIds) if (id !== king.id) put(m.unitById(id)!, 9000, 9000);
    put(queen, 9000, 9000);
    m.step(40);
    recompute(m.ctx, king);
    expect(king.stats.damageTakenMult).toBe(1);
  });

  it("Knight's Tour speeds the Knight out of combat and pays Tempo for a cleared camp", () => {
    const m = quiet();
    const knight = piece(m, 'A', 'knight');
    hold(m, 'A', { id: 'knights_tour' });
    m.step(10);
    expect(knight.mods.find((x) => x.id === 'relic:tour')?.value).toBeCloseTo(1.15, 5);
    const camp = m.state.units.find((u) => u.kind === 'camp');
    if (camp) expect(campDamageMul(m.ctx, knight, camp)).toBe(1.25);
    const tempo = m.state.tempo.A;
    onCampCleared(m.ctx, knight);
    expect(m.state.tempo.A).toBe(tempo + 4);
  });

  it("King's Ransom lifts the Check penalty and shields the other pieces, while behind", () => {
    const m = quiet();
    hold(m, 'A', { id: 'kings_ransom' });
    expect(checkDamageMul(m.ctx, 'A')).toBe(content.tuning.check.damageMul);
    m.state.relics.behind.A = true;
    expect(checkDamageMul(m.ctx, 'A')).toBe(1);
    m.state.check.A = true;
    m.step(10);
    const queen = piece(m, 'A', 'queen');
    recompute(m.ctx, queen);
    expect(queen.stats.damageTakenMult).toBeCloseTo(0.9, 5);
    const king = piece(m, 'A', 'king');
    recompute(m.ctx, king);
    expect(king.stats.damageTakenMult).toBe(1);
  });

  it('Pawn Chain adds 4% per neighbour, at most 12%', () => {
    const m = quiet();
    hold(m, 'A', { id: 'pawn_chain' });
    const pawns = [0, 1, 2, 3, 4].map(() => makePawn(m.ctx, 'A', 'mid'));
    pawns.forEach((u, i) => put(u, 500 + i * 10, 500));
    const base = pawns[0].stats.bladeDmg;
    put(pawns[3], 5000, 5000);
    put(pawns[4], 5000, 5000);
    m.step(12);
    expect(stat(m, pawns[0], 'bladeDmg') / base).toBeCloseTo(1.08, 5);
    put(pawns[3], 500, 520);
    put(pawns[4], 500, 530);
    m.step(12);
    expect(stat(m, pawns[0], 'bladeDmg') / base).toBeCloseTo(1.12, 5);
  });

  it('Spare Tempo raises the cap and pays a tenth at the Act start; Compensation works while behind', () => {
    const m = quiet();
    expect(tempoCap(m.ctx, 'A')).toBe(content.tuning.gambits.tempoMax);
    hold(m, 'A', { id: 'spare_tempo' });
    expect(tempoCap(m.ctx, 'A')).toBe(130);
    m.state.tempo.A = 60;
    expect(actStartTempo(m.ctx, 'A')).toBeCloseTo(6, 5);
    m.state.tempo.A = 120;
    expect(actStartTempo(m.ctx, 'A')).toBe(10);
    hold(m, 'A', { id: 'compensation' });
    expect(tempoRate(m.ctx, 'A')).toBe(content.tuning.gambits.tempoPerSec);
    expect(pawnCapBonus(m.ctx, 'A')).toBe(0);
    m.state.relics.behind.A = true;
    expect(tempoRate(m.ctx, 'A')).toBeCloseTo(1.25, 5);
    expect(pawnCapBonus(m.ctx, 'A')).toBe(2);
    hold(m, 'A', { id: 'pawn_majority' });
    expect(pawnCapBonus(m.ctx, 'A')).toBe(relics.pawnCapMax);
  });

  it('Curtain Wall toughens Bastions and mends an outer one that nobody is near', () => {
    const m = quiet();
    const tower = m.ctx.towers.A.top[0];
    const hp = tower.stats.maxHp;
    hold(m, 'A', { id: 'curtain_wall' });
    recompute(m.ctx, tower);
    expect(tower.stats.maxHp / hp).toBeCloseTo(1.15, 5);
    tower.hp = tower.stats.maxHp * 0.5;
    m.step(8 * 20);
    expect(tower.hp).toBeGreaterThan(tower.stats.maxHp * 0.5);
  });

  it('Royal Keep strengthens the Throne and halves Endgame’s extra damage to it', () => {
    const m = quiet();
    const throne = m.ctx.guardians.A!;
    const hp = throne.stats.maxHp;
    const dmg = throne.stats.bladeDmg;
    hold(m, 'A', { id: 'royal_keep' });
    recompute(m.ctx, throne);
    expect(throne.stats.maxHp / hp).toBeCloseTo(1.2, 5);
    expect(throne.stats.bladeDmg / dmg).toBeCloseTo(1.25, 5);
    m.state.tagMult.throneDamage = 1.5;
    expect(throneDamageMul(m.ctx, throne)).toBe(1.25);
    expect(throneDamageMul(m.ctx, m.ctx.guardians.B!)).toBe(1.5);
  });

  it('Quiet Move trims the hand to two, speeds the refill and the Tempo', () => {
    const m = quiet();
    expect(m.state.hands.A).toHaveLength(content.tuning.gambits.handSize);
    hold(m, 'A', { id: 'quiet_move' });
    onActStart(m.ctx);
    expect(m.state.hands.A).toHaveLength(2);
    expect(handSize(m.ctx, 'A')).toBe(2);
    expect(refillSec(m.ctx, 'A')).toBe(4);
    expect(tempoRate(m.ctx, 'A')).toBeCloseTo(1.2, 5);
    m.state.relics.held.A = [];
    onActStart(m.ctx);
    expect(m.state.hands.A).toHaveLength(content.tuning.gambits.handSize);
  });

  it('Battery allows 3/1/1 only while held, buffs the lone pieces, and Resume needs a legal formation', () => {
    const m = breakMatch(7);
    expect(formationError(m.ctx, 'A')).toBeNull();
    hold(m, 'A', { id: 'battery', lane: 'mid' });
    m.state.relics.settled.A = true;
    fitFormation(m.ctx, 'A');
    expect(laneCounts(m.ctx, 'A')).toEqual({ top: 1, mid: 3, bot: 1 });
    expect(formationError(m.ctx, 'A')).toBeNull();
    const lone = m.state.teams.A.heroIds
      .map((id) => m.unitById(id)!)
      .find((u) => u.hero!.lane === 'top')!;
    recompute(m.ctx, lone);
    const buffed = lone.stats.armor;
    m.state.relics.held.A[0].lane = 'top';
    recompute(m.ctx, lone);
    expect(buffed / lone.stats.armor).toBeCloseTo(1.1, 5);
    m.state.relics.held.A[0].lane = 'mid';
    m.state.relics.held.A = [];
    expect(formationError(m.ctx, 'A')).not.toBeNull();
    expect(m.issue({ type: 'resumeAct' }).ok).toBe(false);
    fitFormation(m.ctx, 'A');
    expect(laneCounts(m.ctx, 'A')).toEqual({ top: 2, mid: 1, bot: 2 });
    expect(m.issue({ type: 'resumeAct' }).ok).toBe(true);
  });

  it('Sortie sends the nearest piece from another lane and buffs the lane, once per Bastion', () => {
    const m = quiet();
    hold(m, 'A', { id: 'sortie' });
    m.state.relics.behind.A = true;
    const tower = m.ctx.towers.A.top[0];
    const rotator = m.state.teams.A.heroIds
      .map((id) => m.unitById(id)!)
      .filter((u) => u.hero!.lane !== 'top')
      .sort(
        (a, b) =>
          Math.hypot(a.x - tower.x, a.y - tower.y) - Math.hypot(b.x - tower.x, b.y - tower.y),
      )[0];
    tower.hp = tower.stats.maxHp * 0.4;
    m.step(20);
    expect(rotator.hero!.order?.kind).toBe('defend');
    expect(rotator.hero!.order?.lane).toBe('top');
    expect(rotator.mods.some((x) => x.id === 'relic:sortie:bladeDmg')).toBe(true);
    expect(events(m, 'relicTriggered')).toHaveLength(1);
    m.step(60);
    expect(events(m, 'relicTriggered')).toHaveLength(1);
  });

  it('Sealed Move fires once per Act for 10 less, waits five seconds short of Tempo, then lapses', () => {
    const m = quiet();
    hold(m, 'A', { id: 'sealed_move', card: 'pawn_storm', trigger: 'kill' });
    const cost = content.gambitById.get('pawn_storm')!.cost - 10;
    m.state.tempo.A = 90;
    m.step(40);
    expect(outcomes(m)).toEqual([]);
    m.state.relics.run.enemyDown.A = true;
    m.step(40);
    expect(outcomes(m)).toEqual(['fired']);
    expect(m.state.tempo.A).toBeGreaterThan(90 - cost - 1);
    expect(m.state.tempo.A).toBeLessThan(90 - cost + 8);
    m.state.relics.run.enemyDown.A = true;
    m.step(200);
    expect(outcomes(m)).toEqual(['fired']);

    onActStart(m.ctx);
    m.state.tempo.A = 0;
    m.state.relics.run.enemyDown.A = true;
    m.step(20 * 4);
    expect(outcomes(m)).toEqual(['fired']);
    m.step(20 * 3);
    expect(outcomes(m)).toEqual(['fired', 'lapsed']);
  });

  it('Pawn Structure fields pawns to its quota, 2 cheaper, and keeps the reserve back', () => {
    const m = quiet();
    hold(m, 'A', { id: 'pawn_structure', quota: { top: 2, mid: 0, bot: 1 }, reserve: 20 });
    m.state.tempo.A = 100;
    m.step(20 * 10);
    const pawns = m.state.units.filter((u) => u.pawn && u.team === 'A' && u.alive);
    expect(pawns.filter((u) => u.lane === 'top')).toHaveLength(2);
    expect(pawns.filter((u) => u.lane === 'bot')).toHaveLength(1);
    expect(pawns.filter((u) => u.lane === 'mid')).toHaveLength(0);

    const reserve = quiet();
    hold(reserve, 'A', { id: 'pawn_structure', quota: { top: 1, mid: 1, bot: 1 }, reserve: 40 });
    reserve.state.tempo.A = 30;
    reserve.step(20 * 5);
    expect(reserve.state.units.filter((u) => u.pawn && u.team === 'A')).toHaveLength(0);
  });

  it('refuses a Sealed Move card outside the Opening, a bad quota, and the guarded trigger without a carry relic', () => {
    const m = breakMatch(5);
    const aimOf = (id: string) =>
      aimFor(m.ctx, 'A', content.relicById.get(id)!, m.state.bell.report!);
    m.state.relics.settled.A = false;
    m.state.relics.offers.A = [
      { id: 'sealed_move', tailored: false, why: null, aim: aimOf('sealed_move') },
      { id: 'pawn_structure', tailored: false, why: null, aim: aimOf('pawn_structure') },
    ];
    const schools = content.openingById.get(m.state.opening.A)!.schools;
    const outside = content.gambits.find(
      (g) => schools.length > 0 && !schools.includes(g.school) && g.weight > 0,
    );
    const ok = aimOf('sealed_move');
    const guarded = m.issue({
      type: 'pickRelic',
      relicId: 'sealed_move',
      ...ok,
      trigger: 'guarded',
    });
    expect(guarded.ok).toBe(false);
    if (outside)
      expect(
        m.issue({ type: 'pickRelic', relicId: 'sealed_move', ...ok, card: outside.id }).ok,
      ).toBe(false);
    const quota = { top: 9, mid: 9, bot: 9 };
    const bad = m.issue({
      type: 'pickRelic',
      relicId: 'pawn_structure',
      ...aimOf('pawn_structure'),
      quota,
    });
    expect(bad.ok).toBe(false);
    expect(m.issue({ type: 'pickRelic', relicId: 'sealed_move', ...ok }).ok).toBe(true);
  });
});
