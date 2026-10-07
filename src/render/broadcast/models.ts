import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  type ColorRepresentation,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  PlaneGeometry,
  Quaternion,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Sprite,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { drawSigil, type SigilSpec } from '../sigils';
import { PALETTE, teamColor } from '../theme';
import {
  type Bit,
  BRASS,
  hash,
  INK,
  type Kit,
  LACQUER,
  PAPER,
  type Piece,
  ProgressRing,
  put,
  SKIN,
  STONE,
  STONE_DARK,
} from './kit';

const TAU = Math.PI * 2;
const Y_AXIS = new Vector3(0, 1, 0);
const X_AXIS = new Vector3(1, 0, 0);
const WHITE = new Color('#ffffff');
const RAGE = new Color('#ff3b3b');

/** Heroes are drawn slightly larger than their sim footprint so they read from the skycam. */
export const HERO_SCALE = 1.3;
export const MINION_SCALE = 1.25;

function tint(geometry: BufferGeometry, color: ColorRepresentation): BufferGeometry {
  const c = new Color(color);
  const n = geometry.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new Float32BufferAttribute(arr, 3));
  return geometry;
}

function lathe(points: [number, number][], seg = 14): LatheGeometry {
  return new LatheGeometry(
    points.map(([r, y]) => new Vector2(r, y)),
    seg,
  );
}

/** A tinted, translated copy for merging into one vertex-colour mesh. */
function bit(geo: BufferGeometry, color: ColorRepresentation, x = 0, y = 0, z = 0): BufferGeometry {
  return tint(geo, color).translate(x, y, z);
}

/* -------------------------------------------------------------------------- */
/* Heroes                                                                     */
/* -------------------------------------------------------------------------- */

export interface HeroLook {
  hue: number;
  ranged: boolean;
  team: string;
  sigilTexture: CanvasTexture;
}

export interface HeroPose {
  yaw: number;
  move: number;
  phase: number;
  lunge: number;
  flinch: number;
  time: number;
}

export interface HeroMarks {
  tick: number;
  time: number;
  isPlayer: boolean;
  recalling: boolean;
  curse: boolean;
  holy: boolean;
}

export function sigilTexture(
  kit: Kit,
  defId: string,
  spec: SigilSpec,
  team: string,
): CanvasTexture {
  return kit.texture(`sigil:${defId}:${team}`, 256, 256, (g) => {
    drawSigil(g, 128, 128, 120, spec, teamColor(team), true);
  });
}

/** A robed figure with a team banner, a weapon and a floating sigil disc. */
export class HeroModel {
  readonly root = new Group();
  /** Ground markers (rings, auras): positioned with the root but never yawed. */
  readonly markers = new Group();
  private readonly figure = new Group();
  private readonly body = new Group();
  private readonly head = new Group();
  private readonly sigil = new Group();
  private readonly arm = new Group();
  private readonly cloth: MeshToonMaterial;
  private readonly orb: MeshToonMaterial | null = null;
  private you: Group | null = null;
  private recall: Group | null = null;
  private curse: Group | null = null;
  private halo: Mesh | null = null;
  private readonly seed: number;
  private readonly melee: boolean;
  private readonly inv = new Quaternion();

