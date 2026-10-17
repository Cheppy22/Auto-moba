import { createContext } from 'preact';
import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import {
  aiReward,
  aimRunRelic,
  applyReward,
  beginMatch,
  betterFinish,
  contentFor,
  finishOf,
  Match,
  newRun,
  nextMatchConfig,
  outcomeOf,
  recordResult,
  setArchetype,
  type BestFinish,
  type CarriedRelic,
  type PieceId,
  type Reward,
  type RunState,
  type RunStep,
  type TeamSetup,
  type Command,
  type CommandResult,
  type Content,
  type GameEvent,
  type LaneId,
  type MatchConfig,
  type PlayTeam,
  type School,
} from '../sim';
import type { CamMode } from '../render/broadcast/types';
import { courtName, setOpposingCourt } from '../analysis/text';
import { inputFromMatch } from '../analysis';
import { buildSummary } from '../analysis/summary';
import { loadBest, loadRun, saveBest, saveRun } from './run/save';
import {
  blackPlayLine,
  cardLine,
  decisive,
  fallToast,
  fightLine,
  fightVerdict,
  laneNear,
} from '../analysis/feedback';
import { mmss } from './format';
import { introOutMs, type IntroPiece, type IntroState } from './intro';
import { cap, PIECE_ORDER, pieceLabel } from './pieces';
import { play } from './sound';

export type Speed = 0 | 1 | 2 | 4 | 8;

/** What the next tap on the HUD or the 3D view will do. */
export type Aim = { kind: 'gambit'; slot: number; cardId: string } | { kind: 'pawn' };

/** A short-lived banner (Act, Check, Throne) or rank-up chip. */
export interface Chip {
  id: number;
  kind: 'rank' | 'act' | 'check' | 'throne' | 'bell' | 'relic';
  title: string;
  detail: string;
  team: PlayTeam | null;
  /** Wall-clock ms when the chip leaves. */
  until: number;
  /** How long it lives, for its fade-out. */
  ms: number;
}

/** A calm one-liner from the combat feedback: a fight verdict, why a piece fell, or what a gambit did. */
export interface Note {
  id: number;
  kind: 'fight' | 'fall' | 'card';
  text: string;
  tone: 'good' | 'bad' | 'even' | 'plain';
  /** Fight verdicts: the fight's place in map units; the tag sits there in the 3D view. */
  at: { x: number; y: number } | null;
  until: number;
  ms: number;
}

/** A gambit Black played, shown as a banner at the top for a few seconds. */
export interface BlackPlay {
  id: number;
  school: School;
  text: string;
  until: number;
  ms: number;
}

/** How long a tray item waits for its flying token before it shows anyway (ms). */
const TRAY_WAIT_MS = 2600;
/**
 * The Checkmate beat's longest wait (ms): the 3D view ends it when the King has fallen (about
 * 3.2 s); without a 3D view the word shows at once and the splash follows after a short hold.
 */
const MATE_BEAT_MAX_MS = 7000;
const MATE_BEAT_BARE_MS = 1400;

export interface UiState {
  speed: Speed;
  /** Camera: free (the default), auto (the director), follow (a unit) or lane (a lane leaned in on). */
  cam: CamMode;
  /** Lane camera: the lane the view leans in on (only while `cam` is 'lane'). */
  zoomLane: LaneId | null;
  /** The unit the camera follows (only while `cam` is 'follow'; the fork camera uses it too). */
  follow: number | null;
  /** The camera is turned or tilted away from its default angle (the compass shows). */
  camTurned: boolean;
  caption: string | null;
  toast: string | null;
  aim: Aim | null;
  adjourned: boolean;
  chips: Chip[];
  /** Fight verdicts, falls and gambit lines share one lane: at most two show, the newest wins. */
  notes: Note[];
  reportHero: number | null;
  /** The piece whose card is open (any team). */
  card: number | null;
  /** The gambit sheet (long-press on a card): the hand slot shown enlarged. The game is paused while it is open. */
  info: { slot: number; cardId: string } | null;
  /** The tab open on the Act break sheet. */
  breakTab: 'report' | 'orders' | 'armory' | 'relics';
  /** The piece shown in the Armory tab (a hero id); null until the tab picks the one with most gold. */
  armoryPick: number | null;
  /** When (ms) a countdown alert last flashed the Act clock; 0 before the first. */
  clockFlash: number;
  /** The match intro while it plays; the sim is held until it ends. */
  intro: IntroState | null;
  /** The Black gambit banner on screen; the next one waits in the session's queue. */
  blackPlay: BlackPlay | null;
  /**
   * The Checkmate beat: for about 3 s after Checkmate the 3D view pushes in on the losing King
   * as he topples (`fallen` once he hits the ground); the result splash waits until the view
   * says the beat is over, 7 s at most (a tap skips it).
   */
  mateBeat: { winner: 'A' | 'B'; fallen: boolean } | null;
}

const freshUi = (): UiState => ({
  speed: 1,
  cam: 'free',
  zoomLane: null,
  follow: null,
  camTurned: false,
  caption: null,
  toast: null,
  aim: null,
  adjourned: false,
  chips: [],
  notes: [],
  reportHero: null,
  card: null,
  info: null,
  breakTab: 'report',
  armoryPick: null,
  clockFlash: 0,
  intro: null,
  blackPlay: null,
  mateBeat: null,
});

/** The 3D view's picking calls, set by the game view while it exists. */
export interface PickView {
  pickGround(clientX: number, clientY: number): { x: number; y: number } | null;
  pickUnit(clientX: number, clientY: number): number | null;
  /** Where a map point lands on the canvas (CSS pixels from its top-left). */
  project(x: number, y: number, lift?: number): { x: number; y: number; visible: boolean };
  /** Eases the camera back to its default angle (the compass). */
  resetAngle(): void;
}

