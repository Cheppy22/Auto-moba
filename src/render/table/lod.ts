import {
  Box3,
  BufferGeometry,
  Float32BufferAttribute,
  Sphere,
  Uint32BufferAttribute,
  Vector3,
} from 'three';
import type { MapDef } from '../../sim';
import { hash, type MapStyle, mix } from './longlook';
import { cone, merge, type Part } from './mesh';
import type { Ground } from './relief';

/**
 * The Long Board's triangle budget (Fable review 4F). The ground and the woods are static meshes
 * that used to be drawn whole every frame; here they are built leaner and cut into tiles, so the
 * camera's frustum skips whatever is off screen:
 *
 * - the ground grid keeps every line over the board but only every few over the apron (the flat
 *   floor past the edge and the bank down to the lake need few cells); the grid stays rectilinear,
 *   so no cracks open between fine and coarse cells;
 * - the woods have four rows of bigger pines instead of six, the outer two as single cones.
 */

/** A height grid over the board and its apron (`LongRelief`). */
export interface Grid {
  readonly nx: number;
  readonly nz: number;
  readonly ex: number;
  readonly ez: number;
  readonly cell: number;
  readonly h: Float32Array;
}

/**
 * Apron lines kept, as cells out from the board's edge (cell 20: 0, 20, 180, then every 40 down
 * the bank). The floor is flat out to the bank, which starts 150 in from the apron's outer edge.
 */
const APRON_KEEP = [0, 1, 9, 11, 13, 15, 17];

/** Grid lines kept along one axis of `n` cells, `apron` of them on each end past the board. */
export function gridLines(n: number, apron: number): number[] {
  const keep = new Set<number>();
  for (let i = apron; i <= n - apron; i++) keep.add(i);
  for (const k of APRON_KEEP)
    if (k <= apron) {
      keep.add(apron - k);
      keep.add(n - apron + k);
    }
  keep.add(0);
  keep.add(n);
  return [...keep].sort((a, b) => a - b);
}

/**
 * The ground as `tx` × `tz` tiles sharing one set of vertices (positions and UVs onto the painted
 * top), each with its own index and bounds so it is culled on its own. The outermost ring drops
 * into the lake (`rimY`). Cells split along their flatter diagonal, as before.
 */
export function groundTiles(
  g: Grid,
  apronCells: number,
  rimY: number,
  tx = 2,
  tz = 3,
): BufferGeometry[] {
  const xs = gridLines(g.nx, apronCells);
  const zs = gridLines(g.nz, apronCells);
  const w = xs.length;
  const d = zs.length;
  const pos = new Float32Array(w * d * 3);
  const uv = new Float32Array(w * d * 2);
  for (let j = 0; j < d; j++)
    for (let i = 0; i < w; i++) {
      const gi = xs[i];
      const gj = zs[j];
      const k = j * w + i;
      const x = -g.ex + gi * g.cell;
      const z = -g.ez + gj * g.cell;
      const rim = gi === 0 || gj === 0 || gi === g.nx || gj === g.nz;
      pos[k * 3] = x;
      pos[k * 3 + 1] = rim ? rimY : g.h[gj * (g.nx + 1) + gi];
      pos[k * 3 + 2] = z;
      uv[k * 2] = (x + g.ex) / (2 * g.ex);
      uv[k * 2 + 1] = 1 - (z + g.ez) / (2 * g.ez);
    }
  const position = new Float32BufferAttribute(pos, 3);
  const uvs = new Float32BufferAttribute(uv, 2);
  const y = (k: number): number => pos[k * 3 + 1];
  // tile borders in grid cells, evenly over the board's length and width
  const cut = (lines: number[], n: number, parts: number): number[] => {
    const out = [0];
    for (let p = 1; p < parts; p++) {
      const want = (n * p) / parts;
      let best = 0;
      for (let i = 0; i < lines.length; i++)
        if (Math.abs(lines[i] - want) < Math.abs(lines[best] - want)) best = i;
      out.push(best);
    }
    out.push(lines.length - 1);
    return out;
  };
  const cx = cut(xs, g.nx, tx);
  const cz = cut(zs, g.nz, tz);
  const tiles: BufferGeometry[] = [];
  const box = new Box3();
  const v = new Vector3();
  for (let b = 0; b < tz; b++)
    for (let a = 0; a < tx; a++) {
      const idx: number[] = [];
      box.makeEmpty();
      for (let j = cz[b]; j < cz[b + 1]; j++)
        for (let i = cx[a]; i < cx[a + 1]; i++) {
          const p = j * w + i;
          const q = p + 1;
          const r = p + w;
          const s = r + 1;
          if (Math.abs(y(p) - y(s)) < Math.abs(y(q) - y(r))) idx.push(p, r, s, p, s, q);
          else idx.push(p, r, q, q, r, s);
          box.expandByPoint(v.set(pos[p * 3], y(p), pos[p * 3 + 2]));
          box.expandByPoint(v.set(pos[s * 3], y(s), pos[s * 3 + 2]));
        }
      if (!idx.length) continue;
      const geo = new BufferGeometry();
      geo.setAttribute('position', position);
      geo.setAttribute('uv', uvs);
      geo.setIndex(new Uint32BufferAttribute(idx, 1));
      // heights inside a tile also come from cells whose corners are outside the sampled pair
      box.min.y = Math.min(box.min.y, rimY) - 80;
      box.max.y += 80;
      geo.boundingBox = box.clone();
      geo.boundingSphere = box.getBoundingSphere(new Sphere());
      tiles.push(geo);
    }
  return tiles;
}

