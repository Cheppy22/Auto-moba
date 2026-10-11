import { describe, expect, it } from 'vitest';
import type { Match, PieceId, SnapUnit } from '../src/sim';
import { dealDamage } from '../src/sim/combat';
import { lanePoint } from '../src/sim/world/map';
import { liveMatch, piece } from './helpers';

const snapOf = (m: Match, team: 'A' | 'B', id: PieceId): SnapUnit => {
  const uid = piece(m, team, id).id;
  return m.snapshot().units.find((u) => u.id === uid)!;
};

describe('inDuel (the roster flash)', () => {
  it('is set by a fight with an enemy piece, not by damage from anything else', () => {
    const m = liveMatch(7);
    const king = piece(m, 'A', 'king');
    const foe = piece(m, 'B', 'queen');
    expect(snapOf(m, 'A', 'king').inDuel).toBe(false);
    // hurt by something that is not a piece (a camp, a pawnling): in combat, not in a duel
    dealDamage(m.ctx, null, king, 10, 'true', 'test');
    expect(snapOf(m, 'A', 'king').inCombat).toBe(true);
    expect(snapOf(m, 'A', 'king').inDuel).toBe(false);
    // a hit by an enemy piece puts both pieces in the duel
    dealDamage(m.ctx, foe, king, 10, 'true', 'test');
    expect(snapOf(m, 'A', 'king').inDuel).toBe(true);
    expect(snapOf(m, 'B', 'queen').inDuel).toBe(true);
    // and it ends with the 1.5 s combat window
    m.state.tick += 40;
    expect(snapOf(m, 'A', 'king').inDuel).toBe(false);
    expect(snapOf(m, 'A', 'king').inCombat).toBe(false);
  });
});

describe('laneNow (the tile tag from Act 2)', () => {
  it('reads the lane a piece stands in, base while recalling, and not a lane in the corner', () => {
    const m = liveMatch(7);
    const u = piece(m, 'A', 'knight');
    const at = (x: number, y: number): void => {
      u.x = u.px = x;
      u.y = u.py = y;
    };
    u.hero!.recall = null;
    u.hero!.goal = null;
    const mid = lanePoint(m.ctx.world.lanes.mid, 0.5);
    at(mid.x, mid.y);
    expect(snapOf(m, 'A', 'knight').laneNow).toBe('mid');
    const top = lanePoint(m.ctx.world.lanes.top, 0.5);
    at(top.x, top.y);
    expect(snapOf(m, 'A', 'knight').laneNow).toBe('top');
    // recalling means on the way home
    u.hero!.recall = {
      startTick: m.state.tick,
      endTick: m.state.tick + 100,
      dest: 'base',
      auto: false,
    };
    expect(snapOf(m, 'A', 'knight').laneNow).toBe('base');
    u.hero!.recall = null;
    at(60, 60);
    expect(['jungle', 'base']).toContain(snapOf(m, 'A', 'knight').laneNow);
  });
});
