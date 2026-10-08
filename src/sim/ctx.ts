import type { Content } from './content/loader';
import type { Tuning, LaneId } from './content/schema';
import { Grid } from './core/grid';
import type { World } from './world/map';
import type {
  EventPayloads,
  EventType,
  MatchState,
  PlayTeam,
  Recorder,
  TeamId,
  Unit,
} from './types';

export interface DamageBucket {
  srcTeam: TeamId | 'none';
  tgtKind: Unit['kind'];
  amount: number;
  count: number;
}

export interface Ctx {
  s: MatchState;
  c: Content;
  t: Tuning;
  world: World;
  /** Ids of the jungle slots that are open; kept in step with `s.slots[].open`. */
  open: Set<string>;
  rec: Recorder;
  idx: Map<number, Unit>;
  grid: Grid<Unit>;
  towers: Record<PlayTeam, Record<LaneId, Unit[]>>;
  guardians: Record<PlayTeam, Unit | null>;
  front: Record<PlayTeam, Record<LaneId, number>>;
  buckets: Map<string, DamageBucket>;
  emit: <K extends EventType>(type: K, payload: EventPayloads[K]) => void;
  unit(id: number): Unit | undefined;
}

export const isEnemy = (a: Unit, b: Unit): boolean =>
  a.team !== b.team && !(a.team === 'neutral' && b.team === 'neutral');

export const hpPct = (u: Unit): number => (u.stats.maxHp > 0 ? u.hp / u.stats.maxHp : 0);

export function isTargetable(ctx: Ctx, u: Unit): boolean {
  if (!u.alive || u.kind === 'obelisk' || u.kind === 'keeper') return false;
  if (u.kind === 'tower' && u.tower && u.tower.index === 1 && u.team !== 'neutral') {
    const outer = ctx.towers[u.team][u.tower.lane][0];
    return !outer || !outer.alive;
  }
  if (u.kind === 'guardian' && u.team !== 'neutral') {
    const lanes = ctx.towers[u.team];
    return (['top', 'mid', 'bot'] as LaneId[]).some((l) => {
      const inner = lanes[l][1];
      return !inner || !inner.alive;
    });
  }
  return true;
}