/** Side of the square cells the woods are cut into (world units), for culling. */
const WOODS_TILE = 2400;

/**
 * The woods round the garden: pines in loose rows on the apron past the board's edge, out onto
 * the bank, darker toward the haze; never on the river's water, which runs on out to the lake.
 * Four rows of bigger trees (the inner two with two cones, the outer two one taller cone),
 * cut into tiles so the frustum skips the ones off screen. Open cones (no bases, no shadow).
 */
export function woodsTiles(
  map: MapDef,
  ground: Ground,
  st: MapStyle,
  apron: number,
): BufferGeometry[] {
  const W = map.size;
  const L = map.length ?? map.size;
  const river = map.terraces?.river ?? 0;
  const rows = [62, 120, 184, 258].filter((off) => off < apron - 40);
  const buckets = new Map<string, Part[]>();
  let n = 9000;
  rows.forEach((off, row) => {
    // the rectangle grown by `off`: walk its perimeter
    const w = W + off * 2;
    const l = L + off * 2;
    const perim = 2 * (w + l);
    for (let d = hash(n++) * 30; d < perim; d += 44 + hash(n++) * 16) {
      let x: number;
      let y: number;
      if (d < w) [x, y] = [-off + d, -off];
      else if (d < w + l) [x, y] = [W + off, -off + (d - w)];
      else if (d < 2 * w + l) [x, y] = [W + off - (d - w - l), L + off];
      else [x, y] = [-off, L + off - (d - 2 * w - l)];
      x += (hash(n++) - 0.5) * 30;
      y += (hash(n++) - 0.5) * 30;
      // the river runs out through the woods to the lake
      if ((x < 0 || x > W) && Math.abs(y - L / 2) < river + 30) continue;
      // the corners are rounded off by the bank: no trees out in the water
      const ox = Math.max(-x, x - W, 0);
      const oy = Math.max(-y, y - L, 0);
      if (Math.hypot(ox, oy) > apron - 40) continue;
      const k = (1 + hash(n++) * 0.5) * 1.4 * (1 + row * 0.06);
      const at: [number, number, number] = [x - W / 2, ground.atSim(x, y) - 3, y - L / 2];
      const turn: [number, number, number] = [0, hash(n++) * Math.PI, 0];
      const dim = 0.12 + row * 0.14;
      const v = hash(n++) < 0.5 ? 0 : 1;
      const parts: Part[] =
        row < 2
          ? [
              { g: cone(19, 34, 6, true), c: mix(st.pine[v], st.haze, dim), p: at, r: turn, s: k },
              {
                g: cone(13, 27, 6, true),
                c: mix(st.pine[v + 2], st.haze, dim),
                p: [at[0], at[1] + 19 * k, at[2]],
                r: turn,
                s: k,
              },
            ]
          : [{ g: cone(22, 50, 5, true), c: mix(st.pine[v], st.haze, dim), p: at, r: turn, s: k }];
      const key = `${Math.floor(at[0] / WOODS_TILE)},${Math.floor(at[2] / WOODS_TILE)}`;
      const list = buckets.get(key);
      if (list) list.push(...parts);
      else buckets.set(key, parts);
    }
  });
  return [...buckets.values()].map(merge);
}
