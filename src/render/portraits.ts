import {
  type Object3D,
  Color,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import type { PieceId } from '../sim';
import { Kit } from './broadcast/kit';
import { PIECE_HEIGHT, PIECE_SCALE, PieceModel } from './broadcast/pieces';
import { wantsTable } from './table';
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
 * Draws each piece's own 3D model, in the look the match is using (the Tournament Table's
 * low-poly figure, or the old view's humanoid), to a small transparent image. One offscreen
 * renderer draws them all and is released again; results are cached per piece, team and size, so
 * a second match costs nothing. Returns data URLs by `portraitKey`, or an empty map when WebGL is
 * not available (callers fall back to the flat glyph).
 */
export function renderPortraits(keys: readonly PortraitKey[], px: number): Map<string, string> {
  const out = new Map<string, string>();
  const table = wantsTable();
  const todo: PortraitKey[] = [];
  for (const k of keys) {
    const hit = cache.get(`${table ? 't' : 'o'}${LOOK.id}:${px}:${portraitKey(k)}`);
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

  const tallest = table
    ? FIG_HEIGHT.king * FIG_SCALE * SIZE.k
    : Math.max(...Object.values(PIECE_HEIGHT)) * PIECE_SCALE;
  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 1, 5000);
  const kit = new Kit();
  const lib = new FigureLib();
  if (table) {
    const L = LOOK.light;
    const key = new DirectionalLight(L.key, L.keyK);
    key.position.set(-260, 420, 520);
    const back = new DirectionalLight(L.back, L.backK);
    back.position.set(300, 240, -420);
    scene.add(new HemisphereLight(L.sky, L.ground, L.skyK), key, back);
  } else {
    const key = new DirectionalLight('#ffe2b8', 2.55);
    key.position.set(-380, 760, 520);
    const rim = new DirectionalLight('#9aa8c4', 0.45);
    rim.position.set(520, 300, -600);
    scene.add(new HemisphereLight('#e6dcc2', '#42382e', 0.85), key, rim);
  }

  try {
    for (const k of todo) {
      let object: Object3D;
      let dispose = (): void => {};
      if (table) {
        const fig = new PieceFigure(lib, k.piece, k.team, null, false);
        fig.place(0, 0, 0, YAW * (k.team === 'A' ? 1 : -1));
        object = fig.root;
        dispose = () => fig.dispose();
      } else {
        const m = new PieceModel(kit, k.piece, k.team, null);
        m.place(0, 0, 0, YAW * (k.team === 'A' ? 1 : -1));
        object = m.root;
      }
      frame(camera, tallest);
      // outlines keep a steady width in pixels at the render size, so every portrait inks alike
      const unitsPerPx = (2 * camera.position.z * Math.tan((FOV * Math.PI) / 360)) / px;
      for (const t of ['A', 'B'] as const)
        lib.ink[t].value = TEAM[t].inkPx * (px / INK_REF_PX) * unitsPerPx;
      kit.inkWidth.value = 1.1 * (px / INK_REF_PX) * unitsPerPx * 1.6;
      scene.add(object);
      renderer.render(scene, camera);
      out.set(portraitKey(k), canvas.toDataURL('image/png'));
      scene.remove(object);
      dispose();
    }
  } catch (err) {
    console.error('Intro portraits failed to draw', err);
  } finally {
    lib.dispose();
    kit.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
  for (const k of todo) {
    const url = out.get(portraitKey(k));
    if (url) cache.set(`${table ? 't' : 'o'}${LOOK.id}:${px}:${portraitKey(k)}`, url);
  }
  return out;
}
