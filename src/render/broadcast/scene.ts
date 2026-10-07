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
import { BarBatch, EventRing, StreakPool } from './fx';
import { hash, Kit, STONE, STONE_DARK } from './kit';
import {
  CampModel,
  GuardianModel,
  HERO_SCALE,
  HeroModel,
  KeeperModel,
  MINION_SCALE,
  MinionKit,
  ObeliskModel,
  sigilTexture,
  TowerModel,
} from './models';
import { VisualPhysics } from './physics';
import type { BroadcastFrame, NewEvents } from './types';

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const GOLD_BOLT = '#f0b44c';
const ONI_RED = '#9c2a2e';
const SHIELD = '#a9d0e0';
const SUN_OFFSET = new Vector3(-380, 760, 520);
const CHEST: Partial<Record<UnitKind, number>> = {
  hero: 14 * HERO_SCALE,
  minion: 7,
  tower: 24,
  guardian: 44,
  camp: 8,
};

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
  placed = false;
  readonly objects: Object3D[] = [];
  hero?: HeroModel;
  tower?: TowerModel;
  guardian?: GuardianModel;
  camp?: CampModel;
  obelisk?: ObeliskModel;
  keeper?: KeeperModel;

  constructor(
    readonly id: number,
    readonly kind: UnitKind,
    readonly defId: string,
    readonly team: string,
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
  private time = 0;
  private stamp = 0;
  private lastTick = -1;
  private cssW = 0;
  private cssH = 0;
  private barScale = 1;
  private readonly tmp = new Vector3();
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
    this.shadows = !coarse && Math.min(window.innerWidth, window.innerHeight) >= 640;
    const r = this.renderer;
    r.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    r.setClearColor(PALETTE.bg);
    r.shadowMap.enabled = this.shadows;
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);

    this.scene.background = new Color(PALETTE.bg);
    this.scene.fog = new FogExp2('#0d0b16', 0.00013);
    const sky = new HemisphereLight('#8f86d2', '#2a2038', 0.75);
    const sun = new DirectionalLight('#ffe2b8', 3.1);
    sun.position.copy(SUN_OFFSET);
    sun.castShadow = this.shadows;
    sun.shadow.mapSize.set(2048, 2048);
    const cam = sun.shadow.camera;
    cam.left = -700;
    cam.right = 700;
    cam.top = 700;
    cam.bottom = -700;
    cam.near = 200;
    cam.far = 1800;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.7;
    const rim = new DirectionalLight('#7a64d8', 0.9);
    rim.position.set(520, 300, -600);
    this.sun = sun;
    this.scene.add(sky, sun, sun.target, rim);

    this.arena = new Arena(this.kit, content, this.shadows);
    this.rig = new CameraRig(canvas, content.map.size * 0.6);
    this.minions = new MinionKit(this.kit);
    this.physics = new VisualPhysics(this.kit);
    this.bars = new BarBatch(this.kit);
    this.streaks = new StreakPool(this.kit);
    this.unitGroup.add(this.minions.group);
    this.scene.add(
      this.arena.group,
      this.unitGroup,
      this.physics.group,
      this.streaks.group,
      this.bars.group,
    );
    this.resize();
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
    this.time += dt;
    if (snap.tick < this.lastTick) this.reset();
    this.lastTick = snap.tick;
    this.stamp++;

    this.byId.clear();
    for (const u of snap.units) this.byId.set(u.id, u);
    this.arena.sync(snap);

    const follow = this.followPoint(frame);
    this.rig.update(frame, this.half, follow);
    const camera = this.rig.camera;
    const dist = this.rig.distance;
    this.kit.inkWidth.value = MathUtils.clamp(dist * 0.0032, 0.4, 2.6);
    this.barScale = MathUtils.clamp(dist / 700, 0.8, 1.5);
    this.aimSun();

    this.handleEvents(events);
    this.bars.begin(camera);
    this.minions.begin();
    this.syncUnits(snap, frame.alpha, dt);
    this.minions.end();
    this.bars.end();
    this.syncRings(snap);
    this.streaks.update(dt);
    this.physics.update(frame.dtMs);
    this.arena.update(this.time, camera.position);
    this.renderer.render(this.scene, camera);
  }

  /** Keeps the shadow frustum on whatever the camera is looking at. */
  private aimSun(): void {
    const f = this.rig.focus;
    const snapTo = (v: number): number => Math.round(v / 8) * 8;
    this.sun.position.set(snapTo(f.x) + SUN_OFFSET.x, SUN_OFFSET.y, snapTo(f.z) + SUN_OFFSET.z);
    this.sun.target.position.set(snapTo(f.x), 0, snapTo(f.z));
    if (!this.shadows) return;
    const reach = MathUtils.clamp(this.rig.distance * 0.75, 260, 720);
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

  private create(u: SnapUnit): UnitView {
    const v = new UnitView(u.id, u.kind, u.defId, u.team);
    const kit = this.kit;
    const color = teamColor(u.team);
    switch (u.kind) {
      case 'hero': {
        const def = this.content.heroById.get(u.defId);
        if (!def) break;
        const m = new HeroModel(kit, {
          hue: def.sigil.hue,
          ranged: def.attackKind === 'ranged',
          team: u.team,
          sigilTexture: sigilTexture(kit, u.defId, def.sigil, u.team),
        });
        v.hero = m;
        v.objects.push(m.root, m.markers);
        break;
      }
      case 'tower':
        v.tower = new TowerModel(kit, color);
        v.objects.push(v.tower.root);
        break;
      case 'guardian':
        v.guardian = new GuardianModel(kit, color);
        v.objects.push(v.guardian.root);
        break;
      case 'camp':
        v.camp = new CampModel(kit, u.defId, u.maxHp > 900);
        v.objects.push(v.camp.root);
        break;
      case 'minion':
        if (u.team === 'neutral' && u.maxHp >= 2000) {
          v.camp = new CampModel(kit, u.defId, true, ONI_RED, 2.5);
          v.objects.push(v.camp.root);
        }
        break;
      case 'obelisk':
        v.obelisk = new ObeliskModel(kit);
        v.objects.push(v.obelisk.root);
        break;
      case 'keeper':
        v.keeper = new KeeperModel(kit);
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
    for (const u of snap.units) {
      if (!u.alive && u.kind !== 'hero') continue;
      let v = this.views.get(u.id);
      if (v && (v.kind !== u.kind || v.defId !== u.defId || v.team !== u.team)) {
        this.drop(v);
        v = undefined;
      }
      if (!v) {
        v = this.create(u);
        this.views.set(u.id, v);
      }
      v.stamp = this.stamp;
      this.updateUnit(v, u, alpha, dt, snap.tick);
    }
    this.stale.length = 0;
    for (const v of this.views.values()) if (v.stamp !== this.stamp) this.stale.push(v);
    for (const v of this.stale) this.drop(v);
  }

  private updateUnit(v: UnitView, u: SnapUnit, alpha: number, dt: number, tick: number): void {
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
        m.place(x, z, v.yaw);
        m.animate(
          { yaw: v.yaw, move: v.move, phase: v.phase, lunge, flinch: v.flinch, time },
          this.rig.camera.quaternion,
          {
            tick,
            time,
            isPlayer: u.isPlayer,
            recalling: u.recalling,
            curse: u.curse,
            holy: u.holy,
          },
        );
        this.bars.add(x, 60, z, 24 * k, 3.4 * k, frac, col);
        if (u.shield > 0)
          this.bars.add(x, 60 + 4.4 * k, z, 24 * k, 2 * k, Math.min(1, u.shield / u.maxHp), SHIELD);
        break;
      }
      case 'minion': {
        if (v.camp) {
          v.camp.root.position.set(x, 0, z);
          v.camp.root.rotation.y = v.yaw;
          v.camp.animate(time, lunge);
          this.bars.add(x, 62, z, 40 * k, 4.4 * k, frac, ONI_RED);
          break;
        }
        const neutral = u.team === 'neutral';
        const scale =
          (neutral ? (u.maxHp < 400 ? 1.1 : u.maxHp < 800 ? 1.5 : 2) : 1) * MINION_SCALE;
        const bob = Math.abs(Math.sin(v.phase)) * 1.3 * v.move * scale;
        this.minions.add(
          u.team,
          u.range > 40,
          x,
          bob,
          z,
          v.yaw,
          v.move * 0.12 + lunge * 0.35 - v.flinch * 0.3,
          scale,
        );
        if (u.hp < u.maxHp)
          this.bars.add(x, 14 * scale, z, 9 * k, 1.8 * k, frac, neutral ? PALETTE.neutral : col);
        break;
      }
      case 'tower': {
        v.tower?.root.position.set(x, 0, z);
        v.tower?.animate(time, lunge, frac);
        this.bars.add(x, 56, z, 28 * k, 3.6 * k, frac, col);
        break;
      }
      case 'guardian': {
        const g = v.guardian;
        if (!g) return;
        g.root.position.set(x, 0, z);
        g.root.rotation.y = v.yaw;
        g.animate(time, lunge, frac);
        this.bars.add(x, 92, z, 52 * k, 4.6 * k, frac, col);
        break;
      }
      case 'camp': {
        const c = v.camp;
        if (!c) return;
        c.root.position.set(x, 0, z);
        c.root.rotation.y = v.yaw;
        c.animate(time, lunge);
        if (u.hp < u.maxHp)
          this.bars.add(x, u.maxHp > 900 ? 38 : 26, z, 15 * k, 2.4 * k, frac, PALETTE.camp);
        break;
      }
      case 'obelisk':
        v.obelisk?.root.position.set(x, 0, z);
        v.obelisk?.animate(time, u.claim);
        break;
      case 'keeper':
        v.keeper?.root.position.set(x, 0, z);
        v.keeper?.animate(time);
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
        this.from.set(a.x, CHEST[p.srcKind] ?? 10, a.z);
        this.to.set(b.x, CHEST[p.tgtKind] ?? 10, b.z);
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
        if (p.kind === 'hero') {
          const v = this.views.get(p.id);
          const killer = this.views.get(p.killer);
          if (v?.hero?.root.visible) {
            this.physics.ragdoll(
              v.hero.pieces(),
              killer ? this.tmp.set(killer.x, 0, killer.z) : null,
            );
            if (this.focusNear(x, z, 420)) this.rig.kick(0.22);
          }
        } else if (p.kind === 'minion') {
          this.physics.paperBurst(x, 4, z, teamColor(p.team));
        } else if (p.kind === 'camp') {
          this.physics.paperBurst(x, 6, z, PALETTE.camp);
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
        ring.group.position.set(e.x - this.half, 0, e.y - this.half);
        this.rings.set(e.id, ring);
        this.unitGroup.add(ring.group);
      }
      const warn = e.phase === 'warning';
      ring.update(this.time, warn, e.progress, e.team);
      const t = e.telegraph;
      ring.setTelegraph(
        t ? t.x - this.half : 0,
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
