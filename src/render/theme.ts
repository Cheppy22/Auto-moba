export const PALETTE = {
  bg: '#0a0c0d',
  panel: '#141a1c',
  border: '#6b5532',
  text: '#e6dcc6',
  dim: '#9c9381',
  gold: '#e0a93e',
  neutral: '#a9d0e0',
  camp: '#b0794a',
  teamA: '#74b9b1',
  teamB: '#d0584a',
} as const;

export const DISPLAY_FONT = "'IM Fell English SC', Georgia, serif";

export function teamColor(team: string): string {
  return team === 'A' ? PALETTE.teamA : team === 'B' ? PALETTE.teamB : PALETTE.neutral;
}
