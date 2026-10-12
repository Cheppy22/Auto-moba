import type { Content } from '../../sim';
import { LANE_CLOSE, LANE_LEAN } from './camera';

/** A finger or mouse must travel this far (CSS px) before a press becomes a drag (taps stay taps). */
const DRAG_PX = 8;
/** Zooming out this far past the lean-in distance sits back to the whole board. */
const SIT_BACK = LANE_LEAN * 1.12;

interface Path {
  /** World x, z of each point (board centre = origin) and the length up to it. */
  x: Float64Array;
  z: Float64Array;
  at: Float64Array;
  total: number;
  midX: number;
  midZ: number;
}

interface Ptr {
  x: number;
  y: number;
  /** Distance travelled since the press (CSS px). */
  moved: number;
}

/**
 * The lane camera of the board view: once a lane is leaned in on, a one-finger (or mouse) drag or a
 * shift-wheel slides the view along that lane at a fixed tilt and height, clamped to the lane's
 * ends; pinch or the wheel zooms between the lean-in distance and a closer limit, and zooming out
 * past the lean-in distance sits back to the whole board (the view fires `table-sitback` on the
 * canvas; the game clears its lane focus on it). Taps are left alone: a press only pans after it
 * travels `DRAG_PX`.
 */
export class LaneCam {
  private readonly paths: Path[] = [];
  private sel = -1;
  /** Distance along the selected lane (world units) and the zoom (fraction of the board distance). */
  private s = 0;
  zoom = LANE_LEAN;
  private readonly ptrs = new Map<number, Ptr>();
  private pinch = 0;
  private parked = false;
  private lastZoom = 0;
  private readonly lean = { x: 0, z: 0 };
  private readonly g0 = { x: 0, z: 0 };
  private readonly g1 = { x: 0, z: 0 };
  /** Half the board's width and length (sim point to world point). */
  private readonly hx: number;
  private readonly hz: number;

  constructor(
    content: Content,
    private readonly canvas: HTMLCanvasElement,
    /** The ground point (world x, z on the y = 0 plane) under a client position. */
    private readonly ground: (cx: number, cy: number, out: { x: number; z: number }) => boolean,
    /** World units per CSS pixel right now. */
    private readonly pxNow: () => number,
  ) {
    const map = content.map;
    const hx = map.size / 2;
    const hz = (map.length ?? map.size) / 2;
    this.hx = hx;
    this.hz = hz;
    for (const poly of Object.values(map.lanes)) {
      const n = poly.length;
      const p: Path = {
        x: new Float64Array(n),
        z: new Float64Array(n),
        at: new Float64Array(n),
        total: 0,
        midX: 0,
        midZ: 0,
      };
      for (let i = 0; i < n; i++) {
        p.x[i] = poly[i][0] - hx;
        p.z[i] = poly[i][1] - hz;
        if (i > 0) p.at[i] = p.at[i - 1] + Math.hypot(p.x[i] - p.x[i - 1], p.z[i] - p.z[i - 1]);
      }
      p.total = p.at[n - 1];
      this.point(p, p.total / 2, this.lean);
      p.midX = this.lean.x;
      p.midZ = this.lean.z;
      this.paths.push(p);
    }
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  dispose(): void {
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onDown);
    c.removeEventListener('pointermove', this.onMove);
    c.removeEventListener('pointerup', this.onUp);
    c.removeEventListener('pointercancel', this.onUp);
    c.removeEventListener('wheel', this.onWheel);
  }

  /** True while a finger or button is down on a leaned-in lane (the camera eases faster). */
  get active(): boolean {
    return this.sel >= 0 && this.ptrs.size > 0;
  }

