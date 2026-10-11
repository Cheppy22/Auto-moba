import type { LaneId, PieceId } from './content/schema';
import type { PlayTeam } from './types';

/** The two sides in play order: A is White, B is Black. */
export const PLAY_TEAMS: readonly PlayTeam[] = ['A', 'B'];

export const TEAM_NAME: Record<PlayTeam, string> = { A: 'White', B: 'Black' };

/** top/mid/bot -> the names the map shows. */
export const LANE_NAME: Record<LaneId, string> = { top: 'Left', mid: 'Mid', bot: 'Right' };

export const PIECE_NAME: Record<PieceId, string> = {
  king: 'King',
  queen: 'Queen',
  rook: 'Rook',
  bishop: 'Bishop',
  knight: 'Knight',
};

/** "White" or "Black" for a team id; anything else (a neutral team, no team) comes back as given. */
export function teamWord(team: string): string {
  return team === 'A' || team === 'B' ? TEAM_NAME[team] : team;
}
