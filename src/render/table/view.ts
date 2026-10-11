import {
  AdditiveBlending,
  NormalBlending,
  CanvasTexture,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  MathUtils,
  MeshBasicMaterial,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { Content, GameEvent, Snapshot, SnapUnit, UnitKind } from '../../sim';
import { styleEmblem } from '../emblems';
import { BarBatch, EventRing } from '../broadcast/fx';
import { GambitFx } from '../broadcast/gambit';
import { Kit } from '../broadcast/kit';
import type { BroadcastFrame, NewEvents } from '../broadcast/types';
import { ZoneFx } from '../broadcast/zones';
import { Board, FRAME } from './board';
import { TableCamera } from './camera';
import { Crowd, crowdInk, facetMaterial, hullOf } from './crowd';
import { FIG_HEIGHT, type PieceId } from './figures';
import { Bolts, Chips, Tags } from './fx';
import {
  baseRim,
  baseTop,
  bastion,
  creature,
  keeper,
  obeliskCrystal,
  obeliskPlinth,
  pawn,
  pawnling,
  spirit,
  throne,
} from './models';
import { CLAY, LOOK, TABLE, TEAM } from './palette';
import { FIG_SCALE, FigureLib, PieceFigure, SIZE, sizeFor } from './piece';
import { RELIEF } from './relief';

const PIECES: readonly PieceId[] = ['king', 'queen', 'rook', 'bishop', 'knight'];
const isPiece = (s: unknown): s is PieceId =>
  typeof s === 'string' && (PIECES as readonly string[]).includes(s);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const LOW_HP = 0.3;
const LOW_HP_RED = '#ff5a48';
const SHIELD = '#a9d0e0';
const GOLD = '#ffd35a';
const PICK_PX = 36;
/** The old view's pieces were about this tall in world units; HUD lifts scale by the ratio. */
const OLD_PIECE_H = 57;
/** Seconds a captured piece takes to topple and sink. */
const FALL_SEC = 0.9;
/** Seconds a returning piece takes to drop onto the board. */
const DROP_SEC = 0.42;
/** Landmarks: Bastions and Thrones drawn bigger than the prototype. */
const TOWER_S = 1.45;
const THRONE_S = 1.4;
/** Throne model height (world units at scale 1). */
const THRONE_H = 245;

type ChessUnit = SnapUnit & {
  piece?: string | null;
  style?: string | null;
  rank?: number;
  forkPending?: boolean;
  pawn?: boolean;
  lane?: string | null;
};

function turn(from: number, to: number, k: number): number {
  const d = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + d * k;
}

/** Everything the table remembers about one sim unit between frames. */
class Rec {
  x = 0;
  z = 0;
  /** Interpolated sim position (world) before decluttering. */
  sx = 0;
  sz = 0;
  ox = 0;
  oz = 0;
  tx = 0;
  tz = 0;
  yaw = 0;
  move = 0;
  phase = 0;
  hp = -1;
  flinch = 0;
  lunge = 0;
  /** Seconds since the last blow, and the running estimate of the blow interval. */
  since = 9;
  period = 1.2;
  flashed = false;
  alive = true;
  fall = 0;
  drop = 1;
  placed = false;
  live = false;
  stamp = 0;
  lift = 20;
  halfW = 12;
  /** Ground height under the unit (board relief). */
  gy = 0;
  fig?: PieceFigure;
  pieceId: PieceId | null = null;
  readonly phase0: number;

  constructor(
    readonly id: number,
    readonly kind: UnitKind,
    readonly defId: string,
    readonly team: string,
    readonly style: string | null,
    readonly elite: boolean,
  ) {
    this.phase0 = ((id * 2654435761) % 628) / 100;
    this.phase = this.phase0;
  }
}

function webgl(canvas: HTMLCanvasElement): WebGLRenderer {
  try {
    return new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch {
    throw new Error('WebGL is not available');
  }
}

/** URL switch: `?look=table` picks this view. */
export function wantsTable(): boolean {
  return (
    typeof location !== 'undefined' && new URLSearchParams(location.search).get('look') === 'table'
  );
}

/**
 * The Tournament Table view (prototype, `?look=table`): the whole board on a walnut table under a
 * fixed war-table camera, faceted humanoid pieces at miniature scale. Same contract as the
 * broadcast view: reads snapshots and events, never touches the sim.
 */
export class TableView {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly kit = new Kit();
  private readonly board: Board;
  private readonly cam: TableCamera;
  private readonly lib = new FigureLib();
  private readonly facet = facetMaterial();
  private readonly half: number;
  private readonly shadows: boolean;
  private readonly recs = new Map<number, Rec>();
  private readonly byId = new Map<number, SnapUnit>();
  private readonly stale: Rec[] = [];
  private readonly pieces: Rec[] = [];
  private readonly obstacles: Rec[] = [];
  private readonly rings = new Map<string, EventRing>();
  private readonly liveRings = new Set<string>();
  private readonly bars: BarBatch;
  private readonly gambits: GambitFx;
  private readonly zones: ZoneFx;
  private readonly chips: Chips;
  private readonly bolts: Bolts;
  private readonly tags = new Tags();
  private readonly crowds: Record<string, Crowd> = {};
  private readonly crowdList: Crowd[] = [];
  private readonly open = new Set<string>();
  private readonly isOpen = (id: string): boolean => this.open.has(id);
  private readonly rim: Crowd;
  private readonly top: Crowd;
  private readonly blobs: Crowd;
  private readonly halos: Crowd;
  private readonly crystal: Crowd;
  private readonly key: DirectionalLight;
  private readonly back: DirectionalLight;
  private readonly tmp = new Vector3();
  private readonly ray = new Vector3();
  private readonly org = new Vector3();
  private readonly from = new Vector3();
  private readonly to = new Vector3();
  private readonly col = new Color();
  private readonly lean = { x: 0, z: 0 };
  private readonly lineup: 'board' | 'close' | 'closeb' | null;
  private lineupUnits: ChessUnit[] | null = null;
  private time = 0;
  private insetClock = 0;
  private stamp = 0;
  private lastTick = -1;
  private drawn = 0;
  private zonesFromSnap = false;
  private cssW = 0;
  private cssH = 0;
  private leaning = false;
  private lost = false;
  private readonly onLost = (e: Event): void => {
    e.preventDefault();
    this.lost = true;
  };
  private readonly onRestored = (): void => {
    this.lost = false;
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly content: Content,
  ) {
    this.renderer = webgl(canvas);
    this.half = content.map.size / 2;
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.shadows = !coarse && Math.min(window.innerWidth, window.innerHeight) >= 640;
    const r = this.renderer;
    r.setPixelRatio(Math.min(coarse ? 2 : 1.5, window.devicePixelRatio || 1));
    r.shadowMap.enabled = this.shadows;
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);
    const p = new URLSearchParams(location.search).get('lineup');
    this.lineup = p === 'close' || p === 'closeb' ? p : p !== null ? 'board' : null;

    // the hall: a dark warm gradient behind the table, fog that swallows the table's edge
    const bg = document.createElement('canvas');
    bg.width = 4;
    bg.height = 256;
    const g = bg.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, TABLE.hallTop);
    grad.addColorStop(0.55, TABLE.hallMid);
    grad.addColorStop(1, TABLE.hallBottom);
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
    const bgTex = this.kit.own(new CanvasTexture(bg));
    bgTex.colorSpace = SRGBColorSpace;
    this.scene.background = bgTex;
    this.scene.fog = new Fog(TABLE.fog, 9000, 26000);

    // light: warm cream sky over walnut bounce, a warm key from White's left, a cool rim from behind
    const L = LOOK.light;
    const sky = new HemisphereLight(L.sky, L.ground, L.skyK);
    this.key = new DirectionalLight(L.key, L.keyK);
    this.back = new DirectionalLight(L.back, L.backK);
    this.key.castShadow = this.shadows;
    if (this.shadows) {
      const sc = this.key.shadow.camera;
      const w = this.half + FRAME;
      sc.left = -w * 1.15;
      sc.right = w * 1.15;
      sc.top = w * 1.15;
      sc.bottom = -w * 1.15;
      sc.near = 100;
      sc.far = 9000;
      this.key.shadow.mapSize.set(2048, 2048);
      this.key.shadow.bias = -0.0006;
      this.key.shadow.normalBias = 1.5;
    }
    this.scene.add(sky, this.key, this.key.target, this.back, this.back.target);

    this.board = new Board(content, coarse ? 2048 : 3072);
    this.cam = new TableCamera(
      content,
      FIG_HEIGHT.king * FIG_SCALE * 1.1 + RELIEF.blockHigh,
      THRONE_H * THRONE_S + RELIEF.baseInner,
    );
    this.scene.add(this.board.group);

    // instanced crowds: one draw call per kind and side
    const crowd = (
      key: string,
      geo: ReturnType<typeof pawn>,
      cap: number,
      colors = false,
    ): Crowd => {
      const c = new Crowd(geo, this.facet, cap, colors);
      c.mesh.castShadow = this.shadows;
      this.crowds[key] = c;
      this.crowdList.push(c);
      this.scene.add(c.mesh);
      return c;
    };
    // pawns and pawnlings carry the same team contour as the pieces
    const inked = (c: Crowd, t: 'A' | 'B'): void => {
      const m = this.kit.own(crowdInk(TEAM[t].ink, this.lib.ink[t]));
      this.scene.add(c.outline(hullOf(c.mesh.geometry), m));
    };
    for (const t of ['A', 'B'] as const) {
      inked(crowd(`melee${t}`, pawnling(t, false), 90, true), t);
      inked(crowd(`ranged${t}`, pawnling(t, true), 60, true), t);
      inked(crowd(`pawn${t}`, pawn(t), 24, true), t);
      crowd(`tower${t}`, bastion(t), 10, true);
      crowd(`guardian${t}`, throne(t), 2, true);
    }
    crowd('beast0', creature(0), 40, true);
    crowd('beast1', creature(1), 24, true);
    crowd('beast2', creature(2), 10, true);
    crowd('spirit', spirit(), 20, true);
    crowd('obelisk', obeliskPlinth(), 14);
    crowd('keeper', keeper(), 2);
    this.crystal = crowd('crystal', obeliskCrystal(), 14, true);
    this.rim = crowd('rim', baseRim(), 140, true);
    this.top = crowd('top', baseTop(), 140, true);
    this.rim.mesh.castShadow = false;
    this.top.mesh.castShadow = false;
    const blobTex = this.kit.texture('table-blob', 64, 64, (bg2) => {
      const rr = bg2.createRadialGradient(32, 32, 0, 32, 32, 32);
      rr.addColorStop(0, 'rgba(0,0,0,0.75)');
      rr.addColorStop(0.6, 'rgba(0,0,0,0.35)');
      rr.addColorStop(1, 'rgba(0,0,0,0)');
      bg2.fillStyle = rr;
      bg2.fillRect(0, 0, 64, 64);
    });
    const blobMat = this.kit.own(
      new MeshBasicMaterial({
        map: blobTex,
        transparent: true,
        depthWrite: false,
        opacity: Math.min(1, (this.shadows ? 0.55 : 0.9) * LOOK.blob),
      }),
    );
    this.blobs = new Crowd(
      this.kit.geo('table-blob', () => new PlaneGeometry(2, 2).rotateX(-Math.PI / 2)),
      blobMat,
      260,
    );
    this.blobs.mesh.renderOrder = 1;
    this.scene.add(this.blobs.mesh);

    // team base rings: a flat ring on the board under every piece and pawn (instance colour)
    const glow = LOOK.halo.mode === 'glow';
    const haloTex = this.kit.texture(`table-halo-${LOOK.halo.mode}`, 128, 128, (hg) => {
      const rr = hg.createRadialGradient(64, 64, 0, 64, 64, 64);
      if (glow) {
        rr.addColorStop(0, 'rgba(255,255,255,0)');
        rr.addColorStop(0.5, 'rgba(255,255,255,0.12)');
        rr.addColorStop(0.7, 'rgba(255,255,255,1)');
        rr.addColorStop(0.8, 'rgba(255,255,255,0.55)');
        rr.addColorStop(1, 'rgba(255,255,255,0)');
      } else {
        rr.addColorStop(0, 'rgba(255,255,255,0)');
        rr.addColorStop(0.66, 'rgba(255,255,255,0)');
        rr.addColorStop(0.7, 'rgba(255,255,255,1)');
        rr.addColorStop(0.93, 'rgba(255,255,255,1)');
        rr.addColorStop(0.98, 'rgba(255,255,255,0)');
      }
      hg.fillStyle = rr;
      hg.fillRect(0, 0, 128, 128);
    });
    const haloMat = this.kit.own(
      new MeshBasicMaterial({
        map: haloTex,
        transparent: true,
        depthWrite: false,
        opacity: LOOK.halo.opacity,
        blending: glow ? AdditiveBlending : NormalBlending,
        fog: false,
      }),
    );
    this.halos = new Crowd(
      this.kit.geo('table-blob', () => new PlaneGeometry(2, 2).rotateX(-Math.PI / 2)),
      haloMat,
      200,
      true,
    );
    this.halos.mesh.renderOrder = 2;
    this.scene.add(this.halos.mesh);

    this.chips = new Chips(this.facet);
    this.bolts = new Bolts(this.facet, this.chips);
    this.bars = new BarBatch(this.kit);
    this.gambits = new GambitFx(this.kit);
    this.zones = new ZoneFx(this.kit, content.map.lanes);
    this.scene.add(
      this.chips.crowd.mesh,
      this.bolts.crowd.mesh,
      this.gambits.group,
      this.zones.group,
      this.bars.group,
      this.tags.mesh,
    );
    this.resize();
    if (import.meta.env.DEV) {
      const w = window as unknown as Record<string, unknown>;
      w.__tvStats = () => this.stats();
      w.__tvMeasure = () => this.measure();
      w.__tvBoard = () => {
        const [x0, y0, x1, y1] = this.cam.boardBox(this.cssW, this.cssH);
        const cx0 = Math.max(0, x0);
        const cy0 = Math.max(0, y0);
        const cx1 = Math.min(this.cssW, x1);
        const cy1 = Math.min(this.cssH, y1);
        return {
          box: [x0, y0, x1, y1].map((n) => Math.round(n)),
          w: Math.round(cx1 - cx0),
          h: Math.round(cy1 - cy0),
          pctArea: Math.round(((cx1 - cx0) * (cy1 - cy0) * 1000) / (this.cssW * this.cssH)) / 10,
          pctH: Math.round(((cy1 - cy0) * 1000) / this.cssH) / 10,
          variant: LOOK.id,
        };
      };
    }
  }

  stats(): { calls: number; triangles: number; geometries: number; textures: number } {
    const i = this.renderer.info;
    return {
      calls: i.render.calls,
      triangles: i.render.triangles,
      geometries: i.memory.geometries,
      textures: i.memory.textures,
    };
  }

  /** On-screen size (CSS px) of every live piece and pawn: [kind, piece, team, height, width]. */
  measure(): { id: number; what: string; team: string; h: number; w: number }[] {
    const out: { id: number; what: string; team: string; h: number; w: number }[] = [];
    const cam = this.cam.camera;
    for (const v of this.recs.values()) {
      if (!v.live) continue;
      if (!v.fig && (v.kind !== 'minion' || v.team === 'neutral')) continue;
      const h = v.fig ? v.fig.height : (v.elite ? 83 : 54) * SIZE.k;
      const a = this.tmp.set(v.x, v.gy, v.z).project(cam);
      const ay = ((1 - a.y) / 2) * this.cssH;
      const b = this.tmp.set(v.x, h + v.gy, v.z).project(cam);
      const by = ((1 - b.y) / 2) * this.cssH;
      const c = this.tmp.set(v.x, h / 2 + v.gy, v.z).project(cam);
      const d = this.from
        .set(v.x, h / 2 + v.gy, v.z)
        .addScaledVector(this.to.set(1, 0, 0).applyQuaternion(cam.quaternion), v.halfW * 2)
        .project(cam);
      out.push({
        id: v.id,
        what: v.pieceId ?? (v.elite ? 'pawn' : 'pawnling'),
        team: v.team,
        h: Math.round((ay - by) * 10) / 10,
        w: Math.round((Math.abs(d.x - c.x) / 2) * this.cssW * 10) / 10,
      });
    }
    return out;
  }

  resize(): void {
    const w = Math.max(2, this.canvas.clientWidth || 800);
    const h = Math.max(2, this.canvas.clientHeight || 600);
    this.cssW = this.canvas.clientWidth;
    this.cssH = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.cam.fit(w, h);
    SIZE.k = sizeFor(this.cam.tiltDeg, this.cam.protoTilt);
    this.board.setOrient(this.cam.orient);
    // key light from White's front-left, rim from behind the board (relative to the seat)
    const c = this.cam.camera.position;
    const len = Math.hypot(c.x, c.z) || 1;
    const fx = c.x / len;
    const fz = c.z / len;
    // right of the seat = (-fz, fx) seen from the camera looking in
    this.key.position.set(fx * 1400 + fz * 1500, 2600, fz * 1400 - fx * 1500);
    this.back.position.set(-fx * 2200 - fz * 400, 1300, -fz * 2200 + fx * 400);
  }

  draw(snap: Snapshot, events: NewEvents, frame: BroadcastFrame): void {
    if (this.lost) return;
    // refit when the canvas or the HUD's published insets change (insets checked once a second)
    this.insetClock += frame.dtMs;
    if (this.canvas.clientWidth !== this.cssW || this.canvas.clientHeight !== this.cssH)
      this.resize();
    else if (this.insetClock > 1000) {
      this.insetClock = 0;
      const ins = this.cam.insets(this.cssW, this.cssH);
      if (`${ins.top},${ins.bottom},${ins.left},${ins.right}` !== this.cam.fitted) this.resize();
    }
    const real = MathUtils.clamp(frame.dtMs, 0, 100) / 1000;
    const dt = real * frame.timeScale;
    this.time += dt;
    if (snap.tick < this.lastTick) this.reset();
    this.lastTick = snap.tick;
    this.stamp++;
    const units = this.lineup ? this.lineupList() : (snap.units as ChessUnit[]);
    this.byId.clear();
    for (const u of units) this.byId.set(u.id, u);
    this.open.clear();
    for (const sl of snap.slots) if (sl.open || this.lineup) this.open.add(sl.id);
    this.board.sync(this.isOpen);

    // camera: whole board; Follow leans in on the followed piece
    let lean: { x: number; z: number } | null = null;
    if (this.lineup === 'close' || this.lineup === 'closeb') {
      const k = this.lineup === 'close' ? 560 : -560;
      this.lean.x = this.cam.dir.x * k;
      this.lean.z = this.cam.dir.z * k;
      lean = this.lean;
    } else if (frame.mode === 'follow' && frame.followId !== null) {
      const f = this.recs.get(frame.followId);
      if (f?.live) {
        this.lean.x = f.x;
        this.lean.z = f.z;
        lean = this.lean;
      }
    }
    this.leaning = lean !== null;
    this.cam.update(real, lean, this.lineup ? 0.62 : undefined);
    const camera = this.cam.camera;
    const px = this.cam.pxNow();
    this.lib.ink.A.value = px * TEAM.A.inkPx;
    this.lib.ink.B.value = px * TEAM.B.inkPx;

    if (!this.lineup) this.handleEvents(events);
    this.bars.begin(camera);
    this.tags.begin(camera);
    for (const c of this.crowdList) c.begin();
    this.blobs.begin();
    this.halos.begin();
    this.syncUnits(units, frame.alpha, dt, real, px, frame.followId);
    for (const c of this.crowdList) c.end();
    this.blobs.end();
    this.halos.end();
    this.bars.end();
    this.tags.end();
    if (!this.lineup) this.syncRings(snap);
    this.zonesFromSnap = Array.isArray(snap.zones);
    if (snap.zones && !this.lineup)
      this.zones.setZones(snap.zones, this.half, this.ground, this.time, dt);
    this.gambits.update(dt, this.time, this.unitPos);
    this.bolts.update(dt);
    this.chips.update(dt);
    this.renderer.render(this.scene, camera);
    this.drawn++;
  }

  private readonly ground = (): number => 1;

  private readonly unitPos = (id: number, out: Vector3): boolean => {
    const v = this.recs.get(id);
    if (!v?.live) return false;
    out.set(v.x, (v.fig ? v.fig.height : 40) - 50 + v.gy, v.z);
    return true;
  };

  /** Where a sim point (plus `lift` old-scale units) lands on the canvas, in CSS pixels. */
  project(x: number, y: number, lift = 0): { x: number; y: number; visible: boolean } {
    const v = this.tmp
      .set(
        x - this.half,
        lift * ((FIG_HEIGHT.king * FIG_SCALE * SIZE.k) / OLD_PIECE_H),
        y - this.half,
      )
      .project(this.cam.camera);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const sx = ((v.x + 1) / 2) * w;
    const sy = ((1 - v.y) / 2) * h;
    return {
      x: sx,
      y: sy,
      visible: v.z > -1 && v.z < 1 && sx >= 0 && sy >= 0 && sx <= w && sy <= h,
    };
  }

  /** The sim point under a screen position: the view ray meets the board plane. */
  pickGround(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width || this.canvas.clientWidth;
    const h = rect.height || this.canvas.clientHeight;
    if (w <= 0 || h <= 0) return null;
    const nx = ((clientX - rect.left) / w) * 2 - 1;
    const ny = 1 - ((clientY - rect.top) / h) * 2;
    if (nx < -1 || nx > 1 || ny < -1 || ny > 1) return null;
    const cam = this.cam.camera;
    const o = this.org.setFromMatrixPosition(cam.matrixWorld);
    const d = this.ray.set(nx, ny, 0.5).unproject(cam).sub(o).normalize();
    if (d.y > -1e-4) return null;
    const t = -o.y / d.y;
    const x = o.x + d.x * t + this.half;
    const y = o.z + d.z * t + this.half;
    const size = this.half * 2;
    if (x < 0 || y < 0 || x > size || y > size) return null;
    return { x, y };
  }

  /** The unit nearest a screen position (within ~36 CSS px); pieces win over everything else. */
  pickUnit(clientX: number, clientY: number): number | null {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width || this.canvas.clientWidth;
    const h = rect.height || this.canvas.clientHeight;
    if (w <= 0 || h <= 0) return null;
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const cam = this.cam.camera;
    let bestPiece = -1;
    let bestPieceD = PICK_PX * PICK_PX;
    let best = -1;
    let bestD = PICK_PX * PICK_PX;
    for (const v of this.recs.values()) {
      if (!v.live) continue;
      const q = this.tmp.set(v.x, v.lift + v.gy, v.z).project(cam);
      if (q.z < -1 || q.z > 1) continue;
      const dx = ((q.x + 1) / 2) * w - px;
      const dy = ((1 - q.y) / 2) * h - py;
      const d2 = dx * dx + dy * dy;
      if (v.fig && d2 < bestPieceD) {
        bestPieceD = d2;
        bestPiece = v.id;
      } else if (!v.fig && d2 < bestD) {
        bestD = d2;
        best = v.id;
      }
    }
    if (bestPiece >= 0) return bestPiece;
    return best >= 0 ? best : null;
  }

  /* ------------------------------ units ------------------------------ */

  private pieceOf(u: ChessUnit): PieceId {
    if (isPiece(u.piece)) return u.piece;
    if (isPiece(u.defId)) return u.defId;
    return 'king';
  }

  private create(u: ChessUnit): Rec {
    const v = new Rec(
      u.id,
      u.kind,
      u.defId,
      u.team,
      u.style ?? null,
      u.kind === 'minion' && u.team !== 'neutral' && u.pawn === true,
    );
    if (u.kind === 'hero') {
      const piece = this.pieceOf(u);
      const side = u.team === 'B' ? 'B' : 'A';
      v.fig = new PieceFigure(this.lib, piece, side, u.style ?? null, this.shadows);
      v.pieceId = piece;
      v.lift = v.fig.height * 0.5;
      v.halfW = v.fig.halfWidth;
      this.scene.add(v.fig.root);
    } else if (u.kind === 'tower') {
      v.lift = 70 * TOWER_S;
      v.halfW = 46 * TOWER_S;
    } else if (u.kind === 'guardian') {
      v.lift = 110 * THRONE_S;
      v.halfW = 90 * THRONE_S;
    } else if (u.kind === 'minion') {
      v.lift = (v.elite ? 40 : 26) * SIZE.k;
      v.halfW = (v.elite ? 16 : 11) * SIZE.k;
    } else if (u.kind === 'camp') {
      v.lift = 30;
      v.halfW = 22;
    } else v.lift = 40;
    return v;
  }

  private drop(v: Rec): void {
    if (v.fig) {
      this.scene.remove(v.fig.root);
      v.fig.dispose();
    }
    this.recs.delete(v.id);
  }

  private syncUnits(
    units: ChessUnit[],
    alpha: number,
    dt: number,
    real: number,
    px: number,
    followId: number | null,
  ): void {
    for (const v of this.recs.values()) v.live = false;
    this.pieces.length = 0;
    this.obstacles.length = 0;
    for (const u of units) {
      if (!u.alive && u.kind !== 'hero') continue;
      let v = this.recs.get(u.id);
      let from: Rec | null = null;
      if (
        v &&
        (v.kind !== u.kind ||
          v.defId !== u.defId ||
          v.team !== u.team ||
          v.style !== (u.style ?? null) ||
          (v.fig && v.pieceId !== this.pieceOf(u)))
      ) {
        if (v.fig && v.style === null && u.style) from = v;
        this.drop(v);
        v = undefined;
      }
      if (!v) {
        v = this.create(u);
        this.recs.set(u.id, v);
        if (from) this.transform(u, v, from);
        else if (v.elite && this.drawn > 0 && u.alive) this.spawnFlare(u);
      }
      v.stamp = this.stamp;
      this.place(v, u, alpha, dt, real);
      if (v.fig && v.alive) this.pieces.push(v);
      if (u.kind === 'tower' || u.kind === 'guardian') this.obstacles.push(v);
    }
    this.declutter(dt);
    for (const u of units) {
      const v = this.recs.get(u.id);
      if (!v || v.stamp !== this.stamp) continue;
      if (!u.alive && u.kind !== 'hero') continue;
      this.render(v, u, dt, px, followId);
    }
    this.stale.length = 0;
    for (const v of this.recs.values()) if (v.stamp !== this.stamp) this.stale.push(v);
    for (const v of this.stale) this.drop(v);
  }

  /** Position, heading, gait and attack timing from the snapshot (before decluttering). */
  private place(v: Rec, u: ChessUnit, alpha: number, dt: number, real: number): void {
    const x = lerp(u.px, u.x, alpha) - this.half;
    const z = lerp(u.py, u.y, alpha) - this.half;
    if (v.fig) {
      if (!u.alive) {
        if (v.alive) {
          v.alive = false;
          v.fall = 1e-4;
        }
        v.fall = Math.min(1, v.fall + dt / FALL_SEC);
        v.live = false;
        return;
      }
      if (!v.alive) {
        v.alive = true;
        v.fall = 0;
        v.drop = 0;
        v.placed = false;
      }
      v.drop = Math.min(1, v.drop + dt / DROP_SEC);
    }
    v.live = u.alive;
    if (!v.placed) {
      v.sx = x;
      v.sz = z;
      v.hp = u.hp;
      v.placed = true;
      v.yaw = u.team === 'B' ? 0 : Math.PI;
      if (u.kind === 'guardian' || u.kind === 'tower') v.yaw = Math.atan2(-x, -z);
      if (this.lineup) v.yaw = this.faceCamera();
    }
    const dx = x - v.sx;
    const dz = z - v.sz;
    const dist = Math.hypot(dx, dz);
    const speed = real > 1e-4 && dist < 60 ? dist / real : 0;
    v.sx = x;
    v.sz = z;
    if (u.kind === 'hero' || u.kind === 'minion' || u.kind === 'camp') {
      const foe = u.target !== null ? this.byId.get(u.target) : undefined;
      let want = v.yaw;
      if (foe && (u.flash || speed < 8))
        want = Math.atan2(foe.x - this.half - x, foe.y - this.half - z);
      else if (speed > 8) want = Math.atan2(dx, dz);
      if (!this.lineup) v.yaw = turn(v.yaw, want, 1 - Math.exp(-12 * dt));
      v.move = lerp(v.move, MathUtils.clamp(speed / 30, 0, 1), 1 - Math.exp(-8 * dt));
      v.phase += dt * (5 + Math.min(speed, 160) * 0.045) * (0.3 + 0.7 * v.move);
    }
    // a blow lands on the rising edge of `flash`; the interval between blows times the wind-up
    v.since += dt;
    if (u.flash && !v.flashed) {
      if (v.since < 3) v.period = lerp(v.period, MathUtils.clamp(v.since, 0.35, 2.5), 0.5);
      v.since = 0;
      v.lunge = 1;
    }
    v.flashed = u.flash;
    v.lunge = Math.max(0, v.lunge - dt * 5);
    if (u.hp < v.hp - 0.01) v.flinch = 1;
    v.hp = u.hp;
    v.flinch = Math.max(0, v.flinch - dt * 4.5);
  }

  /** Pieces drawn at miniature scale would pile up; spread their drawn positions a little. */
  private declutter(dt: number): void {
    const P = this.pieces;
    for (const a of P) {
      a.tx = 0;
      a.tz = 0;
    }
    for (let i = 0; i < P.length; i++) {
      const a = P[i];
      for (let j = i + 1; j < P.length; j++) {
        const b = P[j];
        const min = (a.halfW + b.halfW) * 0.85;
        let dx = a.sx + a.ox - (b.sx + b.ox);
        let dz = a.sz + a.oz - (b.sz + b.oz);
        let d = Math.hypot(dx, dz);
        if (d >= min) continue;
        if (d < 1e-3) {
          const ang = ((a.id * 7 + b.id * 13) % 628) / 100;
          dx = Math.cos(ang);
          dz = Math.sin(ang);
          d = 1;
        }
        const push = (min - d) / 2 / d;
        a.tx += dx * push;
        a.tz += dz * push;
        b.tx -= dx * push;
        b.tz -= dz * push;
      }
      for (const o of this.obstacles) {
        const min = a.halfW * 0.7 + o.halfW * 0.8;
        const dx = a.sx + a.ox - o.sx;
        const dz = a.sz + a.oz - o.sz;
        const d = Math.hypot(dx, dz);
        if (d >= min || d < 1e-3) continue;
        const push = (min - d) / d;
        a.tx += dx * push;
        a.tz += dz * push;
      }
    }
    const k = 1 - Math.exp(-6 * dt);
    const cap = 46;
    for (const a of P) {
      let tx = a.ox + a.tx;
      let tz = a.oz + a.tz;
      // relax back toward the true position when nothing pushes
      if (a.tx === 0 && a.tz === 0) {
        tx = a.ox * 0.9;
        tz = a.oz * 0.9;
      }
      const m = Math.hypot(tx, tz);
      if (m > cap) {
        tx *= cap / m;
        tz *= cap / m;
      }
      a.ox += (tx - a.ox) * k;
      a.oz += (tz - a.oz) * k;
    }
  }

  private faceCamera(): number {
    const c = this.cam.camera.position;
    return Math.atan2(c.x, c.z);
  }

  /** Attack curve: snap to the blow in 60 ms, hold the impact frame, ease back. */
  private attack(v: Rec): number {
    const s = v.since;
    if (s < 0.06) return s / 0.06;
    if (s < 0.14) return 1;
    const t = Math.max(0, 1 - (s - 0.14) / 0.3);
    return t * t * (3 - 2 * t);
  }

  private windup(v: Rec, u: ChessUnit): number {
    if (u.target === null || v.since > v.period * 1.4) return 0;
    const t = MathUtils.clamp((v.since - v.period * 0.55) / (v.period * 0.4), 0, 1);
    return t * t * (3 - 2 * t);
  }

  private render(v: Rec, u: ChessUnit, dt: number, px: number, followId: number | null): void {
    const team = u.team === 'B' ? 'B' : 'A';
    const T = TEAM[team];
    const frac = u.maxHp > 0 ? u.hp / u.maxHp : 1;
    const markCol = u.team === 'neutral' ? '#c9a0e6' : T.mark;
    if (v.fig) {
      const f = v.fig;
      if (!v.alive) {
        f.setVisible(v.fall < 1);
        if (v.fall < 1) {
          f.pose({
            move: 0,
            phase: v.phase,
            attack: 0,
            windup: 0,
            flinch: 0,
            time: this.time,
            fall: v.fall,
            drop: 1,
          });
        }
        return;
      }
      v.x = v.sx + v.ox;
      v.z = v.sz + v.oz;
      const gy = (v.gy = this.board.relief.at(v.x, v.z));
      v.lift = f.height * 0.5;
      v.halfW = f.halfWidth;
      f.setVisible(true);
      f.place(v.x, gy, v.z, v.yaw);
      const A = this.attack(v);
      const W = A > 0.02 ? 0 : this.windup(v, u);
      f.pose({
        move: v.move,
        phase: v.phase,
        attack: A,
        windup: W,
        flinch: v.flinch,
        time: this.time,
        fall: 0,
        drop: v.drop,
      });
      // the miniature's base: team metal rim, style-coloured top, a pulsing gold rim when a fork waits
      const br = Math.max(22, v.halfW * 0.92);
      const fork = u.forkPending === true;
      const pulse = fork ? 0.5 + 0.5 * Math.sin(this.time * 7) : 0;
      this.col.set(T.trim);
      if (fork) this.col.lerp(this.tmpCol.set(GOLD), pulse);
      this.rim.color(this.rim.addXYZ(v.x, gy, v.z, 0, br, 14, br), this.col);
      this.col.set(u.style ? styleEmblem(u.style).color : T.body);
      this.top.color(this.top.addXYZ(v.x, gy, v.z, 0, br, 14, br), this.col);
      this.blobs.addXYZ(v.x, gy + 0.8, v.z, 0, br * 1.5, 1, br * 1.5);
      const hr = br * LOOK.halo.size;
      this.col.set(T.halo);
      if (fork) this.col.lerp(this.tmpCol.set(GOLD), pulse);
      this.halos.color(this.halos.addXYZ(v.x, gy + 1.4, v.z, 0, hr, 1, hr), this.col);
      // health above the head (as wide as the piece, never wider), rank on the base, emblem when leaning in
      const top = f.height + 14 + gy;
      const bw = Math.min(v.halfW * 1.7, 18 * px);
      const bh = 2.4 * px;
      this.bars.add(v.x, top, v.z, bw, bh, frac, frac < LOW_HP ? LOW_HP_RED : markCol);
      if (u.shield > 0)
        this.bars.add(
          v.x,
          top + bh * 1.7,
          v.z,
          bw,
          bh * 0.6,
          Math.min(1, u.shield / u.maxHp),
          SHIELD,
        );
      const ts = Math.min(8 * px, f.height * 0.3);
      const cam = this.cam.camera.position;
      const cx = cam.x - v.x;
      const cz = cam.z - v.z;
      const cl = Math.hypot(cx, cz) || 1;
      const rr = this.camRight;
      const fx = v.x + (cx / cl) * br * 0.9 + rr.x * br * 0.55;
      const fz = v.z + (cz / cl) * br * 0.9 + rr.z * br * 0.55;
      this.tags.rank(fx, ts * 0.5 + 2 + gy, fz, ts, u.rank ?? 1, team, fork);
      if ((this.leaning || u.id === followId) && u.style) {
        this.tags.emblem(
          fx + this.camRight.x * ts * 1.05,
          ts * 0.5 + 2 + gy,
          fz + this.camRight.z * ts * 1.05,
          ts,
          u.style,
        );
      }
      return;
    }
    v.x = v.sx;
    v.z = v.sz;
    const gy = (v.gy = this.board.relief.at(v.x, v.z));
    const A = v.lunge * v.lunge * (3 - 2 * v.lunge);
    switch (u.kind) {
      case 'minion': {
        if (u.team === 'neutral') {
          const big = u.maxHp >= 2000;
          const tier: 0 | 1 | 2 = big ? 2 : u.maxHp >= 800 ? 1 : 0;
          const ev =
            u.defId.includes('spirit') ||
            u.defId.includes('kitsune') ||
            u.defId.includes('lantern');
          const c = this.crowds[ev ? 'spirit' : `beast${tier}`];
          const bob = ev
            ? Math.sin(this.time * 2.4 + v.phase0) * 6 + 10
            : Math.abs(Math.sin(v.phase)) * 3 * v.move;
          const i = c.add(v.x, bob + gy, v.z, v.yaw, ev ? 1.1 : 1.15, A * 0.3 - v.flinch * 0.25);
          c.color(i, this.hurt(v));
          this.blobs.addXYZ(v.x, gy + 0.8, v.z, 0, tier === 2 ? 70 : 34, 1, tier === 2 ? 70 : 34);
          if (u.hp < u.maxHp - 0.5)
            this.bars.add(
              v.x,
              (tier === 2 ? 135 : ev ? 80 : 62) + gy,
              v.z,
              22 * px,
              3 * px,
              frac,
              '#d88a52',
            );
          break;
        }
        const elite = v.elite;
        const key = elite ? `pawn${team}` : `${u.defId === 'ranged' ? 'ranged' : 'melee'}${team}`;
        const c = this.crowds[key] ?? this.crowds[`melee${team}`];
        const hop = Math.abs(Math.sin(v.phase * 1.2)) * (elite ? 5 : 4) * v.move;
        const i = c.add(
          v.x,
          hop + gy,
          v.z,
          v.yaw,
          (elite ? 1.15 : 1.1) * SIZE.k,
          v.move * 0.12 + A * 0.35 - v.flinch * 0.3,
          Math.sin(v.phase * 1.2) * 0.08 * v.move,
        );
        c.color(i, this.hurt(v));
        const br = (elite ? 17 : 13) * SIZE.k;
        this.col.set(T.trim);
        this.rim.color(
          this.rim.addXYZ(v.x, hop * 0.2 + gy, v.z, 0, br, (elite ? 10 : 8) * SIZE.k, br),
          this.col,
        );
        this.blobs.addXYZ(v.x, gy + 0.8, v.z, 0, br * 1.6, 1, br * 1.6);
        const hr = br * LOOK.halo.size * 1.1;
        this.halos.color(this.halos.addXYZ(v.x, gy + 1.4, v.z, 0, hr, 1, hr), this.col.set(T.halo));
        if (u.hp < u.maxHp - 0.5)
          this.bars.add(
            v.x,
            (elite ? 108 : 64) * SIZE.k + gy,
            v.z,
            (elite ? 15 : 10) * px,
            2.4 * px,
            frac,
            markCol,
          );
        break;
      }
      case 'tower': {
        const c = this.crowds[`tower${team}`];
        const i = c.add(v.x, gy, v.z, v.yaw, 0.85 * TOWER_S, A * 0.04, 0);
        c.color(i, this.damaged(v, frac));
        this.blobs.addXYZ(v.x, gy + 0.8, v.z, 0, 90 * TOWER_S, 1, 90 * TOWER_S);
        if (frac < 0.999)
          this.bars.add(v.x, 200 * TOWER_S + gy, v.z, 26 * px, 2.8 * px, frac, markCol);
        break;
      }
      case 'guardian': {
        const c = this.crowds[`guardian${team}`];
        const i = c.add(v.x, gy, v.z, v.yaw, THRONE_S, 0, 0);
        c.color(i, this.damaged(v, frac));
        if (frac < 0.999)
          this.bars.add(v.x, 262 * THRONE_S + gy, v.z, 34 * px, 3.2 * px, frac, markCol);
        break;
      }
      case 'camp': {
        const tier: 0 | 1 | 2 = u.maxHp > 2000 ? 2 : u.maxHp > 800 ? 1 : 0;
        const c = this.crowds[`beast${tier}`];
        const i = c.add(
          v.x,
          Math.abs(Math.sin(v.phase)) * 3 * v.move + gy,
          v.z,
          v.yaw,
          1,
          A * 0.3 - v.flinch * 0.25,
        );
        c.color(i, this.hurt(v));
        this.blobs.addXYZ(
          v.x,
          gy + 0.8,
          v.z,
          0,
          tier === 2 ? 70 : tier === 1 ? 46 : 32,
          1,
          tier === 2 ? 70 : tier === 1 ? 46 : 32,
        );
        if (u.hp < u.maxHp)
          this.bars.add(
            v.x,
            (tier === 2 ? 135 : tier === 1 ? 82 : 58) + gy,
            v.z,
            18 * px,
            2.6 * px,
            frac,
            '#d88a52',
          );
        break;
      }
      case 'obelisk': {
        this.crowds.obelisk.add(v.x, gy, v.z, 0, 1.2);
        const claim = MathUtils.clamp(u.claim, -1, 1);
        this.col.set('#e9e2d0');
        if (claim > 0.02) this.col.lerp(this.tmpCol.set(TEAM.A.rim), claim);
        else if (claim < -0.02) this.col.lerp(this.tmpCol.set(TEAM.B.rim), -claim);
        const i = this.crystal.add(
          v.x,
          Math.sin(this.time * 1.6 + v.phase0) * 4 + gy,
          v.z,
          this.time * 0.6,
          1.2,
        );
        this.crystal.color(i, this.col);
        this.blobs.addXYZ(v.x, gy + 0.8, v.z, 0, 36, 1, 36);
        break;
      }
      case 'keeper':
        this.crowds.keeper.add(v.x, Math.sin(this.time * 1.3) * 2 + gy, v.z, this.time * 0.4, 1.3);
        this.blobs.addXYZ(v.x, gy + 0.8, v.z, 0, 36, 1, 36);
        break;
      default:
        break;
    }
    void dt;
  }

  private readonly tmpCol = new Color();
  private get camRight(): Vector3 {
    return this.ray.set(1, 0, 0).applyQuaternion(this.cam.camera.quaternion);
  }

  /** Instance tint: a white flash when hit. */
  private hurt(v: Rec): Color {
    const f = v.flinch;
    return this.col.setRGB(1 + f * 0.8, 1 + f * 0.8, 1 + f * 0.8);
  }

  /** Buildings darken and redden as they lose health. */
  private damaged(v: Rec, frac: number): Color {
    const d = 1 - frac;
    const f = v.flinch * 0.5;
    return this.col.setRGB(1 - d * 0.25 + f, 1 - d * 0.42 + f, 1 - d * 0.45 + f);
  }

  /** The Rank 4 moment: the new look swells in with a burst of the style colour. */
  private transform(u: ChessUnit, v: Rec, from: Rec): void {
    v.placed = true;
    v.sx = from.sx;
    v.sz = from.sz;
    v.ox = from.ox;
    v.oz = from.oz;
    v.yaw = from.yaw;
    v.move = from.move;
    v.phase = from.phase;
    v.hp = from.hp;
    v.fig?.transform();
    if (this.drawn === 0 || !u.style) return;
    const color = styleEmblem(u.style).color;
    this.gambits.flare(from.x, 1, from.z, color, 70, 1.1, 160);
    this.gambits.flare(from.x, 1, from.z, '#ffffff', 40, 0.6, 0);
    this.chips.burst(from.x, 60, from.z, color, 10, 1.2, 5);
  }

  private spawnFlare(u: SnapUnit): void {
    const x = u.x - this.half;
    const z = u.y - this.half;
    this.gambits.flare(x, 1, z, u.team === 'B' ? TEAM.B.mark : TEAM.A.mark, 40, 1, 110);
  }

  /* ------------------------------ events ------------------------------ */

  private chest(id: number, kind: string): number {
    const v = this.recs.get(id);
    if (v?.fig) return v.fig.height * 0.55;
    if (kind === 'tower') return 120 * TOWER_S;
    if (kind === 'guardian') return 140 * THRONE_S;
    if (kind === 'minion') return (v?.elite ? 50 : 30) * SIZE.k;
    return 34;
  }

  private handleEvents(events: NewEvents): void {
    for (const e of events) this.handleEvent(e);
  }

  private handleEvent(e: GameEvent): void {
    const half = this.half;
    switch (e.type) {
      case 'damage': {
        const p = e.payload;
        if (p.srcKind === 'none' || p.amount <= 0) break;
        const a = this.recs.get(p.src);
        const b = this.recs.get(p.tgt);
        if (!a || !b) break;
        if (p.srcKind === 'minion' && p.tgtKind === 'minion') break;
        const structure = p.srcKind === 'tower' || p.srcKind === 'guardian';
        this.from.set(a.x, this.chest(p.src, p.srcKind) + a.gy, a.z);
        this.to.set(b.x, this.chest(p.tgt, p.tgtKind) + b.gy, b.z);
        const color = structure
          ? '#f0b44c'
          : p.srcTeam === 'B'
            ? TEAM.B.rim
            : p.srcTeam === 'A'
              ? TEAM.A.rim
              : '#d88a52';
        if (this.from.distanceTo(this.to) < 70 && !structure)
          this.chips.burst(this.to.x, this.to.y, this.to.z, color, p.lethal ? 6 : 2, 0.7, 3);
        else this.bolts.fire(this.from, this.to, color, p.lethal || structure);
        break;
      }
      case 'death': {
        const p = e.payload;
        const x = p.x - half;
        const z = p.y - half;
        if (p.kind === 'hero') {
          const v = this.recs.get(p.id);
          const color = v?.style
            ? styleEmblem(v.style).color
            : p.team === 'B'
              ? TEAM.B.body
              : TEAM.A.body;
          this.chips.burst(v?.x ?? x, 70, v?.z ?? z, color, 12, 1.3, 6);
          this.gambits.flare(
            v?.x ?? x,
            1,
            v?.z ?? z,
            p.team === 'B' ? TEAM.B.mark : TEAM.A.mark,
            60,
            0.9,
            0,
          );
          this.cam.kick(0.12);
        } else if (p.kind === 'minion') {
          this.chips.burst(
            x,
            24,
            z,
            p.team === 'B' ? TEAM.B.body : p.team === 'A' ? TEAM.A.body : CLAY.body,
            5,
            0.8,
            4,
          );
        } else if (p.kind === 'camp') {
          this.chips.burst(x, 24, z, CLAY.body, 7, 0.9, 5);
        }
        break;
      }
      case 'structureDown': {
        const p = e.payload;
        const x = p.x - half;
        const z = p.y - half;
        const guardian = p.kind === 'guardian';
        const stone = p.team === 'B' ? '#3a3b42' : '#d9cdb0';
        this.chips.burst(
          x,
          80,
          z,
          stone,
          guardian ? 40 : 24,
          guardian ? 2.2 : 1.6,
          guardian ? 14 : 10,
        );
        this.chips.burst(x, 120, z, p.team === 'B' ? '#56637e' : '#b58d47', 10, 1.6, 10);
        this.cam.kick(guardian ? 0.9 : 0.5);
        break;
      }
      default:
        this.handleChessEvent(
          e.type as string,
          ((e as { payload?: unknown }).payload ?? {}) as Record<string, unknown>,
        );
        break;
    }
  }

  /** Chess events (gambits, Check, Checkmate), read loosely. */
  private handleChessEvent(type: string, p: Record<string, unknown>): void {
    const num = (k: string): number | undefined =>
      typeof p[k] === 'number' ? (p[k] as number) : undefined;
    const team = p.team === 'B' ? 'B' : 'A';
    const col = TEAM[team].mark;
    switch (type) {
      case 'gambit': {
        const card = typeof p.cardId === 'string' ? p.cardId : '';
        const lane = typeof p.lane === 'string' ? p.lane : null;
        const x = num('x');
        const y = num('y');
        const target = num('targetId');
        const tv = target !== undefined ? this.recs.get(target) : undefined;
        if (/sanct/i.test(card) && x !== undefined && y !== undefined && !this.zonesFromSnap) {
          this.gambits.zone(x - this.half, 1, y - this.half, '#8ff0b4', 64, 6);
          break;
        }
        if (/fork/i.test(card) && tv) {
          for (const v of this.recs.values()) {
            if (v.pieceId !== 'knight' || v.team !== team || !v.live) continue;
            this.from.set(v.x, 40, v.z);
            this.to.set(tv.x, 50, tv.z);
            this.gambits.arc(this.from, this.to, GOLD, 0.55);
            break;
          }
          this.gambits.flare(tv.x, 1, tv.z, GOLD, 50, 0.9, 120);
          break;
        }
        if (tv) {
          this.gambits.flare(tv.x, 1, tv.z, '#ff6a5a', 46, 0.9, 120);
          break;
        }
        if (x !== undefined && y !== undefined) {
          this.gambits.flare(x - this.half, 1, y - this.half, col, 70, 1.1, 120);
          break;
        }
        for (const v of this.recs.values()) {
          if (!v.fig || !v.live || v.team !== team) continue;
          const u = this.byId.get(v.id) as ChessUnit | undefined;
          if (lane && u?.lane && u.lane !== lane) continue;
          this.gambits.flare(v.x, 1, v.z, col, 44, 0.8);
        }
        break;
      }
      case 'check':
        for (const v of this.recs.values()) {
          if (v.pieceId !== 'king' || v.team !== team) continue;
          this.gambits.crown(v.id);
          this.gambits.flare(v.x, 1, v.z, '#ffe08a', 60, 1.2, 160);
        }
        break;
      case 'throneDown':
        for (const v of this.recs.values()) {
          if (v.kind !== 'guardian' || v.team !== team) continue;
          this.gambits.flare(v.x, 1, v.z, '#ff6a5a', 160, 1.6, 300);
        }
        this.cam.kick(1);
        break;
      case 'checkmate': {
        const winner = p.winner === 'B' ? 'B' : 'A';
        for (const v of this.recs.values()) {
          if (v.team === winner || !v.live) continue;
          if (v.pieceId === 'king') this.gambits.crown(v.id, 3);
          if (v.pieceId === 'king' || v.kind === 'guardian')
            this.gambits.flare(v.x, 1, v.z, GOLD, 190, 2.2, 360);
        }
        this.cam.kick(1);
        break;
      }
      default:
        break;
    }
  }

  private syncRings(snap: Snapshot): void {
    const seen = this.liveRings;
    seen.clear();
    for (const e of snap.events) {
      seen.add(e.id);
      let ring = this.rings.get(e.id);
      if (!ring) {
        ring = new EventRing(this.kit, e.type, e.radius);
        ring.group.position.set(
          e.x - this.half,
          1.5 + this.board.relief.atSim(e.x, e.y),
          e.y - this.half,
        );
        this.rings.set(e.id, ring);
        this.scene.add(ring.group);
      }
      ring.update(this.time, e.phase === 'warning', e.progress, e.team);
      const t = e.telegraph;
      ring.setTelegraph(
        t ? t.x - this.half : 0,
        0,
        t ? t.y - this.half : 0,
        t?.radius ?? 0,
        this.time,
        !!t,
      );
    }
    for (const [id, ring] of this.rings) {
      if (seen.has(id)) continue;
      this.scene.remove(ring.group);
      this.rings.delete(id);
    }
  }

  /* ------------------------------ debug line-up ------------------------------ */

  /** `?lineup`: every piece in every style, both sides, in rows on the board (no sim units drawn). */
  private lineupList(): ChessUnit[] {
    if (this.lineupUnits) return this.lineupUnits;
    const styles: Record<PieceId, (string | null)[]> = {
      king: [null, 'warlord', 'sovereign', 'usurper'],
      queen: [null, 'regent', 'duelist', 'huntress'],
      rook: [null, 'bastion', 'ram', 'vanguard'],
      bishop: [null, 'light', 'shadow', 'zealot'],
      knight: [null, 'lancer', 'errant', 'paladin'],
    };
    const c = this.cam.camera.position;
    const len = Math.hypot(c.x, c.z) || 1;
    // screen axes on the board: right and up as seen from the seat
    const upX = -c.x / len;
    const upZ = -c.z / len;
    const rX = -upZ;
    const rZ = upX;
    const list: ChessUnit[] = [];
    let id = 900000;
    (['A', 'B'] as const).forEach((team, ti) => {
      PIECES.forEach((piece, col) => {
        styles[piece].forEach((style, row) => {
          const cx = (col - 2) * 190;
          const cy = (ti === 0 ? -1 : 1) * ((3 - row) * 290 + 150);
          const wx = rX * cx + upX * cy;
          const wz = rZ * cx + upZ * cy;
          const x = wx + this.half;
          const y = wz + this.half;
          list.push({
            id: id++,
            kind: 'hero',
            team,
            defId: piece,
            x,
            y,
            px: x,
            py: y,
            hp: 1000 - row * 200,
            maxHp: 1000,
            shield: 0,
            alive: true,
            piece,
            style,
            path: null,
            rank: style ? 4 + row : 1 + col,
            forkPending: false,
            pawn: false,
            lane: null,
            role: null,
            marked: false,
            stunned: false,
            attackKind: null,
            recalling: false,
            goal: null,
            slot: 0,
            range: 0,
            claim: 0,
            curse: false,
            holy: false,
            target: null,
            flash: false,
            inCombat: false,
          } as ChessUnit);
        });
      });
    });
    this.lineupUnits = list;
    return list;
  }

  private reset(): void {
    for (const v of [...this.recs.values()]) this.drop(v);
    for (const [id, ring] of this.rings) {
      this.scene.remove(ring.group);
      this.rings.delete(id);
    }
    this.chips.clear();
    this.bolts.clear();
    this.gambits.clear();
    this.zones.clear();
    this.drawn = 0;
  }

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    this.reset();
    this.board.dispose();
    this.lib.dispose();
    for (const c of Object.values(this.crowds)) c.dispose();
    this.blobs.dispose();
    this.halos.dispose();
    this.chips.crowd.dispose();
    this.bolts.crowd.dispose();
    this.tags.dispose();
    this.facet.dispose();
    this.kit.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
