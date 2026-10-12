import type { TableCamera } from './camera';

/** A press must travel this far (CSS px) before it becomes a drag (taps stay taps). */
const DRAG_PX = 8;
/** Two-finger gestures lock to pinch-and-twist or to tilt after this much movement. */
const PINCH_LOCK_PX = 10;
const TWIST_LOCK = 0.12;
const TILT_LOCK_PX = 14;
/** Radians of yaw and tilt per CSS pixel of a turning mouse drag, and of a two-finger tilt drag. */
const YAW_PER_PX = 0.0065;
const TILT_PER_PX = 0.0045;
/** Q / E turn the board by this much. */
const KEY_YAW = Math.PI / 12;
/** Inertia: how fast a flung pan or turn slows down (per second), and the slowest worth keeping. */
const DECAY = 4.2;
const MIN_PAN_SPEED = 40;
const MIN_YAW_SPEED = 0.05;

/** What the controls drive. `kind` says which gesture took control (the view leaves Auto / Follow). */
export interface Rig {
  readonly cam: TableCamera;
  /** The ground point (world x, z) under a client position, on the plane at the target's height. */
  ground(clientX: number, clientY: number, out: { x: number; z: number }): boolean;
  /** The camera mode now: the lane camera handles its own gestures. */
  mode(): 'free' | 'auto' | 'follow' | 'lane';
  /** A gesture started in Auto or Follow: pan always leaves them, zoom and turn leave Auto only. */
  manual(kind: 'pan' | 'zoom' | 'turn'): void;
  /** Follow mode: zoom the follow distance by a factor. */
  followZoom(f: number): void;
}

interface Ptr {
  x: number;
  y: number;
  sx: number;
  sy: number;
  moved: number;
  /** A mouse drag that turns (right button, middle button, or Ctrl / Alt held). */
  turn: boolean;
}

/**
 * The free camera's gestures. Touch: one finger pans (the ground under it stays under it), two
 * fingers pinch to zoom and twist to turn, or drag up and down together to tilt. Mouse: left drag
 * pans, the wheel zooms toward the pointer, right drag (or Ctrl / Alt drag) turns and tilts. Q and E
 * turn. A flung pan or turn coasts to a stop. Presses shorter than `DRAG_PX` are left to the tap
 * handlers; `gestured` tells them the last press was a drag or a pinch.
 */