/** White's pawn plan at the start of a match (Orders changes it at each Act break). */
const DEFAULT_PAWN_PLAN = { top: 2, mid: 2, bot: 2 };
const RANK_CHIP_MS = 3200;
const BANNER_MS = 2400;
const BELL_CHIP_MS = 2200;
const MAX_RANK_CHIPS = 1;
const MAX_BANNERS = 2;
const MAX_NOTES = 2;
const FIGHT_NOTE_MS = 4200;
const NOTE_MS = 3200;
const BLACK_PLAY_MS = 3000;
/** Banners waiting behind the visible one; at fast speeds the oldest are dropped. */
const MAX_BLACK_QUEUE = 3;
/** Size (px) of the intro's piece portraits: twice what the card shows, so they stay sharp on a phone. */
const PORTRAIT_PX = 192;
/** The run speeds the chip cycles through; 0 is paused. */
const SPEEDS: Speed[] = [1, 2, 4, 8, 0];
/** How far (map units) a tap may miss a unit and still count when it picks the ground. */
const NEAR_PICK = 90;
const same = (a: Chip, b: Chip): boolean => a.kind === b.kind && a.title === b.title;
const isMap = (kind: string): boolean => kind === 'tower' || kind === 'guardian';

export class Session {
  match: Match | null = null;
  /**
   * The Tournament run being played (null in an Exhibition). Saved on this device between
   * matches (`src/ui/run/save.ts`); a match in progress is not saved.
   */
  run: RunState | null = null;
  /** The best-finish line kept on this device after runs end (no power; decision 8). */
  best: BestFinish | null = loadBest();
  /** The run that just ended set a new best finish (the Run summary says so). */
  runBestNew = false;
  ui: UiState = freshUi();
  version = 0;
  alpha = 1;
  view: PickView | null = null;
  /** The sim's step-rate multiplier this frame (1, easing to 0 across the bell's halt). */
  timeScale = 1;
  private lastLeft: number | null = null;
  private chipId = 0;
  private noteId = 0;
  private blackQueue: { school: School; text: string }[] = [];
  private blackId = 0;
  /** True once the intro portraits are drawn (while the player was on the setup screens). */
  private portraitsWarm = false;
  private prewarming = false;
  /** The last running speed, which the Act clock's hold returns to. */
  private runSpeed: Speed = 1;
  /** The run as it stood when the open Setup's match was built (see `issue`). */
  private matchRun: RunState | null = null;
  /** `?run=test` turns on `testEnd` (end-to-end tests). */
  private runTestHook = new URLSearchParams(window.location.search).get('run') === 'test';
  /** `?intro=off` skips the match intro (end-to-end tests). */
  private introOn = new URLSearchParams(window.location.search).get('intro') !== 'off';
  private seenSeq = -1;
  private toastTimer = 0;
  /** Camera mode and target to restore when the fork sheet closes. */
  private forkCam: { cam: CamMode; follow: number | null } | null = null;
  /** When the gambit sheet opened (ms), so the lifting finger cannot close it at once. */
  infoAt = 0;
  /**
   * Captures whose token is flying from the board to the HUD tray: piece id -> the time (ms)
   * the tray stops waiting for it (the item shows when the token lands, or then at the latest).
   */
  private readonly trayWait = new Map<number, number>();
  private mateTimer = 0;
  private escapes: (() => void)[] = [];
  private listeners = new Set<() => void>();
  private frameListeners = new Set<(alpha: number) => void>();

  /**
   * The Long Board is the game's map (the sim, the 3D view, the report and the replay map);
   * `?map=square` plays the old square map.
   */
  private readonly longMap =
    typeof window === 'undefined' ||
    new URLSearchParams(window.location.search).get('map') !== 'square';

  constructor(readonly content: Content) {}

