export const PALETTE = {
  bg: '#08080c',
  panel: '#141320',
  border: '#6b5532',
  text: '#ece2cc',
  dim: '#9d93a8',
  gold: '#e0a93e',
  neutral: '#b9a0e6',
  spirit: '#c4a8f0',
  seal: '#b3262e',
  camp: '#b0794a',
  teamA: '#6fbfa8',
  teamB: '#d04a52',
} as const;

export function teamColor(team: string): string {
  return team === 'A' ? PALETTE.teamA : team === 'B' ? PALETTE.teamB : PALETTE.neutral;
}
