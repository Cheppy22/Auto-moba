import { describe, expect, it } from 'vitest';
import {
  COURT_EMBLEMS,
  CourtFileSchema,
  PIECE_IDS,
  Match,
  courtOf,
  generateOpponents,
  loadContent,
  newRun,
  nextMatchConfig,
  recordResult,
  revealOpponent,
  validateSetup,
  type Content,
} from '../src/sim';
import { readRawContent } from '../tools/content-node';
import { content, piece } from './helpers';

const T = content.tournament!;
const courts = content.courts;

describe('Named courts (3B): content', () => {
  it('are ten, tiered 3 Club, 3 County, 2 Semifinal, 2 Final, with the Black Queen in the Final', () => {
    expect(courts).toHaveLength(10);
    expect([1, 2, 3, 4].map((r) => courts.filter((k) => k.round === r).length)).toEqual([
      3, 3, 2, 2,
    ]);
    expect(courts.filter((k) => k.round === 4).map((k) => k.name)).toContain(T.finalName);
    expect(new Set(courts.map((k) => k.id)).size).toBe(10);
    expect(new Set(courts.map((k) => k.name)).size).toBe(10);
    expect(new Set(courts.map((k) => k.seal.emblem)).size).toBe(10);
    expect(new Set(courts.map((k) => k.signature.relic)).size).toBe(10);
  });

  it('every court is valid against the schema and plays as a legal Black court', () => {
    expect(() => CourtFileSchema.parse({ courts })).not.toThrow();
    for (const k of courts) {
      expect(validateSetup(content, { opening: k.opening, pieces: k.pieces }), k.id).toBeNull();
      for (const id of PIECE_IDS)
        expect(content.styleByKey.has(`${id}/${k.styles[id]}`), `${k.id} ${id}`).toBe(true);
      expect(k.styles[k.portrait.piece], `${k.id} portrait`).toBe(k.portrait.style);
      expect(COURT_EMBLEMS).toContain(k.seal.emblem);
      expect(content.relicById.has(k.signature.relic), k.id).toBe(true);
      // short lines, no stray whitespace
      expect(k.motto.length, `${k.id} motto`).toBeLessThanOrEqual(60);
      expect(k.manner.length, `${k.id} manner`).toBeLessThanOrEqual(110);
      expect(k.name).toBe(k.name.trim());
    }
  });

  it('content that points at nothing is refused at load', () => {
    const raw = readRawContent();
    const bad = (patch: (k: (typeof courts)[number]) => void): Content => {
      const file = structuredClone(raw.courts) as { courts: typeof courts };
      patch(file.courts[0]);
      return loadContent({ ...raw, courts: file });
    };
    expect(() => bad((k) => (k.opening = 'nope'))).toThrow(/unknown opening/);
    expect(() => bad((k) => (k.signature.relic = 'nope'))).toThrow(/signature relic/);
    expect(() => bad((k) => (k.styles.queen = 'nope'))).toThrow(/no archetype/);
    expect(() => bad((k) => (k.portrait.style = 'regent'))).toThrow(/portrait/);
    expect(() => bad((k) => (k.pieces[0].lane = 'mid'))).toThrow(/lanes need/);
    expect(() => bad((k) => (k.signature.lane = 'top'))).toThrow(/not aimed at a lane/);
    // without a courts file the run falls back to generated courts
    const none = loadContent({ ...raw, courts: undefined });
    expect(none.courts).toEqual([]);
    expect(generateOpponents(none, 3).every((o) => !o.courtId)).toBe(true);
  });
});

