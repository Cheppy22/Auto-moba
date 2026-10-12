import {
  AdditiveBlending,
  type Camera,
  Color,
  type ColorRepresentation,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three';
import { PALETTE } from '../theme';
import { type Kit, ProgressRing } from './kit';

const EVENT_COLORS: Record<string, string> = {
  procession: '#f0b44c',
  parade: '#c4a8f0',
  well: '#6fb4d0',
  oni: '#d04a52',
};

const _m = new Matrix4();
const _p = new Vector3();
const _s = new Vector3();
const _c = new Color();
const _white = new Color('#ffffff');
const _up = new Vector3();
const _v = new Vector3();

/** Camera-facing health bars: every bar in the scene is two instanced quads. */
export class BarBatch {
  readonly group = new Group();
  private readonly back: InstancedMesh;
  private readonly fill: InstancedMesh;
  private readonly right = new Vector3();
  private readonly quat = new Quaternion();
  private n = 0;

  constructor(
    private kit: Kit,
    private cap = 360,
  ) {
    const geo = kit.geo('bar', () => new PlaneGeometry(1, 1));
    const mat = (opacity: number): MeshBasicMaterial =>
      kit.own(
        new MeshBasicMaterial({
          transparent: true,
          opacity,
          depthTest: false,
          depthWrite: false,
          fog: false,
        }),
      );
    this.back = new InstancedMesh(geo, mat(0.82), cap);
    this.fill = new InstancedMesh(geo, mat(1), cap);
    this.back.renderOrder = 50;
    this.fill.renderOrder = 51;
    for (const im of [this.back, this.fill]) {
      im.frustumCulled = false;
      im.count = 0;
      this.group.add(im);
    }
    _c.set('#07050b');
    for (let i = 0; i < cap; i++) this.back.setColorAt(i, _c);
  }

  begin(cam: Camera): void {
    this.n = 0;
    this.quat.copy(cam.quaternion);
    this.right.set(1, 0, 0).applyQuaternion(this.quat);
  }

  add(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    frac: number,
    color: ColorRepresentation,
  ): void {
    if (this.n >= this.cap) return;
    const f = Math.max(0, Math.min(1, frac));
    _m.compose(_p.set(x, y, z), this.quat, _s.set(w + h * 0.6, h * 1.5, 1));
    this.back.setMatrixAt(this.n, _m);
    const off = -(w * (1 - f)) / 2;
    _m.compose(
      _p.set(x + this.right.x * off, y + this.right.y * off, z + this.right.z * off),
      this.quat,
      _s.set(Math.max(0.01, w * f), h, 1),
    );
    this.fill.setMatrixAt(this.n, _m);
    this.fill.setColorAt(this.n, _c.set(color));
    this.n++;
  }

  end(): void {
    this.back.count = this.n;
    this.fill.count = this.n;
    this.back.instanceMatrix.needsUpdate = true;
    this.fill.instanceMatrix.needsUpdate = true;
    if (this.fill.instanceColor) this.fill.instanceColor.needsUpdate = true;
  }
}

/** A jungle event drawn on the ground: area, progress arc, light pillar and Oni slam warning. */
export class EventRing {
  readonly group = new Group();
  private readonly color: string;
  private readonly area: Mesh;
  private readonly edge: Mesh;
  private readonly dash: Mesh;
  private readonly progress: ProgressRing;
  private readonly pillar: Mesh;
  private readonly gem: Mesh;
  private readonly tele: Group;
  private readonly teleDisc: Mesh;
  private readonly teleRing: Mesh;

  constructor(kit: Kit, type: string, radius: number) {
    this.color = EVENT_COLORS[type] ?? PALETTE.spirit;
    // calm board: hairline edge, faint area, a short faint pillar
    this.area = kit.glowDisc(this.color, radius * 1.1, 0.16);
    this.area.position.y = 0.9;
    this.edge = kit.decalRing(this.color, radius, false, 0.7, true);
    this.edge.position.y = 1.0;
    this.dash = kit.decalRing(this.color, radius * 0.9, true, 0.3);
    this.dash.position.y = 1.05;
    this.progress = new ProgressRing(kit, radius * 1.05, radius * 1.075, this.color, 0.9);
    this.progress.mesh.position.y = 1.1;
    this.pillar = new Mesh(
      kit.geo('pillar', () => new CylinderGeometry(1, 1, 1, 20, 1, true).translate(0, 0.5, 0)),
      kit.own(
        new MeshBasicMaterial({
          map: kit.beamTexture(),
          color: this.color,
          transparent: true,
          opacity: 0.5,
          blending: AdditiveBlending,
          depthWrite: false,
          side: DoubleSide,
          fog: false,
        }),
      ),
    );
    this.pillar.scale.set(radius * 0.16, 60, radius * 0.16);
    this.gem = new Mesh(
      kit.geo('event-gem', () => new IcosahedronGeometry(1, 0).scale(1, 1.5, 1)),
      kit.basic(this.color),
    );
    this.gem.scale.setScalar(5.5);
    this.gem.position.y = 34;
    const halo = kit.glowSprite(this.color, 34, 0.4);
    halo.position.y = 34;
    this.tele = new Group();
    this.teleDisc = kit.glowDisc('#d04a52', 1, 0.6);
    this.teleRing = kit.decalRing('#ff6a6a', 1, false, 1);
    this.teleRing.position.y = 1.4;
    this.teleDisc.position.y = 1.3;
    this.tele.add(this.teleDisc, this.teleRing);
    this.group.add(
      this.area,
      this.edge,
      this.dash,
      this.progress.mesh,
      this.pillar,
      this.gem,
      halo,
      this.tele,
    );
  }

  update(
    time: number,
    warning: boolean,
    progress: number | undefined,
    team: string | null | undefined,
  ): void {
    const pulse = 0.5 + 0.5 * Math.sin(time * 6);
    (this.edge.material as MeshBasicMaterial).opacity = warning ? 0.3 + 0.5 * pulse : 0.75;
    (this.area.material as MeshBasicMaterial).opacity = warning ? 0.08 + 0.06 * pulse : 0.14;
    (this.pillar.material as MeshBasicMaterial).opacity = warning
      ? 0.18 + 0.14 * pulse
      : 0.38 + 0.12 * pulse;
    this.dash.rotation.y = time * 0.35;
    this.gem.rotation.y = time * 1.6;
    this.gem.position.y = 34 + Math.sin(time * 2.2) * 2.4;
    this.progress.set(!warning && progress !== undefined ? progress : 0);
    this.progress.material.color.set(
      team ? (team === 'A' ? PALETTE.teamA : PALETTE.teamB) : this.color,
    );
  }

  setTelegraph(wx: number, dy: number, wz: number, r: number, time: number, on: boolean): void {
    this.tele.visible = on;
    if (!on) return;
    const pulse = 0.5 + 0.5 * Math.sin(time * 9);
    this.tele.position.set(wx - this.group.position.x, dy, wz - this.group.position.z);
    this.teleDisc.scale.set(r * 2.2, 1, r * 2.2);
    this.teleRing.scale.set(r * 2, 1, r * 2);
    (this.teleDisc.material as MeshBasicMaterial).opacity = 0.35 + 0.35 * pulse;
  }
}
