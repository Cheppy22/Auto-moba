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
import type { BroadcastFrame, CamMode, NewEvents } from '../broadcast/types';
import { ZoneFx } from '../broadcast/zones';
import { Board } from './board';
import type { MapStyleId } from './longlook';
import { TableCamera } from './camera';
import { FreeControls } from './controls';
import { InkPass } from './ink';
import { LaneCam } from './lanecam';
import { Crowd, crowdInk, facetMaterial, hullOf } from './crowd';
import { FIG_HEIGHT, type PieceId } from './figures';
import { CombatFx } from './combatfx';
import { Life } from './life';
import type { LongRelief } from './relief';
import { newEyeHold, stepEyeHold } from './eyehold';
import { Bolts, Chips, Tags } from './fx';
import {
  baseRim,
  baseTop,
  bastion,
  creature,
  obeliskCrystal,
  obeliskPlinth,
  pawn,
  pawnling,
  spirit,
  throne,
} from './models';
import { CLAY, LOOK, TABLE, TEAM } from './palette';
import { FIG_SCALE, FigureLib, PieceFigure, SIZE, sizeFor } from './piece';

const PIECES: readonly PieceId[] = ['king', 'queen', 'rook', 'bishop', 'knight'];
const isPiece = (s: unknown): s is PieceId =>
  typeof s === 'string' && (PIECES as readonly string[]).includes(s);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const easeIn = (t: number): number => t * t;
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);
const LOW_HP = 0.3;
const LOW_HP_RED = '#ff5a48';
const SHIELD = '#a9d0e0';
const PIN_RIM = '#d6a63c';
const DESPERATE_RIM = '#ff4a3a';
const STONE = '#cfc3a1';
const GOLD = '#ffd35a';
const PICK_PX = 36;
/** The old view's pieces were about this tall in world units; HUD lifts scale by the ratio. */
const OLD_PIECE_H = 57;
/** Seconds a captured piece takes to topple and sink (reduced motion: no flight). */
const FALL_SEC = 0.9;
/** A captured piece knocked flying: seconds in all, in the air, and before it fades away. */
const FLY_SEC = 1.5;
const FLY_AIR = 0.5;
const FLY_FADE = 1.05;
/** Hit-stop on a capture (real seconds the effect clock nearly stops) and how slow it runs. */
const HIT_STOP_SEC = 0.12;
const HIT_STOP_K = 0.08;
/** Checkmate beat (real seconds): push-in, the King's slow topple, the gold burst. */
const MATE_PUSH = 0.5;
const MATE_TOPPLE = 1.5;
const MATE_SEC = 3.2;
const MATE_SEC_REDUCED = 1.2;
/** Seconds a returning piece takes to drop onto the board. */
const DROP_SEC = 0.42;
/** Seconds a teleporting piece takes to beam out, and to condense at its destination. */
const WARP_OUT_SEC = 0.4;
const WARP_IN_SEC = 0.45;
/** A piece whose sim position jumps this far in one frame has teleported (recall, Castle, Fork). */
const WARP_MIN = 220;
/** Seconds of game time a hit's outline flash and squash take to fade. */
const HIT_SEC = 0.26;
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

/** A blow that lands a moment after its event (the swing's snap, or the bolt's flight). */
interface PendingHit {
  vid: number;
  aid: number;
  t: number;
  dx: number;
  dz: number;
  strength: number;
  big: boolean;
  kill: boolean;
  melee: boolean;
  team: 'A' | 'B' | 'N';
}

const WHITE = new Color('#ffffff');

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
  /** Strength of the last blow taken (squash, recoil, outline flash), fading to 0. */
  hit = 0;
  hitX = 0;
  hitZ = 0;
  /** Teleport: 0 none, 1 beaming out (held at the departure point), 2 condensing at the destination. */
  warpPhase = 0;
  warpT = 0;
  wx = 0;
  wz = 0;
  /** Seconds the recall channel has run (-1 when not channelling), and the mote timer. */
  recallT = -1;
  mote = 0;
  /** Extra height for the health bar so bars of piled-up pieces do not overlap. */
  barLift = 0;
  bx = 0;
  by = 0;
  lunge = 0;
  /** Seconds since the last blow, and the running estimate of the blow interval. */
  since = 9;
  period = 1.2;
  flashed = false;
  alive = true;
  /** The high-ground eye's minimum on-screen time. */
  readonly eye = newEyeHold();
  fall = 0;
  /** Capture flight: the blow's direction (unit), distance, roll side; landing and token sent. */
  flyX = 0;
  flyZ = 1;
  flyD = 0;
  flyRoll = 1;
  landed = false;
  faded = false;
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

