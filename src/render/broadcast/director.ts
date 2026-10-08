import type { Content, LaneId, SnapUnit, Snapshot } from '../../sim';
import type { NewEvents, PlayKind, Shot } from './types';

type Pt = { x: number; y: number };
type Play = Exclude<PlayKind, 'wide'>;
type Cand = Omit<Shot, 'cut' | 'since' | 'kind'> & { key: string; kind: Play };
interface Death extends Pt {
  seq: number;
  tick: number;
  id: number;
  killer: number | null;
}
interface Fall extends Pt {
  seq: number;
  tick: number;
  kind: string;
  killer: number | null;
}

const PRIORITY: Record<Play, number> = {
  guardian: 90,
  structure: 85,
  multikill: 80,
  teamfight: 70,
  kill: 60,
  event: 50,
  skirmish: 40,
  player: 20,
};

const MIN_HOLD = 60;
const LINGER = 40;
const PREEMPT = 15;
const KILL_HOLD = 60;
const STRUCTURE_HOLD = 80;
const MULTI_HOLD = 80;
const MULTI_WINDOW = 120;
const MULTI_REACH = 300;
const GUARDIAN_HIT_WINDOW = 60;
const GUARDIAN_AWAY = 40;
const GUARDIAN_PHASE = 7;
const CLUSTER = 260;
const JUMP = 450;
const MARGIN = 70;
const MIN_RADIUS = 140;
const MAX_RADIUS = 520;
const JUNGLE_DIST = 90;
const BASE_DIST = 160;

const LANE_NAMES: Record<LaneId, string> = { top: 'Left', mid: 'Mid', bot: 'Right' };
const LANE_IDS: LaneId[] = ['top', 'mid', 'bot'];
const MULTI_NAMES = ['Double kill', 'Triple kill', 'Quadra kill', 'Penta kill'];

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const byId = (a: { id: number }, b: { id: number }): number => a.id - b.id;

function centroid(pts: Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}

function frame(pts: Pt[]): Pt & { radius: number } {
  const c = centroid(pts);
  const reach = pts.reduce((m, p) => Math.max(m, dist(p, c)), 0);
  return { ...c, radius: clamp(reach + MARGIN, MIN_RADIUS, MAX_RADIUS) };
}

function segmentDist(p: Pt, a: readonly number[], b: readonly number[]): number {
  const dx = b[0]! - a[0]!;
  const dy = b[1]! - a[1]!;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : clamp(((p.x - a[0]!) * dx + (p.y - a[1]!) * dy) / len2, 0, 1);
  return Math.hypot(p.x - (a[0]! + t * dx), p.y - (a[1]! + t * dy));
}

/** The largest group of heroes within CLUSTER of one member that has enough of each side. */
function bestCluster(heroes: SnapUnit[], perSide: number): SnapUnit[] | null {
  let best: SnapUnit[] | null = null;
  for (const c of heroes) {
    const group = heroes.filter((u) => dist(u, c) <= CLUSTER);
    const a = group.filter((u) => u.team === 'A').length;
    if (a < perSide || group.length - a < perSide) continue;
    if (!best || group.length > best.length) best = group;
  }
  return best;
}

export class Director {
  private readonly size: number;
  private readonly lanes: [LaneId, readonly (readonly number[])[]][];
  private readonly bases: Pt[];
  private readonly guardianHome: Record<string, Pt> = {};
  private seq = -1;
  private tick = -1;
  private deaths: Death[] = [];
  private falls: Fall[] = [];
  private guardianHits = new Map<number, number>();
  private shot: Shot;
  private key: string | null = null;
  private endedAt: number | null = null;
  private cutTick: number | null = null;

  constructor(content: Content) {
    const map = content.map;
    this.size = map.size;
    this.lanes = LANE_IDS.map((id) => [id, map.lanes[id]]);
    this.bases = [map.bases.A, map.bases.B].map(([x, y]) => ({ x, y }));
    for (const team of ['A', 'B'] as const) {
      const [bx, by] = map.bases[team];
      const half = map.size / 2;
      const len = Math.hypot(half - bx, half - by) || 1;
      this.guardianHome[team] = {
        x: bx + ((half - bx) / len) * map.guardianOffset,
        y: by + ((half - by) / len) * map.guardianOffset,
      };
    }
    this.shot = this.wide(0);
  }

  reset(): void {
    this.seq = -1;
    this.tick = -1;
    this.deaths = [];
    this.falls = [];
    this.guardianHits.clear();
    this.key = null;
    this.endedAt = null;
    this.cutTick = null;
    this.shot = this.wide(0);
  }

