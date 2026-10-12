import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { Content } from '../../sim';
import type { Orient } from './board';
import { LOOK } from './palette';

/** Screen space the HUD covers, in CSS pixels (the default framing keeps the board clear of it). */
interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Where the camera looks and from where: the target point on the ground (world x, z), the distance
 * to it, the yaw (radians; 0 puts the camera on the +z side, behind White on the Long Board) and the
 * tilt (radians above the ground).
 */
export interface Pose {
  x: number;
  z: number;
  d: number;
  yaw: number;
  tilt: number;
}

const FOV = LOOK.cam.fov;
/** Tilt range of the free camera (degrees above the ground). */
export const TILT_MIN = 25;
export const TILT_MAX = 80;
/**
 * Lanes are fitted to their centre line plus a piece's width (not the felt's full width): the
 * two outer lane corners may lose a sliver of felt at the screen edge, the board gets ~7% bigger.
 */
const LANE_FIT = 36;
/** How much closer than the whole-board distance the camera sits when it follows a piece. */
const LEAN = 0.42;
/** Lane lean-in: the starting distance (about 1.9× closer than the whole board) and the closest. */
export const LANE_LEAN = 0.52;
export const LANE_CLOSE = 0.24;
/**
 * The Long Board's whole-board view sits farther back (the board is twice as long), so its
 * lean-ins scale by this to bring pieces to about the size they have on the square board.
 */
const LONG_LEAN = 0.9;
/**
 * Long Board default framing: the span across (the three lanes and a margin), and the scale it
 * never zooms in past (world units per CSS pixel at the target: pieces about 26 px tall on a phone,
 * about 38 px on a desktop), so a short landscape phone still sees White's home terrace.
 */
const LONG_WIDTH = 1560;
const LONG_UPX = { phone: 3.3, desktop: 2.3 } as const;
/** Long Board default tilt (degrees): portrait, landscape phone, desktop. */
const LONG_TILT = { portrait: 52, landscape: 44, desktop: 48 } as const;
/** The closest the camera may come (world units of distance). */
const MIN_DIST = 1300;
/** A yaw or tilt this far (degrees) from the default shows the compass. */
const TURNED_DEG = 2.5;

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * The free camera of the table view. `home` is the default pose for this screen (Long Board: the
 * full width of the board with White nearest the camera; square board: the whole board, as the
 * war table had it); `goal` is where the camera is heading (gestures, follow, lane and the director
 * write it) and `pose` eases toward it. The target is kept on the map, the distance between a close
 * limit and the whole-board view, the tilt between `TILT_MIN` and `TILT_MAX`.
 */
export class TableCamera {
  readonly camera = new PerspectiveCamera(FOV, 1, 20, 60000);
  orient: Orient = 'portrait';
  /** World units per CSS pixel at the board centre (default pose). */
  unitPx = 5;
  private readonly pts: Vector3[] = [];
  /** Tilt of the default pose (degrees), and the prototype's tilt for this screen shape. */
  tiltDeg = 34;
  protoTilt = 30;
  readonly home: Pose = { x: 0, z: 0, d: 6000, yaw: 0, tilt: 0.6 };
  readonly pose: Pose = { x: 0, z: 0, d: 6000, yaw: 0, tilt: 0.6 };
  readonly goal: Pose = { x: 0, z: 0, d: 6000, yaw: 0, tilt: 0.6 };
  /** Distance range: the closest, and the whole board in view. */
  minD = MIN_DIST;
  maxD = 9000;
  /** Distance that frames the whole board at the default angle (lean-ins are shares of it). */
  private boardD = 6000;
  private shake = 0;
  private time = 0;
  private settled = false;
  private cssH = 1;
  private cssW = 1;
  /** Half the HUD's vertical imbalance (bottom − top, CSS px): lean-ins centre in the free band. */
  private freeShift = 0;
  /** Half the HUD's horizontal imbalance (left − right, CSS px). */
  private freeShiftX = 0;
  private readonly tmp = new Vector3();
  /** Half the board's width and length (target clamp). */
  readonly hx: number;
  readonly hz: number;
  /** The Long Board: framed from White's end, the board's width across the screen. */
  private readonly long: boolean;
  /** Lean-in distances are this fraction of the whole-board distance's usual share. */
  private readonly leanK: number;
  /** The square board's seat direction (its default yaw), from the look's framing. */
  private readonly baseDir = new Vector3();
  private readonly whiteZ: number;