/**
 * The Tournament Table view (the default look): the whole board on a walnut table under a
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
  /** Half the board's width (x) and length (z): sim point minus these is the world point. */
  private readonly hx: number;
  private readonly hz: number;
  /** The Long Board (terraces): ground picking and labels follow the real heights. */
  private readonly long: boolean;
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
  private readonly fx: CombatFx;
  /** The Long Board's life pass (weather, ripples, birds, banners); null on the square board. */
  private readonly life: Life | null;
  /** The key and rim lights' set intensities (the light drifts slowly round them). */
  private readonly keyK: number;
  private readonly backK: number;
  private readonly hits: PendingHit[] = [];
  private readonly hitPool: PendingHit[] = [];
  private readonly order: Rec[] = [];
  private readonly motion: MediaQueryList | null =
    typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  private readonly haloCol = {
    A: new Color(TEAM.A.halo),
    B: new Color(TEAM.B.halo),
    N: new Color('#d88a52'),
  };
  private readonly rimCol = {
    A: new Color(TEAM.A.rim),
    B: new Color(TEAM.B.rim),
    N: new Color('#d88a52'),
  };
  /** Brighter team colours for light on the pale dais and for the teleport columns. */
  private readonly hotCol = {
    A: new Color(TEAM.A.rim).lerp(WHITE, 0.5),
    B: new Color(TEAM.B.rim).lerp(WHITE, 0.5),
  };
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
  private readonly laneCam: LaneCam;
  private readonly controls: FreeControls;
  /** The camera mode of the last frame (gestures read it between frames). */
  private mode: CamMode = 'free';
  /** A gesture took the camera back: free for a few frames, until the page's camera mode says so too. */
  private manualPending = 0;
  /** Follow mode: the camera distance (pinch and wheel change it). */
  private followD = 0;
  /** Last compass state sent to the page (turned away from the default angle, yaw in degrees). */
  private angleSent = { turned: false, yaw: NaN };
  private readonly lineup: 'board' | 'close' | 'closeb' | null;
  private lineupUnits: ChessUnit[] | null = null;
  private time = 0;
  /** Real seconds of capture hit-stop left (the effect clock runs at HIT_STOP_K meanwhile). */
  private stopT = 0;
  /** The Checkmate beat on the losing King: real seconds since it began, and the burst done. */
  private mate: { id: number; t: number; boomed: boolean; done: boolean } | null = null;
  private insetClock = 0;
  private stamp = 0;
  private lastTick = -1;
  private drawn = 0;
  /** The ink-and-brass post-process, while it is switched on. */
  private ink: InkPass | null = null;
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
    /** The Long Board's theme (`a` Slate garden, `b` Lamplit parterre). */
    theme: MapStyleId = 'a',
  ) {
    this.renderer = webgl(canvas);
    this.hx = content.map.size / 2;
    this.hz = (content.map.length ?? content.map.size) / 2;
    this.long = !!content.map.terraces;
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.shadows = !coarse && Math.min(window.innerWidth, window.innerHeight) >= 640;
    const r = this.renderer;
    r.setPixelRatio(Math.min(coarse ? 2 : 1.5, window.devicePixelRatio || 1));
    r.shadowMap.enabled = this.shadows;
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);
    const p = new URLSearchParams(location.search).get('lineup');
    this.lineup = p === 'close' || p === 'closeb' ? p : p !== null ? 'board' : null;

    // the square board's hall: a dark warm gradient behind the table, fog that swallows the
    // table's edge (the Long Board replaces both with its theme's haze, below)
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
      const w = Math.max(this.hx, this.hz) + (this.long ? 340 : 130);
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
    this.keyK = this.key.intensity;
    this.backK = this.back.intensity;

    this.board = new Board(content, coarse ? 2048 : 3072, theme);
    this.applyHaze();
    const ground = this.board.relief;
    this.cam = new TableCamera(
      content,
      FIG_HEIGHT.king * FIG_SCALE * 1.1 + ground.peak,
      THRONE_H * THRONE_S + ground.dais,
    );
    this.scene.add(this.board.group);
    this.life = this.long ? new Life(content.map, ground as LongRelief, theme) : null;
    if (this.life) this.scene.add(this.life.group);

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
    if (this.long) this.chips.ground = (x, z) => this.board.relief.at(x, z);
    this.bolts = new Bolts(this.facet, this.chips);
    this.fx = new CombatFx(this.kit);
    this.bars = new BarBatch(this.kit);
    this.gambits = new GambitFx(this.kit);
    this.zones = new ZoneFx(this.kit, content.map.lanes);
    this.scene.add(
      ...this.fx.meshes,
      this.chips.crowd.mesh,
      this.bolts.crowd.mesh,
      this.gambits.group,
      this.zones.group,
      this.bars.group,
      this.tags.mesh,
    );
    this.laneCam = new LaneCam(content, canvas, this.groundAt, () => this.cam.pxNow());
    this.controls = new FreeControls(canvas, {
      cam: this.cam,
      ground: this.groundAt,
      mode: () => this.mode,
      manual: () => {
        // a drag (or, in Auto, any gesture) takes the camera back: free, from where it is
        this.cam.holdHere();
        this.mode = 'free';
        this.manualPending = 3;
        this.canvas.dispatchEvent(new Event('cam-manual'));
      },
      followZoom: (f) => {
        this.followD = MathUtils.clamp(this.followD * f, this.cam.minD, this.cam.maxD);
      },
    });
    this.resize();
    if (import.meta.env.DEV) {
      const w = window as unknown as Record<string, unknown>;
      w.__tvStats = () => this.stats();
      w.__tvMeasure = () => this.measure();
      // dev: renders the current frame `n` times, waiting for each to finish (ms per frame)
      w.__tvBench = (n = 20) => {
        const gl = this.renderer.getContext();
        const px = new Uint8Array(4);
        // reading a pixel back waits for the frame to finish drawing
        const sync = (): void => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        this.paint();
        sync();
        const t0 = performance.now();
        for (let i = 0; i < n; i++) {
          this.paint();
          sync();
        }
        return (performance.now() - t0) / n;
      };
      // dev: fire a blow between two units (ids), for screenshots of the hit effects
      w.__tvHit = (aid: number, vid: number, frac = 0.06, lethal = false, melee = true) => {
        const a = this.recs.get(aid);
        const v = this.recs.get(vid);
        if (a && v) this.queueHit(a, v, a.team, 0, frac, lethal, melee);
      };
      // dev: set the free camera (zoom: a factor of the distance, 99 = all the way out; yaw: radians
      // added; tilt: degrees; home: back to the default pose), for screenshots
      w.__tvCam = (o: {
        zoom?: number;
        yaw?: number;
        tilt?: number;
        home?: boolean;
        /** Aim at a sim point. */
        at?: { x: number; y: number };
      }) => {
        const g = this.cam.goal;
        if (o.home) this.cam.goHome();
        if (o.zoom !== undefined) g.d = o.zoom >= 99 ? this.cam.maxD : g.d * o.zoom;
        if (o.yaw !== undefined) g.yaw += o.yaw;
        if (o.tilt !== undefined) g.tilt = MathUtils.degToRad(o.tilt);
        if (o.at) this.cam.centred({ x: o.at.x - this.hx, z: o.at.y - this.hz }, g.d, g);
        return { ...this.cam.pose, min: this.cam.minD, max: this.cam.maxD };
      };
      // dev: captured pieces in flight (screen position in CSS px), for screenshots and checks
      w.__tvFlights = () =>
        [...this.recs.values()]
          .filter((v) => v.fig && !v.alive && v.flyD > 0 && v.fall < 1)
          .map((v) => {
            const q = this.tmp.set(v.x, v.gy, v.z).project(this.cam.camera);
            return {
              id: v.id,
              fall: v.fall,
              landed: v.landed,
              sx: Math.round(((q.x + 1) / 2) * this.cssW),
              sy: Math.round(((1 - q.y) / 2) * this.cssH),
            };
          });
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

  stats(): {
    calls: number;
    triangles: number;
    geometries: number;
    textures: number;
    frames: number;
    fx: number[];
    time: number;
  } {
    const i = this.renderer.info;
    return {
      frames: this.drawn,
      fx: this.fx.counts(),
      time: this.time,
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
    // dev only: `window.__tvDt = 0.02` fixes the effect time per frame and `window.__tvBudget`
    // (seconds) runs it for that long, then freezes it (deterministic screenshots)
    let dtRaw = real;
    if (import.meta.env.DEV) {
      const w = window as unknown as { __tvDt?: number; __tvBudget?: number };
      if (w.__tvDt) {
        dtRaw = w.__tvDt;
        if (w.__tvBudget !== undefined) {
          dtRaw = Math.max(1e-6, Math.min(dtRaw, w.__tvBudget));
          w.__tvBudget = Math.max(0, w.__tvBudget - dtRaw);
        }
      }
    }
    // a capture's hit-stop: the effect clock nearly stops for a beat (the sim never does)
    const stopK = this.stopT > 0 ? HIT_STOP_K : 1;
    this.stopT = Math.max(0, this.stopT - dtRaw);
    if (this.mate) {
      this.mate.t += dtRaw;
      // the beat is over: the page shows the result splash
      const end = this.motion?.matches === true ? MATE_SEC_REDUCED : MATE_SEC;
      if (!this.mate.done && this.mate.t >= end) {
        this.mate.done = true;
        this.canvas.dispatchEvent(new Event('mate-done'));
      }
    }
    const dt = dtRaw * frame.timeScale * stopK;
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

    this.steer(frame, real);
    const camera = this.cam.camera;
    const px = this.cam.pxNow();
    this.lib.ink.A.value = px * TEAM.A.inkPx;
    this.lib.ink.B.value = px * TEAM.B.inkPx;

    if (!this.lineup) this.handleEvents(events);
    this.flushHits(dt);
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
      this.zones.setZones(snap.zones, this.hx, this.ground, this.time, dt, this.hz);
    this.gambits.update(dt, this.time, this.unitPos);
    this.bolts.update(dt);
    this.fx.update(dt);
    this.chips.update(dt);
    this.drift();
    this.paint();
    this.drawn++;
  }

  /** Draws the scene (through the ink pass when it is on). */
  private paint(): void {
    if (this.ink) this.ink.render(this.scene, this.cam.camera, this.cam.pose.d);
    else this.renderer.render(this.scene, this.cam.camera);
  }

  /** Turns the "Ink style" post-process on or off (the Title and Adjourn switch; `?fx=ink`). */
  setInk(on: boolean): void {
    if (on === !!this.ink) return;
    if (on) this.ink = new InkPass(this.renderer);
    else {
      this.ink?.dispose();
      this.ink = null;
    }
  }

  /** True while the ink pass draws the frame. */
  get inked(): boolean {
    return !!this.ink;
  }

  /**
   * The camera for this frame. Free: the gestures drive it (a fling coasts). Follow: the followed
   * unit in the middle of the HUD-free band. Lane: the lane camera's point along the lane. Auto:
   * the director's shot (the wide shot is the whole board). Switching back to Free starts from
   * where the camera is.
   */
  private steer(frame: BroadcastFrame, real: number): void {
    const cam = this.cam;
    const g = cam.goal;
    this.controls.frame();
    const was = this.mode;
    let mode: CamMode = frame.mode;
    if (this.manualPending > 0) {
      this.manualPending = mode === 'free' ? 0 : this.manualPending - 1;
      mode = 'free';
    }
    if (this.lineup) mode = 'free';
    const mk = this.mate && this.motion?.matches !== true ? this.recs.get(this.mate.id) : undefined;
    if (mk) mode = 'free';
    if (mode !== was) {
      if (mode === 'follow') this.followD = Math.min(cam.pose.d, cam.followDist);
      else if (mode === 'free') cam.holdHere();
    }
    this.mode = mode;
    if (this.long) this.planeY = this.board.relief.at(cam.pose.x, cam.pose.z);
    let rate: number;
    const lane = mode === 'lane' ? this.laneCam.update(frame.laneFocus ?? null) : null;
    if (mode !== 'lane') this.laneCam.update(null);
    if (mk) {
      // Checkmate: push in on the losing King, a little lower, and hold there
      g.d = MathUtils.clamp(cam.followDist * 0.5, cam.minD, cam.maxD);
      g.tilt = Math.max(cam.home.tilt - MathUtils.degToRad(8), MathUtils.degToRad(30));
      cam.centred(mk, g.d, g);
      rate = 2.4;
    } else if (mode === 'lane' && lane) {
      g.d = cam.laneDist(this.laneCam.zoom);
      cam.centred(lane, g.d, g);
      rate = this.laneCam.active ? 10 : 4;
    } else if (mode === 'follow' && frame.followId !== null) {
      const f = this.recs.get(frame.followId);
      if (f?.live) {
        g.d = this.followD;
        cam.centred(f, g.d, g);
      }
      rate = 5;
    } else if (mode === 'auto') {
      const shot = frame.shot;
      const tanV = Math.tan(MathUtils.degToRad(cam.camera.fov / 2));
      if (shot.kind === 'wide') {
        g.x = 0;
        g.z = 0;
        g.d = cam.wholeDist;
      } else {
        this.lean.x = shot.x - this.hx;
        this.lean.z = shot.y - this.hz;
        g.d = MathUtils.clamp(
          (shot.radius * 1.5 * Math.sin(g.tilt)) / tanV,
          cam.minD * 1.4,
          cam.wholeDist,
        );
        cam.centred(this.lean, g.d, g);
      }
      if (shot.cut) Object.assign(cam.pose, g);
      rate = 2.2;
    } else {
      this.controls.tick(real);
      rate = this.controls.active ? 18 : 8;
    }
    this.leaning = mode === 'lane' || mode === 'follow' || g.d < cam.wholeDist * 0.6;
    cam.update(real, rate);
    this.sendAngle();
    // the Long Board: the board stays clear, the lake and the woods past it fade into the haze
    if (this.long && this.scene.fog instanceof Fog) {
      this.scene.fog.near = cam.pose.d + 1800;
      this.scene.fog.far = cam.pose.d + 9000;
    }
  }

  /**
   * The life pass: weather round the camera's target, and a slow drift in the light (as if thin
   * cloud crossed the lamps), both on the effect clock; still when the player prefers less motion.
   */
  private drift(): void {
    const reduced = this.motion?.matches === true;
    const t = this.time;
    this.life?.update(t, this.cam.pose.x, this.cam.pose.z, reduced || !!this.lineup);
    const k = reduced ? 1 : 1 + 0.06 * Math.sin(t * 0.11) + 0.035 * Math.sin(t * 0.29 + 1.3);
    this.key.intensity = this.keyK * k;
    this.back.intensity = this.backK * (2 - k);
  }

  /** The Long Board's haze: the background and the fog take the theme's colour. */
  private applyHaze(): void {
    const haze = this.board.haze;
    if (!haze) return;
    this.scene.background = new Color(haze);
    if (this.scene.fog instanceof Fog) this.scene.fog.color.set(haze);
  }

  /** Switches the Long Board's theme in place (the camera keeps its pose). */
  setTheme(theme: MapStyleId): void {
    this.board.setTheme(theme);
    this.life?.setTheme(theme);
    this.applyHaze();
  }

  /** The last press on the board was a drag or a pinch (the tap handlers ignore it). */
  get gestured(): boolean {
    return this.controls.gestured || this.laneCam.active;
  }

  /** Tells the page when the compass should show and where it points (on change only). */
  private sendAngle(): void {
    const turned = this.cam.turned;
    const yaw = Math.round(MathUtils.radToDeg(this.cam.pose.yaw - this.cam.home.yaw));
    if (yaw !== this.angleSent.yaw && typeof document !== 'undefined')
      document.documentElement.style.setProperty('--cam-yaw', `${yaw}deg`);
    if (turned !== this.angleSent.turned)
      this.canvas.dispatchEvent(new CustomEvent('cam-angle', { detail: { turned } }));
    this.angleSent = { turned, yaw };
  }

  /** Eases back to the default camera angle (the compass button). */
  resetAngle(): void {
    this.cam.resetAngle();
  }

  /** Zone effects sit just above the floor (the square board keeps them on its lane level). */
  private readonly ground = (x: number, z: number): number =>
    this.long ? this.board.relief.at(x, z) + 1 : 1;

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
        x - this.hx,
        lift * ((FIG_HEIGHT.king * FIG_SCALE * SIZE.k) / OLD_PIECE_H) +
          (this.long ? this.board.relief.atSim(x, y) : 0),
        y - this.hz,
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

  /** Height of the plane gestures grab (the ground under the camera's target on the Long Board). */
  private planeY = 0;

  /** The world point (x, z on the plane at `planeY`) under a client position. */
  private readonly groundAt = (
    clientX: number,
    clientY: number,
    out: { x: number; z: number },
  ): boolean => {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width || this.canvas.clientWidth;
    const h = rect.height || this.canvas.clientHeight;
    if (w <= 0 || h <= 0) return false;
    const nx = ((clientX - rect.left) / w) * 2 - 1;
    const ny = 1 - ((clientY - rect.top) / h) * 2;
    const cam = this.cam.camera;
    const o = this.org.setFromMatrixPosition(cam.matrixWorld);
    const d = this.ray.set(nx, ny, 0.5).unproject(cam).sub(o).normalize();
    if (d.y > -1e-4) return false;
    const t = (this.planeY - o.y) / d.y;
    out.x = o.x + d.x * t;
    out.z = o.z + d.z * t;
    return true;
  };

  /** The sim point under a screen position: the view ray meets the board plane. */
  pickGround(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width || this.canvas.clientWidth;
    const h = rect.height || this.canvas.clientHeight;
    if (w <= 0 || h <= 0) return null;
    const nx = ((clientX - rect.left) / w) * 2 - 1;
    const ny = 1 - ((clientY - rect.top) / h) * 2;
    if (nx < -1 || nx > 1 || ny < -1 || ny > 1) return null;
    const g = { x: 0, z: 0 };
    if (!this.groundAt(clientX, clientY, g)) return null;
    // the Long Board's terraces stand above y = 0: slide along the view ray onto the ground
    if (this.long) {
      const o = this.org;
      const d = this.ray;
      for (let i = 0; i < 4; i++) {
        const t = (this.board.relief.at(g.x, g.z) - o.y) / d.y;
        g.x = o.x + d.x * t;
        g.z = o.z + d.z * t;
      }
    }
    const x = g.x + this.hx;
    const y = g.z + this.hz;
    if (x < 0 || y < 0 || x > this.hx * 2 || y > this.hz * 2) return null;
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
    this.layoutBars(px);
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
    let x = lerp(u.px, u.x, alpha) - this.hx;
    let z = lerp(u.py, u.y, alpha) - this.hz;
    if (v.fig) {
      if (!u.alive) {
        if (v.alive) {
          v.alive = false;
          v.fall = 1e-4;
          v.warpPhase = 0;
          v.recallT = -1;
          Object.assign(v.eye, newEyeHold());
        }
        const flying = v.flyD > 0 && this.motion?.matches !== true;
        v.fall = Math.min(1, v.fall + dt / (flying ? FLY_SEC : FALL_SEC));
        v.live = false;
        return;
      }
      if (!v.alive) {
        v.alive = true;
        v.fall = 0;
        v.flyD = 0;
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
    if (v.fig && v.placed && !this.lineup) {
      // a piece whose sim position jumps has teleported: beam out where it stood, condense at the new spot
      if (v.warpPhase === 0 && this.drawn > 0 && Math.hypot(x - v.sx, z - v.sz) > WARP_MIN)
        this.startWarp(v);
      if (v.warpPhase === 1) {
        v.warpT = Math.min(1, v.warpT + dt / WARP_OUT_SEC);
        if (v.warpT >= 1) {
          v.warpPhase = 2;
          v.warpT = 0;
          v.sx = x;
          v.sz = z;
          v.ox = 0;
          v.oz = 0;
          this.arrive(v, x, z);
        } else {
          x = v.wx;
          z = v.wz;
        }
      } else if (v.warpPhase === 2) {
        v.warpT = Math.min(1, v.warpT + dt / WARP_IN_SEC);
        if (v.warpT >= 1) v.warpPhase = 0;
      }
      // the recall channel: counts while the sim says the piece is recalling
      if (u.recalling) v.recallT = Math.max(0, v.recallT) + dt;
      else if (v.recallT >= 0) {
        if (v.recallT > 0.25 && v.warpPhase === 0) this.fizzle(v);
        v.recallT = -1;
      }
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
        want = Math.atan2(foe.x - this.hx - x, foe.y - this.hz - z);
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
    v.hit = Math.max(0, v.hit - dt / HIT_SEC);
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

  /**
   * Health bars of piled-up pieces would sit on top of each other: walk the pieces front to back
   * (lowest on screen first) and lift a bar by one bar-height step until it clears the ones placed.
   */
  private layoutBars(px: number): void {
    const P = this.pieces;
    const O = this.order;
    O.length = 0;
    const cam = this.cam.camera;
    for (const v of P) {
      v.barLift = 0;
      const f = v.fig!;
      const q = this.tmp.set(v.sx + v.ox, f.height + 14 + v.gy, v.sz + v.oz).project(cam);
      v.bx = ((q.x + 1) / 2) * this.cssW;
      v.by = ((1 - q.y) / 2) * this.cssH;
      O.push(v);
    }
    if (O.length < 2) return;
    O.sort((a, b) => b.by - a.by);
    const step = 5.5;
    const toWorld = px / Math.max(0.3, Math.cos((this.cam.tiltDeg * Math.PI) / 180));
    for (let i = 1; i < O.length; i++) {
      const a = O[i];
      const wa = Math.min((a.fig!.halfWidth * 1.7) / px, 18);
      for (let tries = 0; tries < 5; tries++) {
        let hit = false;
        for (let j = 0; j < i; j++) {
          const b = O[j];
          const wb = Math.min((b.fig!.halfWidth * 1.7) / px, 18);
          if (Math.abs(a.bx - b.bx) < (wa + wb) / 2 + 1 && Math.abs(a.by - b.by) < step) {
            hit = true;
            break;
          }
        }
        if (!hit) break;
        a.by -= step;
        a.barLift += step * toWorld;
      }
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
      // the Checkmate beat takes the losing King, standing or fallen
      if (this.mate?.id === v.id) {
        this.mateKing(v, f);
        return;
      }
      if (!v.alive) {
        if (v.flyD > 0 && this.motion?.matches !== true) {
          this.flight(v, f);
          return;
        }
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
      // teleport: 0 present, 1 gone (out: rises 0 to 1, in: falls 1 to 0); reduced motion fades instead
      const reduced = this.motion?.matches === true;
      const wp = v.warpPhase === 1 ? easeIn(v.warpT) : v.warpPhase === 2 ? 1 - easeOut(v.warpT) : 0;
      f.setVisible(wp < 0.985 || reduced);
      // a blow shoves the piece back along the line of the swing
      const shove = reduced ? 0 : v.hit * 7 * SIZE.k;
      f.place(v.x + v.hitX * shove, gy, v.z + v.hitZ * shove, v.yaw);
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
        hit: v.hit,
        still: reduced,
        warp: reduced ? 0 : wp,
        fade: reduced ? 1 - wp : 1,
      });
      // the miniature's base: team metal rim, style-coloured top, a pulsing gold rim when a fork waits
      const br = Math.max(22, v.halfW * 0.92) * (reduced ? 1 : 1 - 0.85 * wp);
      if (wp > 0.97 && !reduced) return;
      if (v.recallT >= 0 && v.warpPhase === 0) this.channel(v, f, br, team, dt, reduced);
      if (!this.lineup && u.inCombat && u.target !== null) this.thread(v, u.target, br, team, px);
      const fork = u.forkPending === true;
      const pulse = fork ? 0.5 + 0.5 * Math.sin(this.time * 7) : 0;
      this.col.set(T.trim);
      if (fork) this.col.lerp(this.tmpCol.set(GOLD), pulse);
      // Pin: a steady brass ring; Desperado: a red rim that beats
      if (u.pinned === true) this.col.set(PIN_RIM);
      else if (u.desperate === true)
        this.col.lerp(this.tmpCol.set(DESPERATE_RIM), 0.55 + 0.45 * Math.sin(this.time * 9));
      this.rim.color(this.rim.addXYZ(v.x, gy, v.z, 0, br, 14, br), this.col);
      this.col.set(u.style ? styleEmblem(u.style).color : T.body);
      this.top.color(this.top.addXYZ(v.x, gy, v.z, 0, br, 14, br), this.col);
      this.blobs.addXYZ(v.x, gy + 0.8, v.z, 0, br * 1.5, 1, br * 1.5);
      const hr = br * LOOK.halo.size;
      this.col.set(T.halo);
      if (fork) this.col.lerp(this.tmpCol.set(GOLD), pulse);
      this.halos.color(this.halos.addXYZ(v.x, gy + 1.4, v.z, 0, hr, 1, hr), this.col);
      // health above the head (as wide as the piece, never wider), rank on the base, emblem when leaning in
      const top = f.height + 14 + gy + v.barLift;
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
      // the high-ground eye: this piece's target stands below it (Reach and Sight favour it)
      // (a 17 px medallion-style badge that breathes gently, still when motion is reduced)
      // it stays up for at least EYE_HOLD_SEC after it turns on, then shrinks away
      const eyeShow = stepEyeHold(v.eye, u.highGround === true, this.time);
      if (eyeShow > 0) {
        const breathe = reduced ? 1 : 1 + 0.08 * Math.sin(this.time * 4);
        this.tags.eye(v.x, top + (u.shield > 0 ? 13 : 11) * px, v.z, 17 * px * breathe * eyeShow);
      }
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
        if (frac < 0.999 || u.shield > 0)
          this.bars.add(v.x, 200 * TOWER_S + gy, v.z, 26 * px, 2.8 * px, frac, markCol);
        if (u.shield > 0)
          this.bars.add(
            v.x,
            200 * TOWER_S + gy + 2.8 * px * 1.7,
            v.z,
            26 * px,
            2.8 * px * 0.6,
            Math.min(1, u.shield / u.maxHp),
            SHIELD,
          );
        break;
      }
      case 'guardian': {
        const c = this.crowds[`guardian${team}`];
        const i = c.add(v.x, gy, v.z, v.yaw, THRONE_S, 0, 0);
        c.color(i, this.damaged(v, frac));
        if (frac < 0.999 || u.shield > 0)
          this.bars.add(v.x, 262 * THRONE_S + gy, v.z, 34 * px, 3.2 * px, frac, markCol);
        if (u.shield > 0)
          this.bars.add(
            v.x,
            262 * THRONE_S + gy + 3.2 * px * 1.7,
            v.z,
            34 * px,
            3.2 * px * 0.6,
            Math.min(1, u.shield / u.maxHp),
            SHIELD,
          );
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
      default:
        break;
    }
    void dt;
  }

  private readonly tmpCol = new Color();
  /** Ground height under a world point for effects placed by position (0 on the square board). */
  private up(x: number, z: number): number {
    return this.long ? this.board.relief.at(x, z) : 0;
  }
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
  /* ------------------------------ capture spectacle ------------------------------ */

  /** A fallen piece in flight: knocked away from the blow, tumbling, a dusty landing, then gone. */
  private flight(v: Rec, f: PieceFigure): void {
    const T = v.fall * FLY_SEC;
    const a = Math.min(1, T / FLY_AIR);
    const after = Math.max(0, T - FLY_AIR);
    const H = f.height;
    const d = v.flyD * (easeOut(a) * 0.85 + 0.15 * easeOut(Math.min(1, after / 0.35)));
    const x = v.x + v.flyX * d;
    const z = v.z + v.flyZ * d;
    const gy = this.board.relief.at(x, z);
    const pivot = H * 0.45;
    const lie = v.halfW * 0.7;
    const arc = 4 * a * (1 - a) * H * 0.85;
    const b = Math.min(1, after / 0.26);
    const bounce = after > 0 ? Math.sin(b * Math.PI) * H * 0.14 * (1 - b * 0.5) : 0;
    const cy = gy + lerp(pivot, lie, easeIn(a)) + arc + bounce;
    // one and a quarter turns head over heels, ending on its face; a little roll in the air
    const pitch = easeOut(a) * Math.PI * 2.5 - Math.sin(b * Math.PI) * 0.15;
    const roll = Math.sin(a * Math.PI) * 0.45 * v.flyRoll;
    const sc = T < FLY_FADE ? 1 : 1 - easeIn(Math.min(1, (T - FLY_FADE) / (FLY_SEC - FLY_FADE)));
    const yaw = Math.atan2(v.flyX, v.flyZ);
    f.setVisible(v.fall < 1 && sc > 0.02);
    if (v.fall >= 1) return;
    f.pose({
      move: 0,
      phase: v.phase,
      attack: 0,
      windup: 0,
      flinch: 0.35 * (1 - a),
      time: this.time,
      fall: 0,
      drop: 1,
      hit: Math.max(0, 0.6 - T * 4),
    });
    f.fling(x, cy, z, yaw, pitch, roll, pivot, Math.max(0.02, sc));
    const team = v.team === 'B' ? 'B' : 'A';
    if (!v.landed && a >= 1) {
      // the landing: a puff of dust and grit, a pale ring on the ground, a small jolt
      v.landed = true;
      this.chips.burst(x, gy + 6, z, team === 'B' ? '#6b6a70' : '#c9bb98', 9, 0.55, 3.2);
      this.chips.burst(x, gy + 4, z, '#9c8e72', 6, 0.4, 2.4);
      this.fx.ring(x, gy + 2, z, '#e6dcc4', v.halfW * 0.8, v.halfW * 3.6, 0.45, 0.55);
      this.cam.kick(0.06);
      this.capture('capture-land', v, x, gy + lie, z);
    }
    if (!v.faded && T >= FLY_FADE) {
      v.faded = true;
      this.chips.rise(x, gy + lie, z, team === 'B' ? TEAM.B.mark : TEAM.A.mark, 8, v.halfW, 3);
    }
  }

  /** Tells the page (the HUD's capture tray) where a capture is on screen. */
  private capture(
    type: 'capture-start' | 'capture-land',
    v: Rec,
    x: number,
    y: number,
    z: number,
  ): void {
    const r = this.canvas.getBoundingClientRect();
    const q = this.tmp.set(x, y, z).project(this.cam.camera);
    const detail = {
      id: v.id,
      team: v.team,
      piece: v.pieceId,
      x: r.left + MathUtils.clamp((q.x + 1) / 2, 0, 1) * r.width,
      y: r.top + MathUtils.clamp((1 - q.y) / 2, 0, 1) * r.height,
    };
    this.canvas.dispatchEvent(new CustomEvent(type, { detail }));
  }

  /** The Checkmate beat: the losing King stands where he fell, then topples slowly; a gold burst. */
  private mateKing(v: Rec, f: PieceFigure): void {
    const m = this.mate!;
    const reduced = this.motion?.matches === true;
    const gy = (v.gy = this.board.relief.at(v.x, v.z));
    const p = reduced ? 0 : MathUtils.clamp((m.t - MATE_PUSH) / MATE_TOPPLE, 0, 1);
    // a slow tip that gathers speed (a toppled chess king), a small rebound when it hits
    const k = p * p * p;
    const reb = p >= 1 ? Math.sin(Math.min(1, (m.t - MATE_PUSH - MATE_TOPPLE) / 0.3) * Math.PI) : 0;
    const ang = k * (Math.PI / 2 - 0.06) - reb * 0.08;
    const yaw = Math.atan2(this.camRight.x, this.camRight.z);
    f.setVisible(true);
    f.pose({
      move: 0,
      phase: v.phase,
      attack: 0,
      windup: 0,
      flinch: 0,
      time: this.time,
      fall: 0,
      drop: 1,
      still: true,
    });
    f.fling(v.x, gy + Math.sin(ang) * v.halfW * 0.6, v.z, yaw, ang, 0, 0, 1);
    if (!m.boomed && (p >= 1 || reduced)) {
      m.boomed = true;
      this.canvas.dispatchEvent(new Event('mate-fall'));
      const br = Math.max(22, v.halfW * 0.92);
      const x = v.x + this.camRight.x * f.height * 0.6;
      const z = v.z + this.camRight.z * f.height * 0.6;
      this.gambits.flare(x, gy + 1, z, GOLD, 210, 2.4, 420);
      this.gambits.flare(x, gy + 1, z, '#fff3c8', 90, 1.2, 0);
      if (reduced) return;
      this.fx.ring(x, gy + 2, z, GOLD, br, br * 9, 1.1, 1.3);
      this.fx.ring(x, gy + 2, z, '#fff3c8', br * 0.6, br * 5, 0.7, 1, 0.12);
      this.fx.column(x, gy, z, GOLD, br * 0.8, br * 0.5, f.height * 4, 1.2, 0, 1);
      this.chips.burst(x, gy + 10, z, GOLD, 26, 1.5, 4.5);
      this.chips.burst(x, gy + 10, z, '#fff3c8', 12, 1.1, 3);
      this.cam.kick(0.55);
      this.stopT = HIT_STOP_SEC * 1.4;
    }
  }

  /** True while the Checkmate beat needs every frame drawn (the match has ended). */
  get cinematic(): boolean {
    return this.mate !== null && this.mate.t < MATE_SEC + 0.6;
  }

  /** Rank-up flare: a gold ring and sparks; Ranks 4 and 8 add a tall pillar and a wider burst. */
  private rankFlare(v: Rec, rank: number): void {
    const f = v.fig;
    if (!f || !v.live || this.motion?.matches === true) return;
    const big = rank === 4 || rank === 8;
    const br = Math.max(22, v.halfW * 0.92);
    const gy = v.gy;
    const h = f.height;
    this.fx.ring(v.x, gy + 2, v.z, GOLD, br * 1.1, br * (big ? 5.2 : 3), big ? 0.9 : 0.6, 1);
    this.fx.column(
      v.x,
      gy,
      v.z,
      GOLD,
      br * 0.55,
      br * 0.3,
      h * (big ? 3.4 : 1.7),
      big ? 1 : 0.6,
      0,
      0.85,
    );
    this.chips.rise(v.x, gy + h * 0.25, v.z, GOLD, big ? 14 : 6, br * 0.8, big ? 3.4 : 2.6);
    if (!big) return;
    this.gambits.flare(v.x, gy + 1, v.z, GOLD, rank === 8 ? 120 : 90, 1.3, 260);
    this.fx.ring(v.x, gy + 2, v.z, '#fff3c8', br, br * 3.6, 0.6, 1, 0.18);
    if (rank === 8) this.fx.ring(v.x, gy + 2, v.z, GOLD, br * 1.4, br * 7, 1.2, 0.8, 0.35);
    this.cam.kick(rank === 8 ? 0.16 : 0.1);
  }

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
    const gy = this.up(from.x, from.z);
    this.gambits.flare(from.x, 1 + gy, from.z, color, 70, 1.1, 160);
    this.gambits.flare(from.x, 1 + gy, from.z, '#ffffff', 40, 0.6, 0);
    this.chips.burst(from.x, 60 + gy, from.z, color, 10, 1.2, 5);
    if (this.motion?.matches === true) return;
    // the Rank 4 transformation: the generic piece shatters in its team colour inside a pillar of
    // the new style's light, and the new figure swells out of it
    const h = v.fig?.height ?? 80;
    const br = Math.max(22, from.halfW * 0.92);
    const team = from.team === 'B' ? 'B' : 'A';
    this.chips.burst(from.x, gy + h * 0.5, from.z, TEAM[team].body, 18, 1.05, 5.5);
    this.chips.burst(from.x, gy + h * 0.8, from.z, TEAM[team].rim, 8, 0.9, 4);
    this.fx.column(from.x, gy, from.z, color, br * 1.1, br * 0.7, h * 4.5, 1.3, 0, 1);
    this.fx.column(from.x, gy, from.z, '#ffffff', br * 0.5, br * 0.3, h * 3, 0.7, 0, 0.8);
    this.fx.ring(from.x, gy + 2, from.z, color, br, br * 6, 1, 1.2);
    this.cam.kick(0.12);
  }

  private spawnFlare(u: SnapUnit): void {
    const x = u.x - this.hx;
    const z = u.y - this.hz;
    this.gambits.flare(
      x,
      1 + this.up(x, z),
      z,
      u.team === 'B' ? TEAM.B.mark : TEAM.A.mark,
      40,
      1,
      110,
    );
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

  /* ------------------------------ hits ------------------------------ */

  private queueHit(
    a: Rec,
    b: Rec,
    srcTeam: string,
    delay: number,
    frac: number,
    lethal: boolean,
    melee: boolean,
  ): void {
    if (this.hits.length >= 32) return;
    const h = this.hitPool.pop() ?? {
      vid: 0,
      aid: 0,
      t: 0,
      dx: 0,
      dz: 0,
      strength: 1,
      big: false,
      kill: false,
      melee: false,
      team: 'N' as const,
    };
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    h.vid = b.id;
    h.aid = a.id;
    h.t = delay;
    h.dx = dx / l;
    h.dz = dz / l;
    h.big = lethal || frac >= 0.12;
    h.kill = lethal;
    h.strength = MathUtils.clamp(0.6 + frac * 5, 0.6, h.big ? 1.5 : 1);
    h.melee = melee;
    h.team = srcTeam === 'A' ? 'A' : srcTeam === 'B' ? 'B' : 'N';
    this.hits.push(h);
  }

  /** Applies the blows that are due: outline flash in the attacker's colour, squash, ring, slash. */
  private flushHits(dt: number): void {
    const reduced = this.motion?.matches === true;
    const px = this.cam.pxNow();
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      h.t -= dt;
      if (h.t > 0) continue;
      this.hits.splice(i, 1);
      this.hitPool.push(h);
      const v = this.recs.get(h.vid);
      if (!v?.fig || !v.live || v.warpPhase !== 0) continue;
      const a = this.recs.get(h.aid);
      const f = v.fig;
      const br = Math.max(22, v.halfW * 0.92);
      const col = this.haloCol[h.team];
      v.hit = Math.max(v.hit, h.strength);
      v.hitX = h.dx;
      v.hitZ = h.dz;
      f.setHitColor(this.col.copy(col).lerp(WHITE, 0.25));
      if (reduced) continue;
      // a ring on the floor under the victim; a stronger one, a column and a bigger ring for big hits and kills
      const y = v.gy + 2;
      if (h.kill) {
        this.fx.ring(v.x, y, v.z, col, br * 1.6, br * 4.4, 0.5, 1.3);
        this.fx.column(v.x, v.gy, v.z, col, br * 0.7, br * 0.5, f.height * 1.7, 0.42, 0, 0.9);
      } else if (h.big) {
        this.fx.ring(v.x, y, v.z, col, br * 1.5, br * 3.4, 0.4, 1.2);
        this.fx.column(v.x, v.gy, v.z, col, br * 0.55, br * 0.4, f.height * 1.3, 0.3, 0, 0.7);
      } else this.fx.ring(v.x, y, v.z, col, br * 1.4, br * 2.6, 0.3, 0.9);
      if (h.melee && a?.live) {
        this.from.set(a.x, this.chest(a.id, a.kind) + a.gy, a.z);
        this.to.set(v.x, f.height * 0.55 + v.gy, v.z);
        const rim = this.rimCol[h.team];
        this.fx.slash(
          this.from,
          this.to,
          this.col.copy(rim).lerp(WHITE, 0.35),
          MathUtils.clamp(br * 1.7, 26, 80),
          (h.aid + h.vid) % 2 === 0 ? 0.5 : -0.5,
        );
        this.fx.tracer(this.from, this.to, rim, 3.2 * px, 0.2, 1.2);
      }
    }
  }

  /* ------------------------------ teleport ------------------------------ */

  /** Departure: a light column shoots up from where the piece stood, a ring flares, facets rise. */
  private startWarp(v: Rec): void {
    v.warpPhase = 1;
    v.warpT = 0;
    v.wx = v.sx;
    v.wz = v.sz;
    v.recallT = -1;
    v.hit = 0;
    const f = v.fig!;
    const t = v.team === 'B' ? 'B' : 'A';
    const br = Math.max(22, v.halfW * 0.92);
    const gy = v.gy;
    const halo = this.haloCol[t];
    if (this.motion?.matches === true) {
      this.fx.ring(v.x, gy + 2, v.z, halo, br * 1.1, br * 1.9, 0.5, 0.7);
      return;
    }
    this.fx.column(v.x, gy, v.z, this.hotCol[t], br * 1.1, br * 0.5, f.height * 3.8, 0.85, 0, 1.4);
    this.fx.ring(v.x, gy + 2, v.z, this.hotCol[t], br * 1.1, br * 3.4, 0.7, 1.4);
    this.fx.ring(v.x, gy + 2, v.z, halo, br * 0.8, br * 2.4, 0.55, 0.9, 0.12);
    this.chips.rise(v.x, gy + f.height * 0.1, v.z, this.rimCol[t], 8, br * 0.8, 4.5);
    this.chips.rise(v.x, gy + f.height * 0.3, v.z, TEAM[t].body, 4, br * 0.6, 4);
  }

  /** Arrival: facets fly in and assemble, a column of light collapses, rings pulse on the dais. */
  private arrive(v: Rec, x: number, z: number): void {
    const f = v.fig!;
    const t = v.team === 'B' ? 'B' : 'A';
    const br = Math.max(22, v.halfW * 0.92);
    const gy = this.board.relief.at(x, z);
    const halo = this.haloCol[t];
    if (this.motion?.matches === true) {
      this.fx.ring(x, gy + 2, z, halo, br * 1.0, br * 2.0, 0.5, 0.7);
      return;
    }
    this.fx.column(x, gy, z, this.hotCol[t], br * 0.6, br * 1.6, f.height * 3.2, 0.7, 1, 1.4);
    // saturated team colour: pale light would vanish on the pale dais
    this.fx.ring(x, gy + 2, z, halo, br * 1.0, br * 4.4, 0.8, 2.2);
    this.fx.ring(x, gy + 2, z, halo, br * 0.8, br * 3.0, 0.6, 1.8, 0.18);
    this.chips.gather(x, gy + f.height * 0.4, z, this.rimCol[t], 9, br * 3.2, 4.5);
    this.chips.gather(x, gy + f.height * 0.3, z, TEAM[t].body, 4, br * 2.4, 4);
  }

  /** The channel was cut short: the closing ring flashes and dies. */
  private fizzle(v: Rec): void {
    const t = v.team === 'B' ? 'B' : 'A';
    const br = Math.max(22, v.halfW * 0.92);
    this.fx.ring(v.x, v.gy + 2, v.z, this.haloCol[t], br * 1.6, br * 0.8, 0.25, 0.5);
  }

  /** While a piece recalls: a ring closing in on its base, a light column that grows, a scan ring and motes. */
  private channel(
    v: Rec,
    f: PieceFigure,
    br: number,
    team: 'A' | 'B',
    dt: number,
    reduced: boolean,
  ): void {
    const sec = this.content.tuning.recall.baseSec;
    const p = MathUtils.clamp(v.recallT / Math.max(0.5, sec), 0, 1);
    const pulse = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(this.time * 9);
    const halo = this.hotCol[team];
    const rim = this.rimCol[team];
    this.fx.ringNow(v.x, v.gy + 2, v.z, halo, br * lerp(2.7, 1.3, p), 0.7 + 0.5 * pulse);
    this.fx.columnNow(
      v.x,
      v.gy,
      v.z,
      halo,
      br * 0.95,
      f.height * lerp(1.0, 2.6, p),
      0.35 + 0.6 * p,
      this.time * 1.5,
    );
    if (reduced) return;
    const c = (this.time * 1.6 + v.phase0) % 1;
    this.fx.ringNow(v.x, v.gy + 2 + c * f.height * 1.1, v.z, rim, br * 1.05, 0.75 * (1 - c));
    v.mote += dt;
    if (v.mote > 0.3) {
      v.mote = 0;
      this.chips.rise(v.x, v.gy + f.height * 0.15, v.z, rim, 1, br * 0.8, 3.2);
    }
  }

  /** A faint line on the floor from a piece to the piece it is fighting, in its team colour. */
  private thread(v: Rec, targetId: number, br: number, team: 'A' | 'B', px: number): void {
    const o = this.recs.get(targetId);
    if (!o?.fig || !o.live || o === v) return;
    const dx = o.x - v.x;
    const dz = o.z - v.z;
    const d = Math.hypot(dx, dz);
    if (d < br * 2.6) return;
    const ux = dx / d;
    const uz = dz / d;
    // the two sides of a duel sit side by side, so both colours show
    const side = (team === 'A' ? 1 : -1) * 1.7 * px;
    const ob = Math.max(22, o.halfW * 0.92);
    this.fx.threadNow(
      v.x + ux * br * 1.1 - uz * side,
      v.z + uz * br * 1.1 + ux * side,
      o.x - ux * ob * 1.1 - uz * side,
      o.z - uz * ob * 1.1 + ux * side,
      Math.max(v.gy, o.gy) + 6,
      this.haloCol[team],
      3 * px,
      0.5,
    );
  }

  private handleEvents(events: NewEvents): void {
    for (const e of events) this.handleEvent(e);
  }

  private handleEvent(e: GameEvent): void {
    const hx = this.hx;
    const hz = this.hz;
    switch (e.type) {
      case 'damage': {
        const p = e.payload;
        if (p.srcKind === 'none' || p.amount <= 0) break;
        const a = this.recs.get(p.src);
        const b = this.recs.get(p.tgt);
        if (!a || !b) break;
        if (p.srcKind === 'minion' && p.tgtKind === 'minion') break;
        const structure = p.srcKind === 'tower' || p.srcKind === 'guardian';
        // damage-over-time ticks arrive every tick: they get no effect of their own
        const frac = p.amount / Math.max(1, this.byId.get(p.tgt)?.maxHp ?? 1000);
        if (p.origin !== 'attack' && !structure && frac < 0.02) break;
        this.from.set(a.x, this.chest(p.src, p.srcKind) + a.gy, a.z);
        this.to.set(b.x, this.chest(p.tgt, p.tgtKind) + b.gy, b.z);
        const color = structure
          ? '#f0b44c'
          : p.srcTeam === 'B'
            ? TEAM.B.rim
            : p.srcTeam === 'A'
              ? TEAM.A.rim
              : '#d88a52';
        const dist = this.from.distanceTo(this.to);
        const au = this.byId.get(p.src) as ChessUnit | undefined;
        const ranged =
          structure ||
          au?.attackKind === 'ranged' ||
          (au?.attackKind == null && (au?.defId === 'ranged' || dist >= 70));
        if (!ranged)
          this.chips.burst(this.to.x, this.to.y, this.to.z, color, p.lethal ? 6 : 2, 0.7, 3);
        else this.bolts.fire(this.from, this.to, color, p.lethal || structure);
        if (b.fig && !structure) {
          // the victim reacts when the blow lands: at the swing's snap, or when the bolt arrives
          const delay = ranged ? Math.min(0.32, 0.08 + dist / 2400) : 0.06;
          this.queueHit(a, b, p.srcTeam, delay, frac, p.lethal, !ranged);
        }
        break;
      }
      case 'death': {
        const p = e.payload;
        const x = p.x - hx;
        const z = p.y - hz;
        if (p.kind === 'hero') {
          const v = this.recs.get(p.id);
          const color = v?.style
            ? styleEmblem(v.style).color
            : p.team === 'B'
              ? TEAM.B.body
              : TEAM.A.body;
          this.chips.burst(
            v?.x ?? x,
            70 + this.up(v?.x ?? x, v?.z ?? z),
            v?.z ?? z,
            color,
            12,
            1.3,
            6,
          );
          this.gambits.flare(
            v?.x ?? x,
            1 + this.up(v?.x ?? x, v?.z ?? z),
            v?.z ?? z,
            p.team === 'B' ? TEAM.B.mark : TEAM.A.mark,
            60,
            0.9,
            0,
          );
          this.cam.kick(0.12);
          if (v?.fig && this.motion?.matches !== true) {
            // knocked flying from where the sim says it fell (the last drawn spot is stale after
            // a long frame) away from the killer's current spot, or backwards with no killer
            v.x = x;
            v.z = z;
            v.gy = this.board.relief.at(x, z);
            const k = this.byId.get(p.killer);
            let dx = k ? x - (k.x - hx) : 0;
            let dz = k ? z - (k.y - hz) : 0;
            let l = Math.hypot(dx, dz);
            if (l < 1) {
              dx = -Math.sin(v.yaw);
              dz = -Math.cos(v.yaw);
              l = 1;
            }
            v.flyX = dx / l;
            v.flyZ = dz / l;
            v.flyD = v.fig.height * (1.05 + ((p.id * 37) % 10) / 30);
            v.flyRoll = p.id % 2 === 0 ? 1 : -1;
            v.landed = false;
            v.faded = false;
            this.stopT = HIT_STOP_SEC;
            this.fx.ring(v.x, v.gy + 2, v.z, '#ffffff', v.halfW, v.halfW * 4, 0.25, 1);
            this.capture('capture-start', v, v.x, v.gy + v.fig.height * 0.5, v.z);
          }
        } else if (p.kind === 'minion') {
          this.chips.burst(
            x,
            24 + this.up(x, z),
            z,
            p.team === 'B' ? TEAM.B.body : p.team === 'A' ? TEAM.A.body : CLAY.body,
            5,
            0.8,
            4,
          );
        } else if (p.kind === 'camp') {
          this.chips.burst(x, 24 + this.up(x, z), z, CLAY.body, 7, 0.9, 5);
        }
        break;
      }
      case 'rankUp': {
        const v = this.recs.get(e.payload.id);
        if (v && this.drawn > 0) this.rankFlare(v, e.payload.rank);
        break;
      }
      case 'structureDown': {
        const p = e.payload;
        const x = p.x - hx;
        const z = p.y - hz;
        const guardian = p.kind === 'guardian';
        const stone = p.team === 'B' ? '#3a3b42' : '#d9cdb0';
        this.chips.burst(
          x,
          80 + this.up(x, z),
          z,
          stone,
          guardian ? 40 : 24,
          guardian ? 2.2 : 1.6,
          guardian ? 14 : 10,
        );
        this.chips.burst(
          x,
          120 + this.up(x, z),
          z,
          p.team === 'B' ? '#56637e' : '#b58d47',
          10,
          1.6,
          10,
        );
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
          this.gambits.zone(
            x - this.hx,
            1 + this.up(x - this.hx, y - this.hz),
            y - this.hz,
            '#8ff0b4',
            64,
            6,
          );
          break;
        }
        if (/fork/i.test(card) && tv) {
          for (const v of this.recs.values()) {
            if (v.pieceId !== 'knight' || v.team !== team || !v.live) continue;
            this.from.set(v.x, 40 + v.gy, v.z);
            this.to.set(tv.x, 50 + tv.gy, tv.z);
            this.gambits.arc(this.from, this.to, GOLD, 0.55);
            break;
          }
          this.gambits.flare(tv.x, 1 + this.up(tv.x, tv.z), tv.z, GOLD, 50, 0.9, 120);
          break;
        }
        if (/^pin$/i.test(card) && tv) {
          // a brass ring on the pinned piece and a thin line of light to the one behind it
          const behind = num('behindId');
          const bv = behind !== undefined ? this.recs.get(behind) : undefined;
          if (bv) {
            this.from.set(tv.x, 30 + tv.gy, tv.z);
            this.to.set(bv.x, 30 + bv.gy, bv.z);
            this.gambits.arc(this.from, this.to, PIN_RIM, 0.7);
          }
          this.gambits.flare(tv.x, 1 + this.up(tv.x, tv.z), tv.z, PIN_RIM, 52, 1.2, 140);
          break;
        }
        if (/fortify/i.test(card) && tv) {
          this.gambits.flare(tv.x, 1 + this.up(tv.x, tv.z), tv.z, STONE, 90, 1.6, 200);
          break;
        }
        if (/desperado/i.test(card) && tv) {
          this.gambits.flare(tv.x, 1 + this.up(tv.x, tv.z), tv.z, DESPERATE_RIM, 56, 1.1, 160);
          break;
        }
        if (tv) {
          this.gambits.flare(tv.x, 1 + this.up(tv.x, tv.z), tv.z, '#ff6a5a', 46, 0.9, 120);
          break;
        }
        if (x !== undefined && y !== undefined) {
          this.gambits.flare(
            x - this.hx,
            1 + this.up(x - this.hx, y - this.hz),
            y - this.hz,
            col,
            70,
            1.1,
            120,
          );
          break;
        }
        for (const v of this.recs.values()) {
          if (!v.fig || !v.live || v.team !== team) continue;
          const u = this.byId.get(v.id) as ChessUnit | undefined;
          if (lane && u?.lane && u.lane !== lane) continue;
          this.gambits.flare(v.x, 1 + this.up(v.x, v.z), v.z, col, 44, 0.8);
        }
        break;
      }
      case 'check':
        for (const v of this.recs.values()) {
          if (v.pieceId !== 'king' || v.team !== team) continue;
          this.gambits.crown(v.id);
          this.gambits.flare(v.x, 1 + this.up(v.x, v.z), v.z, '#ffe08a', 60, 1.2, 160);
        }
        break;
      case 'throneDown':
        for (const v of this.recs.values()) {
          if (v.kind !== 'guardian' || v.team !== team) continue;
          this.gambits.flare(v.x, 1 + this.up(v.x, v.z), v.z, '#ff6a5a', 160, 1.6, 300);
        }
        this.cam.kick(1);
        break;
      case 'checkmate': {
        const winner = p.winner === 'B' ? 'B' : 'A';
        for (const v of this.recs.values())
          if (v.pieceId === 'king' && v.team !== winner && v.fig)
            this.mate = { id: v.id, t: 0, boomed: false, done: false };
        if (this.mate) {
          const v = this.recs.get(this.mate.id)!;
          // the King stands where the sim has him (the last drawn spot may be stale)
          const u = this.byId.get(v.id);
          if (u) {
            v.x = u.x - this.hx;
            v.z = u.y - this.hz;
            v.gy = this.board.relief.at(v.x, v.z);
          }
          // a gold shaft comes down on the King as the camera pushes in
          this.fx.column(v.x, v.gy, v.z, GOLD, 60, 30, 900, 1.4, 1, 0.9);
          this.gambits.crown(v.id, MATE_SEC);
        }
        for (const v of this.recs.values()) {
          if (v.team === winner || !v.live) continue;
          if (v.pieceId === 'king') this.gambits.crown(v.id, 3);
          if (v.pieceId === 'king' || v.kind === 'guardian')
            this.gambits.flare(v.x, 1 + this.up(v.x, v.z), v.z, GOLD, 190, 2.2, 360);
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
          e.x - this.hx,
          1.5 + this.board.relief.atSim(e.x, e.y),
          e.y - this.hz,
        );
        this.rings.set(e.id, ring);
        this.scene.add(ring.group);
      }
      ring.update(this.time, e.phase === 'warning', e.progress, e.team);
      const t = e.telegraph;
      ring.setTelegraph(
        t ? t.x - this.hx : 0,
        0,
        t ? t.y - this.hz : 0,
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
          const x = wx + this.hx;
          const y = wz + this.hz;
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
    this.fx.clear();
    this.hitPool.push(...this.hits);
    this.hits.length = 0;
    this.gambits.clear();
    this.zones.clear();
    this.drawn = 0;
    this.mate = null;
    this.stopT = 0;
  }

  dispose(): void {
    this.setInk(false);
    this.laneCam.dispose();
    this.controls.dispose();
    document.documentElement.style.removeProperty('--cam-yaw');
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    this.reset();
    this.board.dispose();
    this.life?.dispose();
    this.lib.dispose();
    for (const c of Object.values(this.crowds)) c.dispose();
    this.blobs.dispose();
    this.halos.dispose();
    this.chips.crowd.dispose();
    this.bolts.crowd.dispose();
    this.fx.dispose();
    this.tags.dispose();
    this.facet.dispose();
    this.kit.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