  constructor(
    private kit: Kit,
    look: HeroLook,
  ) {
    this.seed = look.hue;
    this.melee = !look.ranged;
    const team = teamColor(look.team);
    const id = `${look.hue}:${look.team}:${look.ranged}`;
    const robe = new Color().setHSL(look.hue / 360, 0.5, 0.34).lerp(new Color(team), 0.2);
    const trim = new Color().setHSL(look.hue / 360, 0.55, 0.52);
    const teamCloth = new Color(team).lerp(WHITE, 0.12);
    this.cloth = kit.uniqueVertexToon();

    const solid = (key: string, bits: () => Bit[], k = 0.8): Mesh =>
      kit.solid(`hero-${key}:${id}`, bits, k, this.cloth);

    this.body.add(
      solid(
        'body',
        () => [
          {
            geo: lathe(
              [
                [0.01, -8],
                [7.0, -7.8],
                [7.2, -6.4],
                [6.0, -1],
                [4.6, 3.5],
                [4.1, 7],
                [3.3, 8.2],
                [0.01, 8.6],
              ],
              16,
            ),
            color: robe,
          },
          {
            geo: new SphereGeometry(4.9, 14, 8),
            color: trim,
            at: [0, 6.2, 0],
            scale: [1, 0.42, 0.9],
          },
          {
            geo: new TorusGeometry(5.2, 1.2, 8, 18),
            color: teamCloth,
            at: [0, 0.4, 0],
            rot: [Math.PI / 2, 0, 0],
          },
          {
            geo: new BoxGeometry(1.8, 5.4, 0.5),
            color: teamCloth,
            at: [0, -2.8, -5.4],
            rot: [0.12, 0, 0],
          },
        ],
        0.9,
      ),
    );
    this.body.position.set(0, 8, 0);
    this.figure.add(this.body);

    this.head.add(
      solid('head', () => {
        const bits: Bit[] = [
          { geo: new SphereGeometry(4.1, 16, 12), color: SKIN },
          { geo: new SphereGeometry(0.5, 6, 5), color: INK, at: [-1.4, 0.3, 3.7] },
          { geo: new SphereGeometry(0.5, 6, 5), color: INK, at: [1.4, 0.3, 3.7] },
        ];
        if (this.melee)
          bits.push(
            { geo: new ConeGeometry(8.6, 4.2, 14), color: '#1c1722', at: [0, 3.7, 0] },
            {
              geo: new TorusGeometry(8.2, 0.45, 5, 20),
              color: team,
              at: [0, 1.7, 0],
              rot: [Math.PI / 2, 0, 0],
            },
          );
        else
          bits.push(
            {
              geo: new SphereGeometry(4.9, 14, 10, 0, TAU, 0, 2.1),
              color: robe,
              at: [0, 0.4, -0.4],
            },
            { geo: new ConeGeometry(1.4, 4.8, 5), color: trim, at: [0, 5.3, -0.4] },
          );
        return bits;
      }),
    );
    this.head.position.set(0, 20.4, 0);
    this.figure.add(this.head);

    this.arm.position.set(5.6, 13.2, 1);
    this.figure.add(this.arm);
    if (this.melee) {
      this.arm.add(
        solid(
          'sword',
          () => [
            {
              geo: new CylinderGeometry(0.6, 0.6, 3.6, 6),
              color: LACQUER,
              at: [0, -1, 1.4],
              rot: [Math.PI / 2, 0, 0],
            },
            { geo: new BoxGeometry(3.4, 0.6, 0.9), color: BRASS, at: [0, -1, 3.2] },
            { geo: new BoxGeometry(1, 0.55, 12), color: '#dfe5ea', at: [0, -1, 9.4] },
          ],
          0.6,
        ),
      );
      this.arm.rotation.x = 0.35;
    } else {
      this.arm.add(
        solid(
          'staff',
          () => [{ geo: new CylinderGeometry(0.55, 0.65, 27, 6), color: LACQUER, at: [0, 2, 1.2] }],
          0.6,
        ),
      );
      const glow = new Color().setHSL(look.hue / 360, 0.8, 0.62);
      this.orb = kit.uniqueToon(glow, glow, 0.9);
      put(
        this.arm,
        kit.part('hero-orb', () => new SphereGeometry(2.3, 12, 9), this.orb, 0.6),
        0,
        16,
        1.2,
      );
      put(this.arm, kit.glowSprite(glow, 13, 0.6), 0, 16, 1.2);
      this.arm.rotation.x = 0.12;
    }

    const disc = new Mesh(
      kit.geo('hero-sigil', () => new PlaneGeometry(14, 14)),
      kit.own(
        new MeshBasicMaterial({
          map: look.sigilTexture,
          transparent: true,
          fog: false,
          alphaTest: 0.02,
          side: DoubleSide,
        }),
      ),
    );
    disc.renderOrder = 20;
    put(this.sigil, disc);
    put(
      this.sigil,
      new Mesh(
        kit.geo('hero-sigil-ring', () => new TorusGeometry(7.1, 0.6, 6, 32)),
        kit.basic(BRASS),
      ),
      0,
      0,
      -0.2,
    );
    this.sigil.position.set(0, 39, 0);

    this.root.add(this.figure, this.sigil);
    this.root.scale.setScalar(HERO_SCALE);

    const ring = kit.decalRing(team, 15, false, 0.85);
    ring.position.y = 0.9;
    this.markers.add(kit.blob(12, 0.6), ring);
  }

  place(x: number, z: number, yaw: number): void {
    this.root.position.set(x, 0, z);
    this.markers.position.set(x, 0, z);
    this.root.rotation.y = yaw;
  }

  setVisible(v: boolean): void {
    this.root.visible = v;
    this.markers.visible = v;
  }

  /** Parts the ragdoll takes with it. */
  pieces(): Piece[] {
    this.root.updateWorldMatrix(true, true);
    return [
      { object: this.body, radius: 5.8 * HERO_SCALE, lie: true },
      { object: this.head, radius: 3.6 * HERO_SCALE, lie: false },
      { object: this.sigil, radius: 4 * HERO_SCALE, lie: false },
    ];
  }