  update(snap: Snapshot, events: NewEvents): Shot {
    const tick = snap.tick;
    if (tick < this.tick) this.reset();
    this.tick = tick;
    this.ingest(events);
    const running = snap.phase.kind === 'live' || snap.phase.kind === 'end';
    if (!running) this.reset();
    else this.choose(tick, this.candidates(snap));
    return { ...this.shot, cut: this.cutTick === tick, subjects: [...this.shot.subjects] };
  }

  private wide(since: number): Shot {
    const half = this.size / 2;
    return {
      kind: 'wide',
      x: half,
      y: half,
      radius: this.size * 0.6,
      caption: null,
      cut: false,
      subjects: [],
      priority: 0,
      since,
    };
  }

  private ingest(events: NewEvents): void {
    for (const e of events) {
      if (e.seq <= this.seq) continue;
      this.seq = e.seq;
      if (e.type === 'death' && e.payload.kind === 'hero') {
        const { id, x, y, killer, killerKind } = e.payload;
        this.deaths.push({
          seq: e.seq,
          tick: e.tick,
          id,
          x,
          y,
          killer: killerKind === 'hero' ? killer : null,
        });
      } else if (e.type === 'structureDown') {
        const { kind, x, y, killer } = e.payload;
        this.falls.push({
          seq: e.seq,
          tick: e.tick,
          kind,
          x,
          y,
          killer: killer >= 0 ? killer : null,
        });
      } else if (
        e.type === 'damage' &&
        e.payload.tgtKind === 'guardian' &&
        e.payload.srcKind === 'hero'
      ) {
        this.guardianHits.set(e.payload.tgt, e.tick);
      }
    }
    const tick = this.tick;
    this.deaths = this.deaths.filter((d) => tick - d.tick <= MULTI_WINDOW + MULTI_HOLD);
    this.falls = this.falls.filter((f) => tick - f.tick < STRUCTURE_HOLD);
    for (const [id, t] of this.guardianHits) {
      if (tick - t > GUARDIAN_HIT_WINDOW) this.guardianHits.delete(id);
    }
  }

  private choose(tick: number, cands: Cand[]): void {
    const cur = this.shot;
    let match: Cand | undefined;
    if (this.key !== null) {
      match = cands
        .filter((c) => c.key === this.key && dist(c, cur) <= JUMP)
        .sort((a, b) => dist(a, cur) - dist(b, cur))[0];
      if (match) this.endedAt = null;
      else this.endedAt ??= tick;
    }
    const challenger = cands.find((c) => c !== match);
    const held = this.key !== null && tick - cur.since < MIN_HOLD;
    const needed =
      this.key === null ? 0 : held ? cur.priority + PREEMPT : match ? cur.priority + 1 : 0;
    if (challenger && challenger.priority >= needed) this.start(challenger, tick);
    else if (match) this.follow(match);
    else if (this.key !== null && !held && tick - (this.endedAt ?? tick) >= LINGER) {
      this.key = null;
      this.endedAt = null;
      this.cutTick = null;
      this.shot = this.wide(tick);
    }
  }

  private start(c: Cand, tick: number): void {
    const from = this.key === null ? null : this.shot;
    const cut = c.kind === 'structure' || (from !== null && dist(from, c) > JUMP);
    this.cutTick = cut ? tick : null;
    this.key = c.key;
    this.endedAt = null;
    this.shot = { ...this.shot, since: tick, cut: false };
    this.follow(c);
  }

  private follow(c: Cand): void {
    const { x, y, radius, caption, subjects, priority, kind } = c;
    this.shot = { ...this.shot, kind, x, y, radius, caption, subjects, priority };
  }