  /** The content the board is drawn from: the match's own (its map), or the one the next match plays. */
  get board(): Content {
    return this.match?.content ?? (this.longMap ? contentFor(this.content, 'long') : this.content);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onFrame(fn: (alpha: number) => void): () => void {
    this.frameListeners.add(fn);
    return () => this.frameListeners.delete(fn);
  }

  frame(alpha: number): void {
    this.alpha = alpha;
    for (const fn of this.frameListeners) fn(alpha);
  }

  notify(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  setUi(patch: Partial<UiState>): void {
    this.ui = { ...this.ui, ...patch };
    this.notify();
  }

  /** The 3D view knocked a captured piece flying: its tray item waits for the token. */
  captureStart(id: number): void {
    this.trayWait.set(id, performance.now() + TRAY_WAIT_MS);
  }

  /** The capture token reached the tray (or could not fly): the tray item shows. */
  captureLanded(id: number): void {
    if (this.trayWait.delete(id)) this.notify();
  }

  /** True while a captured piece's token is still on its way to the tray. */
  trayWaiting(id: number): boolean {
    const until = this.trayWait.get(id);
    if (until === undefined) return false;
    if (performance.now() < until) return true;
    this.trayWait.delete(id);
    return false;
  }

  /** Starts the Checkmate beat (the result splash waits for it). */
  private startMateBeat(winner: 'A' | 'B'): void {
    window.clearTimeout(this.mateTimer);
    const m = this.match;
    const view = !!this.view;
    this.setUi({ mateBeat: { winner, fallen: !view } });
    this.mateTimer = window.setTimeout(
      () => {
        if (this.match === m) this.endMateBeat();
      },
      view ? MATE_BEAT_MAX_MS : MATE_BEAT_BARE_MS,
    );
  }

  /** The King has hit the ground: the word lands. */
  mateFell(): void {
    const b = this.ui.mateBeat;
    if (b && !b.fallen) this.setUi({ mateBeat: { ...b, fallen: true } });
  }

  /** Ends the Checkmate beat at once (its timer, or a tap to skip). */
  endMateBeat(): void {
    window.clearTimeout(this.mateTimer);
    if (this.ui.mateBeat) this.setUi({ mateBeat: null });
  }

  /** A short message near the hand (the sim's refusals, small hints). */
  toast(message: string, ms = 2600): void {
    window.clearTimeout(this.toastTimer);
    this.setUi({ toast: cap(message) });
    this.toastTimer = window.setTimeout(() => this.setUi({ toast: null }), ms);
  }

  pushEscape(close: () => void): () => void {
    this.escapes.push(close);
    return () => {
      this.escapes = this.escapes.filter((fn) => fn !== close);
    };
  }

  closeTopOverlay(): void {
    this.escapes[this.escapes.length - 1]?.();
  }

  // ------------------------------------------------------------ match

  newMatch(config?: Partial<MatchConfig>): void {
    const seed = config?.seed ?? Math.floor(Math.random() * 1e9);
    // the browser game stops for White's forks and for the Act break sheet, on the Long Board
    // unless `?map=square`
    this.match = Match.create(this.content, {
      seed,
      pauseForForks: true,
      pauseForBreak: true,
      ...(this.longMap ? { map: 'long' as const } : {}),
      ...config,
    });
    // Black reads as the opposing court's name in a run (see `courtName`), "Black" in an Exhibition
    setOpposingCourt(this.run?.opponents[this.run.round]?.name ?? null);
    this.seenSeq = -1;
    this.lastLeft = null;
    this.forkCam = null;
    this.trayWait.clear();
    window.clearTimeout(this.mateTimer);
    this.blackQueue = [];
    this.ui = { ...freshUi(), cam: this.ui.cam === 'auto' ? 'auto' : 'free' };
    this.notify();
  }

  issue(cmd: Command): CommandResult {
    if (!this.match) return { ok: false, reason: 'no match' };
    // the Run kit may have changed archetypes or relic aims since this Setup opened: the match is
    // built again from the run as it stands (nothing has happened in it yet)
    if (cmd.type === 'setupTeam' && this.run?.status === 'between' && this.matchRun !== this.run) {
      const ui = this.ui;
      this.newMatch(nextMatchConfig(this.content, this.run));
      this.ui = ui;
      this.matchRun = this.run;
    }
    const r = this.match.issue(cmd);
    if (!r.ok) this.toast(r.reason ?? 'rejected');
    else {
      if (cmd.type === 'setupTeam') {
        if (this.run?.status === 'between') {
          const court = { opening: cmd.opening, pieces: cmd.pieces.map((e) => ({ ...e })) };
          this.applyRun(beginMatch(this.content, this.run, court));
        }
        // White starts with a standing pawn plan, so a player who never taps still fields pawns
        this.match.issue({ type: 'setPawnPlan', quota: DEFAULT_PAWN_PLAN });
        this.startIntro();
      } else if (cmd.type === 'playGambit') play('thud');
      else if (cmd.type === 'pickRelic' || cmd.type === 'autoRelic') play('chime');
      this.notify();
    }
    return r;
  }

  reset(): void {
    // a run in memory is on the device's save; the Title offers Continue
    this.run = null;
    this.leaveMatch();
  }

  /** Closes the match and its screens but keeps the run: the next run screen (Spoils, summary) shows. */
  leaveMatch(): void {
    this.match = null;
    this.forkCam = null;
    this.blackQueue = [];
    this.ui = freshUi();
    this.notify();
  }

  adjourn(): void {
    if (this.match?.state.phase.kind !== 'live' || this.match.state.bell.stage === 'break') return;
    this.setUi({ adjourned: true, aim: null, card: null, info: null });
  }

  /** The speed chip: 1x, 2x, 4x, 8x, then paused, then 1x again. */
  cycleSpeed(): void {
    const i = SPEEDS.indexOf(this.ui.speed);
    if (this.ui.speed > 0) this.runSpeed = this.ui.speed;
    this.setUi({ speed: SPEEDS[(i + 1) % SPEEDS.length] });
  }

  /** Holding the Act clock: pause, or run again at the speed it had (1x if it was never changed). */
  togglePause(): void {
    if (this.ui.speed > 0) {
      this.runSpeed = this.ui.speed;
      this.setUi({ speed: 0 });
    } else this.setUi({ speed: this.runSpeed });
  }

  /** The Auto switch: the director camera follows the big plays; off returns to the free camera. */
  setAuto(on: boolean): void {
    this.setUi({ cam: on ? 'auto' : 'free', zoomLane: null, follow: null });
  }

  /** The free camera, from wherever the camera is now (a drag, a tap on empty ground). */
  freeCam(): void {
    if (this.ui.cam !== 'free') this.setUi({ cam: 'free', zoomLane: null, follow: null });
  }

  /** The camera follows a unit (a piece or a pawn). */
  followUnit(id: number): void {
    this.setUi({ cam: 'follow', follow: id, zoomLane: null });
  }

  /**
   * The lane camera: leans in on a lane; the same lane again (or Escape, or null) returns to the
   * free camera.
   */
  zoomLane(lane: LaneId | null): void {
    const same = lane === null || (this.ui.cam === 'lane' && this.ui.zoomLane === lane);
    this.setUi(
      same
        ? { cam: 'free', follow: null, zoomLane: null }
        : { cam: 'lane', follow: null, zoomLane: lane },
    );
  }

  /** The compass: the camera eases back to its default angle. */
  resetAngle(): void {
    this.view?.resetAngle();
  }

  /** Opens the piece card (any team); a second call for the same piece closes it. */
  openCard(id: number | null): void {
    this.setUi({ card: id === this.ui.card ? null : id, info: null });
  }

  closeCard(): void {
    if (this.ui.card !== null) this.setUi({ card: null });
  }

  /**
   * Opens a gambit card enlarged (long-press or right-click). The loop holds the sim while
   * `ui.info` is set; the speed is untouched, so closing the sheet resumes at the old speed.
   */
  showInfo(slot: number): void {
    const m = this.match;
    if (
      !m ||
      m.state.phase.kind !== 'live' ||
      this.ui.adjourned ||
      m.state.forks.length > 0 ||
      m.state.bell.stage === 'break'
    )
      return;
    const card = m.snapshot().hand[slot];
    if (!card || card.cardId === '') return;
    this.infoAt = performance.now();
    this.setUi({ info: { slot, cardId: card.cardId }, card: null, aim: null });
  }

  closeInfo(): void {
    if (this.ui.info) this.setUi({ info: null });
  }

  resume(): void {
    this.setUi({ adjourned: false });
  }

  // ------------------------------------------------------------ tournament run

  /** The saved run on this device (for the Title's Continue), or null. */
  savedRun(): RunState | null {
    return loadRun(this.content);
  }

  /** A new run (the Draw comes next); it replaces any saved run. */
  startRun(seed = Math.floor(Math.random() * 1e9)): void {
    this.match = null;
    this.runBestNew = false;
    this.run = newRun(this.content, seed);
    saveRun(this.run);
    this.notify();
  }

  /**
   * Picks up the saved run. Between matches it waits where it was saved (Spoils when offers are
   * open, else Setup for the next round via `playRound`); a run saved while a match was being
   * played restarts that match from its beginning, with the same court and seed.
   */
  continueRun(): boolean {
    const run = this.savedRun();
    if (!run) return false;
    this.run = run;
    this.runBestNew = false;
    if (run.status === 'playing') {
      this.newMatch(nextMatchConfig(this.content, run));
      this.issue({ type: 'setupTeam', ...run.court });
    } else if (run.status === 'between' && !run.offers && run.results.length > 0) this.playRound();
    else this.notify();
    return true;
  }

  /** Opens Setup for the current round's match (pre-fill it with `setupDefaults`). */
  playRound(): void {
    if (!this.run) return;
    this.newMatch(nextMatchConfig(this.content, this.run));
    this.matchRun = this.run;
  }

  /** What Setup pre-fills: the run's court, else the match's seeded default. */
  setupDefaults(): TeamSetup | null {
    if (this.run) return this.run.court;
    return this.match ? this.match.defaultSetup() : null;
  }

  /** Spoils: takes one reward ('auto' = Let the AI choose) and goes on to Setup for the next round. */
  pickReward(reward: Reward | 'auto'): CommandResult {
    if (!this.run) return { ok: false, reason: 'no run' };
    const pick = reward === 'auto' ? aiReward(this.content, this.run) : reward;
    if (!pick) return { ok: false, reason: 'no reward to take' };
    const r = this.applyRun(applyReward(this.content, this.run, pick));
    if (r.ok) {
      play('chime');
      this.playRound();
    }
    return r;
  }

  /** Run kit: a piece's carried archetype (null: choose at Rank 4). */
  setRunArchetype(piece: PieceId, style: string | null): CommandResult {
    if (!this.run) return { ok: false, reason: 'no run' };
    return this.applyRun(setArchetype(this.content, this.run, piece, style));
  }

  /** Run kit: re-aims a carried relic. */
  aimRunRelic(relicId: string, aim: Partial<Omit<CarriedRelic, 'id'>>): CommandResult {
    if (!this.run) return { ok: false, reason: 'no run' };
    return this.applyRun(aimRunRelic(this.content, this.run, relicId, aim));
  }

  /**
   * Test hook (`?run=test`): ends the match at once with a set winner, as a Checkmate would (or
   * as an adjudication would, when asked), so end-to-end tests walk a whole run without playing
   * four matches.
   */
  testEnd(winner: PlayTeam | null, adjudicated = false, mate = false): void {
    const m = this.match;
    if (!m || !this.runTestHook || m.state.phase.kind === 'end') return;
    const ctx = m.ctx;
    ctx.s.winner = winner;
    ctx.s.phase = { kind: 'end', n: ctx.s.phase.n, startTick: ctx.s.tick };
    // `mate`: as a real Checkmate, so the view plays the Checkmate beat before the splash
    if (mate && winner) ctx.emit('checkmate', { winner });
    ctx.emit('matchEnd', {
      winner,
      phase: ctx.s.phase.n,
      ...(adjudicated ? { adjudicated: true as const } : {}),
    });
    this.notify();
  }

  /**
   * Leaves the run, the one in memory or else the one saved on the device: its save is deleted.
   * Abandoning a run that got past the Club round still counts for the best-finish line.
   */
  endRun(): void {
    const run = this.run ?? this.savedRun();
    if (run && (run.status === 'between' || run.status === 'playing') && run.round > 0) {
      this.best = betterFinish(this.best, { v: 1, round: run.round, champion: false });
      saveBest(this.best);
    }
    saveRun(null);
    this.run = null;
    this.runBestNew = false;
    this.notify();
  }

  private applyRun(step: RunStep): CommandResult {
    if (!step.ok) {
      this.toast(step.reason);
      return { ok: false, reason: step.reason };
    }
    this.run = step.run;
    saveRun(this.run);
    this.notify();
    return { ok: true };
  }

  /** The run's match has ended: record it (Spoils, or the run's end and the best finish). */
  private finishRunMatch(m: Match): void {
    if (!this.run || this.run.status !== 'playing') return;
    let mvp: PieceId | null = null;
    try {
      const row = buildSummary(inputFromMatch(m, m.content)).mvp.White?.row;
      mvp = (row?.piece as PieceId | undefined) ?? null;
    } catch (err) {
      console.warn('Run: the match MVP could not be read', err);
    }
    this.run = recordResult(this.content, this.run, outcomeOf(m, mvp));
    const done = finishOf(this.run);
    if (done) {
      const before = this.best;
      this.best = betterFinish(before, done);
      this.runBestNew = this.best !== before && this.best === done;
      saveBest(this.best);
    }
    saveRun(this.run);
    this.notify();
  }

  // ------------------------------------------------------------ match intro

  /**
   * Draws the intro portraits in the background while the player is on the setup screens, so the
   * versus card has them the moment Begin is pressed. They are generic per piece and team (no
   * style, no Opening), so nothing the player picks changes them. White's five first, then
   * Black's, each in its own task so the setup screen stays responsive between them.
   */
  prewarmPortraits(): void {
    if (this.portraitsWarm || this.prewarming) return;
    this.prewarming = true;
    const draw = (team: 'A' | 'B', next: (() => void) | null): void => {
      setTimeout(() => {
        import('../render/portraits')
          .then(({ renderPortraits }) => {
            renderPortraits(
              PIECE_ORDER.map((piece) => ({ piece, team })),
              PORTRAIT_PX,
            );
          })
          .catch((err) => console.error('The intro portraits failed to load', err))
          .finally(() => {
            if (next) next();
            else {
              this.prewarming = false;
              this.portraitsWarm = true;
            }
          });
      }, 250);
    };
    draw('A', () => draw('B', null));
  }

  /**
   * After Begin: the versus card shows at once over the dimmed board and holds (the sim waits)
   * until the player starts the match (not for `?intro=off`). It shows a glyph where a portrait is
   * not drawn yet and swaps the portrait in when it arrives; normally the setup screens have drawn
   * them already.
   */
  private startIntro(): void {
    const m = this.match;
    if (!this.introOn || !m || m.state.phase.kind !== 'live') return;
    const pieces: IntroPiece[] = [];
    for (const u of m.snapshot().units)
      if (u.piece && u.lane && (u.team === 'A' || u.team === 'B'))
        pieces.push({ id: u.id, team: u.team, piece: u.piece, lane: u.lane });
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.ui = {
      ...this.ui,
      intro: {
        startedAt: performance.now(),
        reduced,
        phase: 'show',
        outAt: null,
        pieces,
        portraits: null,
      },
      aim: null,
      card: null,
      info: null,
    };
    // each piece's portrait is its own 3D model, drawn once offscreen by the render layer; cached,
    // so after the setup prewarm this returns at once. Otherwise draw after the card has painted.
    const done = (portraits: ReadonlyMap<string, string> | null): void => {
      const intro = this.ui.intro;
      if (intro?.pieces === pieces) this.setUi({ intro: { ...intro, portraits } });
    };
    const keys = pieces.map(({ piece, team }) => ({ piece, team }));
    const draw = (): void => {
      import('../render/portraits')
        .then(({ renderPortraits }) => {
          const drawn = renderPortraits(keys, PORTRAIT_PX);
          this.portraitsWarm = true;
          done(drawn.size > 0 ? drawn : null);
        })
        .catch((err) => {
          console.error('The intro portraits failed to load', err);
          done(null);
        });
    };
    if (this.portraitsWarm) draw();
    else setTimeout(draw, 120);
  }

  /** The player starts the match from the card (tap, Begin, Enter, Space, Escape): it dissolves, then play begins. */
  startFromIntro(): void {
    const intro = this.ui.intro;
    if (!intro || intro.phase === 'out') return;
    this.setUi({ intro: { ...intro, phase: 'out', outAt: performance.now() } });
  }

  /** Ends the intro once its dissolve is done. Called every frame; the card never ends by itself otherwise. */
  syncIntro(): void {
    const intro = this.ui.intro;
    if (intro?.outAt != null && performance.now() - intro.outAt >= introOutMs(intro.reduced))
      this.skipIntro();
  }

  /** Ends the intro now: play begins and the Act banner shows. */
  skipIntro(): void {
    if (!this.ui.intro) return;
    const act = this.match?.snapshot().act.n;
    const chips = this.ui.chips.filter((c) => c.kind !== 'act');
    if (act)
      chips.push(
        this.chip({ kind: 'act', title: `Act ${act}`, detail: '', team: null }, BANNER_MS),
      );
    this.setUi({ intro: null, chips });
  }

  // ------------------------------------------------------------ gambits, pawns, forks

  /** Tap on a hand card: play it, or start aiming it. */
  playCard(slot: number): void {
    const m = this.match;
    if (!m) return;
    const card = m.snapshot().hand[slot];
    if (!card || card.cardId === '') return;
    if (this.ui.aim?.kind === 'gambit' && this.ui.aim.slot === slot) {
      this.setUi({ aim: null });
      return;
    }
    if (!card.usable) {
      this.setUi({ aim: null });
      this.toast(card.reason || 'that card cannot be played now');
      return;
    }
    if (card.target === 'none') {
      this.setUi({ aim: null });
      this.issue({ type: 'playGambit', slot });
      return;
    }
    this.setUi({ aim: { kind: 'gambit', slot, cardId: card.cardId }, toast: null });
  }

  /** Tap on Field Pawn: check the cost and cap, then ask for a lane. */
  fieldPawn(): void {
    const m = this.match;
    if (!m) return;
    if (this.ui.aim?.kind === 'pawn') {
      this.setUi({ aim: null });
      return;
    }
    const snap = m.snapshot();
    const p = snap.pawns.A;
    if (snap.phase.kind !== 'live') return this.toast('Pawns are fielded during the match');
    if (snap.act.bell === 'halt' || snap.act.bell === 'break')
      return this.toast('Play is stopped for the bell');
    if (snap.tempo.A < p.cost) return this.toast('Not enough Tempo');
    if (p.alive >= p.cap) return this.toast('Pawn cap reached');
    this.setUi({ aim: { kind: 'pawn' }, toast: null });
  }

  cancelAim(): void {
    if (this.ui.aim) this.setUi({ aim: null });
  }

  /** A lane button of the aim tray. */
  aimLane(lane: LaneId): void {
    const aim = this.ui.aim;
    if (!aim) return;
    if (aim.kind === 'pawn') this.issue({ type: 'fieldPawn', lane });
    else this.issue({ type: 'playGambit', slot: aim.slot, lane });
    this.setUi({ aim: null });
  }

  /** A tap on the 3D view while a point or enemy gambit is being aimed. */
  aimTap(clientX: number, clientY: number): void {
    const aim = this.ui.aim;
    const m = this.match;
    if (!aim || aim.kind !== 'gambit' || !m) return;
    if (!this.view) return this.toast('The 3D view is not ready: pick a lane card instead');
    const card = m.snapshot().hand[aim.slot];
    if (!card || card.cardId !== aim.cardId) {
      this.setUi({ aim: null });
      return;
    }
    let r: CommandResult | null = null;
    if (card.target === 'point') {
      const g = this.view.pickGround(clientX, clientY);
      if (!g) return this.toast('Tap the board to choose a spot');
      r = this.issue({ type: 'playGambit', slot: aim.slot, x: g.x, y: g.y });
    } else if (card.target === 'ally') {
      const targetId = this.pickAlly(clientX, clientY);
      if (targetId === null) return this.toast('Tap one of your pieces');
      r = this.issue({ type: 'playGambit', slot: aim.slot, targetId });
    } else if (card.target === 'enemy') {
      const wantStructure = card.cardId === 'siege';
      const targetId = this.pickEnemy(clientX, clientY, wantStructure);
      if (targetId === null)
        return this.toast(
          wantStructure
            ? `Tap a ${courtName('B')} Bastion or Throne`
            : `Tap a ${courtName('B')} piece`,
        );
      r = this.issue({ type: 'playGambit', slot: aim.slot, targetId });
    }
    if (r?.ok) this.setUi({ aim: null });
  }

  /**
   * A portrait tapped while a card that needs a piece is being aimed: a White portrait for an ally
   * card (Exchange), a Black portrait for an enemy card (Check, Fork) plays the card on that piece.
   * True when the tap was meant for the card (even if the sim refused it), so it must not also
   * follow the piece.
   */
  aimUnit(id: number, team: 'A' | 'B' = 'A'): boolean {
    const aim = this.ui.aim;
    const m = this.match;
    if (!aim || aim.kind !== 'gambit' || !m) return false;
    const card = m.snapshot().hand[aim.slot];
    if (!card || card.cardId !== aim.cardId) return false;
    // Siege aims at a Bastion or Throne, which has no portrait
    const want = team === 'A' ? 'ally' : card.cardId === 'siege' ? null : 'enemy';
    if (card.target !== want) return false;
    const r = this.issue({ type: 'playGambit', slot: aim.slot, targetId: id });
    if (r.ok) this.setUi({ aim: null });
    return true;
  }

  /** One of White's pieces under a tap, or the nearest one around the tapped ground. */
  private pickAlly(clientX: number, clientY: number): number | null {
    const m = this.match!;
    const view = this.view!;
    const good = (id: number | null): boolean => {
      const u = id === null ? undefined : m.unitById(id);
      return !!u && u.alive && u.team === 'A' && !!u.hero;
    };
    const direct = view.pickUnit(clientX, clientY);
    if (good(direct)) return direct;
    const g = view.pickGround(clientX, clientY);
    if (!g) return null;
    let best: number | null = null;
    let bestD = NEAR_PICK;
    for (const u of m.state.units) {
      if (!good(u.id)) continue;
      const d = Math.hypot(u.x - g.x, u.y - g.y);
      if (d < bestD) {
        bestD = d;
        best = u.id;
      }
    }
    return best;
  }

  /** The enemy unit under a tap; falls back to the nearest valid one around the tapped ground. */
  private pickEnemy(clientX: number, clientY: number, structure: boolean): number | null {
    const m = this.match!;
    const view = this.view!;
    const good = (id: number | null): boolean => {
      const u = id === null ? undefined : m.unitById(id);
      if (!u || !u.alive || u.team !== 'B') return false;
      return structure ? isMap(u.kind) : !!u.hero;
    };
    const direct = view.pickUnit(clientX, clientY);
    if (good(direct)) return direct;
    const g = view.pickGround(clientX, clientY);
    if (!g) return null;
    let best: number | null = null;
    let bestD = NEAR_PICK;
    for (const u of m.state.units) {
      if (!u.alive || !good(u.id)) continue;
      const d = Math.hypot(u.x - g.x, u.y - g.y);
      if (d < bestD) {
        bestD = d;
        best = u.id;
      }
    }
    return best;
  }

  chooseFork(heroId: number, optionId: string): void {
    this.issue({ type: 'chooseFork', heroId, optionId });
  }

  /** "Let the AI choose": the AI answers every waiting fork. */
  autoForks(): void {
    this.issue({ type: 'autoForks' });
  }

  /**
   * While a fork waits the camera frames the piece that is choosing; the old camera comes back
   * when the last fork is answered. Called every frame.
   */
  syncForks(): void {
    const m = this.match;
    if (!m) return;
    const head = m.state.forks.length > 0 ? m.state.forks[0].heroId : null;
    if (head !== null) {
      if (!this.forkCam) {
        this.forkCam = { cam: this.ui.cam, follow: this.ui.follow };
        this.setUi({ cam: 'follow', follow: head, aim: null, card: null, info: null });
      } else if (this.ui.cam !== 'follow' || this.ui.follow !== head) {
        this.setUi({ cam: 'follow', follow: head });
      }
    } else if (this.forkCam) {
      const back = this.forkCam;
      this.forkCam = null;
      this.setUi({ cam: back.cam, follow: back.follow });
    }
  }

  /** Leaves the Act break sheet: the next Act begins. */
  resumeAct(): void {
    if (this.issue({ type: 'resumeAct' }).ok)
      this.setUi({ breakTab: 'report', armoryPick: null, aim: null });
  }

  setBreakTab(tab: UiState['breakTab']): void {
    this.setUi({ breakTab: tab });
  }

  /** Flashes the Act clock and drops a small notice as the clock passes each alert time. */
  syncBell(): void {
    const m = this.match;
    if (!m) return;
    const st = m.state;
    if (st.phase.kind !== 'live' || st.bell.stage !== 'none') {
      this.lastLeft = null;
      return;
    }
    const t = this.content.tuning;
    const left = t.phaseSeconds - (st.tick - st.phase.startTick) / t.tickRate;
    const prev = this.lastLeft;
    this.lastLeft = left;
    if (prev === null || left >= prev) return;
    // a soft tick on each second of the last few, a little firmer as the bell nears
    const last = t.bell.pulseLastSec;
    const sec = Math.ceil(left - 1e-6);
    if (sec >= 1 && sec <= last && sec < Math.ceil(prev - 1e-6))
      play('tick', { k: (last + 1 - sec) / last });
    const hit = t.bell.alertsSec.find((a) => prev > a && left <= a);
    if (hit === undefined) return;
    const chip = this.chip(
      { kind: 'bell', title: `${mmss(hit * t.tickRate)} to the bell`, detail: '', team: null },
      BELL_CHIP_MS,
    );
    this.ui = {
      ...this.ui,
      clockFlash: performance.now(),
      chips: [...this.ui.chips.filter((c) => c.kind !== 'bell'), chip],
    };
    this.notify();
  }

  // ------------------------------------------------------------ events -> chips

  private chip(c: Omit<Chip, 'id' | 'until' | 'ms'>, ms: number): Chip {
    return { ...c, id: ++this.chipId, until: performance.now() + ms, ms };
  }

  /** Turns new sim events into banners and chips, and drops the expired ones. */
  syncEvents(): void {
    const m = this.match;
    if (!m) return;
    if (m.state.phase.kind === 'end' && this.run?.status === 'playing') this.finishRunMatch(m);
    const ev = m.events;
    if (ev.length === 0 || ev[ev.length - 1].seq < this.seenSeq) this.seenSeq = -1;
    const fresh: Chip[] = [];
    const notes: Note[] = [];
    const plays: { school: School; text: string }[] = [];
    const quiet = m.state.bell.stage === 'halt' || m.state.bell.stage === 'break';
    const note = (n: Omit<Note, 'id' | 'until' | 'ms'>, ms: number): void => {
      if (!quiet) notes.unshift({ ...n, id: ++this.noteId, until: performance.now() + ms, ms });
    };
    for (let i = ev.length - 1; i >= 0 && ev[i].seq > this.seenSeq; i--) {
      const e = ev[i];
      this.cue(m, e);
      if (e.type === 'phaseStart' && e.payload.kind === 'live') {
        fresh.unshift(
          this.chip(
            { kind: 'act', title: `Act ${e.payload.phase}`, detail: '', team: null },
            BANNER_MS,
          ),
        );
        const theirs = m.state.relics.latest.B;
        const name = theirs ? this.content.relicById.get(theirs)?.name : undefined;
        if (e.payload.phase > 1 && name)
          fresh.push(
            this.chip(
              {
                kind: 'relic',
                title: `${courtName('B')} took ${name}`,
                detail: 'Tap their relic seal',
                team: 'B',
              },
              BANNER_MS + 600,
            ),
          );
      } else if (e.type === 'fightEnd') {
        if (!decisive(e.payload)) continue;
        const v = fightVerdict(e.payload).verdict;
        note(
          {
            kind: 'fight',
            text: fightLine(e.payload),
            tone: v === 'won' ? 'good' : v === 'lost' ? 'bad' : 'even',
            at: { x: e.payload.x, y: e.payload.y },
          },
          FIGHT_NOTE_MS,
        );
      } else if (e.type === 'checkmate') {
        this.startMateBeat(e.payload.winner);
      } else if (e.type === 'death') {
        const piece = m.unitById(e.payload.id)?.hero?.defId;
        if (e.payload.team !== 'A' || !e.payload.fall || !piece) continue;
        note(
          { kind: 'fall', text: fallToast(piece, e.payload.fall), tone: 'plain', at: null },
          NOTE_MS,
        );
      } else if (e.type === 'gambitEnd') {
        const name = this.content.gambitById.get(e.payload.cardId)?.name;
        if (e.payload.team !== 'A' || !name) continue;
        note(
          {
            kind: 'card',
            text: cardLine(name, e.payload, this.content.tuning.tickRate),
            tone: 'plain',
            at: null,
          },
          NOTE_MS,
        );
      } else if (e.type === 'sealedMove') {
        // the player's own Sealed Move plays or lapses by itself: say so
        const name = this.content.gambitById.get(e.payload.card)?.name;
        if (e.payload.team !== 'A' || !name) continue;
        note(
          {
            kind: 'card',
            text:
              e.payload.outcome === 'fired'
                ? `Sealed Move played ${name}`
                : `Sealed Move lapsed: not enough Tempo for ${name}`,
            tone: e.payload.outcome === 'fired' ? 'good' : 'bad',
            at: null,
          },
          NOTE_MS,
        );
      } else if (e.type === 'gambit') {
        if (e.payload.team === 'B') {
          const play = this.blackPlay(m, e.payload);
          if (play) plays.unshift(play);
        }
      } else if (e.type === 'check') {
        fresh.unshift(
          this.chip(
            {
              kind: 'check',
              title: `${courtName(e.payload.team)} in Check`,
              detail: 'Until the King returns',
              team: e.payload.team,
            },
            BANNER_MS + 500,
          ),
        );
      } else if (e.type === 'throneDown') {
        fresh.unshift(
          this.chip(
            {
              kind: 'throne',
              title: `${courtName(e.payload.team)} Throne has fallen`,
              detail: 'Its King can no longer return',
              team: e.payload.team,
            },
            BANNER_MS + 700,
          ),
        );
      } else if (e.type === 'rankUp' || e.type === 'fork') {
        const u = m.unitById(e.payload.id);
        if (!u || u.team !== 'A' || !u.hero) continue;
        const piece = pieceLabel(this.content, u.hero.defId);
        if (e.type === 'rankUp') {
          if (e.payload.rank === 4 || e.payload.rank === 8) continue;
          fresh.unshift(
            this.chip(
              {
                kind: 'rank',
                title: `${piece} · Rank ${e.payload.rank}`,
                detail: e.payload.bonus,
                team: 'A',
              },
              RANK_CHIP_MS,
            ),
          );
        } else {
          const name = forkOptionName(
            this.content,
            u.hero.defId,
            u.hero.style,
            e.payload.rank,
            e.payload.optionId,
          );
          fresh.unshift(
            this.chip(
              {
                kind: 'rank',
                title: `${piece} · Rank ${e.payload.rank}`,
                detail:
                  name +
                  (e.payload.locked ? ' (your run)' : e.payload.auto ? ' (court’s pick)' : ''),
                team: 'A',
              },
              RANK_CHIP_MS,
            ),
          );
        }
      }
    }
    if (ev.length) this.seenSeq = ev[ev.length - 1].seq;
    const now = performance.now();
    const alive = this.ui.chips.filter((c) => c.until > now);
    // the same notice twice (two Checks in a row) shows once, with a fresh timer
    const latest = fresh.filter((c, i) => !fresh.some((d, j) => j > i && same(c, d)));
    const next = latest.length
      ? [...alive.filter((c) => !latest.some((d) => same(c, d))), ...latest]
      : alive;
    const keep = new Set([
      ...next.filter((c) => c.kind === 'rank').slice(-MAX_RANK_CHIPS),
      ...next.filter((c) => c.kind !== 'rank' && c.kind !== 'bell').slice(-MAX_BANNERS),
      ...next.filter((c) => c.kind === 'bell').slice(-1),
    ]);
    const trimmed = next.filter((c) => keep.has(c));
    const heldNotes = this.ui.notes.filter((n) => n.until > now);
    const nextNotes = notes.length > 0 ? [...heldNotes, ...notes].slice(-MAX_NOTES) : heldNotes;
    const notesChanged = notes.length > 0 || nextNotes.length !== this.ui.notes.length;
    const black = this.nextBlackPlay(plays, now);
    if (
      latest.length > 0 ||
      trimmed.length !== this.ui.chips.length ||
      notesChanged ||
      black !== undefined
    ) {
      this.ui = {
        ...this.ui,
        chips: trimmed,
        notes: nextNotes,
        blackPlay: black === undefined ? this.ui.blackPlay : black,
      };
      this.notify();
    }
  }

  /** The sound of a sim event: a bell toll, a piece falling, a fork chosen. */
  private cue(m: Match, e: GameEvent): void {
    if (e.type === 'bell') {
      if (e.payload.stage === 'tolling') play('toll', { n: e.payload.toll ?? 1 });
    } else if (e.type === 'death') {
      const u = m.unitById(e.payload.id);
      if (u?.hero && this.ui.speed < 4) play('clack', { team: u.team });
    } else if (e.type === 'fork') {
      if (m.unitById(e.payload.id)?.team === 'A') play('chime');
    }
  }

  /** The words and school of a gambit Black played, from the card and what it was aimed at. */
  private blackPlay(
    m: Match,
    p: Extract<GameEvent, { type: 'gambit' }>['payload'],
  ): { school: School; text: string } | null {
    const def = this.content.gambitById.get(p.cardId);
    if (!def) return null;
    const target = p.targetId === undefined ? undefined : m.unitById(p.targetId);
    const lane =
      p.x === undefined || p.y === undefined
        ? null
        : laneNear(m.content.map.lanes, p.x, p.y, this.content.tuning.feedback.fight.laneRadius);
    const structure =
      target?.kind === 'guardian' ? 'Throne' : target?.kind === 'tower' ? 'Bastion' : null;
    const text = blackPlayLine(def.name, def.target, p, {
      lane,
      piece: target?.hero?.defId ?? null,
      structure,
    });
    return { school: def.school, text };
  }

  /**
   * Queues new Black plays and returns the banner to show: undefined when nothing changes, null
   * to clear it. One banner shows at a time; the next waits its turn.
   */
  private nextBlackPlay(
    plays: { school: School; text: string }[],
    now: number,
  ): BlackPlay | null | undefined {
    if (plays.length > 0) this.blackQueue = [...this.blackQueue, ...plays].slice(-MAX_BLACK_QUEUE);
    const cur = this.ui.blackPlay;
    if (cur && cur.until > now) return undefined;
    const next = this.blackQueue.shift();
    if (next) return { id: ++this.blackId, ...next, until: now + BLACK_PLAY_MS, ms: BLACK_PLAY_MS };
    return cur ? null : undefined;
  }
}

/** The name of a fork option taken: a style at Rank 4, a skill path of the chosen style at Rank 8. */
export function forkOptionName(
  c: Content,
  piece: string,
  style: string | null,
  rank: number,
  optionId: string,
): string {
  if (rank === 4) return c.styleByKey.get(`${piece}/${optionId}`)?.name ?? '';
  const st = style ? c.styleByKey.get(`${piece}/${style}`) : undefined;
  return st?.forks['8'].find((f) => f.id === optionId)?.name ?? '';
}

export function useEscape(active: boolean, close: () => void): void {
  const s = useSession();
  const latest = useRef(close);
  latest.current = close;
  useEffect(() => (active ? s.pushEscape(() => latest.current()) : undefined), [s, active]);
}

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('SessionContext missing');
  const [, setV] = useState(0);
  useEffect(() => s.subscribe(() => setV((v) => v + 1)), [s]);
  return s;
}