  animate(p: HeroPose, camQuat: Quaternion, marks: HeroMarks): void {
    const bob = Math.abs(Math.sin(p.phase)) * 1.7 * p.move;
    const swing = Math.sin(p.phase);
    const f = this.figure;
    const lunge = this.melee ? p.lunge * 4.4 : -p.lunge * 1.2;
    f.position.set(0, bob, lunge - p.flinch * 2.4);
    f.rotation.set(
      p.move * 0.1 + p.lunge * (this.melee ? 0.4 : -0.12) - p.flinch * 0.42,
      0,
      swing * 0.06 * p.move,
    );
    const breathe = 1 + Math.sin(p.time * 2.2 + this.seed) * 0.014;
    f.scale.set(1 + p.flinch * 0.06, breathe - p.flinch * 0.07, 1 + p.flinch * 0.06);
    this.head.position.y = 20.4 + Math.sin(p.time * 2.2 + this.seed + 0.6) * 0.25;
    this.arm.rotation.x =
      (this.melee ? 0.35 : 0.12) - p.lunge * (this.melee ? 1.9 : 0.6) + swing * 0.18 * p.move;
    this.sigil.position.y = 39 + Math.sin(p.time * 1.9 + this.seed) * 1.1;
    this.inv.setFromAxisAngle(Y_AXIS, -this.root.rotation.y).multiply(camQuat);
    this.sigil.quaternion.copy(this.inv);
    if (this.orb)
      this.orb.emissiveIntensity = 0.7 + p.lunge * 1.2 + Math.sin(p.time * 4 + this.seed) * 0.12;
    this.cloth.emissive.setScalar(p.flinch * 0.6);
    this.updateMarks(marks);
  }