  constructor(content: Content, topY: number, throneTop: number) {
    const map = content.map;
    const hx = map.size / 2;
    const hz = (map.length ?? map.size) / 2;
    this.hx = hx;
    this.hz = hz;
    this.long = !!map.terraces;
    this.leanK = this.long ? LONG_LEAN : 1;
    this.whiteZ = map.bases.A[1] - hz + map.walk.base;
    const add = (x: number, y: number, r: number): void => {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const px = x - hx + Math.cos(a) * r;
        const pz = y - hz + Math.sin(a) * r;
        this.pts.push(new Vector3(px, 0, pz), new Vector3(px, topY, pz));
      }
    };
    for (const lane of Object.values(map.lanes))
      for (let i = 1; i < lane.length; i++) {
        const [ax, ay] = lane[i - 1];
        const [bx, by] = lane[i];
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 120));
        for (let k = 0; k <= n; k++)
          add(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n, LANE_FIT);
      }
    for (const [x, y] of Object.values(map.bases)) add(x, y, map.walk.base);
    // the Thrones are landmarks: their banners must fit too
    for (const [bx, by] of Object.values(map.bases)) {
      const dx = hx - bx;
      const dy = hz - by;
      const len = Math.hypot(dx, dy) || 1;
      const gx = bx + (dx / len) * map.guardianOffset - hx;
      const gz = by + (dy / len) * map.guardianOffset - hz;
      this.pts.push(new Vector3(gx, 0, gz), new Vector3(gx, throneTop, gz));
    }
  }

  /**
   * Screen space the HUD covers. The HUD publishes `--hud-top` / `--hud-bottom` (and
   * `--hud-left` / `--hud-right`) in CSS px on the root element; until it does, its usual bands are
   * assumed (portrait 155 top / 136 bottom, full width; wide screens a slim top bar and White's
   * column on the left).
   */
  insets(w: number, h: number): Insets {
    const def: Insets =
      w / h < 1.3
        ? { top: 155, bottom: 136, left: 0, right: 0 }
        : h < 520
          ? { top: 57, bottom: 0, left: 80, right: 0 }
          : { top: 72, bottom: 0, left: 102, right: 0 };
    if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return def;
    const st = getComputedStyle(document.documentElement);
    const v = (name: string, fb: number): number => {
      const n = parseFloat(st.getPropertyValue(name));
      return Number.isFinite(n) && n >= 0 ? n : fb;
    };
    return {
      top: v('--hud-top', def.top),
      bottom: v('--hud-bottom', def.bottom),
      left: v('--hud-left', def.left),
      right: v('--hud-right', def.right),
    };
  }

  /** The insets the last fit used (so the view can refit when the HUD changes them). */
  fitted = '';

  /** Re-fits the default pose and the zoom range for a canvas of w×h CSS pixels. */
  fit(w: number, h: number): void {
    const cam = this.camera;
    cam.aspect = w / h;
    cam.fov = FOV;
    cam.updateProjectionMatrix();
    this.cssH = h;
    this.cssW = w;
    // the Long Board's paint faces White's end (the camera's default seat) on every screen
    this.orient = this.long || h > w ? 'portrait' : 'landscape';
    const ins = this.insets(w, h);
    this.fitted = `${ins.top},${ins.bottom},${ins.left},${ins.right}`;
    this.freeShift = (ins.bottom - ins.top) / 2;
    this.freeShiftX = (ins.left - ins.right) / 2;
    this.protoTilt = h > w ? 30 : h < 520 ? 31 : 38;
    // a camera still at its default angle (or pose) follows the new default (a phone turned)
    const g = this.goal;
    const h0 = this.home;
    const atHome = Math.hypot(g.x - h0.x, g.z - h0.z) < 1 && Math.abs(g.d - h0.d) < h0.d * 0.01;
    const straight = !this.turned;
    if (this.long) this.fitLong(w, h, ins);
    else this.fitSquare(w, h, ins);
    const tanV = Math.tan(MathUtils.degToRad(FOV / 2));
    this.unitPx = (2 * this.home.d * tanV) / Math.max(1, h);
    if (!this.settled || (straight && atHome)) {
      Object.assign(this.pose, this.home);
      Object.assign(this.goal, this.home);
      this.settled = true;
    } else if (straight) {
      g.yaw = this.home.yaw;
      g.tilt = this.home.tilt;
    }
    this.clamp(this.goal);
    this.clamp(this.pose);
    this.place(this.pose);
  }

  /**
   * The square board: the war table's whole-board view (portrait: the camera behind White's
   * corner; landscape: behind the Right lane's corner; square framing: White's rank-1 edge).
   */
  private fitSquare(w: number, h: number, ins: Insets): void {
    if (LOOK.cam.square) this.baseDir.set(0, 0, 1);
    else if (h > w) this.baseDir.set(-Math.SQRT1_2, 0, Math.SQRT1_2);
    else this.baseDir.set(Math.SQRT1_2, 0, Math.SQRT1_2);
    const yaw = Math.atan2(this.baseDir.x, this.baseDir.z);
    // portrait takes the variant's tilt; landscape and desktop search their range for the tilt
    // that frames the board biggest (steeper wins ties)
    const range: readonly [number, number] =
      h > w
        ? [LOOK.cam.portrait, LOOK.cam.portrait]
        : h < 520
          ? LOOK.cam.landscape
          : LOOK.cam.desktop;
    let best = { deg: range[1], d: Infinity };
    for (let deg = range[1]; deg >= range[0] - 1e-6; deg -= 2) {
      const f = this.solve(ins, w, h, yaw, MathUtils.degToRad(deg), 28);
      if (f.d < best.d * 0.985) best = { deg, d: f.d };
    }
    this.tiltDeg = best.deg;
    const tilt = MathUtils.degToRad(best.deg);
    const f = this.solve(ins, w, h, yaw, tilt, 48);
    Object.assign(this.home, { x: f.x, z: f.z, d: f.d, yaw, tilt });
    this.boardD = f.d;
    this.minD = Math.min(MIN_DIST, f.d * 0.3);
    this.maxD = f.d * 1.25;
  }

  /**
   * The Long Board: the camera behind White's base, the board's full width (the three lanes and a
   * margin) across the screen (never closer than `LONG_UPX`), White's base just above the
   * bottom HUD. Pinching out reaches the whole board.
   */
  private fitLong(w: number, h: number, ins: Insets): void {
    const deg = h > w ? LONG_TILT.portrait : h < 520 ? LONG_TILT.landscape : LONG_TILT.desktop;
    this.tiltDeg = deg;
    const tilt = MathUtils.degToRad(deg);
    const tanV = Math.tan(MathUtils.degToRad(FOV / 2));
    const tanH = tanV * (w / h);
    const freeW = Math.max(0.3, (w - ins.left - ins.right) / w);
    const dWidth = LONG_WIDTH / 2 / (tanH * freeW);
    const scale = Math.min(w, h) < 600 ? LONG_UPX.phone : LONG_UPX.desktop;
    const d = Math.max(dWidth, (scale * h) / (2 * tanV));
    // slide the target until White's base edge sits at the bottom of the free band (centred across it)
    const pose: Pose = { x: 0, z: 0, d, yaw: 0, tilt };
    const want = 1 - (2 * (h - ins.bottom - 10)) / h; // NDC y of the free band's bottom
    const upx = (2 * d * tanV) / h;
    pose.x = -this.freeShiftX * upx;
    for (let i = 0; i < 24; i++) {
      this.place(pose);
      const q = this.tmp.set(0, 0, this.whiteZ).project(this.camera);
      const err = q.y - want;
      if (Math.abs(err) < 1e-4) break;
      // one NDC unit of screen height is about d·tanV / sin(tilt) of ground depth
      pose.z -= (err * d * tanV) / Math.sin(tilt);
    }
    pose.z = Math.min(pose.z, this.hz);
    Object.assign(this.home, pose);
    const whole = this.solve(ins, w, h, 0, tilt, 48);
    this.boardD = whole.d;
    this.minD = MIN_DIST;
    this.maxD = Math.max(whole.d * 1.12, d * 1.2);
  }

  /** Camera target and distance that fit the board inside the insets at a yaw and tilt. */
  private solve(
    ins: Insets,
    w: number,
    h: number,
    yaw: number,
    tilt: number,
    iters: number,
  ): { x: number; z: number; d: number } {
    const cam = this.camera;
    const sx0 = -1 + (2 * ins.left) / w;
    const sx1 = 1 - (2 * ins.right) / w;
    const sy0 = -1 + (2 * ins.bottom) / h;
    const sy1 = 1 - (2 * ins.top) / h;
    const tanV = Math.tan(MathUtils.degToRad(FOV / 2));
    const tanH = tanV * cam.aspect;
    const pose: Pose = { x: 0, z: 0, d: 7000, yaw, tilt };
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    for (let it = 0; it < iters; it++) {
      this.place(pose);
      let bx0 = Infinity;
      let bx1 = -Infinity;
      let by0 = Infinity;
      let by1 = -Infinity;
      for (const p of this.pts) {
        const q = this.tmp.copy(p).project(cam);
        if (q.x < bx0) bx0 = q.x;
        if (q.x > bx1) bx1 = q.x;
        if (q.y < by0) by0 = q.y;
        if (q.y > by1) by1 = q.y;
      }
      const k = Math.max((bx1 - bx0) / (sx1 - sx0), (by1 - by0) / (sy1 - sy0));
      const dx = (bx0 + bx1) / 2 - (sx0 + sx1) / 2;
      const dy = (by0 + by1) / 2 - (sy0 + sy1) / 2;
      const sh = dx * pose.d * tanH * 0.8;
      const sv = (dy * pose.d * tanV * 0.8) / Math.sin(tilt);
      // screen right on the ground is (cos yaw, −sin yaw); screen up is away from the camera
      pose.x += rx * sh - Math.sin(yaw) * sv;
      pose.z += rz * sh - Math.cos(yaw) * sv;
      pose.d *= Math.pow(k, 0.85);
    }
    return { x: pose.x, z: pose.z, d: pose.d };
  }

  /** The board's on-screen box (CSS px) right now: [x0, y0, x1, y1]. */
  boardBox(w: number, h: number): [number, number, number, number] {
    let bx0 = Infinity;
    let bx1 = -Infinity;
    let by0 = Infinity;
    let by1 = -Infinity;
    for (let i = 0; i < this.pts.length; i += 2) {
      const q = this.tmp.copy(this.pts[i]).project(this.camera);
      bx0 = Math.min(bx0, q.x);
      bx1 = Math.max(bx1, q.x);
      by0 = Math.min(by0, q.y);
      by1 = Math.max(by1, q.y);
    }
    return [((bx0 + 1) / 2) * w, ((1 - by1) / 2) * h, ((bx1 + 1) / 2) * w, ((1 - by0) / 2) * h];
  }

  /** Puts the three.js camera at a pose. */
  private place(p: Pose, ox = 0, oz = 0): void {
    const c = Math.cos(p.tilt) * p.d;
    const cam = this.camera;
    cam.position.set(
      p.x + ox + Math.sin(p.yaw) * c,
      Math.sin(p.tilt) * p.d,
      p.z + oz + Math.cos(p.yaw) * c,
    );
    cam.lookAt(p.x + ox, 0, p.z + oz);
    cam.updateMatrixWorld();
  }

  /** Keeps a pose on the map, inside the zoom range and the tilt range. */
  clamp(p: Pose): void {
    p.x = MathUtils.clamp(p.x, -this.hx, this.hx);
    p.z = MathUtils.clamp(p.z, -this.hz, this.hz);
    p.d = MathUtils.clamp(p.d, this.minD, this.maxD);
    p.tilt = MathUtils.clamp(p.tilt, MathUtils.degToRad(TILT_MIN), MathUtils.degToRad(TILT_MAX));
  }

  kick(k: number): void {
    this.shake = Math.min(1, this.shake + k);
  }

  /** Camera distance that frames the whole board (lean-ins are shares of it). */
  get wholeDist(): number {
    return this.boardD;
  }

  /** Follow distance: about the old lean-in on a piece. */
  get followDist(): number {
    return this.boardD * LEAN * this.leanK;
  }

  /** Lane lean-in distance for a lane camera zoom (a share of the whole-board distance). */
  laneDist(zoom: number): number {
    return this.boardD * zoom * this.leanK;
  }

  /**
   * The ground point to aim at so that `at` (world x, z) sits in the middle of the HUD-free band
   * at distance `d` (the HUD covers more at the bottom than the top on a phone).
   */
  centred(at: { x: number; z: number }, d: number, out: { x: number; z: number }): void {
    const tanV = Math.tan(MathUtils.degToRad(FOV / 2));
    const upx = (2 * d * tanV) / Math.max(1, this.cssH);
    const back = (this.freeShift * upx) / Math.sin(this.goal.tilt);
    const side = this.freeShiftX * upx;
    const sy = Math.sin(this.goal.yaw);
    const cy = Math.cos(this.goal.yaw);
    // toward the camera on the ground is (sin yaw, cos yaw); screen right is (cos yaw, −sin yaw)
    out.x = at.x + sy * back - cy * side;
    out.z = at.z + cy * back + sy * side;
  }

  /** World units per CSS pixel right now (at the target point). */
  pxNow(): number {
    return (2 * this.pose.d * Math.tan(MathUtils.degToRad(FOV / 2))) / Math.max(1, this.cssH);
  }

  /** True when the goal's yaw or tilt is away from the default angle (the compass shows). */
  get turned(): boolean {
    const t = MathUtils.degToRad(TURNED_DEG);
    return (
      Math.abs(wrap(this.goal.yaw - this.home.yaw)) > t ||
      Math.abs(this.goal.tilt - this.home.tilt) > t
    );
  }

  /** Eases back to the default yaw and tilt (the compass button). */
  resetAngle(): void {
    this.goal.yaw = this.pose.yaw + wrap(this.home.yaw - this.pose.yaw);
    this.goal.tilt = this.home.tilt;
  }

  /** Back to the default pose. */
  goHome(): void {
    Object.assign(this.goal, this.home);
    this.goal.yaw = this.pose.yaw + wrap(this.home.yaw - this.pose.yaw);
  }

  /** The goal takes over the current pose (a gesture or mode change starts from where we are). */
  holdHere(): void {
    Object.assign(this.goal, this.pose);
  }

  /** Moves pose and goal together (a grab-pan: the ground under the finger stays under it). */
  shift(dx: number, dz: number): void {
    this.pose.x += dx;
    this.pose.z += dz;
    this.goal.x += dx;
    this.goal.z += dz;
    this.clamp(this.goal);
    this.clamp(this.pose);
    this.place(this.pose);
  }

  /** Eases the pose toward the goal (`rate` per second) and places the camera, with any shake. */
  update(dt: number, rate = 4): void {
    this.time += dt;
    this.clamp(this.goal);
    const k = 1 - Math.exp(-dt * rate);
    const p = this.pose;
    const g = this.goal;
    p.x += (g.x - p.x) * k;
    p.z += (g.z - p.z) * k;
    // zoom eases in log space so it feels the same at every distance
    p.d = Math.exp(Math.log(p.d) + (Math.log(g.d) - Math.log(p.d)) * k);
    p.yaw += wrap(g.yaw - p.yaw) * k;
    p.tilt += (g.tilt - p.tilt) * k;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const s = this.shake * this.shake * 9;
    this.place(p, Math.sin(this.time * 61) * s, Math.cos(this.time * 47) * s);
  }

  /** CSS size the camera was last fitted for. */
  get size(): { w: number; h: number } {
    return { w: this.cssW, h: this.cssH };
  }
}