  /**
   * The frame's lane focus (a sim point, the middle of the picked lane, or null): returns the
   * world point to lean in on, or null for the whole board.
   */
  update(focus: { x: number; y: number } | null): { x: number; z: number } | null {
    if (!focus) {
      this.sel = -1;
      this.parked = false;
      return null;
    }
    if (this.parked) return null;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.paths.length; i++) {
      const p = this.paths[i];
      const d = Math.hypot(p.midX - (focus.x - this.hx), p.midZ - (focus.y - this.hz));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best !== this.sel) {
      this.sel = best;
      this.s = this.paths[best].total / 2;
      this.zoom = LANE_LEAN;
    }
    if (this.zoom > LANE_LEAN && this.ptrs.size === 0 && performance.now() - this.lastZoom > 500)
      this.zoom = LANE_LEAN;
    this.point(this.paths[best], this.s, this.lean);
    return this.lean;
  }

  private point(p: Path, s: number, out: { x: number; z: number }): number {
    const n = p.at.length;
    let i = 1;
    while (i < n - 1 && p.at[i] < s) i++;
    const len = p.at[i] - p.at[i - 1] || 1;
    const f = Math.min(1, Math.max(0, (s - p.at[i - 1]) / len));
    out.x = p.x[i - 1] + (p.x[i] - p.x[i - 1]) * f;
    out.z = p.z[i - 1] + (p.z[i] - p.z[i - 1]) * f;
    return i;
  }

  /** Slides along the lane by a world displacement of the view (projected on the lane's direction). */
  private slide(wx: number, wz: number): void {
    const p = this.paths[this.sel];
    const i = this.point(p, this.s, this.g1);
    const len = p.at[i] - p.at[i - 1] || 1;
    const tx = (p.x[i] - p.x[i - 1]) / len;
    const tz = (p.z[i] - p.z[i - 1]) / len;
    this.s = Math.min(p.total, Math.max(0, this.s + wx * tx + wz * tz));
  }

  private zoomBy(f: number): void {
    const z = this.zoom * f;
    if (z > SIT_BACK) {
      this.sitBack();
      return;
    }
    // a little past the lean-in distance shows the pull; it springs back when the gesture ends
    this.zoom = Math.max(LANE_CLOSE, z);
    this.lastZoom = performance.now();
  }

  private sitBack(): void {
    this.parked = true;
    this.sel = -1;
    this.ptrs.clear();
    this.canvas.dispatchEvent(new Event('table-sitback'));
  }

  private readonly onDown = (e: PointerEvent): void => {
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, moved: 0 });
    if (this.sel < 0) return;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // a synthetic or already-released pointer cannot be captured; dragging still works
    }
    if (this.ptrs.size === 2) this.pinch = this.spread();
  };

  private readonly onMove = (e: PointerEvent): void => {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    const px = p.x;
    const py = p.y;
    p.moved += Math.hypot(e.clientX - px, e.clientY - py);
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.sel < 0) return;
    if (this.ptrs.size >= 2) {
      const d = this.spread();
      if (this.pinch > 0 && d > 0) this.zoomBy(this.pinch / d);
      this.pinch = d;
      return;
    }
    if (p.moved < DRAG_PX) return;
    // grab the board: the ground point under the finger stays under it (along the lane)
    if (this.ground(px, py, this.g0) && this.ground(e.clientX, e.clientY, this.g1))
      this.slide(this.g0.x - this.g1.x, this.g0.z - this.g1.z);
  };

  private readonly onUp = (e: PointerEvent): void => {
    this.ptrs.delete(e.pointerId);
    this.pinch = this.ptrs.size === 2 ? this.spread() : 0;
  };

  private readonly onWheel = (e: WheelEvent): void => {
    if (this.sel < 0) return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    if (e.shiftKey) {
      // shift-wheel scrolls along the lane: down / right moves toward Black's end
      const d = (Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX) * unit;
      const p = this.paths[this.sel];
      this.s = Math.min(p.total, Math.max(0, this.s + d * this.pxNow() * 1.5));
      return;
    }
    this.zoomBy(Math.exp(e.deltaY * unit * 0.0025));
  };

  private spread(): number {
    let ax = 0;
    let ay = 0;
    let k = 0;
    let d = 0;
    for (const p of this.ptrs.values()) {
      if (k === 0) {
        ax = p.x;
        ay = p.y;
      } else d = Math.hypot(p.x - ax, p.y - ay);
      if (++k === 2) break;
    }
    return d;
  }
}