  private updateMarks(k: HeroMarks): void {
    const kit = this.kit;
    if (k.isPlayer && !this.you) {
      const you = new Group();
      const ring = kit.decalRing(PALETTE.gold, 20, false, 1);
      ring.position.y = 1.1;
      const dash = kit.decalRing('#fff1b8', 26, true, 0.85);
      dash.position.y = 1.2;
      const arrow = kit.part(
        'you-arrow',
        () => new ConeGeometry(3.4, 7.5, 4).rotateX(Math.PI),
        kit.toon(PALETTE.gold, PALETTE.gold, 0.9),
        0.7,
      );
      arrow.castShadow = false;
      you.add(ring, dash, arrow);
      you.userData = { dash, arrow };
      this.markers.add(you);
      this.you = you;
    }
    if (this.you) {
      this.you.visible = k.isPlayer;
      const { dash, arrow } = this.you.userData as { dash: Mesh; arrow: Mesh };
      dash.rotation.y = k.time * 0.6;
      arrow.position.y = 58 + Math.sin(k.time * 3) * 2;
      arrow.rotation.y = k.time * 1.7;
    }
    if (k.recalling && !this.recall) {
      const recall = new Group();
      const ring = kit.decalRing(PALETTE.gold, 1, false, 1);
      ring.position.y = 1;
      const col = new Mesh(
        kit.geo('recall-col', () =>
          new CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0),
        ),
        kit.own(
          new MeshBasicMaterial({
            map: kit.beamTexture(),
            color: PALETTE.gold,
            transparent: true,
            opacity: 0.6,
            blending: AdditiveBlending,
            depthWrite: false,
            side: DoubleSide,
            fog: false,
          }),
        ),
      );
      recall.add(ring, col);
      recall.userData = { ring, col };
      this.markers.add(recall);
      this.recall = recall;
    }
    if (this.recall) {
      this.recall.visible = k.recalling;
      if (k.recalling) {
        const { ring, col } = this.recall.userData as { ring: Mesh; col: Mesh };
        const t = (k.tick % 20) / 20;
        const r = 14 + t * 22;
        ring.scale.set(r * 2, 1, r * 2);
        (ring.material as MeshBasicMaterial).opacity = 1 - t;
        col.scale.set(15, 80, 15);
        (col.material as MeshBasicMaterial).opacity = 0.7 + 0.25 * Math.sin(k.time * 8);
      }
    }
    if (k.curse && !this.curse) {
      const curse = new Group();
      const ring = kit.decalRing(PALETTE.seal, 25, true, 1);
      ring.position.y = 1.3;
      const ring2 = kit.decalRing(PALETTE.spirit, 32, true, 0.7);
      ring2.position.y = 1.35;
      const pool = kit.glowDisc('#b3262e', 40, 0.55);
      pool.position.y = 0.8;
      const motes: Sprite[] = [];
      for (let i = 0; i < 5; i++) {
        const s = kit.glowSprite('#ff8c78', 5, 0.9);
        s.material = kit.own(s.material.clone());
        motes.push(s);
        curse.add(s);
      }
      curse.add(ring, ring2, pool);
      curse.userData = { ring, ring2, pool, motes };
      this.markers.add(curse);
      this.curse = curse;
    }
    if (this.curse) {
      this.curse.visible = k.curse;
      if (k.curse) {
        const { ring, ring2, pool, motes } = this.curse.userData as {
          ring: Mesh;
          ring2: Mesh;
          pool: Mesh;
          motes: Sprite[];
        };
        const pulse = 0.5 + 0.5 * Math.sin(k.time * 4);
        ring.rotation.y = k.time * 0.9;
        ring2.rotation.y = -k.time * 0.5;
        (pool.material as MeshBasicMaterial).opacity = 0.3 + 0.3 * pulse;
        for (let i = 0; i < motes.length; i++) {
          const ph = (k.time * 0.6 + i / motes.length) % 1;
          const a = (i / motes.length) * TAU + this.seed;
          motes[i].position.set(Math.cos(a) * 17, 2 + ph * 36, Math.sin(a) * 17);
          motes[i].material.opacity = 0.9 * (1 - ph);
        }
      }
    }
    if (k.holy && !this.halo) {
      this.halo = new Mesh(
        kit.geo('holy-halo', () => new TorusGeometry(5, 0.45, 6, 28).rotateX(Math.PI / 2)),
        kit.basic('#f0d48a'),
      );
      this.halo.position.y = 40;
      this.root.add(this.halo);
    }
    if (this.halo) {
      this.halo.visible = k.holy;
      this.halo.rotation.y = k.time * 1.4;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Minions (instanced)                                                        */
/* -------------------------------------------------------------------------- */

function dollGeometry(team: string): BufferGeometry {
  const cloth = new Color(team).multiplyScalar(0.85);
  const accent = new Color(team).offsetHSL(0, 0, 0.12);
  return mergeGeometries([
    bit(
      lathe(
        [
          [0.01, 0],
          [3.8, 0],
          [3.5, 2],
          [2.8, 6],
          [2.2, 8.2],
          [0.01, 8.5],
        ],
        10,
      ),
      cloth,
    ),
    bit(new SphereGeometry(2.5, 10, 8), SKIN, 0, 10.4),
    bit(new ConeGeometry(3.9, 2.5, 10), accent, 0, 12.8),
    bit(new BoxGeometry(1.1, 1.8, 0.3), PALETTE.seal, 0, 10.7, 2.4),
    bit(new BoxGeometry(0.7, 0.7, 5.5), STONE_DARK, 3.7, 5.2, 2.2),
  ])!;
}

function lanternGeometry(team: string): BufferGeometry {
  const paper = new Color(team).lerp(WHITE, 0.25);
  const rib = (r: number, y: number): BufferGeometry =>
    bit(new TorusGeometry(r, 0.3, 5, 14).rotateX(Math.PI / 2), INK, 0, y);
  return mergeGeometries([
    bit(new SphereGeometry(3.8, 12, 9).scale(1, 1.28, 1), paper, 0, 7.4),
    rib(3.8, 7.4),
    rib(3.3, 10.2),
    rib(3.3, 4.6),
    bit(new CylinderGeometry(2.2, 2.6, 1.4, 10), LACQUER, 0, 12),
    bit(new CylinderGeometry(2.4, 2, 1.2, 10), LACQUER, 0, 2.6),
    bit(new ConeGeometry(0.9, 3.4, 6).rotateX(Math.PI), BRASS, 0, 0.9),
    bit(new TorusGeometry(1.5, 0.25, 4, 10), BRASS, 0, 13.6),
  ])!;
}

interface MinionVariant {
  mesh: InstancedMesh;
  hull: InstancedMesh;
  count: number;
  cap: number;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _qt = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();

/** Lane minions and event spirits: paper dolls (melee) and paper lanterns (ranged), instanced. */
export class MinionKit {
  readonly group = new Group();
  private variants = new Map<string, MinionVariant>();
  private readonly shadows: InstancedMesh;
  private shadowCount = 0;
  private static readonly SHADOWS = 480;

  constructor(kit: Kit) {
    const teams: [string, string, number][] = [
      ['A', PALETTE.teamA, 160],
      ['B', PALETTE.teamB, 160],
      ['neutral', PALETTE.neutral, 96],
    ];
    for (const [id, color, cap] of teams) {
      for (const ranged of [false, true]) {
        const geo = kit.own(ranged ? lanternGeometry(color) : dollGeometry(color));
        const mat = kit.own(
          new MeshToonMaterial({
            vertexColors: true,
            gradientMap: kit.gradient,
            emissive: ranged ? color : '#000000',
            emissiveIntensity: ranged ? 0.55 : 0,
          }),
        );
        const mesh = new InstancedMesh(geo, mat, cap);
        const hull = new InstancedMesh(kit.hull(geo), kit.ink(0.8), cap);
        for (const im of [mesh, hull]) {
          im.frustumCulled = false;
          im.count = 0;
          this.group.add(im);
        }
        mesh.castShadow = true;
        this.variants.set(`${id}:${ranged}`, { mesh, hull, count: 0, cap });
      }
    }
    const blob = kit.blob(1);
    this.shadows = new InstancedMesh(blob.geometry, blob.material, MinionKit.SHADOWS);
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = 4;
    this.group.add(this.shadows);
  }

  begin(): void {
    for (const v of this.variants.values()) v.count = 0;
    this.shadowCount = 0;
  }

  add(
    team: string,
    ranged: boolean,
    x: number,
    y: number,
    z: number,
    yaw: number,
    lean: number,
    scale: number,
  ): void {
    const v = this.variants.get(`${team}:${ranged}`) ?? this.variants.get(`neutral:${ranged}`)!;
    if (v.count >= v.cap) return;
    _q.setFromAxisAngle(Y_AXIS, yaw);
    _qt.setFromAxisAngle(X_AXIS, lean);
    _q.multiply(_qt);
    _m.compose(_p.set(x, y, z), _q, _s.setScalar(scale));
    v.mesh.setMatrixAt(v.count, _m);
    v.hull.setMatrixAt(v.count, _m);
    v.count++;
    if (this.shadowCount < MinionKit.SHADOWS) {
      _m.compose(_p.set(x, 0.55, z), _qt.identity(), _s.set(scale * 9, 1, scale * 9));
      this.shadows.setMatrixAt(this.shadowCount++, _m);
    }
  }

  end(): void {
    for (const v of this.variants.values()) {
      v.mesh.count = v.count;
      v.hull.count = v.count;
      v.mesh.instanceMatrix.needsUpdate = true;
      v.hull.instanceMatrix.needsUpdate = true;
    }
    this.shadows.count = this.shadowCount;
    this.shadows.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const v of this.variants.values()) {
      v.mesh.dispose();
      v.hull.dispose();
    }
    this.shadows.dispose();
  }
}

/* -------------------------------------------------------------------------- */
/* Structures                                                                 */
/* -------------------------------------------------------------------------- */

const pyramid = (rTop: number, rBottom: number, height: number): CylinderGeometry =>
  new CylinderGeometry(rTop, rBottom, height, 4).rotateY(Math.PI / 4);

/** A stone tōrō lantern: plinth, post, fire box with a glowing core, lacquered roof. */
export class TowerModel {
  readonly root = new Group();
  private readonly core: Mesh;
  private readonly coreMat: MeshBasicMaterial;
  private readonly halo: Sprite;
  private readonly team: Color;

  constructor(kit: Kit, team: string) {
    this.team = new Color(team);
    const lit = new Color(team).lerp(WHITE, 0.25);
    const r = this.root;
    r.add(kit.blob(20, 0.6));
    r.add(
      kit.solid(
        `tower:${team}`,
        () => {
          const bits: Bit[] = [
            { geo: new CylinderGeometry(12.5, 14.5, 3.4, 6), color: STONE_DARK, at: [0, 1.7, 0] },
            { geo: new CylinderGeometry(9.5, 11, 2.6, 6), color: STONE, at: [0, 4.7, 0] },
            { geo: new CylinderGeometry(3.3, 4.3, 12, 8), color: STONE, at: [0, 11.8, 0] },
            { geo: new CylinderGeometry(7.6, 4.6, 2.4, 6), color: STONE, at: [0, 18.8, 0] },
            { geo: new CylinderGeometry(7, 7.6, 1.5, 6), color: STONE_DARK, at: [0, 29, 0] },
            {
              geo: new ConeGeometry(11.4, 9.5, 6),
              color: new Color('#2a2133').lerp(this.team, 0.1),
              at: [0, 35.4, 0],
            },
          ];
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * TAU;
            bits.push(
              {
                geo: new BoxGeometry(1.5, 8.8, 1.5),
                color: STONE_DARK,
                at: [Math.cos(a) * 6, 24.3, Math.sin(a) * 6],
              },
              {
                geo: new SphereGeometry(1, 8, 6),
                color: BRASS,
                at: [Math.cos(a) * 12, 31.2, Math.sin(a) * 12],
              },
            );
          }
          return bits;
        },
        1.2,
      ),
    );
    r.add(
      kit.glowSolid(`tower-trim:${team}`, () => [
        {
          geo: new TorusGeometry(4, 0.85, 6, 16),
          color: lit,
          at: [0, 9, 0],
          rot: [Math.PI / 2, 0, 0],
        },
        { geo: new CylinderGeometry(12.2, 12.8, 1, 6), color: lit, at: [0, 30.4, 0] },
        { geo: new SphereGeometry(2, 10, 8), color: lit, at: [0, 41, 0], scale: [1, 1.4, 1] },
      ]),
    );
    this.coreMat = kit.own(new MeshBasicMaterial({ color: lit, fog: false }));
    this.core = put(
      r,
      new Mesh(
        kit.geo('t-core', () => new SphereGeometry(4.2, 12, 9)),
        this.coreMat,
      ),
      0,
      24.3,
      0,
    );
    this.halo = put(r, kit.glowSprite(team, 36, 0.55), 0, 24.3, 0);
    r.scale.setScalar(1.1);
  }

  animate(time: number, flash: number, hpFrac: number): void {
    const flick = hpFrac < 0.4 ? 0.7 + 0.3 * Math.sin(time * 19) : 1;
    const base = 0.55 + 0.1 * Math.sin(time * 2.4);
    this.halo.scale.setScalar(30 + flash * 20 + Math.sin(time * 2.4) * 2);
    this.core.scale.setScalar(1 + flash * 0.35);
    this.coreMat.color
      .copy(this.team)
      .lerp(WHITE, 0.25 + flash * 0.7)
      .multiplyScalar(flick * (base + 0.5));
  }
}

/** A floating shrine spirit: lacquered hall with a glowing face, orbiting stone slabs. */
export class GuardianModel {
  readonly root = new Group();
  private readonly hover = new Group();
  private readonly orbit = new Group();
  private readonly eyes: MeshBasicMaterial;
  private readonly team: Color;
  private readonly tail: Mesh;
  private readonly slabs: Mesh[] = [];

