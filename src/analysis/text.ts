import type { Content, PlayTeam } from '../sim';
import type { Report } from './index';

const LANE_NAMES: Record<string, string> = { top: 'Left', mid: 'Mid', bot: 'Right' };

/** top/mid/bot -> Left/Mid/Right (the names the map shows). */
export function laneName(lane: string): string {
  return LANE_NAMES[lane] ?? lane;
}

/** Possessive-free team label from the viewer's point of view. */
export function teamLabel(team: string, viewer: PlayTeam = 'A'): string {
  if (team !== 'A' && team !== 'B') return team;
  return team === viewer ? 'your team' : 'the enemy';
}

/** The two sides of the board: Team A is White, Team B is Black. */
export function courtName(team: string): string {
  return team === 'A' ? 'White' : team === 'B' ? 'Black' : team;
}

/** The base structure's display name: each side has a Throne. */
export function throneName(team: string): string {
  return team === 'A' ? 'White Throne' : team === 'B' ? 'Black Throne' : 'Throne';
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** A piece's display name, e.g. "White Knight". */
export function pieceName(team: string, piece: string): string {
  return `${courtName(team)} ${cap(piece)}`;
}

export function teamLabelCap(team: string, viewer: PlayTeam = 'A'): string {
  return cap(teamLabel(team, viewer));
}

const SLOT_NAMES: Record<string, string> = {
  tlc: 'left jungle',
  brc: 'right jungle',
  tla: 'lower-left jungle',
  tlb: 'upper-left jungle',
  bra: 'lower-right jungle',
  brb: 'upper-right jungle',
  ob_mid: 'the centre',
  ob_top_w: 'the lower Left lane',
  ob_top_n: 'the upper Left lane',
  ob_bot_s: 'the lower Right lane',
  ob_bot_e: 'the upper Right lane',
};

/** Slot or obelisk-node id -> a readable place name. */
export function slotName(id: string): string {
  const direct = SLOT_NAMES[id];
  if (direct) return direct;
  if (id.startsWith('ob_') && SLOT_NAMES[id.slice(3)]) return SLOT_NAMES[id.slice(3)];
  return id.replace(/^ob_/, '').replace(/_/g, ' ');
}

const STAT_NAMES: Record<string, string> = {
  moveSpeed: 'move speed',
  maxHp: 'max health',
};

function buffText(stat: string, value: number): string {
  const name = STAT_NAMES[stat] ?? stat;
  const pct = Math.round((value - 1) * 100);
  return value >= 1 ? `+${pct}% ${name} for the team` : `${pct}% ${name} for the team`;
}

/** Obelisk reward label (e.g. "unlock:hundred_hand_ledger") -> plain English. */
export function obeliskRewardText(reward: string, value: number, c: Content): string {
  if (reward.startsWith('unlock:')) {
    const id = reward.slice(7);
    const name = c.items.find((i) => i.id === id)?.name ?? id.replace(/_/g, ' ');
    const off = Math.round(c.tuning.shop.unlockDiscount * 100);
    return `${off}% off ${name} at the jungle stalls`;
  }
  if (reward.startsWith('buff:')) {
    const stat = reward.slice(5);
    return buffText(stat, value);
  }
  if (reward === 'points') return `+${value} points`;
  if (reward === 'gold') return `+${value} gold for each piece`;
  if (reward === 'unlock') return 'a discount at the jungle stalls';
  return reward.replace(/_/g, ' ');
}

export function structureText(
  s: Report['special']['structures'][number],
  viewer: PlayTeam = 'A',
): string {
  const side = cap(teamLabel(s.team, viewer) === 'your team' ? 'your' : 'enemy');
  if (s.kind === 'tower') {
    const rank = s.index === 0 ? 'outer' : s.index === 1 ? 'inner' : `#${s.index + 1}`;
    return `${side} ${rank} Bastion (${laneName(s.lane)} lane) fell`;
  }
  if (s.kind === 'guardian') return `${side} ${throneName(s.team)} fell`;
  return `${side} ${s.kind} fell`;
}

export function obeliskText(
  o: Report['special']['obelisks'][number],
  c: Content,
  viewer: PlayTeam = 'A',
): string {
  return `${teamLabelCap(o.team, viewer)} claimed the obelisk at ${slotName(o.node)}: ${obeliskRewardText(o.reward, o.value, c)}`;
}

export function biomeText(b: Report['special']['biomes'][number], c: Content): string {
  const name = c.biomeById.get(b.biome)?.name ?? b.biome.replace(/_/g, ' ');
  return `${name} opened in the ${slotName(b.slot)}`;
}

export interface EventLine {
  tick: number;
  kind: 'structure' | 'biome' | 'pressure' | 'obelisk';
  text: string;
  /** Team the line is about, if any (for colouring). */
  team?: PlayTeam;
}

/** The report's "Recorded" log lines in plain language, in time order. */
export function eventLines(report: Report, c: Content, viewer?: PlayTeam): EventLine[] {
  const v = viewer ?? report.viewerTeam;
  const out: EventLine[] = [];
  for (const s of report.special.structures) {
    const team = s.team === 'A' || s.team === 'B' ? s.team : undefined;
    out.push({ tick: s.tick, kind: 'structure', text: structureText(s, v), team });
  }
  for (const b of report.special.biomes)
    out.push({ tick: b.tick, kind: 'biome', text: biomeText(b, c) });
  for (const p of report.special.pressure)
    out.push({ tick: p.tick, kind: 'pressure', text: `Pressure event: ${p.name}` });
  for (const o of report.special.obelisks)
    out.push({ tick: o.tick, kind: 'obelisk', text: obeliskText(o, c, v), team: o.team });
  return out.sort((a, b) => a.tick - b.tick);
}