export class FreeControls {
  private readonly ptrs = new Map<number, Ptr>();
  /** Two-finger state: lock ('pinch' zooms, twists and pans; 'tilt' only tilts) and the last frame. */
  private lock: 'pinch' | 'tilt' | null = null;
  private last2 = { cx: 0, cy: 0, dist: 0, ang: 0, ay: 0, by: 0 };
  private acc = { dist: 0, ang: 0, tilt: 0 };
  /** A finger of a two-finger gesture moved since the last frame. */
  private moved2 = false;
  /** The last press sequence moved the camera (or used two fingers): not a tap. */
  gestured = false;
  private readonly vel = { x: 0, z: 0, yaw: 0 };
  private lastMove = 0;
  private readonly g0 = { x: 0, z: 0 };
  private readonly g1 = { x: 0, z: 0 };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly rig: Rig,
  ) {
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.onMenu);
    window.addEventListener('keydown', this.onKey);
  }

  dispose(): void {
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onDown);
    c.removeEventListener('pointermove', this.onMove);
    c.removeEventListener('pointerup', this.onUp);
    c.removeEventListener('pointercancel', this.onUp);
    c.removeEventListener('wheel', this.onWheel);
    c.removeEventListener('contextmenu', this.onMenu);
    window.removeEventListener('keydown', this.onKey);
  }

  /** True while a finger or button is down and moving the camera (the camera eases faster). */
  get active(): boolean {
    return this.ptrs.size > 0 && this.gestured;
  }

  /** Applies the two-finger gesture's movement since the last frame; called every frame. */
  frame(): void {
    if (this.moved2 && this.ptrs.size >= 2 && !this.off) this.twoFinger();
    this.moved2 = false;
  }

  /** Coasting after a fling; called every frame. */
  tick(dt: number): void {
    if (this.ptrs.size > 0 || this.rig.mode() !== 'free') {
      if (this.ptrs.size === 0) this.stop();
      return;
    }
    const k = Math.exp(-dt * DECAY);
    if (Math.hypot(this.vel.x, this.vel.z) > MIN_PAN_SPEED) {
      this.rig.cam.shift(this.vel.x * dt, this.vel.z * dt);
      this.vel.x *= k;
      this.vel.z *= k;
    } else this.vel.x = this.vel.z = 0;
    if (Math.abs(this.vel.yaw) > MIN_YAW_SPEED) {
      this.rig.cam.goal.yaw += this.vel.yaw * dt;
      this.vel.yaw *= k;
    } else this.vel.yaw = 0;
  }

  private stop(): void {
    this.vel.x = this.vel.z = this.vel.yaw = 0;
  }

  /** The lane camera owns the gestures while a lane is leaned in on. */
  private get off(): boolean {
    return this.rig.mode() === 'lane';
  }

  /** Takes control for a gesture; false when the current mode keeps it (Follow pans). */
  private take(kind: 'pan' | 'zoom' | 'turn'): void {
    const m = this.rig.mode();
    if (m === 'auto' || (m === 'follow' && kind === 'pan')) this.rig.manual(kind);
  }

  private readonly onDown = (e: PointerEvent): void => {
    if (this.ptrs.size === 0) {
      this.gestured = false;
      this.stop();
    }
    const turn =
      e.pointerType === 'mouse' && (e.button === 2 || e.button === 1 || e.ctrlKey || e.altKey);
    this.ptrs.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      sx: e.clientX,
      sy: e.clientY,
      moved: 0,
      turn,
    });
    if (this.ptrs.size >= 2) {
      this.gestured = true;
      this.lock = null;
      this.acc = { dist: 0, ang: 0, tilt: 0 };
      this.snap2();
    }
    if (this.off) return;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // a synthetic or already-released pointer cannot be captured; dragging still works
    }
  };

  private readonly onMove = (e: PointerEvent): void => {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    const px = p.x;
    const py = p.y;
    p.moved += Math.hypot(e.clientX - px, e.clientY - py);
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.off) return;
    // two fingers are read once a frame (each finger's move arrives as its own event)
    if (this.ptrs.size >= 2) {
      this.moved2 = true;
      return;
    }
    if (p.moved < DRAG_PX) return;
    const now = performance.now();
    const dt = Math.max(0.008, (now - this.lastMove) / 1000);
    this.lastMove = now;
    const cam = this.rig.cam;
    if (p.turn) {
      if (!this.gestured) this.take('turn');
      this.gestured = true;
      const dYaw = -(e.clientX - px) * YAW_PER_PX;
      cam.goal.yaw += dYaw;
      cam.goal.tilt += (e.clientY - py) * TILT_PER_PX;
      this.vel.yaw = this.vel.yaw * 0.5 + (dYaw / dt) * 0.5;
      return;
    }
    if (!this.gestured) this.take('pan');
    this.gestured = true;
    // grab the board: the ground point under the finger stays under it
    if (this.rig.ground(px, py, this.g0) && this.rig.ground(e.clientX, e.clientY, this.g1)) {
      const dx = this.g0.x - this.g1.x;
      const dz = this.g0.z - this.g1.z;
      cam.shift(dx, dz);
      this.vel.x = this.vel.x * 0.5 + (dx / dt) * 0.5;
      this.vel.z = this.vel.z * 0.5 + (dz / dt) * 0.5;
    }
  };

  private readonly onUp = (e: PointerEvent): void => {
    const p = this.ptrs.get(e.pointerId);
    this.ptrs.delete(e.pointerId);
    if (this.ptrs.size >= 2) this.snap2();
    // a lifted second finger leaves a one-finger pan that must not jump
    if (this.ptrs.size === 1) {
      this.lock = null;
      for (const q of this.ptrs.values()) q.moved = DRAG_PX;
      this.stop();
    }
    // a fling only counts if the finger was still moving when it lifted
    if (this.ptrs.size === 0 && (!p || performance.now() - this.lastMove > 90)) this.stop();
  };

  private readonly onWheel = (e: WheelEvent): void => {
    if (this.off) return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const f = Math.exp(e.deltaY * unit * 0.0016);
    this.zoomAt(f, e.clientX, e.clientY);
  };

  private readonly onMenu = (e: Event): void => e.preventDefault();

  private readonly onKey = (e: KeyboardEvent): void => {
    if (this.off || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const k = e.key.toLowerCase();
    if (k !== 'q' && k !== 'e') return;
    this.take('turn');
    this.rig.cam.goal.yaw += k === 'q' ? KEY_YAW : -KEY_YAW;
  };

  /** Zooms by a factor, keeping the ground under a client point in place (Follow: its distance). */
  private zoomAt(f: number, cx: number, cy: number): void {
    this.take('zoom');
    if (this.rig.mode() === 'follow') {
      this.rig.followZoom(f);
      return;
    }
    const cam = this.rig.cam;
    const g = cam.goal;
    const d = Math.min(cam.maxD, Math.max(cam.minD, g.d * f));
    if (this.rig.ground(cx, cy, this.g0)) {
      const k = d / g.d;
      g.x = this.g0.x + (g.x - this.g0.x) * k;
      g.z = this.g0.z + (g.z - this.g0.z) * k;
    }
    g.d = d;
  }

  /** Centre, spread, angle and heights of the first two fingers. */
  private two(): { cx: number; cy: number; dist: number; ang: number; ay: number; by: number } {
    const it = this.ptrs.values();
    const a = it.next().value as Ptr;
    const b = it.next().value as Ptr;
    return {
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
      dist: Math.hypot(b.x - a.x, b.y - a.y),
      ang: Math.atan2(b.y - a.y, b.x - a.x),
      ay: a.y,
      by: b.y,
    };
  }

  private snap2(): void {
    this.last2 = this.two();
  }

  private twoFinger(): void {
    const now = this.two();
    const was = this.last2;
    this.last2 = now;
    const dDist = now.dist - was.dist;
    const dAng = Math.atan2(Math.sin(now.ang - was.ang), Math.cos(now.ang - was.ang));
    const dyA = now.ay - was.ay;
    const dyB = now.by - was.by;
    if (!this.lock) {
      this.acc.dist += dDist;
      this.acc.ang += dAng;
      // both fingers moving up or down together, about as far, is a tilt
      if (Math.sign(dyA) === Math.sign(dyB) && Math.abs(dyA - dyB) < 6)
        this.acc.tilt += (dyA + dyB) / 2;
      if (Math.abs(this.acc.dist) > PINCH_LOCK_PX || Math.abs(this.acc.ang) > TWIST_LOCK)
        this.lock = 'pinch';
      else if (Math.abs(this.acc.tilt) > TILT_LOCK_PX) this.lock = 'tilt';
      if (!this.lock) return;
      this.take(this.lock === 'tilt' ? 'turn' : 'zoom');
    }
    const cam = this.rig.cam;
    if (this.lock === 'tilt') {
      cam.goal.tilt += ((dyA + dyB) / 2) * TILT_PER_PX;
      return;
    }
    // pinch: zoom about the centre, twist turns, the centre drags the board along
    if (now.dist > 0 && was.dist > 0) this.zoomAt(was.dist / now.dist, now.cx, now.cy);
    cam.goal.yaw += dAng;
    if (this.rig.mode() === 'free') {
      if (this.rig.ground(was.cx, was.cy, this.g0) && this.rig.ground(now.cx, now.cy, this.g1))
        cam.shift(this.g0.x - this.g1.x, this.g0.z - this.g1.z);
    }
  }
}