  constructor(kit: Kit, team: string) {
    this.team = new Color(team);
    const lit = new Color(team).lerp(WHITE, 0.2);
    const h = this.hover;
    this.root.add(kit.blob(34, 0.5));
    this.tail = put(
      h,
      new Mesh(
        kit.geo('g-tail', () => new ConeGeometry(11, 26, 10).rotateX(Math.PI)),
        kit.own(
          new MeshBasicMaterial({
            color: team,
            transparent: true,
            opacity: 0.38,
            blending: AdditiveBlending,
            depthWrite: false,
            fog: false,
          }),
        ),
      ),
      0,
      12,
      0,
    );
    h.add(
      kit.solid(
        `guardian:${team}`,
        () => {
          const bits: Bit[] = [
            { geo: new CylinderGeometry(16, 13, 4, 8), color: STONE_DARK, at: [0, 28, 0] },
            { geo: new BoxGeometry(34, 2.4, 30), color: STONE, at: [0, 31, 0] },
            { geo: new BoxGeometry(24, 15, 21), color: '#4a2629', at: [0, 40, 0] },
            { geo: pyramid(10, 29, 9), color: '#231a2c', at: [0, 53.4, 0] },
            { geo: pyramid(1.5, 14, 8.5), color: '#231a2c', at: [0, 63.4, 0] },
            {
              geo: new SphereGeometry(2.6, 10, 8),
              color: BRASS,
              at: [0, 70.8, 0],
              scale: [1, 1.5, 1],
            },
            { geo: new BoxGeometry(9, 0.9, 0.5), color: INK, at: [0, 37.6, 10.7] },
            {
              geo: new TorusGeometry(13.5, 0.9, 6, 24),
              color: PAPER,
              at: [0, 46.5, 0],
              rot: [Math.PI / 2, 0, 0],
              scale: [1, 1, 0.9],
            },
          ];
          for (const x of [-12.8, 12.8])
            for (const z of [-11.2, 11.2])
              bits.push({
                geo: new CylinderGeometry(1.5, 1.5, 17, 8),
                color: BRASS,
                at: [x, 40, z],
              });
          for (const s of [-1, 1])
            bits.push({
              geo: new BoxGeometry(1.1, 10, 1.1),
              color: BRASS,
              at: [s * 3.2, 69, 0],
              rot: [0, 0, -s * 0.5],
            });
          return bits;
        },
        1.6,
      ),
    );
    h.add(
      kit.glowSolid(`guardian-trim:${team}`, () => [
        { geo: pyramid(24, 31.5, 1.6), color: lit, at: [0, 48.4, 0] },
        { geo: pyramid(9, 15.5, 1.2), color: lit, at: [0, 58.6, 0] },
      ]),
    );
    h.add(
      kit.glowSolid(
        'guardian-shide',
        () => {
          const bits: Bit[] = [];
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * TAU;
            bits.push({
              geo: new PlaneGeometry(2.2, 5),
              color: PAPER,
              at: [Math.cos(a) * 14, 43.6, Math.sin(a) * 12.5],
              rot: [0, -a, 0],
            });
          }
          return bits;
        },
        DoubleSide,
      ),
    );
    this.eyes = kit.own(new MeshBasicMaterial({ color: lit, vertexColors: true, fog: false }));
    h.add(
      new Mesh(
        kit.geo('g-eyes', () =>
          kit.merge(
            [-1, 1].map((s) => ({
              geo: new BoxGeometry(6, 1.7, 0.6),
              color: WHITE,
              at: [s * 5.6, 42.4, 10.8] as [number, number, number],
              rot: [0, 0, s * 0.38] as [number, number, number],
            })),
          ),
        ),
        this.eyes,
      ),
    );
    this.orbit.position.y = 42;
    h.add(this.orbit);
    for (let i = 0; i < 3; i++) {
      const slab = kit.solid(
        'g-slab',
        () => [{ geo: new BoxGeometry(5, 11, 2), color: STONE_DARK }],
        1.2,
      );
      this.slabs.push(slab);
      this.orbit.add(slab);
    }
    put(h, kit.glowSprite(team, 70, 0.35), 0, 40, 0);
    this.root.add(h);
  }