describe('Named courts (3B): the draw', () => {
  it('is the same for the same seed, one court per round from that round, with the table kept', () => {
    const a = generateOpponents(content, 77);
    expect(generateOpponents(content, 77)).toEqual(a);
    expect(a.map((o) => o.round)).toEqual([1, 2, 3, 4]);
    a.forEach((o, i) => {
      const k = courtOf(content, o)!;
      expect(k.round).toBe(i + 1);
      expect(o.name).toBe(k.name);
      expect(o.setup).toEqual({
        opening: k.opening,
        // Techniques on: each piece carries the court's fixed first move
        pieces: k.pieces.map((e) => ({ ...e, firstMove: k.firstMoves![e.piece] })),
      });
      expect(o.styles).toEqual(k.styles);
      expect(o.tempoBonus).toBe(T.rounds[i].tempoBonus);
      // the signature relic is always held (and counts toward the round's relics, at least one)
      expect(o.signatureRelic).toBe(k.signature.relic);
      expect(o.relics[0].id).toBe(k.signature.relic);
      expect(o.relics).toHaveLength(Math.max(T.rounds[i].relics, 1));
      expect(new Set(o.relics.map((r) => r.id)).size).toBe(o.relics.length);
    });
  });

  it('visits every court over enough seeds, and the Final is the Black Queen about half the time', () => {
    const seen = new Set<string>();
    let queen = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const run = generateOpponents(content, seed);
      for (const o of run) seen.add(o.courtId!);
      if (run[3].name === T.finalName) queen++;
    }
    expect(seen.size).toBe(10);
    expect(queen).toBeGreaterThan(60);
    expect(queen).toBeLessThan(140);
  });

  it('keeps a court’s Opening when its round comes up (no counter-Opening for named courts)', () => {
    const run = newRun(content, 9);
    run.court.opening = 'kings_gambit';
    for (const i of [1, 2, 3]) expect(revealOpponent(content, run, i)).toEqual(run.opponents[i]);
  });

  it('survives a reload: the run carries its courts and plays on', () => {
    const run = newRun(content, 21);
    const copy = structuredClone(run);
    expect(copy.opponents.map((o) => o.courtId)).toEqual(run.opponents.map((o) => o.courtId));
    const next = recordResult(
      content,
      { ...copy, status: 'playing' },
      {
        winner: 'A',
        minutes: 10,
        adjudicated: false,
        mvp: null,
        relics: [],
        styles: {},
        techniques: {},
      },
    );
    expect(next.opponents[1].courtId).toBe(run.opponents[1].courtId);
  });
});

describe('Named courts (3B): in a match', () => {
  it('Black starts with the signature relic, its fixed Opening and lanes, and takes its archetypes', () => {
    // every court, in the first moment of a match
    for (const k of courts) {
      const run = newRun(content, 1);
      const idx = k.round - 1;
      const opp = generateOpponents(content, 1).find((o) => o.courtId === k.id);
      // draw seeds until this court is the round's court
      let found = opp;
      for (let seed = 2; !found && seed < 400; seed++)
        found = generateOpponents(content, seed).find((o) => o.courtId === k.id);
      expect(found, k.id).toBeDefined();
      run.opponents[idx] = found!;
      run.round = idx;
      const cfg = nextMatchConfig(content, run);
      expect(cfg.forceStyles?.B).toEqual(k.styles);
      const m = Match.create(content, { ...cfg, map: 'long', autoGambits: { A: true, B: true } });
      m.issue({ type: 'setupTeam', ...m.defaultSetup() });
      expect(m.state.opening.B, k.id).toBe(k.opening);
      const held = m.state.relics.held.B;
      expect(held[0].id, k.id).toBe(k.signature.relic);
      expect(held, k.id).toHaveLength(Math.max(T.rounds[idx].relics, 1));
      if (k.signature.piece)
        expect(m.unitById(held[0].piece!)!.hero!.defId).toBe(k.signature.piece);
      for (const p of k.pieces) {
        const u = piece(m, 'B', p.piece);
        expect(u.hero!.lane, `${k.id} ${p.piece}`).toBe(p.lane);
      }
    }
  });

  it('keeps its signature relic through the Act breaks (the AI trades other relics, never it)', () => {
    // Club (cap 0: drafts nothing) and County (cap 2: drafts one, then may only swap that one)
    for (const seed of [5001, 5002]) {
      for (const round of [0, 1]) {
        const run = newRun(content, seed);
        run.round = round;
        const sig = run.opponents[round].signatureRelic!;
        const m = Match.create(content, {
          ...nextMatchConfig(content, run, true),
          map: 'long',
          autoGambits: { A: true, B: true },
          autoForks: { A: true, B: true },
        });
        while (m.state.phase.kind === 'live' && m.state.phase.n <= 4) m.step(20 * 60);
        const held = m.state.relics.held.B.map((h) => h.id);
        expect(held, `seed ${seed} round ${round}`).toContain(sig);
        if (round === 0) expect(held).toHaveLength(1);
      }
    }
  }, 120_000);
});
