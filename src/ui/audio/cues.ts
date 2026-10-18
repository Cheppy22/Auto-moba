/**
 * The sound cues and the rules that pick them. Pure (no Web Audio): sim events and commands go in,
 * cue requests come out, so the mapping can be tested without a browser. The sounds themselves are
 * made in `cueSynth.ts`.
 */
import type { GameEvent } from '../../sim';
import type { School } from '../schools';

export type Cue =
  | 'toll'
  | 'tick'
  | 'clack'
  | 'fall'
  | 'chime'
  | 'thud'
  | 'tap'
  | 'tab'
  | 'deny'
  | 'check'
  | 'checkmateWin'
  | 'checkmateLoss'
  | 'throneDown'
  | 'throneHit'
  | 'bastion'
  | 'rank'
  | 'rankBig'
  | 'relic'
  | 'buy'
  | 'sell'
  | 'spoils'
  | 'roundWin'
  | 'roundLoss'
  | 'eye'
  | 'actStart'
  | 'seal'
  | 'march'
  | 'initiative'
  | 'fortress'
  | 'sacrifice'
  | 'position'
  | 'clock';

export interface CueOpts {
  /** Toll number (1..3). */
  n?: number;
  /** Team that owns the thing (sets pitch for clack, bastion). */
  team?: string;
  /** 0..1 strength (tick: how near the bell). */
  k?: number;
  /** A gambit played by Black: the same school sound, lower and darker. */
  dark?: boolean;
  /** Seconds to wait before it sounds. */
  delay?: number;
}

export interface CueRequest {
  cue: Cue;
  opts?: CueOpts;
}

/** What each cue is, and the shortest gap (ms) between two of it. */
export const CUE_INFO: Record<Cue, { cooldownMs: number; desc: string }> = {
  toll: { cooldownMs: 0, desc: 'Act bell: low brass bell, each of the three tolls louder' },
  tick: { cooldownMs: 0, desc: 'Clock tick in the last 5 seconds before the bell' },
  clack: { cooldownMs: 90, desc: 'Capture: a wooden clack when an enemy piece falls' },
  fall: { cooldownMs: 90, desc: 'Your piece falls: a duller, lower wooden knock' },
  chime: { cooldownMs: 0, desc: 'Rank 4 / 8 choice made: rising brass fifth' },
  thud: { cooldownMs: 120, desc: 'Plain gambit: a low felt thud (fallback)' },
  tap: { cooldownMs: 0, desc: 'Button tap: short dry wooden tick' },
  tab: { cooldownMs: 0, desc: 'Tab change: a softer two-step tick' },
  deny: { cooldownMs: 250, desc: 'Refused action: a short low double knock' },
  check: { cooldownMs: 600, desc: 'Check: two close, uneasy bell pings' },
  checkmateWin: { cooldownMs: 0, desc: 'Checkmate, you win: a rising brass-and-bell resolve' },
  checkmateLoss: {
    cooldownMs: 0,
    desc: 'Checkmate, you lose: a falling minor chord and a low gong',
  },
  throneDown: { cooldownMs: 0, desc: 'Throne falls: a deep gong with a cracking rumble' },
  throneHit: { cooldownMs: 1400, desc: 'Throne struck: a faint heavy thump' },
  bastion: {
    cooldownMs: 300,
    desc: 'Bastion falls: stone crumble and a low boom (brighter when it is theirs)',
  },
  rank: { cooldownMs: 500, desc: 'Rank up: a small bright three-note sparkle' },
  rankBig: { cooldownMs: 0, desc: 'Rank 4 or 8: a fuller bell chord with shimmer' },
  relic: { cooldownMs: 0, desc: 'Relic taken: a glassy rising arpeggio' },
  buy: { cooldownMs: 120, desc: 'Gold spent at the break (reroll, upgrade): two coin pings' },
  sell: { cooldownMs: 120, desc: 'Gold gained at the break (pass): a falling coin clink' },
  spoils: { cooldownMs: 0, desc: 'Spoils pick: a warm, settled major chord' },
  roundWin: { cooldownMs: 0, desc: 'Tournament round won: a short brass fanfare' },
  roundLoss: { cooldownMs: 0, desc: 'Tournament round lost: a slow low descent' },
  eye: { cooldownMs: 2500, desc: 'High-ground eye badge: a tiny, very quiet high blip' },
  actStart: { cooldownMs: 0, desc: 'A new Act begins: a soft low swell and a wood knock' },
  seal: { cooldownMs: 300, desc: 'Sealed Move plays: a wax-seal press and click' },
  march: { cooldownMs: 120, desc: 'March gambit: two drum beats and a rising fifth' },
  initiative: { cooldownMs: 120, desc: 'Initiative gambit: a sharp rapier zing' },
  fortress: { cooldownMs: 120, desc: 'Fortress gambit: a stone slam and a low metal ring' },
  sacrifice: { cooldownMs: 120, desc: 'Sacrifice gambit: a dark falling minor bell' },
  position: { cooldownMs: 120, desc: 'Position gambit: a soft sliding wooden sweep' },
  clock: { cooldownMs: 120, desc: 'Clock gambit: a quick double tick and a small chime' },
};

/**
 * Big stingers push the music (and a little of the garden) down so they stand clear: how long
 * and how far (the music's gain drops to `depth`).
 */
