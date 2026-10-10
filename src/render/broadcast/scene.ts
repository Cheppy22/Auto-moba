import {
  Color,
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  MathUtils,
  Object3D,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { Content, GameEvent, Snapshot, SnapUnit, UnitKind } from '../../sim';
import { PALETTE, teamColor } from '../theme';
import { Arena } from './arena';
import { CameraRig } from './camera';
import { BadgeBatch, BarBatch, EventRing, StreakPool } from './fx';
import { GambitFx } from './gambit';
import { hash, Kit, STONE, STONE_DARK } from './kit';
import {
  BastionModel,
  CampModel,
  JabberwockModel,
  KeeperModel,
  MINION_SCALE,
  MinionKit,
  ObeliskModel,
  PAWN_SCALE,
  ThroneModel,
} from './models';
import { isPieceId, PIECE_IDS, PIECE_SCALE, PieceModel, styleAccent, type PieceId } from './pieces';
import { VisualPhysics } from './physics';
import type { BroadcastFrame, NewEvents } from './types';

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const GOLD_BOLT = '#f0b44c';
const ONI_RED = '#9c2a2e';
const SHIELD = '#a9d0e0';
/** Below this health fraction a piece's bar turns red. */
const LOW_HP = 0.3;
const LOW_HP_RED = '#ff5a48';
const SUN_OFFSET = new Vector3(-380, 760, 520);
/** The dark behind the board: warm ebony rather than violet-black. */
const VOID = '#16120e';
/** Seconds a Sanctuary zone ring lasts. */
const SANCTUARY_SEC = 6;
/** Taps within this many CSS pixels of a unit pick it. */
const PICK_PX = 36;
const CHEST: Partial<Record<UnitKind, number>> = {
  hero: 16 * PIECE_SCALE,
  minion: 7,
  tower: 24,
  guardian: 50,
  camp: 8,
};

/** Fields the chess sim adds to `SnapUnit`; optional here so the view also runs on older snapshots. */
interface ChessFields {
  piece?: string | null;
  style?: string | null;
  rank?: number;
  forkPending?: boolean;
  pawn?: boolean;
  lane?: string | null;
}
type ChessUnit = SnapUnit & ChessFields;

/** Which chess piece a hero unit is: its `piece`, else its `defId`, else a stable guess. */
function pieceOf(u: ChessUnit): PieceId {
  if (isPieceId(u.piece)) return u.piece;
  if (isPieceId(u.defId)) return u.defId;
  return PIECE_IDS[hash(u.defId) % PIECE_IDS.length];
}

function turn(from: number, to: number, k: number): number {
  const d = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + d * k;
}

/** Everything the view remembers about one sim unit between frames. */
class UnitView {
  x = 0;
  z = 0;
  yaw = 0;
  move = 0;
  phase = 0;
  hp = -1;
  lunge = 0;
  flinch = 0;
  stamp = 0;
  /** Ground height under the unit this frame. */
  gy = 0;
  placed = false;
  /** Picking: set every frame the unit is drawn. */
  live = false;
  lift = 10;
  isPiece = false;
  lane: string | null = null;
  pieceId: PieceId | null = null;
  readonly objects: Object3D[] = [];
  hero?: PieceModel;
  tower?: BastionModel;
  king?: ThroneModel;
  camp?: CampModel;
  jabber?: JabberwockModel;
  obelisk?: ObeliskModel;
  keeper?: KeeperModel;

  constructor(
    readonly id: number,
    readonly kind: UnitKind,
    readonly defId: string,
    readonly team: string,
    readonly style: string | null,
    readonly elite: boolean,
  ) {
    this.phase = (hash(`${id}`) % 628) / 100;
  }
}

function webgl(canvas: HTMLCanvasElement): WebGLRenderer {
  try {
    return new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
  } catch {
    throw new Error('WebGL is not available');
  }
}

/** Dev-only hooks: fake chess fields on snapshots before the sim provides them. */
export interface BroadcastDebug {
  /** Called for every unit each frame, before drawing. */
  patch?: (u: SnapUnit & ChessFields, snap: Snapshot) => void;
  /** Called with each snapshot's units array; may push extra units. */
  extra?: (units: SnapUnit[], snap: Snapshot) => void;
}

/** The three.js broadcast view. Render-only: reads snapshots and events, never touches the sim. */
export class BroadcastView {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly kit = new Kit();
  private readonly arena: Arena;
  private readonly rig: CameraRig;
  private readonly minions: MinionKit;
  private readonly physics: VisualPhysics;
  private readonly bars: BarBatch;
  private readonly badges: BadgeBatch;
  private readonly gambits: GambitFx;
  private readonly streaks: StreakPool;
  private readonly unitGroup = new Group();
  private readonly views = new Map<number, UnitView>();
  private readonly byId = new Map<number, SnapUnit>();
  private readonly stale: UnitView[] = [];
  private readonly liveRings = new Set<string>();
  private readonly rings = new Map<string, EventRing>();
  private readonly sun: DirectionalLight;
  private readonly half: number;
  private readonly shadows: boolean;
  /** Map size over the 1000 the art was tuned on. */
  private readonly mapK: number;
  private time = 0;
  /** Dev tool: speeds up the view's own animation clock (slow software renderers). */
  private devTimeScale = 1;
  private stamp = 0;
  private lastTick = -1;
  private drawn = 0;
  private zonesFromSnap = false;
  private cssW = 0;
  private cssH = 0;
  private barScale = 1;
  private badgeSize = 12;
  private emblemSize = 14;
  private pieceBarW = 26;
  private pieceBarH = 3;
  private readonly camRight = new Vector3();
  /** Far shots enlarge heroes and minions a little so phones can still read them. */
  private boost = 1;
  private readonly debug: BroadcastDebug = {};
  private readonly tmp = new Vector3();
  private readonly ray = new Vector3();
  private readonly org = new Vector3();
  private readonly from = new Vector3();
  private readonly to = new Vector3();
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
    this.mapK = content.map.size / 1000;
    this.shadows = !coarse && Math.min(window.innerWidth, window.innerHeight) >= 640;
    const r = this.renderer;
    r.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    r.setClearColor(VOID);
    r.shadowMap.enabled = this.shadows;
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);

    this.scene.background = new Color(VOID);
    this.scene.fog = new FogExp2(VOID, 0.00013);
    // late-afternoon garden light: a warm sun, a soft cream sky and a faint cool fill
    const sky = new HemisphereLight('#e6dcc2', '#42382e', 0.85);
    const sun = new DirectionalLight('#ffe2b8', 2.55);
    sun.position.copy(SUN_OFFSET);
    sun.castShadow = this.shadows;
    sun.shadow.mapSize.set(2048, 2048);
    const cam = sun.shadow.camera;
    const wide = 700 * (content.map.size / 1000);
    cam.left = -wide;
    cam.right = wide;
    cam.top = wide;
    cam.bottom = -wide;
    cam.near = 200;
    cam.far = 1800 * (content.map.size / 1000);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.7;
    const rim = new DirectionalLight('#9aa8c4', 0.45);
    rim.position.set(520, 300, -600);
    this.sun = sun;
    this.scene.add(sky, sun, sun.target, rim);

    this.arena = new Arena(this.kit, content, this.shadows);
    this.rig = new CameraRig(
      canvas,
      content.map.size * 0.6,
      (x, z) => this.arena.field.surfaceW(x, z),
      this.arena.field.outline(),
    );
    this.minions = new MinionKit(this.kit);
    this.physics = new VisualPhysics(this.kit);
    this.physics.ground = (x, z) => this.arena.field.heightW(x, z);
    this.bars = new BarBatch(this.kit);
    this.badges = new BadgeBatch(this.kit);
    this.gambits = new GambitFx(this.kit);
    this.streaks = new StreakPool(this.kit);
    this.unitGroup.add(this.minions.group);
    this.scene.add(
      this.arena.group,
      this.unitGroup,
      this.physics.group,
      this.streaks.group,
      this.gambits.group,
      this.bars.group,
      this.badges.group,
    );
    this.resize();
    if (import.meta.env.DEV) {
      const w = window as unknown as {
        __bvStats?: () => ReturnType<BroadcastView['stats']>;
        __bvSettle?: () => void;
        __bvTime?: (k: number) => void;
        __bvCam?: () => number[];
        __bvWide?: (on: boolean) => void;
        __bvPin?: (
          p: { x: number; z: number; dist: number; elev: number; azim: number } | null,
        ) => void;
        __bvDebug?: BroadcastDebug;
      };
      w.__bvStats = () => this.stats();
      w.__bvSettle = () => this.rig.settle();
      w.__bvCam = () => {
        const c = this.rig.camera.position;
        const f = this.rig.focus;
        return [c.x, c.y, c.z, f.x, f.y, f.z];
      };
      w.__bvWide = (on) => {
        this.rig.forceWide = on;
      };
      w.__bvTime = (k) => {
        this.devTimeScale = k;
      };
      w.__bvPin = (p) => {
        this.rig.pinned = p;
        this.rig.settle(p ?? undefined);
      };
      w.__bvDebug = this.debug;
    }
  }

  /** Draw calls, triangles and GPU objects in the last frame (for profiling). */
  stats(): { calls: number; triangles: number; geometries: number; textures: number } {
    const i = this.renderer.info;
    return {
      calls: i.render.calls,
      triangles: i.render.triangles,
      geometries: i.memory.geometries,
      textures: i.memory.textures,
    };
  }

  resize(): void {
    const w = Math.max(2, this.canvas.clientWidth || 800);
    const h = Math.max(2, this.canvas.clientHeight || 600);
    this.cssW = this.canvas.clientWidth;
    this.cssH = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.rig.setAspect(w / h);
  }

  draw(snap: Snapshot, events: NewEvents, frame: BroadcastFrame): void {
    if (this.lost) return;
    if (this.canvas.clientWidth !== this.cssW || this.canvas.clientHeight !== this.cssH)
      this.resize();
    const dt = MathUtils.clamp(frame.dtMs, 0, 100) / 1000;
    this.time += dt * this.devTimeScale;
    if (snap.tick < this.lastTick) this.reset();
    this.lastTick = snap.tick;
    this.stamp++;

    if (import.meta.env.DEV) {
      this.debug.extra?.(snap.units, snap);
      if (this.debug.patch) for (const u of snap.units) this.debug.patch(u, snap);
    }
    this.byId.clear();
    for (const u of snap.units) this.byId.set(u.id, u);
    this.arena.sync(snap, this.time);

    const follow = this.followPoint(frame);
    this.rig.update(frame, this.half, follow);
    const camera = this.rig.camera;
    const dist = this.rig.distance;
    this.kit.inkWidth.value = MathUtils.clamp(dist * 0.0032, 0.4, 2.6);
    this.barScale = MathUtils.clamp(dist / 700, 0.8, 2.4);
    // piece bars and badges are sized in CSS pixels: a little smaller on far shots, never illegible
    const fov = (camera.fov * Math.PI) / 180;
    const unitPx = (2 * dist * Math.tan(fov / 2)) / Math.max(1, this.cssH);
    const far = MathUtils.clamp((dist - 600) / 1400, 0, 1);
    this.badgeSize = lerp(16, 13, far) * unitPx;
    this.emblemSize = lerp(21, 17, far) * unitPx;
    this.pieceBarW = lerp(30, 22, far) * unitPx;
    this.pieceBarH = lerp(3, 2.4, far) * unitPx;
    this.camRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    this.boost = MathUtils.clamp(dist / 1700, 1, 1.65);
    this.aimSun();

    this.handleEvents(events);
    this.bars.begin(camera);
    this.badges.begin(camera, this.cssW, this.cssH, unitPx);
    this.minions.begin();
    this.syncUnits(snap, frame.alpha, dt);
    this.minions.end();
    this.bars.end();
    this.badges.end(this.time);
    this.syncRings(snap);
    this.zonesFromSnap = Array.isArray(snap.zones);
    if (snap.zones) this.gambits.setZones(snap.zones, this.half, this.zoneGround, this.time);
    this.gambits.update(dt, this.time, this.unitPos);
    this.streaks.update(dt);
    this.physics.update(frame.dtMs);
    this.arena.update(this.time, camera.position);
    this.renderer.render(this.scene, camera);
    this.drawn++;
  }

  private readonly zoneGround = (x: number, z: number): number => this.arena.field.surfaceW(x, z);

  /** Where a live unit stands in scene space (for effects that follow a unit). */
  private readonly unitPos = (id: number, out: Vector3): boolean => {
    const v = this.views.get(id);
    if (!v?.live) return false;
    out.set(v.x, v.gy, v.z);
    return true;
  };

  /**
   * Where a sim point (plus `lift` units above the ground) lands on the canvas, in CSS pixels
   * from the canvas's top-left. `visible` is false behind the camera or off screen.
   */
  project(x: number, y: number, lift = 0): { x: number; y: number; visible: boolean } {
    const ground = this.arena.field.heightAt(x, y);
    const v = this.tmp.set(x - this.half, ground + lift, y - this.half).project(this.rig.camera);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const sx = ((v.x + 1) / 2) * w;
    const sy = ((1 - v.y) / 2) * h;
    const visible = v.z > -1 && v.z < 1 && sx >= 0 && sy >= 0 && sx <= w && sy <= h;
    return { x: sx, y: sy, visible };
  }

  /**
   * The sim point under a screen position (CSS pixels from the canvas's top-left), found by
   * marching the view ray down onto the terrain. Null when the ray misses the island.
   */
  pickGround(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width || this.canvas.clientWidth;
    const h = rect.height || this.canvas.clientHeight;
    if (w <= 0 || h <= 0) return null;
    const nx = ((clientX - rect.left) / w) * 2 - 1;
    const ny = 1 - ((clientY - rect.top) / h) * 2;
    if (nx < -1 || nx > 1 || ny < -1 || ny > 1) return null;
    const cam = this.rig.camera;
    cam.updateMatrixWorld();
    const o = this.org.setFromMatrixPosition(cam.matrixWorld);
    const d = this.ray.set(nx, ny, 0.5).unproject(cam).sub(o).normalize();
    if (d.y > -1e-4) return null;
    const field = this.arena.field;
    const maxT = Math.min(9000, (o.y + 140) / -d.y);
    const step = 6;
    let prevT = 0;
    let t = 0;
    let found = -1;
    for (; t <= maxT; t += step) {
      const px = o.x + d.x * t;
      const pz = o.z + d.z * t;
      if (o.y + d.y * t <= field.surfaceW(px, pz)) {
        found = t;
        break;
      }
      prevT = t;
    }
    if (found < 0) return null;
    let lo = prevT;
    let hi = found;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      const px = o.x + d.x * mid;
      const pz = o.z + d.z * mid;
      if (o.y + d.y * mid <= field.surfaceW(px, pz)) hi = mid;
      else lo = mid;
    }
    const x = o.x + d.x * hi;
    const z = o.z + d.z * hi;
    if (Math.hypot(x, z) > field.ws.islandR) return null;
    return { x: x + this.half, y: z + this.half };
  }

  /**
   * The id of the unit nearest a screen position, if its projected position is within about 36
   * CSS pixels. Pieces win over pawns, structures and neutrals whenever one is in range.
   */
  pickUnit(clientX: number, clientY: number): number | null {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width || this.canvas.clientWidth;
    const h = rect.height || this.canvas.clientHeight;
    if (w <= 0 || h <= 0) return null;
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const cam = this.rig.camera;
    cam.updateMatrixWorld();
    let bestPiece = -1;
    let bestPieceD = PICK_PX * PICK_PX;
    let best = -1;
    let bestD = PICK_PX * PICK_PX;
    for (const v of this.views.values()) {
      if (!v.live) continue;
      const q = this.tmp.set(v.x, v.gy + v.lift, v.z).project(cam);
      if (q.z < -1 || q.z > 1) continue;
      const dx = ((q.x + 1) / 2) * w - px;
      const dy = ((1 - q.y) / 2) * h - py;
      const d2 = dx * dx + dy * dy;
      if (v.isPiece && d2 < bestPieceD) {
        bestPieceD = d2;
        bestPiece = v.id;
      } else if (d2 < bestD) {
        bestD = d2;
        best = v.id;
      }
    }
    if (bestPiece >= 0) return bestPiece;
    return best >= 0 ? best : null;
  }

  /** Keeps the shadow frustum on whatever the camera is looking at. */
  private aimSun(): void {
    const f = this.rig.focus;
    const snapTo = (v: number): number => Math.round(v / 8) * 8;
    this.sun.position.set(snapTo(f.x) + SUN_OFFSET.x, SUN_OFFSET.y, snapTo(f.z) + SUN_OFFSET.z);
    this.sun.target.position.set(snapTo(f.x), 0, snapTo(f.z));
    if (!this.shadows) return;
    const reach = MathUtils.clamp(this.rig.distance * 0.75, 260, 720 * this.mapK);
    const cam = this.sun.shadow.camera;
    if (Math.abs(cam.right - reach) / reach > 0.08) {
      cam.left = -reach;
      cam.right = reach;
      cam.top = reach;
      cam.bottom = -reach;
      cam.updateProjectionMatrix();
    }
  }

  private followPoint(frame: BroadcastFrame): { x: number; z: number } | null {
    if (frame.mode !== 'follow' || frame.followId === null) return null;
    const u = this.byId.get(frame.followId);
    if (!u) return null;
    return {
      x: lerp(u.px, u.x, frame.alpha) - this.half,
      z: lerp(u.py, u.y, frame.alpha) - this.half,
    };
  }

  /* ------------------------------ units ------------------------------ */

  private create(u: ChessUnit): UnitView {
    const side = u.team === 'B' ? 'B' : 'A';
    const v = new UnitView(
      u.id,
      u.kind,
      u.defId,
      u.team,
      u.style ?? null,
      u.kind === 'minion' && u.team !== 'neutral' && u.pawn === true,
    );
    const kit = this.kit;
    const color = teamColor(u.team);
    switch (u.kind) {
      case 'hero': {
        const piece = pieceOf(u);
        const m = new PieceModel(kit, piece, side, u.style ?? null);
        v.hero = m;
        v.pieceId = piece;
        v.isPiece = true;
        v.lift = (m.height * PIECE_SCALE) / 2;
        v.objects.push(m.root, m.markers);
        break;
      }
      case 'tower':
        v.tower = new BastionModel(kit, color, side);
        v.lift = 24;
        v.objects.push(v.tower.root);
        break;
      case 'guardian':
        v.king = new ThroneModel(kit, color, side);
        v.lift = 40;
        v.objects.push(v.king.root);
        break;
      case 'camp':
        v.camp = new CampModel(kit, u.defId, u.maxHp > 900);
        v.lift = 8;
        v.objects.push(v.camp.root);
        break;
      case 'minion':
        v.lift = v.elite ? 14 : 8;
        if (u.team === 'neutral' && u.defId === 'jabberwock') {
          v.jabber = new JabberwockModel(kit, u.defId);
          v.lift = 30;
          v.objects.push(v.jabber.root);
        } else if (u.team === 'neutral' && u.maxHp >= 2000) {
          v.camp = new CampModel(kit, u.defId, true, ONI_RED, 2.5);
          v.lift = 20;
          v.objects.push(v.camp.root);
        }
        break;
      case 'obelisk':
        v.obelisk = new ObeliskModel(kit);
        v.lift = 20;
        v.objects.push(v.obelisk.root);
        break;
      case 'keeper':
        v.keeper = new KeeperModel(kit);
        v.lift = 12;
        v.objects.push(v.keeper.root);
        break;
    }
    for (const o of v.objects) this.unitGroup.add(o);
    return v;
  }

  private drop(v: UnitView): void {
    for (const o of v.objects) this.unitGroup.remove(o);
    this.views.delete(v.id);
  }

  private syncUnits(snap: Snapshot, alpha: number, dt: number): void {
    for (const v of this.views.values()) v.live = false;
    for (const u of snap.units as ChessUnit[]) {
      if (!u.alive && u.kind !== 'hero') continue;
      let v = this.views.get(u.id);
      let from: UnitView | null = null;
      if (
        v &&
        (v.kind !== u.kind ||
          v.defId !== u.defId ||
          v.team !== u.team ||
          v.style !== (u.style ?? null) ||
          (v.hero !== undefined && v.pieceId !== pieceOf(u)))
      ) {
        // a generic piece that has just chosen its archetype keeps its place and heading
        if (v.hero && v.style === null && u.style && v.kind === u.kind && v.pieceId === pieceOf(u))
          from = v;
        this.drop(v);
        v = undefined;
      }
      if (!v) {
        v = this.create(u);
        this.views.set(u.id, v);
        if (from) this.transform(u, v, from);
        if (v.elite && this.drawn > 0 && u.alive) this.spawnFlare(u, v);
      }
      v.stamp = this.stamp;
      v.live = u.alive;
      v.lane = u.lane ?? null;
      this.updateUnit(v, u, alpha, dt);
    }
    this.stale.length = 0;
    for (const v of this.views.values()) if (v.stamp !== this.stamp) this.stale.push(v);
    for (const v of this.stale) this.drop(v);
  }

  /** The Rank 4 moment: the new look pops in with a burst of the style colour. */
  private transform(u: ChessUnit, v: UnitView, from: UnitView): void {
    v.placed = true;
    v.x = from.x;
    v.z = from.z;
    v.yaw = from.yaw;
    v.move = from.move;
    v.phase = from.phase;
    v.hp = from.hp;
    v.lunge = from.lunge;
    v.hero?.transform();
    if (this.drawn === 0) return;
    const color = styleAccent(u.style);
    if (!color) return;
    const gy = this.arena.field.heightW(from.x, from.z);
    this.gambits.flare(from.x, gy, from.z, color, 46, 1.1, 95);
    this.gambits.flare(from.x, gy, from.z, '#ffffff', 26, 0.6, 0);
    this.physics.paperBurst(from.x, gy + 12, from.z, color);
    if (this.focusNear(from.x, from.z, 420)) this.rig.kick(0.12);
  }

  /** A pillar of light where a freshly fielded pawn steps out. */
  private spawnFlare(u: SnapUnit, v: UnitView): void {
    const x = u.x - this.half;
    const z = u.y - this.half;
    const gy = this.arena.field.heightW(x, z);
    this.gambits.flare(x, gy, z, teamColor(v.team), 34, 1, 70);
  }

  private updateUnit(v: UnitView, u: ChessUnit, alpha: number, dt: number): void {
    const x = lerp(u.px, u.x, alpha) - this.half;
    const z = lerp(u.py, u.y, alpha) - this.half;
    if (!v.placed) {
      v.x = x;
      v.z = z;
      v.hp = u.hp;
      v.placed = true;
      v.yaw = u.team === 'B' ? 0 : Math.PI;
      if (u.kind === 'guardian') v.yaw = Math.atan2(-x, -z);
      if (u.kind === 'camp') v.yaw = Math.atan2(-x, -z) + ((hash(`${u.id}`) % 100) / 100 - 0.5);
    }
    const gy = this.arena.field.heightW(x, z);
    v.gy = gy;
    const dx = x - v.x;
    const dz = z - v.z;
    const dist = Math.hypot(dx, dz);
    const teleport = dist > 60;
    const speed = dt > 1e-4 && !teleport ? dist / dt : 0;
    v.x = x;
    v.z = z;

    const mobile = u.kind === 'hero' || u.kind === 'minion';
    if (mobile) {
      const foe = u.target !== null ? this.byId.get(u.target) : undefined;
      let want = v.yaw;
      if (foe && (u.flash || speed < 8))
        want = Math.atan2(foe.x - this.half - x, foe.y - this.half - z);
      else if (speed > 8) want = Math.atan2(dx, dz);
      v.yaw = turn(v.yaw, want, 1 - Math.exp(-14 * dt));
      v.move = lerp(v.move, MathUtils.clamp(speed / 28, 0, 1), 1 - Math.exp(-10 * dt));
      v.phase += dt * (6 + Math.min(speed, 160) * 0.05) * (0.3 + 0.7 * v.move);
    }
    if (u.flash) v.lunge = 1;
    else v.lunge = Math.max(0, v.lunge - dt * 5.5);
    if (u.hp < v.hp - 0.01) v.flinch = 1;
    v.hp = u.hp;
    v.flinch = Math.max(0, v.flinch - dt * 4.2);
    const lunge = v.lunge * v.lunge * (3 - 2 * v.lunge);
    const frac = u.maxHp > 0 ? u.hp / u.maxHp : 1;
    const col = teamColor(u.team);
    const k = this.barScale;
    const time = this.time;

    switch (u.kind) {
      case 'hero': {
        const m = v.hero;
        if (!m) return;
        m.setVisible(u.alive);
        if (!u.alive) return;
        m.place(x, gy, z, v.yaw, this.boost);
        m.animate(
          { yaw: v.yaw, move: v.move, phase: v.phase, lunge, flinch: v.flinch, time },
          this.rig.camera.quaternion,
        );
        const top = gy + (m.height * PIECE_SCALE + 6) * this.boost;
        const bw = this.pieceBarW;
        const bh = this.pieceBarH;
        this.bars.add(x, top, z, bw, bh, frac, frac < LOW_HP ? LOW_HP_RED : col);
        if (u.shield > 0)
          this.bars.add(
            x,
            top + bh * 1.6,
            z,
            bw,
            bh * 0.6,
            Math.min(1, u.shield / u.maxHp),
            SHIELD,
          );
        // [emblem][rank]=====  left of the bar
        const rs = this.badgeSize;
        const es = this.emblemSize;
        const r = this.camRight;
        const dr = bw / 2 + bh * 0.4 + rs * 0.5;
        const de = dr + rs * 0.42 + es * 0.5;
        this.badges.piece(
          x,
          top,
          z,
          r,
          dr,
          de,
          rs,
          es,
          u.rank ?? 1,
          col,
          u.forkPending === true,
          v.style,
        );
        break;
      }
      case 'minion': {
        if (v.jabber) {
          v.jabber.root.position.set(x, gy, z);
          v.jabber.root.rotation.y = v.yaw;
          v.jabber.animate(time, lunge);
          this.bars.add(x, gy + 112, z, 50 * k, 4.8 * k, frac, ONI_RED);
          break;
        }
        if (v.camp) {
          v.camp.root.position.set(x, gy, z);
          v.camp.root.rotation.y = v.yaw;
          v.camp.animate(time, lunge);
          this.bars.add(x, gy + 62, z, 40 * k, 4.4 * k, frac, ONI_RED);
          break;
        }
        const neutral = u.team === 'neutral';
        const elite = v.elite;
        const scale =
          (neutral ? (u.maxHp < 400 ? 1.1 : u.maxHp < 800 ? 1.5 : 2) : 1) *
          (elite ? PAWN_SCALE : MINION_SCALE) *
          this.boost;
        const bob = Math.abs(Math.sin(v.phase)) * 1.3 * v.move * scale;
        this.minions.add(
          u.team,
          elite,
          x,
          gy + bob,
          z,
          v.yaw,
          v.move * 0.12 + lunge * 0.35 - v.flinch * 0.3,
          scale,
          gy,
        );
        // calm board: pawns and pawnlings show a bar only once they are hurt
        if (u.hp < u.maxHp - 0.5)
          this.bars.add(
            x,
            gy + (elite ? 25 : 14) * scale,
            z,
            (elite ? 13 : 8) * k,
            (elite ? 1.9 : 1.5) * k,
            frac,
            neutral ? PALETTE.neutral : col,
          );
        break;
      }
      case 'tower': {
        v.tower?.root.position.set(x, gy, z);
        if (v.tower) v.tower.root.rotation.y = v.yaw;
        v.tower?.animate(time, lunge, frac);
        this.bars.add(x, gy + 70, z, 26 * k, 2.8 * k, frac, col);
        break;
      }
      case 'guardian': {
        const g = v.king;
        if (!g) return;
        g.root.position.set(x, gy, z);
        g.root.rotation.y = v.yaw;
        g.animate(time, lunge, frac);
        this.bars.add(x, gy + 150, z, 46 * k, 3.4 * k, frac, col);
        break;
      }
      case 'camp': {
        const c = v.camp;
        if (!c) return;
        c.root.position.set(x, gy, z);
        c.root.rotation.y = v.yaw;
        c.animate(time, lunge);
        if (u.hp < u.maxHp)
          this.bars.add(x, gy + (u.maxHp > 900 ? 38 : 26), z, 15 * k, 2.4 * k, frac, PALETTE.camp);
        break;
      }
      case 'obelisk':
        v.obelisk?.root.position.set(x, gy, z);
        v.obelisk?.animate(time, u.claim);
        break;
      case 'keeper':
        v.keeper?.root.position.set(x, gy, z);
        v.keeper?.animate(time, this.rig.camera.quaternion);
        break;
    }
  }

  /* ------------------------------ events ------------------------------ */

  private focusNear(x: number, z: number, r: number): boolean {
    return Math.hypot(this.rig.focus.x - x, this.rig.focus.z - z) < r;
  }

  private handleEvents(events: NewEvents): void {
    for (const e of events) this.handleEvent(e);
  }

  /** Chess events the sim adds (and any it may add later): read loosely, ignore what is unknown. */
  private handleChessEvent(type: string, p: Record<string, unknown>): void {
    const num = (k: string): number | undefined =>
      typeof p[k] === 'number' ? (p[k] as number) : undefined;
    const team = p.team === 'B' ? 'B' : 'A';
    const col = teamColor(team);
    switch (type) {
      case 'gambit': {
        const card = typeof p.cardId === 'string' ? p.cardId : '';
        const lane = typeof p.lane === 'string' ? p.lane : null;
        const x = num('x');
        const y = num('y');
        const target = num('targetId');
        const tv = target !== undefined ? this.views.get(target) : undefined;
        // zones normally come from the snapshot; this covers a sim that only sends the event
        if (/sanct/i.test(card) && x !== undefined && y !== undefined && !this.zonesFromSnap) {
          const wx = x - this.half;
          const wz = y - this.half;
          this.gambits.zone(
            wx,
            this.arena.field.surfaceW(wx, wz),
            wz,
            '#8ff0b4',
            64,
            SANCTUARY_SEC,
          );
          break;
        }
        if (/fork/i.test(card) && tv) {
          for (const v of this.views.values()) {
            if (v.pieceId !== 'knight' || v.team !== team || !v.live) continue;
            this.from.set(v.x, v.gy + 6, v.z);
            this.to.set(tv.x, tv.gy + 10, tv.z);
            this.gambits.arc(this.from, this.to, '#ffd35a', 0.55);
            break;
          }
          this.gambits.flare(tv.x, tv.gy, tv.z, '#ffd35a', 34, 0.9, 50);
          break;
        }
        if (tv) {
          this.gambits.flare(tv.x, tv.gy, tv.z, '#ff6a5a', 30, 0.9, 40);
          break;
        }
        if (x !== undefined && y !== undefined) {
          const wx = x - this.half;
          const wz = y - this.half;
          this.gambits.flare(wx, this.arena.field.surfaceW(wx, wz), wz, col, 52, 1.1, 50);
          break;
        }
        // lane or self cards: a ring under each piece the order touches
        for (const v of this.views.values()) {
          if (!v.isPiece || !v.live || v.team !== team) continue;
          if (lane && v.lane && v.lane !== lane) continue;
          this.gambits.flare(v.x, v.gy, v.z, col, 30, 0.8);
        }
        break;
      }
      case 'check': {
        for (const v of this.views.values()) {
          if (v.pieceId !== 'king' || v.team !== team) continue;
          this.gambits.crown(v.id);
          this.gambits.flare(v.x, v.gy, v.z, '#ffe08a', 44, 1.2, 60);
        }
        break;
      }
      case 'throneDown': {
        for (const v of this.views.values()) {
          if (v.kind !== 'guardian' || v.team !== team) continue;
          this.gambits.flare(v.x, v.gy, v.z, '#ff6a5a', 120, 1.6, 140);
        }
        this.rig.kick(1);
        break;
      }
      case 'checkmate': {
        const winner = p.winner === 'B' ? 'B' : 'A';
        for (const v of this.views.values()) {
          if (v.team === winner || !v.live) continue;
          if (v.pieceId === 'king') this.gambits.crown(v.id, 3);
          if (v.pieceId === 'king' || v.kind === 'guardian')
            this.gambits.flare(v.x, v.gy, v.z, '#ffd35a', 150, 2.2, 180);
        }
        this.rig.kick(1);
        break;
      }
      default:
        break;
    }
  }

  private handleEvent(e: GameEvent): void {
    const half = this.half;
    switch (e.type) {
      case 'damage': {
        const p = e.payload;
        if (p.srcKind === 'none' || p.amount <= 0) break;
        const a = this.views.get(p.src);
        const b = this.views.get(p.tgt);
        if (!a || !b) break;
        a.lunge = 1;
        if (p.srcKind === 'minion' && p.tgtKind === 'minion') break;
        const structure = p.srcKind === 'tower' || p.srcKind === 'guardian';
        this.from.set(a.x, a.gy + (CHEST[p.srcKind] ?? 10), a.z);
        this.to.set(b.x, b.gy + (CHEST[p.tgtKind] ?? 10), b.z);
        this.streaks.fire(
          this.from,
          this.to,
          structure ? GOLD_BOLT : teamColor(p.srcTeam === 'none' ? 'neutral' : p.srcTeam),
          p.lethal || structure,
        );
        break;
      }
      case 'death': {
        const p = e.payload;
        const x = p.x - half;
        const z = p.y - half;
        if (p.kind === 'hero' || (p.kind as string) === 'piece') {
          const v = this.views.get(p.id);
          const killer = this.views.get(p.killer);
          if (v?.hero?.root.visible) {
            this.physics.ragdoll(
              v.hero.pieces(),
              killer ? this.tmp.set(killer.x, killer.gy, killer.z) : null,
            );
            if (this.focusNear(x, z, 420)) this.rig.kick(0.22);
          }
        } else if (p.kind === 'minion') {
          this.physics.paperBurst(x, this.arena.field.heightW(x, z) + 4, z, teamColor(p.team));
        } else if (p.kind === 'camp') {
          this.physics.paperBurst(x, this.arena.field.heightW(x, z) + 6, z, PALETTE.camp);
        }
        break;
      }
      case 'structureDown': {
        const p = e.payload;
        const x = p.x - half;
        const z = p.y - half;
        const roof = new Color(teamColor(p.team)).multiplyScalar(0.4).getStyle();
        const guardian = p.kind === 'guardian';
        this.physics.debris(
          x,
          this.arena.field.heightW(x, z),
          z,
          guardian ? 64 : 38,
          guardian ? 20 : 10,
          [STONE, STONE_DARK, roof, STONE],
          guardian ? 26 : 15,
        );
        this.rig.kick(guardian ? 1 : 0.6);
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
          this.arena.field.surfaceAt(e.x, e.y),
          e.y - this.half,
        );
        this.rings.set(e.id, ring);
        this.unitGroup.add(ring.group);
      }
      const warn = e.phase === 'warning';
      ring.update(this.time, warn, e.progress, e.team);
      const t = e.telegraph;
      ring.setTelegraph(
        t ? t.x - this.half : 0,
        t ? this.arena.field.surfaceAt(t.x, t.y) - ring.group.position.y : 0,
        t ? t.y - this.half : 0,
        t?.radius ?? 0,
        this.time,
        !!t,
      );
    }
    for (const [id, ring] of this.rings) {
      if (seen.has(id)) continue;
      this.unitGroup.remove(ring.group);
      this.rings.delete(id);
    }
  }

  private reset(): void {
    for (const v of [...this.views.values()]) this.drop(v);
    for (const [id, ring] of this.rings) {
      this.unitGroup.remove(ring.group);
      this.rings.delete(id);
    }
    this.physics.clear();
    this.streaks.clear();
    this.gambits.clear();
    this.drawn = 0;
  }

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    this.reset();
    this.rig.dispose();
    this.physics.dispose();
    this.minions.dispose();
    this.arena.dispose();
    this.kit.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
