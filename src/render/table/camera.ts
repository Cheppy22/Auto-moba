import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { Content } from '../../sim';
import type { Orient } from './board';
import { LOOK } from './palette';

/** Screen space the HUD covers, in CSS pixels; the board is fitted inside the rest. */
interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const FOV = LOOK.cam.fov;
/**
 * Lanes are fitted to their centre line plus a piece's width (not the felt's full width): the
 * two outer lane corners may lose a sliver of felt at the screen edge, the board gets ~7% bigger.
 */
const LANE_FIT = 36;
/** How much closer the camera sits when it leans in on a piece. */
const LEAN = 0.42;
/** Lane lean-in: the starting distance (about 1.9× closer, like the default look) and the closest. */
export const LANE_LEAN = 0.52;
export const LANE_CLOSE = 0.24;

/**
 * The war-table camera: one fixed three-quarter view of the whole board, fitted to the screen
 * (portrait: White at the bottom; landscape and desktop: White on the left). "Follow" leans in
 * on the followed piece; everything else sits back at the whole-board view.
 */
export class TableCamera {
  readonly camera = new PerspectiveCamera(FOV, 1, 20, 30000);
  orient: Orient = 'portrait';
  /** World units per CSS pixel at the board centre (whole-board pose). */
  unitPx = 5;
  private readonly pts: Vector3[] = [];
  /** Horizontal direction from the board centre toward the player's seat. */
  readonly dir = new Vector3();
  private el = 0.6;
  /** Tilt of the whole-board pose (degrees), and the prototype's tilt for this screen shape. */
  tiltDeg = 34;
  protoTilt = 30;
  private boardX = 0;
  private boardZ = 0;
  private boardD = 6000;
  private x = 0;
  private z = 0;
  private d = 6000;
  private shake = 0;
  private time = 0;
  private settled = false;
  private cssH = 1;
  /** Half the HUD's vertical imbalance (bottom − top, CSS px): lean-ins centre in the free band. */
  private freeShift = 0;
  /** Half the HUD's horizontal imbalance (left − right, CSS px). */
  private freeShiftX = 0;
  private readonly tmp = new Vector3();
  private readonly right = new Vector3();
  private readonly fwd = new Vector3();
  /** Half the board size (clamps for the lean-in). */
  private readonly half: number;

  constructor(content: Content, topY: number, throneTop: number) {
    const map = content.map;
    const half = map.size / 2;
    this.half = half;
    const add = (x: number, y: number, r: number): void => {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const px = x - half + Math.cos(a) * r;
        const pz = y - half + Math.sin(a) * r;
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
      const dx = half - bx;
      const dy = half - by;
      const len = Math.hypot(dx, dy) || 1;
      const gx = bx + (dx / len) * map.guardianOffset - half;
      const gz = by + (dy / len) * map.guardianOffset - half;
      this.pts.push(new Vector3(gx, 0, gz), new Vector3(gx, throneTop, gz));
    }
  }

  /**
   * Screen space the HUD covers. The HUD may publish `--hud-top` / `--hud-bottom` (and
   * `--hud-left` / `--hud-right`) in CSS px on the root element (the court-bar HUD does); until
   * it does, that HUD's usual bands are assumed (portrait 155 top / 136 bottom, full width; wide
   * screens a slim top bar and White's column on the left).
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

  /** Re-fits the whole-board pose for a canvas of w×h CSS pixels. */
  fit(w: number, h: number): void {
    const cam = this.camera;
    cam.aspect = w / h;
    cam.fov = FOV;
    cam.updateProjectionMatrix();
    this.cssH = h;
    this.orient = h > w ? 'portrait' : 'landscape';
    // portrait: the camera sits behind White's corner; landscape: behind the Right lane's corner
    // square framing: the seat is White's rank-1 edge, the board fills its screen box
    if (LOOK.cam.square) this.dir.set(0, 0, 1);
    else if (this.orient === 'portrait') this.dir.set(-Math.SQRT1_2, 0, Math.SQRT1_2);
    else this.dir.set(Math.SQRT1_2, 0, Math.SQRT1_2);
    const ins = this.insets(w, h);
    this.fitted = `${ins.top},${ins.bottom},${ins.left},${ins.right}`;
    this.freeShift = (ins.bottom - ins.top) / 2;
    this.freeShiftX = (ins.left - ins.right) / 2;
    // tilt: portrait is width-bound, so it takes the variant's tilt; landscape and desktop search
    // their range for the tilt that frames the board biggest (steeper wins ties)
    const range: readonly [number, number] =
      h > w
        ? [LOOK.cam.portrait, LOOK.cam.portrait]
        : h < 520
          ? LOOK.cam.landscape
          : LOOK.cam.desktop;
    let best = { el: range[1], x: 0, z: 0, d: Infinity };
    for (let deg = range[1]; deg >= range[0] - 1e-6; deg -= 2) {
      this.el = MathUtils.degToRad(deg);
      const f = this.solve(ins, w, h, 28);
      if (f.d < best.d * 0.985) best = { el: deg, ...f };
    }
    this.el = MathUtils.degToRad(best.el);
    this.tiltDeg = best.el;
    this.protoTilt = h > w ? 30 : h < 520 ? 31 : 38;
    const { x, z, d } = this.solve(ins, w, h, 48);
    const tanV = Math.tan(MathUtils.degToRad(FOV / 2));
    this.boardX = x;
    this.boardZ = z;
    this.boardD = d;
    this.unitPx = (2 * d * tanV) / Math.max(1, h);
    if (!this.settled) {
      this.x = x;
      this.z = z;
      this.d = d;
      this.settled = true;
    }
    this.pose(this.x, this.z, this.d);
  }

