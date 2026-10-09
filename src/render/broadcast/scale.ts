import type { Content } from '../../sim';

/**
 * Every size in the 3D world that depends on how big the map is. The art was tuned on a map 1000
 * units across with lanes 40 wide (`k = 1`); a bigger map scales those sizes with `k`, while things
 * that are the size of a unit (trees, cliffs ledges, lanterns, badges) stay as they are.
 */
export interface WorldScale {
  /** Map size over the 1000 the art was tuned on. */
  k: number;
  size: number;
  half: number;
  /** Walkable lane half width (sim units). */
  lane: number;
  /** Half width of the painted and raised road: the walkable edge minus a small shoulder. */
  roadHalf: number;
  /** Half width of the painted stone path into a clearing. */
  portHalf: number;
  /** Throne dais size over the one the art was tuned on (walk.base 105). */
  baseK: number;
  /** Radius of the floating island, where the land has fallen away completely. */
  islandR: number;
  /** Radius where the land starts to fall away. */
  fallStart: number;
  /** Half width of the heightfield square and its cell count and cell size. */
  edge: number;
  cells: number;
  step: number;
  /** Distances to the walkable edge are tracked this far. */
  dCap: number;
  /** Chessboard tile size. */
  tile: number;
  /** Side of the painted ground texture, in pixels. */
  texSize: number;
  /** Half width of the river's deep core; its banks ease out to about 3.3 times this. */
  riverCore: number;
}

/** The hand-tuned art: base radius, and the shoulder between the road (or port path) and the walkable edge. */
const ART_BASE = 105;
const ROAD_SHOULDER = 22;
const PORT_SHOULDER = 9.5;
/** Heightfield cell size the art was tuned on, and the most cells a side may have. */
const ART_STEP = 6;
const MAX_CELLS = { desktop: 340, phone: 256 };
/** Ground texture pixels per world unit, and the largest texture. */
const TEX_DENSITY = 1.4;
const MAX_TEX = { desktop: 3072, phone: 2048 };

/** `desktop` is the same switch as shadows: phones get a coarser heightfield and ground texture. */
export function worldScale(map: Content['map'], desktop: boolean): WorldScale {
  const size = map.size;
  const k = size / 1000;
  const islandR = 0.7 * size;
  const edge = islandR + 8;
  const cap = desktop ? MAX_CELLS.desktop : MAX_CELLS.phone;
  const cells = Math.min(cap, Math.round((2 * edge) / ART_STEP));
  const maxTex = desktop ? MAX_TEX.desktop : MAX_TEX.phone;
  const texSize = Math.min(
    maxTex,
    Math.max(2048, Math.round((2 * edge * TEX_DENSITY) / 256) * 256),
  );
  const lane = map.walk.lane;
  return {
    k,
    size,
    half: size / 2,
    lane,
    roadHalf: Math.max(8, lane - ROAD_SHOULDER),
    portHalf: Math.max(6, map.walk.port - PORT_SHOULDER),
    baseK: map.walk.base / ART_BASE,
    islandR,
    fallStart: 0.664 * size,
    edge,
    cells,
    step: (2 * edge) / cells,
    dCap: 140 * k,
    tile: 40 * k,
    texSize,
    riverCore: 20 * k,
  };
}
