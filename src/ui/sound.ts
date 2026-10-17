/**
 * The game's sound, all made with the Web Audio API (no audio files, no dependencies):
 * cues (`audio/cueSynth.ts`), a generative music bed (`audio/music.ts`) and a theme-aware garden
 * ambience (`audio/ambience.ts`), mixed by four volume sliders and a mute switch (`audio/mixer.ts`).
 *
 * Nothing plays until the player has touched the page once (`unlock`, from the first tap or key).
 * If the browser has no Web Audio, every call here is a quiet no-op.
 */
import { Ambience, type Theme } from './audio/ambience';
import { DUCK, Throttle, type Cue, type CueOpts } from './audio/cues';
import { voiceCue } from './audio/cueSynth';
import { mixer, setMutedState, subscribeMixer } from './audio/mixer';
import { MusicPlayer } from './audio/music';
import { getEngine, liveEngine, startEngine } from './audio/synth';

export type { Cue, CueOpts } from './audio/cues';
export type { Theme } from './audio/ambience';

let music: MusicPlayer | null = null;
let ambience: Ambience | null = null;
let theme: Theme = 'a';
let tension = 0;
let intensity = 0;
let warned = false;
let played = 0;
const throttle = new Throttle();

export const isMuted = (): boolean => mixer().muted;

export function setMuted(value: boolean): void {
  setMutedState(value);
}

/** Calls back when the mute switch or any volume changes. */
export const subscribeSound = subscribeMixer;

/** Starts (or wakes) the audio. Browsers only allow it from a tap or key press. */
export function unlock(): void {
  const e = startEngine();
  if (!e || music) return;
  try {
    const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    music = new MusicPlayer(e, seed);
    ambience = new Ambience(e, seed ^ 0x5bd1e995);
    ambience.setTheme(theme);
    ambience.setIntensity(intensity);
    music.setTension(tension);
    music.start();
    ambience.start();
    syncSleep();
  } catch (err) {
    console.error('Music could not start', err);
    music?.stop();
    ambience?.stop();
  }
}

/** Plays a cue now (silent while muted or before the first tap). */
export function play(cue: Cue, opts: CueOpts = {}): void {
  const e = liveEngine();
  if (!e || !throttle.allow(cue, performance.now())) return;
  try {
    voiceCue(e, cue, e.ctx.currentTime + 0.01 + (opts.delay ?? 0), opts);
    played++;
    const duck = DUCK[cue];
    if (duck) duckSound(duck.sec, duck.depth);
  } catch (err) {
    if (!warned) {
      warned = true;
      console.error('A sound cue failed', cue, err);
    }
  }
}

/** The board theme the garden should sound like. */
export function setSoundTheme(next: Theme): void {
  theme = next;
  ambience?.setTheme(next);
}

/** How the match feels (see `audio/mood.ts`): eased in over a few seconds. */
export function setSoundMood(next: { tension: number; intensity: number }): void {
  tension = next.tension;
  intensity = next.intensity;
  music?.setTension(tension);
  ambience?.setIntensity(intensity);
}

/** Music and garden step back for a moment (the bell). */
export function duckSound(sec: number, depth = 0.3): void {
  music?.duck(sec, depth);
  ambience?.duck(sec, Math.max(depth, 0.4));
}

/** What the end-to-end tests read: whether the audio started, and how busy it is. */
export function soundDebug(): {
  state: string;
  music: boolean;
  ambience: boolean;
  voices: number;
  tension: number;
  intensity: number;
  theme: Theme;
  cues: number;
} {
  const e = getEngine();
  return {
    state: e ? e.ctx.state : 'none',
    music: !!music,
    ambience: !!ambience,
    voices: e?.voices ?? 0,
    tension,
    intensity,
    theme,
    cues: played,
  };
}

// A muted game puts the audio to sleep (no CPU), and so does a hidden tab.
function syncSleep(): void {
  const e = getEngine();
  if (!e) return;
  const asleep = mixer().muted || (typeof document !== 'undefined' && document.hidden);
  if (asleep) {
    window.setTimeout(() => {
      if (mixer().muted || document.hidden) void e.ctx.suspend().catch(() => undefined);
    }, 450);
  } else if (e.ctx.state === 'suspended') void e.ctx.resume().catch(() => undefined);
}
if (typeof window !== 'undefined') {
  subscribeMixer(syncSleep);
  document.addEventListener('visibilitychange', syncSleep);
}
