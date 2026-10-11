import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { Content } from '../../sim';
import type { Orient } from './board';

/** Screen space the HUD covers, in CSS pixels; the board is fitted inside the rest. */
interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const FOV = 28;
/** How much closer the camera sits when it leans in on a piece. */
const LEAN = 0.42;

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
  private readonly dir = new Vector3();
  private el = 0.6;
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
  private readonly tmp = new Vector3();
  private readonly right = new Vector3();
  private readonly fwd = new Vector3();
  /** Half the board size (clamps for the lean-in). */
  private readonly half: number;

  constructor(content: Content, topY: number) {
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
          add(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n, map.walk.lane);
      }
    for (const [x, y] of Object.values(map.bases)) add(x, y, map.walk.base);
  }

  private insets(w: number, h: number): Insets {
    if (h > w) return { top: 66, bottom: 126, left: 0, right: 0 };
    if (h < 520) return { top: 54, bottom: 64, left: 58, right: 58 };
    return { top: 64, bottom: 84, left: 84, right: 84 };
  }

  /** Re-fits the whole-board pose for a canvas of w×h CSS pixels. */
  fit(w: number, h: number): void {
    const cam = this.camera;
    cam.aspect = w / h;
    cam.fov = FOV;
    cam.updateProjectionMatrix();
    this.cssH = h;
    this.orient = h > w ? 'portrait' : 'landscape';
    this.el = MathUtils.degToRad(h > w ? 30 : h < 520 ? 31 : 38);
    // portrait: the camera sits behind White's corner; landscape: behind the Right lane's corner
    if (this.orient === 'portrait') this.dir.set(-Math.SQRT1_2, 0, Math.SQRT1_2);
    else this.dir.set(Math.SQRT1_2, 0, Math.SQRT1_2);
    const ins = this.insets(w, h);
    const sx0 = -1 + (2 * ins.left) / w;
    const sx1 = 1 - (2 * ins.right) / w;
    const sy0 = -1 + (2 * ins.bottom) / h;
    const sy1 = 1 - (2 * ins.top) / h;
    const tanV = Math.tan(MathUtils.degToRad(FOV / 2));
    const tanH = tanV * cam.aspect;
    let x = 0;
    let z = 0;
    let d = 7000;
    for (let it = 0; it < 48; it++) {
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

  /** Eases toward the whole-board pose, or the lean-in pose on `lean` (world x, z). */
  update(dt: number, lean: { x: number; z: number } | null): void {
    this.time += dt;
    let tx = this.boardX;
    let tz = this.boardZ;
    let td = this.boardD;
    if (lean) {
      const lim = this.half * 0.62;
      tx = MathUtils.clamp(lean.x, -lim, lim);
      tz = MathUtils.clamp(lean.z, -lim, lim);
      td = this.boardD * LEAN;
    }
    const k = 1 - Math.exp(-dt * 3.2);
    this.x += (tx - this.x) * k;
    this.z += (tz - this.z) * k;
    this.d += (td - this.d) * k;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const s = this.shake * this.shake * 9;
    this.pose(this.x + Math.sin(this.time * 61) * s, this.z + Math.cos(this.time * 47) * s, this.d);
  }
}
