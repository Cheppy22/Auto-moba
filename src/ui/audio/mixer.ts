/**
 * The sound mixer's state: four volumes (master, music, ambience, effects) and one mute switch.
 * Pure data plus localStorage (read and written in try/catch). The audio engine reads the gains;
 * the settings panel writes the volumes.
 */

export type Bus = 'master' | 'music' | 'ambience' | 'effects';

export const BUSES: readonly Bus[] = ['master', 'music', 'ambience', 'effects'];

export const BUS_LABEL: Record<Bus, string> = {
  master: 'Master',
  music: 'Music',
  ambience: 'Ambience',
  effects: 'Effects',
};

export interface MixerState {
  /** 0..1 each, as the sliders show them. */
  volume: Record<Bus, number>;
  muted: boolean;
}

/** The sliders' starting places: the music and the garden sit under the effects. */
export const DEFAULT_VOLUME: Record<Bus, number> = {
  master: 0.8,
  music: 0.65,
  ambience: 0.75,
  effects: 1,
};

/** The mute switch ('on' | 'off', as before) and the volumes (JSON). */
export const MUTE_KEY = 'automoba.sound';
export const VOLUME_KEY = 'automoba.mixer';

export const clamp01 = (v: number): number =>
  Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;

/** Slider position to gain: squared, so the lower half of a slider still moves the loudness. */
export const sliderToGain = (v: number): number => clamp01(v) ** 2;

/** Reads the saved volumes; anything unreadable falls back to the defaults. */
export function parseVolumes(raw: string | null): Record<Bus, number> {
  const out = { ...DEFAULT_VOLUME };
  if (!raw) return out;
  try {
    const data: unknown = JSON.parse(raw);
    if (data && typeof data === 'object') {
      for (const b of BUSES) {
        const v = (data as Record<string, unknown>)[b];
        if (typeof v === 'number' && Number.isFinite(v)) out[b] = clamp01(v);
      }
    }
  } catch {
    // a damaged value: the defaults stand
  }
  return out;
}

/** What one bus is set to right now (0 while muted). */
export const busGain = (s: MixerState, bus: Bus): number =>
  s.muted ? 0 : sliderToGain(s.volume[bus]);

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function storage(): Store | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadMixer(store: Store | null = storage()): MixerState {
  let muted = false;
  let raw: string | null = null;
  try {
    muted = store?.getItem(MUTE_KEY) === 'off';
    raw = store?.getItem(VOLUME_KEY) ?? null;
  } catch {
    // blocked storage: defaults
  }
  return { volume: parseVolumes(raw), muted };
}

export function saveMixer(s: MixerState, store: Store | null = storage()): void {
  try {
    store?.setItem(MUTE_KEY, s.muted ? 'off' : 'on');
    store?.setItem(VOLUME_KEY, JSON.stringify(s.volume));
  } catch {
    // private windows and blocked storage: the choice just lasts for this visit
  }
}

let state: MixerState = loadMixer();
const listeners = new Set<() => void>();

export const mixer = (): MixerState => state;

function commit(next: MixerState): void {
  state = next;
  saveMixer(state);
  for (const fn of listeners) fn();
}

export function setVolume(bus: Bus, value: number): void {
  commit({ ...state, volume: { ...state.volume, [bus]: clamp01(value) } });
}

export function setMutedState(muted: boolean): void {
  if (muted !== state.muted) commit({ ...state, muted });
}

export function subscribeMixer(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Test hook: puts the mixer back to a known state without touching storage. */
export function resetMixerForTest(
  next: MixerState = { volume: { ...DEFAULT_VOLUME }, muted: false },
): void {
  state = next;
  for (const fn of listeners) fn();
}