  animate(time: number, flash: number, hpFrac: number): void {
    this.hover.position.y = 6 + Math.sin(time * 1.3) * 2.2;
    this.hover.rotation.y = Math.sin(time * 0.3) * 0.08;
    const rage = hpFrac < 0.5;
    this.orbit.rotation.y = time * (rage ? 1.1 : 0.55);
    this.slabs.forEach((s, i) => {
      const a = (i / this.slabs.length) * TAU;
      s.position.set(Math.cos(a) * 25, Math.sin(time * 1.6 + i * 2) * 3, Math.sin(a) * 25);
      s.rotation.y = -a + Math.PI / 2;
    });
    this.eyes.color
      .copy(rage ? RAGE : this.team)
      .lerp(WHITE, 0.35 + flash * 0.6)
      .multiplyScalar(0.8 + 0.2 * Math.sin(time * 5));
    this.tail.scale.set(1 + Math.sin(time * 2) * 0.06, 1 + Math.sin(time * 3.1) * 0.1, 1);
  }
}

/* -------------------------------------------------------------------------- */
/* Neutrals                                                                   */
/* -------------------------------------------------------------------------- */

/** A neutral spirit blob; elite ones grow horns. Also stands in for the Hungry Oni. */
export class CampModel {
  readonly root = new Group();
  private readonly blob = new Group();
  private readonly seed: number;
  private readonly size: number;

