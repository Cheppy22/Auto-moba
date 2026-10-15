import { LANE_NAME, teamWord, type Content, type PlayTeam } from '../sim';
import type { Report } from './index';

const LANE_NAMES: Record<string, string | undefined> = LANE_NAME;

/** top/mid/bot -> Left/Mid/Right (the names the map shows). */
export function laneName(lane: string): string {
  return LANE_NAMES[lane] ?? lane;
}

/** Possessive-free team label from the viewer's point of view. */
export function teamLabel(team: string, viewer: PlayTeam = 'A'): string {
  if (team !== 'A' && team !== 'B') return team;
  return team === viewer ? 'your team' : 'the enemy';
}

/** The opposing court's full name in a Tournament run (set by the session per match); null in an Exhibition. */
let opposingCourt: string | null = null;

export function setOpposingCourt(name: string | null): void {
  opposingCourt = name;
}

/** "Brasswick" for "The Brasswick Club": no leading "The", no trailing club-word (short for phones). */
function shortCourt(full: string): string {
  const short = full
    .replace(/^The\s+/, '')
    .replace(/\s+(Club|Court|Society|Hall|Circle|Rooms)$/, '')
    .replace(/\s+Chess$/, '');
  return short || full;
}

/**
 * The one place a side's display name comes from: White is "White"; Black is "Black" in an
 * Exhibition and the opposing court's short name in a Tournament run ("Wexmoor Gambit").
 */
export function courtName(team: string): string {
  return team === 'B' && opposingCourt ? shortCourt(opposingCourt) : teamWord(team);
}

/** "Black’s" / "Brasswick’s" ("Lady Marlow's" stays as it is); `apos` is the apostrophe to use. */
export function courtPossessive(team: string, apos = '’'): string {
  const n = courtName(team);
  return /['’]s$/.test(n) ? n : `${n}${apos}s`;
}

/** The base structure's display name: each side has a Throne. */
function throneName(team: string): string {
  return team === 'A' || team === 'B' ? `${courtName(team)} Throne` : 'Throne';
}

export const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** A piece's display name, e.g. "White Knight". */
export function pieceName(team: string, piece: string): string {
  return `${courtName(team)} ${cap(piece)}`;
}

function teamLabelCap(team: string, viewer: PlayTeam = 'A'): string {
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
  // the Long Board (the default map)
  w1: "the West Grove's far end",
  w2: 'the middle of the West Grove',
  w3: "the West Grove's river tip",
  e1: "the East Grove's near end",
  e2: 'the middle of the East Grove',
  e3: "the East Grove's river tip",
  pit: 'the Pit',
  pit_w: 'the Pit',
  pit_e: 'the Pit',
  ford_l: 'the Left ford',
  ford_r: 'the Right ford',
  way_w: "White's Sally Path",
};

/** Slot or obelisk-node id -> a readable place name. */
export function slotName(id: string): string {
  if (id === 'way_b') return `${courtPossessive('B', "'")} Sally Path`;
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

function obeliskText(
  o: Report['special']['obelisks'][number],
  c: Content,
  viewer: PlayTeam = 'A',
): string {
  return `${teamLabelCap(o.team, viewer)} claimed the obelisk at ${slotName(o.node)}: ${obeliskRewardText(o.reward, o.value, c)}`;
}

function biomeText(b: Report['special']['biomes'][number], c: Content): string {
  const name = c.biomeById.get(b.biome)?.name ?? b.biome.replace(/_/g, ' ');
  return `${name} opened in the ${slotName(b.slot)}`;
}

interface EventLine {
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
