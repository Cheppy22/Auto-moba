import type { PositionSample } from '../sim';

export class PositionIndex {
  private byHero = new Map<number, PositionSample[]>();

  constructor(samples: PositionSample[]) {
    for (const s of samples) {
      const list = this.byHero.get(s.id);
      if (list) list.push(s);
      else this.byHero.set(s.id, [s]);
    }
  }

  slice(id: number, fromTick: number, toTick: number): PositionSample[] {
    const list = this.byHero.get(id) ?? [];
    return list.filter((s) => s.tick >= fromTick && s.tick <= toTick);
  }

  at(id: number, tick: number): { x: number; y: number; hp: number } | null {
    const list = this.byHero.get(id);
    if (!list || list.length === 0) return null;
    let lo = 0;
    let hi = list.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (list[mid].tick <= tick) lo = mid;
      else hi = mid - 1;
    }
    const a = list[lo];
    const b = list[lo + 1];
    if (!b || b.tick === a.tick || tick <= a.tick) return { x: a.x, y: a.y, hp: a.hp };
    const f = Math.min(1, (tick - a.tick) / (b.tick - a.tick));
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, hp: a.hp + (b.hp - a.hp) * f };
  }
}
