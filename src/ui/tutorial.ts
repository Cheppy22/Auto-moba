// The first-match tutorial: five short nudges, each shown once, remembered on this device.
// Every storage read and write is wrapped (private windows and previews can block storage); a
// blocked store just means the nudges show again next visit, never a crash.

/** The nudges, in the order a first match usually meets them. */
export type NudgeId = 'tempo' | 'eye' | 'capture' | 'fork' | 'break';

export const NUDGES: readonly NudgeId[] = ['tempo', 'eye', 'capture', 'fork', 'break'];
export const TUTORIAL_KEY = 'automoba.tutorial';

/** The parts of `Storage` the tutorial uses (tests pass a stand-in). */
export type TutorialStore = Pick<Storage, 'getItem' | 'setItem'>;

interface Saved {
  v: 1;
  /** Nudges already shown. */
  seen: NudgeId[];
  /** The player skipped the whole tutorial. */
  off: boolean;
}

function defaultStore(): TutorialStore | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function load(at: TutorialStore | null): Saved {
  const fresh: Saved = { v: 1, seen: [], off: false };
  if (!at) return fresh;
  try {
    const text = at.getItem(TUTORIAL_KEY);
    if (text === null) return fresh;
    const x = JSON.parse(text) as Partial<Saved> | null;
    if (!x || x.v !== 1 || !Array.isArray(x.seen)) return fresh;
    return { v: 1, seen: x.seen.filter((id): id is NudgeId => NUDGES.includes(id)), off: !!x.off };
  } catch (err) {
    console.warn('The tutorial save could not be read; the nudges start over.', err);
    return fresh;
  }
}

/**
 * What the player has been shown. `enabled` is false in end-to-end tests (`?intro=off`), where
 * every match is a first match and a nudge would cover what a test taps.
 */
export class Tutorial {
  private saved: Saved;

  constructor(
    private enabled: boolean,
    private at: TutorialStore | null = defaultStore(),
  ) {
    this.saved = load(at);
  }

  /** True when this nudge should show now: on, and never shown before. */
  canShow(id: NudgeId): boolean {
    return this.enabled && !this.saved.off && !this.saved.seen.includes(id);
  }

  /** The tutorial has more to show (the Replay button reads this). */
  get active(): boolean {
    return this.enabled && !this.saved.off && this.saved.seen.length < NUDGES.length;
  }

  /** Marks a nudge as shown. */
  seen(id: NudgeId): void {
    if (this.saved.seen.includes(id)) return;
    this.saved = { ...this.saved, seen: [...this.saved.seen, id] };
    this.persist();
  }

  /** "Skip tutorial": no more nudges, in this match or later ones. */
  skipAll(): void {
    this.saved = { ...this.saved, off: true };
    this.persist();
  }

  /** "Replay tutorial": every nudge shows again, starting with the next match or event. */
  replay(): void {
    this.saved = { v: 1, seen: [], off: false };
    this.persist();
  }

  private persist(): void {
    if (!this.at) return;
    try {
      this.at.setItem(TUTORIAL_KEY, JSON.stringify(this.saved));
    } catch (err) {
      console.warn('The tutorial save could not be written.', err);
    }
  }
}

/** The first sentence of a card's description, kept short enough for a nudge. */
export function firstSentence(text: string, max = 110): string {
  const t = text.replace(/\s+/g, ' ').trim();
  const m = /^.*?[.!?](?=\s|$)/.exec(t);
  const s = (m ? m[0] : t).trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 40 ? cut.lastIndexOf(' ') : cut.length)}…`;
}

/** "Your Knight took Black's Rook. It is out for 0:45 and you gained Tempo." */
export function captureLine(args: {
  /** The team that made the capture. */
  taker: 'A' | 'B';
  takerName: string;
  victimName: string;
  /** Seconds until the victim returns, or null if it cannot return. */
  backIn: number | null;
  courtB: string;
  tempo: number;
}): string {
  const mine = args.taker === 'A';
  const who = mine ? `Your ${args.takerName}` : `${args.courtB}'s ${args.takerName}`;
  const whom = mine ? `${args.courtB}'s ${args.victimName}` : `your ${args.victimName}`;
  const out =
    args.backIn === null
      ? 'It cannot come back.'
      : `It is out for ${Math.floor(args.backIn / 60)}:${String(Math.round(args.backIn % 60)).padStart(2, '0')}, shown in the tray at the top.`;
  const why = mine
    ? `You gain ${args.tempo} Tempo, and that lane is weaker until it returns.`
    : `${args.courtB} gains Tempo, and that lane is weaker until it returns.`;
  return `${who} took ${whom}. ${out} ${why}`;
}