  constructor(kit: Kit, defId: string, elite: boolean, color?: string, size = 1) {
    this.seed = hash(defId);
    const hue = (this.seed % 360) / 360;
    const base = new Color(color ?? PALETTE.camp).offsetHSL(color ? 0 : (hue - 0.5) * 0.12, 0, 0);
    this.size = (elite ? 1.45 : 1) * size;
    const belly = base.clone().offsetHSL(0, -0.1, 0.18);
    const eye = elite ? '#ff5a46' : '#ffe08a';
    const b = this.blob;
    b.add(
      kit.solid(
        `camp:${base.getHexString()}:${elite}`,
        () => {
          const bits: Bit[] = [
            { geo: new SphereGeometry(1, 18, 14), color: base, at: [0, 7, 0], scale: [8, 7, 7.6] },
            {
              geo: new SphereGeometry(1, 12, 9),
              color: belly,
              at: [0, 5.2, 3.3],
              scale: [5.5, 4.6, 4],
            },
          ];
          for (const x of [-1, 1]) {
            bits.push({
              geo: new ConeGeometry(1.9, 5.4, 5),
              color: base,
              at: [x * 5, 13.4, 0],
              rot: [0, 0, -x * 0.42],
            });
            if (elite)
              bits.push({
                geo: new ConeGeometry(1.3, 6, 5),
                color: '#e8dcc0',
                at: [x * 2.6, 15, 1],
                rot: [0, 0, -x * 0.25],
              });
          }
          return bits;
        },
        0.8,
      ),
    );
    b.add(
      kit.glowSolid(`camp-eyes:${eye}`, () =>
        [-1, 1].map((x) => ({
          geo: new SphereGeometry(1.15, 8, 6),
          color: eye,
          at: [x * 3.1, 9, 6.6] as [number, number, number],
          rot: [0, 0, x * 0.35] as [number, number, number],
          scale: [1, 0.7, 0.6] as [number, number, number],
        })),
      ),
    );
    put(b, kit.glowSprite(elite ? '#ff5a46' : '#ffd98a', 18, 0.35), 0, 8, 0);
    b.scale.setScalar(this.size);
    this.root.add(b, kit.blob(12 * this.size, 0.55));
  }

  animate(time: number, lunge: number): void {
    const t = time * 3 + this.seed;
    this.blob.scale.y = (1 + Math.sin(t) * 0.05 + lunge * 0.12) * this.size;
    this.blob.position.y = Math.max(0, Math.sin(t * 0.5)) * 0.8 + lunge * 2;
  }
}

/** A standing stone with glowing glyphs and an orbiting rune ring; a ground arc shows the claim. */
export class ObeliskModel {
  readonly root = new Group();
  private readonly ringA: Mesh;
  private readonly floater = new Group();
  private readonly progress: ProgressRing;
  private readonly glyphs: MeshBasicMaterial;

