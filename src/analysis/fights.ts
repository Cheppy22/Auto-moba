import type { GameEvent, PlayTeam } from '../sim';
import type { PositionIndex } from './positions';

export interface Fight {
  id: number;
  startTick: number;
  endTick: number;
  x: number;
  y: number;
  participants: number[];
  sideA: number[];
  sideB: number[];
  damage: Record<number, { dealt: number; taken: number }>;
  deaths: { id: number; tick: number; killer: number }[];
  damageA: number;
  damageB: number;
  deathsA: number;
  deathsB: number;
}

interface Opts {
  gapTicks: number;
  radius: number;
  seqFrom: number;
  seqTo: number;
}

interface Open extends Fight {
  n: number;
  sx: number;
  sy: number;
}

export function deriveFights(
  events: GameEvent[],
  pos: PositionIndex,
  teamOf: Map<number, PlayTeam>,
  opts: Opts,
): Fight[] {
  const all: Open[] = [];
  let open: Open[] = [];
  for (const e of events) {
    if (e.seq < opts.seqFrom || e.seq > opts.seqTo) continue;
    open = open.filter((f) => e.tick - f.endTick <= opts.gapTicks);
    if (e.type === 'damage') {
      const p = e.payload;
      if (p.srcKind !== 'hero' || p.tgtKind !== 'hero') continue;
      const st = teamOf.get(p.src);
      const tt = teamOf.get(p.tgt);
      if (!st || !tt || st === tt) continue;
      const a = pos.at(p.src, e.tick);
      const b = pos.at(p.tgt, e.tick);
      if (!a || !b) continue;
      const x = (a.x + b.x) / 2;
      const y = (a.y + b.y) / 2;
      let f = open.find((o) => Math.hypot(o.x - x, o.y - y) <= opts.radius);
      if (!f) {
        f = {
          id: all.length,
          startTick: e.tick,
          endTick: e.tick,
          x,
          y,
          participants: [],
          sideA: [],
          sideB: [],
          damage: {},
          deaths: [],
          damageA: 0,
          damageB: 0,
          deathsA: 0,
          deathsB: 0,
          n: 0,
          sx: 0,
          sy: 0,
        };
        all.push(f);
        open.push(f);
      }
      f.endTick = e.tick;
      f.n++;
      f.sx += x;
      f.sy += y;
      f.x = f.sx / f.n;
      f.y = f.sy / f.n;
      for (const [id, side] of [
        [p.src, st],
        [p.tgt, tt],
      ] as [number, PlayTeam][]) {
        if (!f.participants.includes(id)) {
          f.participants.push(id);
          (side === 'A' ? f.sideA : f.sideB).push(id);
        }
      }
      (f.damage[p.src] ??= { dealt: 0, taken: 0 }).dealt += p.amount;
      (f.damage[p.tgt] ??= { dealt: 0, taken: 0 }).taken += p.amount;
      if (st === 'A') f.damageA += p.amount;
      else f.damageB += p.amount;
    } else if (e.type === 'death' && e.payload.kind === 'hero') {
      const f = open.find((o) => o.participants.includes(e.payload.id));
      if (f) {
        f.deaths.push({ id: e.payload.id, tick: e.tick, killer: e.payload.killer });
        f.endTick = e.tick;
        if (teamOf.get(e.payload.id) === 'A') f.deathsA++;
        else f.deathsB++;
      }
    }
  }
  return all.map((f) => {
    const { n: _n, sx: _sx, sy: _sy, ...rest } = f;
    void _n;
    void _sx;
    void _sy;
    return {
      ...rest,
      damageA: Math.round(f.damageA),
      damageB: Math.round(f.damageB),
    };
  });
}