export const DUCK: Partial<Record<Cue, { sec: number; depth: number }>> = {
  toll: { sec: 5, depth: 0.3 },
  checkmateWin: { sec: 4, depth: 0.25 },
  checkmateLoss: { sec: 4, depth: 0.25 },
  throneDown: { sec: 3, depth: 0.3 },
  clack: { sec: 0.7, depth: 0.5 },
  fall: { sec: 0.7, depth: 0.5 },
  rankBig: { sec: 1.5, depth: 0.6 },
};

/**
 * Per-cue level trim (linear, default 1). Small everyday sounds are made louder so the effects sit
 * above the music in a mix (measured: docs/audio/aaa-mix.m4a); the very subtle eye stays quiet.
 */
export const CUE_TRIM: Partial<Record<Cue, number>> = {
  clack: 2.6,
  fall: 2.2,
  tap: 2,
  tab: 2,
  tick: 1.6,
  deny: 1.8,
  rank: 1.6,
  buy: 2,
  sell: 2,
  seal: 2,
  throneHit: 1.5,
  initiative: 1.7,
  position: 1.7,
  clock: 2.2,
  march: 1.3,
};

export const CUES = Object.keys(CUE_INFO) as Cue[];

/** Each gambit school has its own cue. */
export const SCHOOL_CUE: Record<School, Cue> = {
  march: 'march',
  initiative: 'initiative',
  fortress: 'fortress',
  sacrifice: 'sacrifice',
  position: 'position',
  clock: 'clock',
};

/** What the mapper may ask the game about. */
export interface EventLookup {
  /** Team of a piece (hero) by unit id; undefined for pawns, structures and unknown ids. */
  heroTeam(id: number): 'A' | 'B' | undefined;
  /** The school of a gambit card. */
  school(cardId: string): School | undefined;
  /** The run speed (4 and 8 skip the busiest sounds). */
  speed: number;
}

/** The cues one sim event calls for (White is team A, the player). */
export function eventCues(e: GameEvent, look: EventLookup): CueRequest[] {
  switch (e.type) {
    case 'bell':
      return e.payload.stage === 'tolling'
        ? [{ cue: 'toll', opts: { n: e.payload.toll ?? 1 } }]
        : [];
    case 'death': {
      if (look.speed >= 4) return [];
      const team = look.heroTeam(e.payload.id);
      if (!team) return [];
      return [{ cue: team === 'A' ? 'fall' : 'clack', opts: { team } }];
    }
    case 'fork':
      return look.heroTeam(e.payload.id) === 'A' ? [{ cue: 'chime' }] : [];
    case 'rankUp':
      if (look.heroTeam(e.payload.id) !== 'A') return [];
      return [{ cue: e.payload.rank === 4 || e.payload.rank === 8 ? 'rankBig' : 'rank' }];
    case 'check':
      return [{ cue: 'check', opts: { team: e.payload.team } }];
    case 'throneDown':
      return [{ cue: 'throneDown', opts: { team: e.payload.team } }];
    case 'checkmate':
      return [{ cue: e.payload.winner === 'A' ? 'checkmateWin' : 'checkmateLoss' }];
    case 'matchEnd':
      // a points decision has no Checkmate event; give it the same closing note
      return e.payload.adjudicated && e.payload.winner
        ? [{ cue: e.payload.winner === 'A' ? 'checkmateWin' : 'checkmateLoss' }]
        : [];
    case 'structureDown':
      return e.payload.kind === 'tower' ? [{ cue: 'bastion', opts: { team: e.payload.team } }] : [];
    case 'damage':
      return e.payload.tgtKind === 'guardian' && e.payload.amount > 0 ? [{ cue: 'throneHit' }] : [];
    case 'gambit': {
      const school = look.school(e.payload.cardId);
      const dark = e.payload.team === 'B';
      return [{ cue: school ? SCHOOL_CUE[school] : 'thud', opts: { dark } }];
    }
    case 'sealedMove':
      return e.payload.team === 'A' && e.payload.outcome === 'fired' ? [{ cue: 'seal' }] : [];
    case 'phaseStart':
      return e.payload.kind === 'live' && e.payload.phase > 1
        ? [{ cue: 'actStart', opts: { n: e.payload.phase } }]
        : [];
    default:
      return [];
  }
}

/** The cue a successful player command makes (the tap on its button is separate). */
export function commandCue(type: string): Cue | null {
  switch (type) {
    case 'pickRelic':
    case 'autoRelic':
      return 'relic';
    case 'rerollOffer':
    case 'upgradeTechnique':
      return 'buy';
    case 'passOffer':
      return 'sell';
    default:
      return null;
  }
}

/** The cue a tapped control makes: tabs sound softer than buttons. */
export const tapCue = (isTab: boolean): Cue => (isTab ? 'tab' : 'tap');

/** The closing cue of a Tournament round, from who won (null: a dead tie counts as a loss). */
export const roundCue = (winner: 'A' | 'B' | null): Cue =>
  winner === 'A' ? 'roundWin' : 'roundLoss';

/** Keeps a cue from sounding twice inside its cooldown (and a busy fight from stacking). */
export class Throttle {
  private last = new Map<Cue, number>();
  allow(cue: Cue, nowMs: number): boolean {
    const gap = CUE_INFO[cue].cooldownMs;
    const prev = this.last.get(cue);
    if (prev !== undefined && nowMs - prev < gap) return false;
    this.last.set(cue, nowMs);
    return true;
  }
}