  constructor(kit: Kit) {
    this.glyphs = kit.own(
      new MeshBasicMaterial({ color: PALETTE.spirit, vertexColors: true, fog: false }),
    );
    this.root.add(kit.blob(16, 0.55));
    this.root.add(
      kit.solid(
        'obelisk-base',
        () => [{ geo: pyramid(9, 11, 3.5), color: STONE_DARK, at: [0, 1.8, 0] }],
        1.2,
      ),
    );
    this.floater.add(
      kit.solid(
        'obelisk-shaft',
        () => [
          { geo: pyramid(4.2, 6.6, 34), color: '#4f4863', at: [0, 21, 0] },
          { geo: new ConeGeometry(4.2, 7, 4).rotateY(Math.PI / 4), color: BRASS, at: [0, 41.5, 0] },
        ],
        1.2,
      ),
    );
    this.floater.add(
      new Mesh(
        kit.geo('obelisk-glyphs', () => {
          const bits: Bit[] = [];
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * TAU;
            for (const [y, h] of [
              [16, 5],
              [24, 3.5],
              [31, 2.6],
            ] as const) {
              const rr = 5.5 - y * 0.075;
              bits.push({
                geo: new BoxGeometry(0.5, h, 1.1),
                color: WHITE,
                at: [Math.cos(a) * rr, y, Math.sin(a) * rr],
                rot: [0, -a, 0],
              });
            }
          }
          return kit.merge(bits);
        }),
        this.glyphs,
      ),
    );
    this.ringA = put(
      this.floater,
      new Mesh(
        kit.geo('obelisk-ring', () =>
          kit.merge([{ geo: new TorusGeometry(11, 0.5, 6, 32), color: WHITE }]),
        ),
        this.glyphs,
      ),
      0,
      24,
      0,
    );
    put(this.floater, kit.glowSprite(PALETTE.spirit, 56, 0.4), 0, 24, 0);
    this.root.add(this.floater);
    this.progress = new ProgressRing(kit, 14, 16.5, '#ffffff', 0.95);
    this.progress.mesh.position.y = 1.4;
    this.root.add(this.progress.mesh);
  }

  animate(time: number, claim: number): void {
    this.floater.position.y = Math.sin(time * 1.5) * 1.6;
    this.ringA.rotation.set(Math.PI / 2 + Math.sin(time) * 0.2, time * 1.1, 0);
    this.glyphs.color.set(PALETTE.spirit).multiplyScalar(0.75 + 0.25 * Math.sin(time * 3));
    this.progress.set(claim);
  }
}

function wingShape(upper: boolean): Shape {
  const s = new Shape();
  if (upper) {
    s.moveTo(0, 0);
    s.bezierCurveTo(4, 7, 14, 10, 15, 3);
    s.bezierCurveTo(16, -3, 8, -4, 0, 0);
  } else {
    s.moveTo(0, -1);
    s.bezierCurveTo(5, -2, 10, -4, 9, -9);
    s.bezierCurveTo(7, -13, 1, -9, 0, -1);
  }
  return s;
}

/** The Keeper: a gold butterfly hovering over a pulsing ring. */
export class KeeperModel {
  readonly root = new Group();
  private readonly wings: Group[] = [];
  private readonly flier = new Group();
  private readonly ring: Mesh;

  constructor(kit: Kit) {
    const wing = (color: string, emissive: string, intensity: number): MeshToonMaterial =>
      kit.own(
        new MeshToonMaterial({
          color,
          gradientMap: kit.gradient,
          emissive,
          emissiveIntensity: intensity,
          side: DoubleSide,
        }),
      );
    const gold = wing(PALETTE.gold, '#a8741c', 0.65);
    const vein = wing('#f6dc8a', '#c99428', 0.7);
    const up = kit.geo('k-wing-up', () =>
      new ShapeGeometry(wingShape(true), 12).rotateX(-Math.PI / 2),
    );
    const low = kit.geo('k-wing-low', () =>
      new ShapeGeometry(wingShape(false), 12).rotateX(-Math.PI / 2),
    );
    for (const side of [-1, 1]) {
      const w = new Group();
      put(w, new Mesh(up, gold)).position.y = 0.01;
      put(w, new Mesh(low, vein)).position.y = -0.01;
      w.scale.x = side;
      this.wings.push(w);
      this.flier.add(w);
    }
    put(
      this.flier,
      kit.part(
        'k-body',
        () => new SphereGeometry(1, 8, 6).scale(0.9, 0.9, 4.2),
        kit.toon('#5a3a14'),
        0.5,
      ),
    );
    put(this.flier, kit.glowSprite('#ffd88a', 34, 0.55));
    this.flier.scale.setScalar(1.7);
    this.flier.position.y = 24;
    this.root.add(this.flier);
    this.ring = kit.decalRing(PALETTE.gold, 18, true, 0.7);
    this.ring.position.y = 0.9;
    this.root.add(kit.blob(12, 0.4), this.ring);
  }

  animate(time: number): void {
    const flap = Math.sin(time * 9) * 0.75 + 0.35;
    this.wings[0].rotation.z = -flap;
    this.wings[1].rotation.z = flap;
    this.flier.position.y = 24 + Math.sin(time * 1.7) * 3.2;
    this.flier.rotation.y = Math.sin(time * 0.7) * 0.9;
    this.flier.rotation.x = Math.sin(time * 1.1) * 0.12;
    this.ring.rotation.y = time * 0.5;
    const pulse = (1 + Math.sin(time * 2) * 0.05) * 36;
    this.ring.scale.set(pulse, 1, pulse);
  }
}