  private candidates(snap: Snapshot): Cand[] {
    const tick = snap.tick;
    const out: Cand[] = [];
    const add = (key: string, kind: Play, pts: Pt[], caption: string, subjects: number[]): void => {
      const f = frame(pts);
      out.push({ key, kind, ...f, caption, subjects, priority: PRIORITY[kind] });
    };
    const spot = (key: string, kind: Play, p: Pt, caption: string, subjects: number[]): void => {
      out.push({
        key,
        kind,
        x: p.x,
        y: p.y,
        radius: MIN_RADIUS + 20,
        caption,
        subjects,
        priority: PRIORITY[kind],
      });
    };
    const titled = (title: string, p: Pt): string => `${title} · ${this.area(p)}`;

    const units = new Map(snap.units.map((u) => [u.id, u]));
    const heroes = snap.units
      .filter((u) => u.kind === 'hero' && u.alive && (u.team === 'A' || u.team === 'B'))
      .sort(byId);
    const ids = (us: { id: number }[]): number[] => us.map((u) => u.id).sort((a, b) => a - b);

    for (const g of snap.units.filter((u) => u.kind === 'guardian' && u.alive).sort(byId)) {
      const home = this.guardianHome[g.team];
      const hit = this.guardianHits.get(g.id);
      const siege = hit !== undefined && tick - hit <= GUARDIAN_HIT_WINDOW && g.hp < g.maxHp;
      const away = snap.phase.n >= GUARDIAN_PHASE && !!home && dist(g, home) > GUARDIAN_AWAY;
      if (!siege && !away) continue;
      const foes = heroes.filter((h) => h.team !== g.team && dist(h, g) <= CLUSTER + 40);
      add(
        `guardian:${g.id}`,
        'guardian',
        [g, ...foes],
        siege ? 'King under siege' : 'The King marches',
        ids([g, ...foes]),
      );
    }

    for (const f of this.falls) {
      const title = f.kind === 'guardian' ? 'Checkmate' : 'Tower falls';
      const subjects = f.killer === null ? [] : [f.killer];
      out.push({
        key: `structure:${f.seq}`,
        kind: 'structure',
        x: f.x,
        y: f.y,
        radius: 220,
        caption: titled(title, f),
        subjects,
        priority: PRIORITY.structure,
      });
    }

    const last = this.deaths[this.deaths.length - 1];
    if (last && tick - last.tick <= MULTI_HOLD) {
      const group = this.deaths.filter(
        (d) => last.tick - d.tick <= MULTI_WINDOW && dist(d, last) <= MULTI_REACH,
      );
      if (group.length >= 2) {
        const name = MULTI_NAMES[group.length - 2] ?? 'Massacre';
        add('multi', 'multikill', group, titled(name, centroid(group)), ids(group));
      }
    }

    const fight = bestCluster(heroes, 3);
    if (fight)
      add('teamfight', 'teamfight', fight, titled('Team fight', centroid(fight)), ids(fight));

    for (const d of [...this.deaths].reverse()) {
      if (tick - d.tick >= KILL_HOLD) continue;
      const subjects = d.killer === null ? [d.id] : [d.id, d.killer];
      spot(`kill:${d.seq}`, 'kill', d, titled('Hero down', d), subjects);
    }

    for (const e of snap.events) {
      if (e.phase !== 'active') continue;
      const near = heroes.filter((h) => dist(h, e) <= e.radius);
      if (near.length === 0) continue;
      const reach = near.reduce((m, h) => Math.max(m, dist(h, e)), e.radius);
      out.push({
        key: `event:${e.id}`,
        kind: 'event',
        x: e.x,
        y: e.y,
        radius: clamp(reach + MARGIN, MIN_RADIUS, MAX_RADIUS),
        caption: e.name,
        subjects: ids(near),
        priority: PRIORITY.event,
      });
    }

    const fighting = new Map<number, SnapUnit>();
    for (const h of heroes) {
      const t = h.target === null ? undefined : units.get(h.target);
      let foe = t && t.kind === 'hero' && t.alive && t.team !== h.team ? t : undefined;
      if (!foe && h.flash) {
        const reach = Math.max(h.range, 60) + 40;
        foe = heroes.find((o) => o.team !== h.team && dist(o, h) <= reach);
      }
      if (foe) {
        fighting.set(h.id, h);
        fighting.set(foe.id, foe);
      }
    }
    const brawl = bestCluster([...fighting.values()].sort(byId), 1);
    if (brawl) add('skirmish', 'skirmish', brawl, titled('Skirmish', centroid(brawl)), ids(brawl));

    return out.sort((a, b) => b.priority - a.priority);
  }

  private area(p: Pt): string {
    if (this.bases.some((b) => dist(p, b) <= BASE_DIST)) return 'Base';
    let best: LaneId = 'mid';
    let bestD = Infinity;
    for (const [id, line] of this.lanes) {
      for (let i = 1; i < line.length; i++) {
        const d = segmentDist(p, line[i - 1]!, line[i]!);
        if (d < bestD) {
          bestD = d;
          best = id;
        }
      }
    }
    return bestD > JUNGLE_DIST ? `${LANE_NAMES[best]} jungle` : LANE_NAMES[best];
  }
}