  /** Camera target and distance that fit the board inside the insets at the current tilt. */
  private solve(
    ins: Insets,
    w: number,
    h: number,
    iters: number,
  ): { x: number; z: number; d: number } {
    const cam = this.camera;
    const sx0 = -1 + (2 * ins.left) / w;
    const sx1 = 1 - (2 * ins.right) / w;
    const sy0 = -1 + (2 * ins.bottom) / h;
    const sy1 = 1 - (2 * ins.top) / h;
    const tanV = Math.tan(MathUtils.degToRad(FOV / 2));
    const tanH = tanV * cam.aspect;
    let x = 0;
    let z = 0;
    let d = 7000;
    for (let it = 0; it < iters; it++) {
      this.pose(x, z, d);
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
      this.right.set(1, 0, 0).applyQuaternion(cam.quaternion).setY(0).normalize();
      this.fwd.copy(this.dir).multiplyScalar(-1);
      const sh = dx * d * tanH * 0.8;
      const sv = (dy * d * tanV * 0.8) / Math.sin(this.el);
      x += this.right.x * sh + this.fwd.x * sv;
      z += this.right.z * sh + this.fwd.z * sv;
      d *= Math.pow(k, 0.85);
    }
    return { x, z, d };
  }

  /** The board's on-screen box (CSS px) at the whole-board pose: [x0, y0, x1, y1]. */
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

  private pose(x: number, z: number, d: number): void {
    const c = Math.cos(this.el);
    const cam = this.camera;
    cam.position.set(x + this.dir.x * c * d, Math.sin(this.el) * d, z + this.dir.z * c * d);
    cam.lookAt(x, 0, z);
    cam.updateMatrixWorld();
  }

  kick(k: number): void {
    this.shake = Math.min(1, this.shake + k);
  }

  /** World units per CSS pixel right now (shrinks while leaning in). */
  pxNow(): number {
    return (2 * this.d * Math.tan(MathUtils.degToRad(FOV / 2))) / Math.max(1, this.cssH);
  }

  /**
   * Eases toward the whole-board pose, or the lean-in pose on `lean` (world x, z) at `amount` of
   * the whole-board distance. `free` skips the clamp toward the centre (lane pans reach the bases);
   * `rate` is the easing speed (faster while a finger drags the view).
   */
  update(
    dt: number,
    lean: { x: number; z: number } | null,
    amount = LEAN,
    free = false,
    rate = 3.2,
  ): void {
    this.time += dt;
    let tx = this.boardX;
    let tz = this.boardZ;
    let td = this.boardD;
    if (lean) {
      const lim = free ? Infinity : this.half * 0.62;
      td = this.boardD * amount;
      // the lean point sits in the middle of the HUD-free band, not the canvas
      const tanV = Math.tan(MathUtils.degToRad(FOV / 2));
      const upx = (2 * td * tanV) / Math.max(1, this.cssH);
      const back = (this.freeShift * upx) / Math.sin(this.el);
      const side = this.freeShiftX * upx;
      // screen right on the ground is (dir.z, -dir.x)
      tx = MathUtils.clamp(lean.x, -lim, lim) + this.dir.x * back - this.dir.z * side;
      tz = MathUtils.clamp(lean.z, -lim, lim) + this.dir.z * back + this.dir.x * side;
    }
    const k = 1 - Math.exp(-dt * rate);
    this.x += (tx - this.x) * k;
    this.z += (tz - this.z) * k;
    this.d += (td - this.d) * k;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const s = this.shake * this.shake * 9;
    this.pose(this.x + Math.sin(this.time * 61) * s, this.z + Math.cos(this.time * 47) * s, this.d);
  }
}
