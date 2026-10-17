import {
  Color,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import type { PieceId } from '../sim';
import type { CourtDef } from '../sim';
import { LOOK, TEAM } from './table/palette';
import { FIG_HEIGHT } from './table/figures';
import { FIG_SCALE, FigureLib, PieceFigure, SIZE } from './table/piece';

/** One portrait to draw: a generic piece (no style yet) in a team's colours. */
export interface PortraitKey {
  piece: PieceId;
  team: 'A' | 'B';
}

/** Cache key, also the key of the result map. */
export const portraitKey = (k: PortraitKey): string => `${k.piece}:${k.team}`;

/** Camera framing: field of view, and how far the figure is turned toward its opponent. */
const FOV = 24;
const YAW = 0.5;
/** Spare room around the figure (fraction of its height). */
const MARGIN = 1.2;
/** Outline width at the render size, as a share of the table look's own CSS-pixel width. */
const INK_REF_PX = 90;

const cache = new Map<string, string>();

/**
 * Frames every piece alike, sized to the tallest figure, so the five stand in true proportion
 * on one ground line, looking a little down on them.
 */
function frame(camera: PerspectiveCamera, tallest: number): void {
  const dist = ((tallest / 2) * MARGIN) / Math.tan((FOV * Math.PI) / 360);
  const mid = tallest * 0.48;
  camera.position.set(0, mid + dist * 0.12, dist);
  camera.lookAt(0, mid, 0);
  camera.updateMatrixWorld();
}

/**
 * Draws each piece's own 3D model (the Tournament Table's low-poly figure) to a small transparent
 * image. One offscreen
 * renderer draws them all and is released again; results are cached per piece, team and size, so
 * a second match costs nothing. Returns data URLs by `portraitKey`, or an empty map when WebGL is
 * not available (callers fall back to the flat glyph).
 */
export function renderPortraits(keys: readonly PortraitKey[], px: number): Map<string, string> {
  const out = new Map<string, string>();
  const todo: PortraitKey[] = [];
  for (const k of keys) {
    const hit = cache.get(`t${LOOK.id}:${px}:${portraitKey(k)}`);
    if (hit) out.set(portraitKey(k), hit);
    else todo.push(k);
  }
  if (todo.length === 0) return out;

  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return out;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(px, px, false);
  renderer.setClearColor(new Color(0x000000), 0);

  const tallest = FIG_HEIGHT.king * FIG_SCALE * SIZE.k;
  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 1, 5000);
  const lib = new FigureLib();
  const L = LOOK.light;
  const key = new DirectionalLight(L.key, L.keyK);
  key.position.set(-260, 420, 520);
  const back = new DirectionalLight(L.back, L.backK);
  back.position.set(300, 240, -420);
  scene.add(new HemisphereLight(L.sky, L.ground, L.skyK), key, back);

  try {
    for (const k of todo) {
      const fig = new PieceFigure(lib, k.piece, k.team, null, false);
      fig.place(0, 0, 0, YAW * (k.team === 'A' ? 1 : -1));
      const object = fig.root;
      frame(camera, tallest);
      // outlines keep a steady width in pixels at the render size, so every portrait inks alike
      const unitsPerPx = (2 * camera.position.z * Math.tan((FOV * Math.PI) / 360)) / px;
      for (const t of ['A', 'B'] as const)
        lib.ink[t].value = TEAM[t].inkPx * (px / INK_REF_PX) * unitsPerPx;
      scene.add(object);
      renderer.render(scene, camera);
      out.set(portraitKey(k), canvas.toDataURL('image/png'));
      scene.remove(object);
      fig.dispose();
    }
  } catch (err) {
    console.error('Intro portraits failed to draw', err);
  } finally {
    lib.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
  for (const k of todo) {
    const url = out.get(portraitKey(k));
    if (url) cache.set(`t${LOOK.id}:${px}:${portraitKey(k)}`, url);
  }
  return out;
}

/** Yaw (radians) of each court-portrait pose; positive turns the figure toward the viewer's left. */
const POSE_YAW: Record<CourtDef['portrait']['pose'], number> = {
  front: 0.08,
  left: 0.6,
  right: -0.6,
  'profile-left': 1.15,
  'profile-right': -1.15,
};
/** A court portrait is a bust: this share of the figure's height is in frame, centred this far up. */
const BUST = { view: 0.9, centre: 0.57 };
/** Portrait shape: height over width. */
export const COURT_PORTRAIT_RATIO = 1.25;

/**
 * A hand-made court's portrait: its signature piece in Black's colours and the court's own
 * archetype, turned by the court's pose and framed as a bust (the figure's upper two thirds), drawn
 * to a transparent image `px` wide. Cached; null when WebGL is not available (callers keep the glyph).
 */
export function renderCourtPortrait(portrait: CourtDef['portrait'], px: number): string | null {
  const key = `t${LOOK.id}:${px}:court:${portrait.piece}:${portrait.style}:${portrait.pose}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const w = px;
  const h = Math.round(px * COURT_PORTRAIT_RATIO);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  renderer.setClearColor(new Color(0x000000), 0);
  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, w / h, 1, 5000);
  const lib = new FigureLib();
  const L = LOOK.light;
  const keyLight = new DirectionalLight(L.key, L.keyK);
  keyLight.position.set(-260, 420, 520);
  const back = new DirectionalLight(L.back, L.backK);
  back.position.set(300, 240, -420);
  scene.add(new HemisphereLight(L.sky, L.ground, L.skyK), keyLight, back);
  let url: string | null = null;
  try {
    const fig = new PieceFigure(lib, portrait.piece, 'B', portrait.style, false);
    fig.place(0, 0, 0, POSE_YAW[portrait.pose]);
    const tall = fig.height;
    // wide figures (the Rook, a Knight with a lance) get more room so they are not cut at the sides
    const view = Math.max(tall * BUST.view, (fig.halfWidth * 2 * 1.25) / (w / h));
    const dist = view / 2 / Math.tan((FOV * Math.PI) / 360);
    const mid = tall * BUST.centre;
    camera.position.set(0, mid + dist * 0.06, dist);
    camera.lookAt(0, mid, 0);
    camera.updateMatrixWorld();
    const unitsPerPx = (2 * dist * Math.tan((FOV * Math.PI) / 360)) / h;
    lib.ink.B.value = TEAM.B.inkPx * (px / INK_REF_PX) * 0.55 * unitsPerPx;
    scene.add(fig.root);
    renderer.render(scene, camera);
    url = canvas.toDataURL('image/png');
    scene.remove(fig.root);
    fig.dispose();
  } catch (err) {
    console.error('A court portrait failed to draw', err);
  } finally {
    lib.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
  if (url) cache.set(key, url);
  return url;
}
