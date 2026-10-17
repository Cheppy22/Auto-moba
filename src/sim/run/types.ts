// Tournament run data (spec 1B, "Data shapes"). Pure and seeded: the browser and the headless
// tools play runs with the same functions. Nothing here touches the DOM or storage.
import type { PieceId } from '../content/schema';
import type { CarriedRelic, PlayTeam, TeamSetup } from '../types';

/** 1 Club, 2 County, 3 Semifinal, 4 Final. */
export type RoundNo = 1 | 2 | 3 | 4;

/** One opponent court. The stand-in generator builds these; 3B's hand-made courts use the same shape. */
export interface OpponentDef {
  id: string;
  name: string;
  round: RoundNo;
  /** Black's Opening and five pieces (path and lane each). */
  setup: TeamSetup;
  /** 3B: fixed archetypes (`forceStyles.B`); absent means the AI chooses. */
  styles?: Partial<Record<PieceId, string>>;
  /** Relics the court starts with. */
  relics: CarriedRelic[];
  /** Extra Tempo at the start. */
  tempoBonus: number;
  /** 3B. */
  portrait?: string;
  /** 3B. */
  signatureRelic?: string;
}

export type Reward =
  | { kind: 'relic'; relic: string; replaces?: string }
  | { kind: 'heirloom'; piece: PieceId; item: string }
  | { kind: 'book'; card: string };

/** The run's pace, chosen once at the Draw; every match of the run plays it. */
export type RunPace = 'classical' | 'blitz';

/** `between`: on the Draw, Spoils or Setup; `playing`: a match is under way; then the run is over. */
export type RunStatus = 'between' | 'playing' | 'champion' | 'out';

export interface RunMatchResult {
  /** The opponent court's name. */
  opponent: string;
  won: boolean;
  minutes: number;
  /** No Checkmate: decided by Bastions, then Throne health. */
  adjudicated: boolean;
  /** White's best piece that match (the report's White MVP), if known. */
  mvp: PieceId | null;
}

export interface RunState {
  v: 1;
  seed: number;
  pace: RunPace;
  /** The current round, 0..3 (Club .. Final). */
  round: number;
  opponents: OpponentDef[];
  /** White's court: pre-filled into Setup, and the court the current match began with. */
  court: TeamSetup;
  /** Archetypes taken at Rank 4 by themselves from match 2 (a missing piece chooses at Rank 4). */
  archetypes: Partial<Record<PieceId, string>>;
  /** At most `tournament.relicMax` (5). */
  relics: CarriedRelic[];
  heirlooms: Partial<Record<PieceId, string>>;
  books: string[];
  results: RunMatchResult[];
  /** The open Spoils screen's three cards; null when none is open. */
  offers: Reward[] | null;
  status: RunStatus;
}

/** What a finished match hands the run (`outcomeOf` reads it off a `Match`). */
export interface MatchOutcome {
  winner: PlayTeam | null;
  minutes: number;
  adjudicated: boolean;
  mvp: PieceId | null;
  /** White's relics at the end, by piece type. */
  relics: CarriedRelic[];
  /** White's archetypes chosen this match. */
  styles: Partial<Record<PieceId, string>>;
  /** Items each White piece held at the end (the heirloom offer goes to the piece with fewest). */
  items: Partial<Record<PieceId, number>>;
}

/** A run step that checks the player's input. */
export type RunStep = { ok: true; run: RunState } | { ok: false; reason: string };

/** The one line kept on the device after a run (decision 8): how far the best run got. */
export interface BestFinish {
  v: 1;
  /** The furthest round reached, 0..3. */
  round: number;
  champion: boolean;
}
