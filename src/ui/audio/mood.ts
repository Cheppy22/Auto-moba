/**
 * What the music and the garden should feel like right now. Pure: the session feeds in what is
 * happening, the engine eases toward the answer. Nothing here touches the sim.
 */
import type { GameEvent } from '../../sim';

export type Screen = 'menu' | 'setup' | 'live' | 'break' | 'end';

export interface MoodInput {
  screen: Screen;
  /** The current Act (1-based; 0 outside a match). */
  act: number;
  /** Endgame starts at this Act. */
  endgameAct: number;
  /** 0..1 recent fighting (see `Heat`). */
  heat: number;
  /** Either side is in Check. */
  check: boolean;
  /** Either Throne has fallen. */
  throneDown: boolean;
}

export interface Mood {
  /** 0 calm .. 1 tense: sets how far the music leans on the tense layer. */
  tension: number;
  /** 0 quiet .. 1 loud: how much the garden swells (wind, rumble). */
  intensity: number;
}

const clamp = (v: number): number => Math.min(1, Math.max(0, v));

export function moodFor(i: MoodInput): Mood {
  if (i.screen !== 'live') {
    // menus, setup and the Act break sheet are the calm bed; the break keeps a little of the match
    return { tension: i.screen === 'break' ? 0.12 : 0, intensity: 0 };
  }
  const lateAct = Math.max(0, i.act - 1) * 0.07;
  const endgame = i.act >= i.endgameAct ? 0.25 : 0;
  const tension = clamp(
    0.12 + lateAct + endgame + i.heat * 0.28 + (i.check ? 0.22 : 0) + (i.throneDown ? 0.2 : 0),
  );
  const intensity = clamp(i.heat * 0.85 + (i.check ? 0.2 : 0) + endgame * 0.4);
  return { tension, intensity };
}

/**
 * A running "how hot is the fighting" number. Hits and falls push it up; it drains on its own
 * (about 6 seconds to forget), so a quiet minute returns to calm.
 */
export class Heat {
  private value = 0;
  private at = 0;
  constructor(private readonly tauMs = 6000) {}

  bump(amount: number, nowMs: number): void {
    this.value = Math.min(1.2, this.read(nowMs) + amount);
    this.at = nowMs;
  }

  read(nowMs: number): number {
    const dt = Math.max(0, nowMs - this.at);
    return this.value * Math.exp(-dt / this.tauMs);
  }
}

/** How much one sim event heats a fight (0 for most events). */
export function heatOf(e: GameEvent): number {
  switch (e.type) {
    case 'damage':
      return e.payload.tgtKind === 'hero' ||
        e.payload.tgtKind === 'guardian' ||
        e.payload.tgtKind === 'tower'
        ? Math.min(0.03, e.payload.amount / 7000)
        : 0;
    case 'death':
      return e.payload.kind === 'hero' ? 0.14 : 0;
    case 'structureDown':
      return 0.25;
    case 'check':
    case 'throneDown':
      return 0.3;
    case 'gambit':
      return 0.04;
    default:
      return 0;
  }
}
