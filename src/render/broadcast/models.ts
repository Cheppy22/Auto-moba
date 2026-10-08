import {
  BoxGeometry,
  BufferGeometry,
  Color,
  type ColorRepresentation,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LatheGeometry,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  type Object3D,
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
import { cheshireFade } from '../icons';
import { PALETTE } from '../theme';
import { type Bit, BRASS, hash, INK, type Kit, PAPER, ProgressRing, put, STONE_DARK } from './kit';

const TAU = Math.PI * 2;
const Y_AXIS = new Vector3(0, 1, 0);
const X_AXIS = new Vector3(1, 0, 0);
const WHITE = new Color('#ffffff');
const RAGE = new Color('#ff3b3b');

/** Heroes are drawn slightly larger than their sim footprint so they read from the skycam. */
export const HERO_SCALE = 1.3;
export const MINION_SCALE = 1.1;
/** Pawns are modelled bigger than pawnlings; this is their extra display scale. */
export const PAWN_SCALE = 1.1;

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
/* Minions (instanced)                                                        */
/* -------------------------------------------------------------------------- */

interface PawnColors {
  body: string;
  shade: string;
  trim: string;
  skin: string;
}

const PAWN_COLORS: Record<string, PawnColors> = {
  A: {
    body: PALETTE.whiteBody,
    shade: PALETTE.whiteShade,
    trim: PALETTE.whiteTrim,
    skin: '#f3e6cc',
  },
  B: {
    body: PALETTE.blackBody,
    shade: PALETTE.blackShade,
    trim: PALETTE.blackTrim,
    skin: '#7b7690',
  },
  neutral: { body: PALETTE.neutral, shade: '#6f5f93', trim: PALETTE.spirit, skin: '#d9cdf0' },
};

/** A pawnling: a small, simple turned pawn (base, waist, collar, ball head). */
function pawnlingGeometry(c: PawnColors): BufferGeometry {
  return mergeGeometries([
    bit(
      lathe(
        [
          [0.01, 0],
          [4.6, 0],
          [4.6, 1.3],
          [3.4, 2.3],
          [2.2, 4.8],
          [2, 7.6],
          [3.1, 8.3],
          [3.1, 9.1],
          [1.4, 9.7],
          [0.01, 9.7],
        ],
        10,
      ),
      c.body,
    ),
    bit(new SphereGeometry(3, 10, 8), c.body, 0, 12.3),
    bit(new TorusGeometry(3.2, 0.5, 4, 12).rotateX(Math.PI / 2), c.trim, 0, 8.8),
  ])!;
}

/**
 * A pawn: the elite foot soldier. Bigger and more detailed than a pawnling: a plumed helm with a
 * visor slit, pauldrons, a team-trimmed shield on the left arm and a spear on the right.
 */
function pawnGeometry(c: PawnColors): BufferGeometry {
  const parts = [
    bit(
      lathe(
        [
          [0.01, 0],
          [8.2, 0],
          [8.2, 2.2],
          [6.3, 3.8],
          [4.2, 8],
          [3.8, 13],
          [5.6, 14.6],
          [5.6, 16.2],
          [2.6, 17],
          [0.01, 17],
        ],
        14,
      ),
      c.body,
    ),
    bit(new TorusGeometry(5.9, 0.9, 5, 16).rotateX(Math.PI / 2), c.trim, 0, 15.4),
    bit(new TorusGeometry(7.9, 0.8, 5, 16).rotateX(Math.PI / 2), c.trim, 0, 2.6),
    bit(new TorusGeometry(4.5, 0.7, 5, 14).rotateX(Math.PI / 2), c.trim, 0, 9),
    // helm: dome, brim, visor slit, crest
    bit(new SphereGeometry(5.2, 14, 10), c.body, 0, 21.4),
    bit(new TorusGeometry(5.3, 0.7, 5, 16).rotateX(Math.PI / 2), c.trim, 0, 20.4),
    bit(new BoxGeometry(5.6, 0.9, 1.2), INK, 0, 21, 4.8),
    bit(new BoxGeometry(1, 6, 7).rotateX(-0.2), c.trim, 0, 25.6, -0.4),
    // pauldrons
    bit(new SphereGeometry(2.8, 8, 6), c.shade, -6.4, 14, 0),
    bit(new SphereGeometry(2.8, 8, 6), c.shade, 6.4, 14, 0),
    // kite shield, left arm
    bit(new BoxGeometry(1.2, 11, 7.6), c.shade, -7.8, 10, 3.2),
    bit(new BoxGeometry(1.4, 8.6, 1.4), c.trim, -8.1, 10, 3.2),
    bit(new BoxGeometry(1.4, 1.4, 5.4), c.trim, -8.1, 11.6, 3.2),
    // spear, right arm
    bit(new CylinderGeometry(0.55, 0.55, 26, 5).rotateX(Math.PI / 2.3), c.trim, 7.4, 12, 8),
    bit(new ConeGeometry(1.3, 4.6, 5).rotateX(Math.PI / 2.3), '#e4eaf0', 7.4, 14.2, 20),
  ];
  return mergeGeometries(parts)!;
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

/**
 * Pawnlings (the lane waves) and pawns (elite soldiers fielded with Tempo), instanced per team.
 * Neutral spirits reuse the pawnling shape in lantern violet.
 */
export class MinionKit {
  readonly group = new Group();
  private variants = new Map<string, MinionVariant>();
  private readonly shadows: InstancedMesh;
  private shadowCount = 0;
  private static readonly SHADOWS = 480;

  constructor(kit: Kit) {
    const specs: [string, boolean, number][] = [
      ['A', false, 200],
      ['B', false, 200],
      ['neutral', false, 96],
      ['A', true, 40],
      ['B', true, 40],
    ];
    for (const [id, elite, cap] of specs) {
      const c = PAWN_COLORS[id];
      const geo = kit.own(elite ? pawnGeometry(c) : pawnlingGeometry(c));
      const mat = kit.own(
        new MeshToonMaterial({
          vertexColors: true,
          gradientMap: kit.gradient,
          emissive: id === 'B' ? '#1a1d2e' : '#000000',
          emissiveIntensity: id === 'B' ? 0.5 : 0,
        }),
      );
      const mesh = new InstancedMesh(geo, mat, cap);
      const hull = new InstancedMesh(kit.hull(geo), kit.ink(elite ? 0.9 : 0.8), cap);
      for (const im of [mesh, hull]) {
        im.frustumCulled = false;
        im.count = 0;
        this.group.add(im);
      }
      mesh.castShadow = true;
      this.variants.set(`${id}:${elite}`, { mesh, hull, count: 0, cap });
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
    elite: boolean,
    x: number,
    y: number,
    z: number,
    yaw: number,
    lean: number,
    scale: number,
    ground = 0,
  ): void {
    const v = this.variants.get(`${team}:${elite}`) ?? this.variants.get('neutral:false')!;
    if (v.count >= v.cap) return;
    _q.setFromAxisAngle(Y_AXIS, yaw);
    _qt.setFromAxisAngle(X_AXIS, lean);
    _q.multiply(_qt);
    _m.compose(_p.set(x, y, z), _q, _s.setScalar(scale));
    v.mesh.setMatrixAt(v.count, _m);
    v.hull.setMatrixAt(v.count, _m);
    v.count++;
    if (this.shadowCount < MinionKit.SHADOWS) {
      _m.compose(_p.set(x, ground + 0.55, z), _qt.identity(), _s.set(scale * 9, 1, scale * 9));
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

/** A Bastion: a squat battlemented tower in team stone, a banner and a lit arrow window. */
export class BastionModel {
  readonly root = new Group();
  private readonly core: Mesh;
  private readonly coreMat: MeshBasicMaterial;
  private readonly halo: Sprite;
  private readonly team: Color;

  constructor(kit: Kit, team: string, side: 'A' | 'B') {
    this.team = new Color(team);
    const lit = new Color(team).lerp(WHITE, 0.25);
    const white = side === 'A';
    const stone = white ? '#d8cdb2' : '#37323f';
    const stoneDark = white ? '#a99d82' : '#221f2b';
    const trim = white ? PALETTE.whiteTrim : PALETTE.blackTrim;
    const r = this.root;
    r.add(kit.blob(22, 0.6));
    r.add(
      kit.solid(
        `bastion:${side}`,
        () => {
          const bits: Bit[] = [
            { geo: new CylinderGeometry(15.5, 17.5, 3.6, 8), color: stoneDark, at: [0, 1.8, 0] },
            {
              geo: lathe(
                [
                  [0.01, 3.6],
                  [14, 3.6],
                  [12.4, 14],
                  [11, 28],
                  [11.6, 31],
                  [13.6, 33],
                  [0.01, 33],
                ],
                8,
              ),
              color: stone,
            },
            { geo: new CylinderGeometry(13.9, 13.9, 1.6, 8), color: trim, at: [0, 32.2, 0] },
            { geo: new CylinderGeometry(11.6, 11.6, 3, 8), color: stoneDark, at: [0, 34.5, 0] },
            // brick bands
            {
              geo: new TorusGeometry(12.6, 0.5, 4, 8).rotateX(Math.PI / 2),
              color: stoneDark,
              at: [0, 11, 0],
            },
            {
              geo: new TorusGeometry(11.8, 0.5, 4, 8).rotateX(Math.PI / 2),
              color: stoneDark,
              at: [0, 21, 0],
            },
            // door
            { geo: new BoxGeometry(5.2, 8, 1.4), color: INK, at: [0, 8.2, 12.4] },
            // arrow window (the lit core shows through)
            { geo: new BoxGeometry(3.6, 8, 1.4), color: INK, at: [0, 23.5, 11.5] },
          ];
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU + Math.PI / 8;
            bits.push({
              geo: new BoxGeometry(5, 5.6, 3.6),
              color: stone,
              at: [Math.cos(a) * 11.6, 38.8, Math.sin(a) * 11.6],
              rot: [0, -a + Math.PI / 2, 0],
            });
          }
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * TAU;
            bits.push({
              geo: new BoxGeometry(3.4, 14, 5).translate(0, 7, 0),
              color: stoneDark,
              at: [Math.cos(a) * 14.4, 3.6, Math.sin(a) * 14.4],
              rot: [0, -a + Math.PI / 2, 0],
            });
          }
          return bits;
        },
        1.2,
      ),
    );
    r.add(
      kit.glowSolid(`bastion-trim:${side}:${team}`, () => [
        { geo: new BoxGeometry(11, 15, 0.5), color: lit, at: [0, 18, 12.6] },
        { geo: new BoxGeometry(1.6, 18, 1.6), color: trim, at: [0, 46, 0] },
        { geo: new ConeGeometry(2.4, 5, 4).rotateY(Math.PI / 4), color: lit, at: [0, 57.5, 0] },
        { geo: new BoxGeometry(0.6, 6.5, 9), color: lit, at: [0, 51, 5.2] },
      ]),
    );
    this.coreMat = kit.own(new MeshBasicMaterial({ color: lit, fog: false }));
    this.core = put(
      r,
      new Mesh(
        kit.geo('b-core', () => new SphereGeometry(2.6, 10, 8)),
        this.coreMat,
      ),
      0,
      23.5,
      10.4,
    );
    this.halo = put(r, kit.glowSprite(team, 34, 0.55), 0, 23.5, 11);
    r.scale.setScalar(1.1);
  }

  animate(time: number, flash: number, hpFrac: number): void {
    const flick = hpFrac < 0.4 ? 0.7 + 0.3 * Math.sin(time * 19) : 1;
    const base = 0.55 + 0.1 * Math.sin(time * 2.4);
    this.halo.scale.setScalar(26 + flash * 20 + Math.sin(time * 2.4) * 2);
    this.core.scale.setScalar(1 + flash * 0.4);
    this.coreMat.color
      .copy(this.team)
      .lerp(WHITE, 0.25 + flash * 0.7)
      .multiplyScalar(flick * (base + 0.5));
  }
}

/** The Throne: a great seat on a stepped dais, a crown hanging over it, and a pale flame. */
export class ThroneModel {
  readonly root = new Group();
  private readonly crown = new Group();
  private readonly gems: MeshBasicMaterial;
  private readonly cloth: MeshToonMaterial;
  private readonly team: Color;
  private readonly aura: Sprite;

  constructor(kit: Kit, team: string, side: 'A' | 'B') {
    this.team = new Color(team);
    const lit = new Color(team).lerp(WHITE, 0.2);
    const white = side === 'A';
    const stone = white ? '#e2d8bd' : '#3b3544';
    const stoneDark = white ? '#b3a78a' : '#252130';
    const trim = white ? PALETTE.whiteTrim : PALETTE.blackTrim;
    const velvet = white ? '#9c2d38' : '#4a2a6a';
    this.cloth = kit.uniqueVertexToon();
    this.root.add(kit.blob(40, 0.5));
    this.root.add(
      kit.solid(
        `throne:${side}`,
        () => {
          const bits: Bit[] = [
            { geo: new CylinderGeometry(30, 33, 3, 8), color: stoneDark, at: [0, 1.5, 0] },
            { geo: new CylinderGeometry(24, 27, 3, 8), color: stone, at: [0, 4.5, 0] },
            { geo: new CylinderGeometry(18, 21, 3, 8), color: stoneDark, at: [0, 7.5, 0] },
            // seat, cushion and arms
            { geo: new BoxGeometry(22, 8, 17), color: stone, at: [0, 13, -1] },
            { geo: new BoxGeometry(17, 2.4, 13), color: velvet, at: [0, 17.6, 0.2] },
            { geo: new BoxGeometry(4.2, 9, 15), color: stone, at: [-12, 18, -1] },
            { geo: new BoxGeometry(4.2, 9, 15), color: stone, at: [12, 18, -1] },
            { geo: new BoxGeometry(5, 1.8, 16), color: trim, at: [-12, 23, -1] },
            { geo: new BoxGeometry(5, 1.8, 16), color: trim, at: [12, 23, -1] },
            // backrest with a pointed arch
            { geo: new BoxGeometry(24, 46, 5), color: stone, at: [0, 36, -9] },
            { geo: new BoxGeometry(15, 40, 5.6), color: velvet, at: [0, 35, -6.4] },
            {
              geo: new ConeGeometry(12.4, 14, 4).rotateY(Math.PI / 4),
              color: stone,
              at: [0, 66, -9],
              scale: [1, 1, 0.22],
            },
            { geo: new CylinderGeometry(1.4, 1.4, 52, 6), color: trim, at: [-13.4, 36, -9] },
            { geo: new CylinderGeometry(1.4, 1.4, 52, 6), color: trim, at: [13.4, 36, -9] },
          ];
          for (const x of [-1, 1]) {
            bits.push(
              { geo: new CylinderGeometry(3, 3.6, 40, 8), color: stone, at: [x * 26, 22, 4] },
              { geo: new CylinderGeometry(4.2, 3.4, 2.4, 8), color: trim, at: [x * 26, 42.4, 4] },
              { geo: new SphereGeometry(2.6, 8, 6), color: trim, at: [x * 13.4, 63, -9] },
            );
          }
          return bits;
        },
        1.5,
        this.cloth,
      ),
    );
    this.gems = kit.own(new MeshBasicMaterial({ color: lit, vertexColors: true, fog: false }));
    this.root.add(
      new Mesh(
        kit.geo('throne-gems', () =>
          kit.merge([
            { geo: new SphereGeometry(2, 8, 6), color: WHITE, at: [-26, 46.4, 4] },
            { geo: new SphereGeometry(2, 8, 6), color: WHITE, at: [26, 46.4, 4] },
            {
              geo: new SphereGeometry(2.2, 8, 6),
              color: WHITE,
              at: [0, 58, -6.2],
              scale: [1, 1.5, 0.6],
            },
            { geo: new BoxGeometry(23, 1, 1), color: WHITE, at: [0, 13.4, 8.2] },
          ]),
        ),
        this.gems,
      ),
    );
    const c = this.crown;
    c.add(
      kit.solid(
        `throne-crown:${side}`,
        () => {
          const bits: Bit[] = [
            { geo: new CylinderGeometry(9, 9.6, 5, 14, 1, true), color: trim, at: [0, 0, 0] },
            {
              geo: new TorusGeometry(9.4, 0.9, 5, 18).rotateX(Math.PI / 2),
              color: trim,
              at: [0, 2.6, 0],
            },
            {
              geo: new TorusGeometry(9.2, 0.9, 5, 18).rotateX(Math.PI / 2),
              color: trim,
              at: [0, -2.6, 0],
            },
            { geo: new CylinderGeometry(1, 1, 8, 6), color: trim, at: [0, 10, 0] },
            { geo: new BoxGeometry(6, 1.8, 1.8), color: trim, at: [0, 11.6, 0] },
          ];
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * TAU;
            bits.push(
              {
                geo: new ConeGeometry(1.6, 6, 5),
                color: trim,
                at: [Math.cos(a) * 9, 5.4, Math.sin(a) * 9],
              },
              {
                geo: new SphereGeometry(1, 6, 5),
                color: '#ffffff',
                at: [Math.cos(a) * 9, 9, Math.sin(a) * 9],
              },
            );
          }
          return bits;
        },
        1.2,
      ),
    );
    c.position.set(0, 90, -2);
    this.root.add(c);
    this.aura = put(this.root, kit.glowSprite(team, 90, 0.3), 0, 62, -2);
    this.aura.material = kit.own(this.aura.material.clone());
    put(this.root, kit.glowSprite(team, 46, 0.5), 0, 90, -2);
    this.root.scale.setScalar(1.25);
  }

  animate(time: number, flash: number, hpFrac: number): void {
    const rage = hpFrac < 0.5;
    const pulse = 0.5 + 0.5 * Math.sin(time * 6);
    this.crown.position.y = 90 + Math.sin(time * 1.3) * 2.2;
    this.crown.rotation.y = time * (rage ? 1.2 : 0.4);
    this.gems.color
      .copy(rage ? RAGE : this.team)
      .lerp(WHITE, 0.35 + flash * 0.6)
      .multiplyScalar(0.8 + 0.2 * Math.sin(time * 5));
    if (rage) this.cloth.emissive.copy(RAGE).multiplyScalar(0.1 + 0.18 * pulse + flash * 0.3);
    else this.cloth.emissive.setScalar(flash * 0.35);
    this.aura.material.color.copy(rage ? RAGE : this.team);
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

/** Gives every mesh in `root` its own transparent material so the whole thing can fade. */
function fadable(kit: Kit, root: Object3D): { mat: Material; base: number }[] {
  const out: { mat: Material; base: number }[] = [];
  root.traverse((o) => {
    if (o instanceof Mesh) {
      const old = o.material as Material;
      const next = kit.own(
        typeof old.userData.ink === 'number' ? kit.ink(old.userData.ink, true) : old.clone(),
      );
      next.transparent = true;
      o.material = next;
      out.push({ mat: next, base: next.opacity });
    } else if (o instanceof Sprite) {
      const next = kit.own(o.material.clone());
      o.material = next;
      out.push({ mat: next, base: next.opacity });
    }
  });
  return out;
}

/** The Cheshire Keeper: a floating brass grin and two violet eyes (a Tenniel tabby, never stripes). */
export class KeeperModel {
  readonly root = new Group();
  private readonly face = new Group();
  private readonly grin = new Group();
  private readonly eyes = new Group();
  private readonly grinMats: { mat: Material; base: number }[];
  private readonly eyeMats: { mat: Material; base: number }[];
  private readonly ring: Mesh;
  private readonly seed: number;

  constructor(kit: Kit) {
    this.seed = 3.7;
    const crescent = (): ExtrudeGeometry => {
      const sh = new Shape();
      sh.moveTo(-12, 0);
      sh.quadraticCurveTo(0, -19, 12, 0);
      sh.quadraticCurveTo(0, -6.5, -12, 0);
      const g = new ExtrudeGeometry(sh, {
        depth: 2.2,
        bevelEnabled: true,
        bevelThickness: 0.8,
        bevelSize: 0.7,
        bevelSegments: 1,
        curveSegments: 14,
      });
      return g.translate(0, 4.2, -1.1);
    };
    const gold = kit.toon(PALETTE.gold, '#a8741c', 0.5);
    put(this.grin, kit.part('cheshire-grin', crescent, gold, 0.9));
    const teeth = kit.solid(
      'cheshire-teeth',
      () => {
        const bits: Bit[] = [];
        for (let i = -3; i <= 3; i++) {
          const t = 0.5 + i * 0.1;
          const x = (1 - t) * (1 - t) * -12 + t * t * 12;
          const yo = 2 * t * (1 - t) * -19;
          const yi = 2 * t * (1 - t) * -6.5;
          bits.push({
            geo: new BoxGeometry(1.5, Math.max(1.2, (yi - yo) * 0.62), 0.7),
            color: PAPER,
            at: [x, 4.2 + (yo + yi) / 2 + 0.4, 1.4],
          });
        }
        return bits;
      },
      0.5,
    );
    this.grin.add(teeth);
    this.grin.position.set(0, -2, 0);

    const violet = kit.toon(PALETTE.neutral, PALETTE.neutral, 0.7);
    for (const side of [-1, 1]) {
      const eye = new Group();
      put(
        eye,
        kit.part(
          'cheshire-eye',
          () => new SphereGeometry(1, 14, 10).scale(5.4, 2.7, 1.5),
          violet,
          0.7,
        ),
      );
      put(
        eye,
        kit.part(
          'cheshire-pupil',
          () => new SphereGeometry(1, 8, 6).scale(0.9, 2.3, 0.5),
          kit.toon(PALETTE.gold, PALETTE.gold, 0.9),
          0.4,
        ),
        0,
        0,
        1.3,
      );
      eye.position.set(side * 9, 11.5, 0);
      eye.rotation.z = side * -0.3;
      this.eyes.add(eye);
    }
    const glow = put(this.face, kit.glowSprite(PALETTE.neutral, 52, 0.3), 0, 4, -2);
    this.face.add(this.grin, this.eyes);
    this.face.position.y = 28;
    this.face.scale.setScalar(1.15);
    this.root.add(this.face);
    this.grinMats = fadable(kit, this.grin);
    this.eyeMats = fadable(kit, this.eyes);
    this.grinMats.push(...fadable(kit, glow));
    this.ring = kit.decalRing(PALETTE.gold, 18, true, 0.7);
    this.ring.position.y = 0.9;
    this.root.add(kit.blob(12, 0.4), this.ring);
  }

  animate(time: number, camQuat: Quaternion): void {
    const { grin, eyes } = cheshireFade(time * 20 + this.seed * 20);
    this.face.position.y = 28 + Math.sin(time * 1.3) * 2.6;
    this.face.quaternion.copy(camQuat);
    this.face.rotateZ(Math.sin(time * 0.7) * 0.12);
    this.grin.rotation.z = Math.sin(time * 0.9) * 0.05;
    this.eyes.position.y = Math.sin(time * 1.6) * 0.5;
    for (const [list, a] of [
      [this.grinMats, grin],
      [this.eyeMats, eyes],
    ] as const) {
      for (const m of list) m.mat.opacity = m.base * a;
    }
    this.grin.visible = grin > 0.02;
    this.eyes.visible = eyes > 0.02;
    this.ring.rotation.y = time * 0.5;
    const pulse = (1 + Math.sin(time * 2) * 0.05) * 36;
    this.ring.scale.set(pulse, 1, pulse);
    (this.ring.material as MeshBasicMaterial).opacity = 0.25 + 0.5 * grin;
  }
}

/** A tapered limb between two points, as a merge-ready geometry. */
function limb(a: Vector3, b: Vector3, r0: number, r1: number, seg = 7): BufferGeometry {
  const dir = b.clone().sub(a);
  const len = dir.length();
  const q = new Quaternion().setFromUnitVectors(Y_AXIS, dir.normalize());
  return new CylinderGeometry(r1, r0, len, seg)
    .applyQuaternion(q)
    .translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}

function batWing(): Shape {
  const s = new Shape();
  s.moveTo(0, 0);
  s.lineTo(16, 2);
  s.lineTo(36, 0);
  s.quadraticCurveTo(33, 7, 31, 16);
  s.quadraticCurveTo(26, 10, 23, 20);
  s.quadraticCurveTo(17, 12, 12, 21);
  s.quadraticCurveTo(7, 12, 0, 13);
  s.closePath();
  return s;
}

/**
 * The Jabberwock, after Tenniel: a long serpentine neck, bat wings, a spined back, buck teeth in
 * jaws that bite, claws that catch and eyes of flame. Faces +z like every other figure.
 */
export class JabberwockModel {
  readonly root = new Group();
  private readonly body = new Group();
  private readonly head = new Group();
  private readonly jaw = new Group();
  private readonly wings: Group[] = [];
  private readonly eyes: MeshBasicMaterial;
  private readonly seed: number;

  constructor(kit: Kit, defId: string) {
    this.seed = hash(defId) % 628;
    const v = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z);
    const scale = new Color('#46604c');
    const belly = new Color('#cdbf92');
    const dark = new Color('#2f4236');
    this.root.add(kit.blob(30, 0.6));
    this.body.add(
      kit.solid(
        'jabber-body',
        () => {
          const bits: Bit[] = [
            {
              geo: new SphereGeometry(1, 16, 12),
              color: scale,
              at: [0, 18, 0],
              scale: [10, 9, 15],
            },
            {
              geo: new SphereGeometry(1, 12, 9),
              color: belly,
              at: [0, 14.2, 2],
              scale: [7, 6, 11.5],
            },
          ];
          for (const x of [-1, 1]) {
            bits.push(
              { geo: new SphereGeometry(6, 10, 8), color: scale, at: [x * 8, 13, -7] },
              { geo: limb(v(x * 8, 12, -7), v(x * 8.6, 1.6, -4), 3.2, 2, 7), color: dark },
              { geo: new BoxGeometry(4, 1.4, 7), color: dark, at: [x * 8.6, 0.7, -1] },
              { geo: limb(v(x * 6, 16, 10), v(x * 8.5, 9, 18), 2.4, 1.5, 6), color: dark },
            );
            for (const c of [-1, 0, 1])
              bits.push(
                {
                  geo: new ConeGeometry(0.8, 4.6, 5),
                  color: PAPER,
                  at: [x * 8.6 + c * 1.5, 0.9, 4],
                  rot: [Math.PI / 2, 0, 0],
                },
                {
                  geo: new ConeGeometry(0.7, 4, 5),
                  color: PAPER,
                  at: [x * 8.5 + c * 1.3, 8.4, 21],
                  rot: [Math.PI / 2 + 0.5, 0, 0],
                },
              );
          }
          const tail = [v(0, 15, -14), v(0, 12, -27), v(0, 11, -40), v(0, 14, -52), v(0, 19, -60)];
          const neck = [v(0, 21, 9), v(0, 29, 14), v(0, 40, 15), v(0, 50, 20), v(0, 56, 27)];
          const rad = [7, 5.6, 4.4, 3.4, 2.6];
          const trad = [6.4, 4.6, 3.2, 2, 0.8];
          for (let i = 0; i < 4; i++) {
            bits.push(
              { geo: limb(tail[i], tail[i + 1], trad[i], trad[i + 1], 8), color: scale },
              { geo: limb(neck[i], neck[i + 1], rad[i], rad[i + 1], 8), color: scale },
              {
                geo: new SphereGeometry(trad[i + 1], 8, 6),
                color: scale,
                at: tail[i + 1].toArray(),
              },
              {
                geo: new SphereGeometry(rad[i + 1], 8, 6),
                color: scale,
                at: neck[i + 1].toArray(),
              },
            );
            bits.push({
              geo: limb(neck[i], neck[i + 1], rad[i] * 0.7, rad[i + 1] * 0.7, 6),
              color: belly,
              at: [0, 0, 2.2],
            });
          }
          for (let i = 0; i < 9; i++) {
            const t = i / 8;
            bits.push({
              geo: new ConeGeometry(1.8 - t * 0.7, 5.5 - t * 1.8, 5),
              color: dark,
              at: [0, 26.6 - t * 3 - Math.abs(t - 0.2) * 6, 10 - t * 19],
              rot: [-0.5 - t * 0.6, 0, 0],
            });
          }
          for (let i = 0; i < 4; i++)
            bits.push({
              geo: new ConeGeometry(1.4 - i * 0.25, 4 - i * 0.6, 5),
              color: dark,
              at: [0, tail[i].y + trad[i] + 1, tail[i].z - 2],
              rot: [-1.1, 0, 0],
            });
          return bits;
        },
        1.1,
      ),
    );
    for (const side of [-1, 1]) {
      const w = new Group();
      const membrane = new Mesh(
        kit.geo('jabber-wing', () => new ShapeGeometry(batWing(), 12).rotateX(-Math.PI / 2)),
        kit.own(
          new MeshToonMaterial({
            color: '#3b2c4a',
            gradientMap: kit.gradient,
            emissive: '#2a1030',
            emissiveIntensity: 0.4,
            side: DoubleSide,
          }),
        ),
      );
      w.add(membrane);
      w.add(
        kit.solid(
          'jabber-wing-bones',
          () => [
            { geo: limb(v(0, 0, 0), v(16, 0.4, -2), 1.5, 1.1, 5), color: dark },
            { geo: limb(v(16, 0.4, -2), v(36, 0, 0), 1.1, 0.5, 5), color: dark },
            { geo: limb(v(16, 0.4, -2), v(31, 0, -16), 0.7, 0.4, 4), color: BRASS },
            { geo: limb(v(16, 0.4, -2), v(23, 0, -20), 0.7, 0.4, 4), color: BRASS },
            { geo: limb(v(16, 0.4, -2), v(12, 0, -21), 0.7, 0.4, 4), color: BRASS },
            {
              geo: new ConeGeometry(0.9, 3.4, 5),
              color: PAPER,
              at: [36.4, 0, 1.5],
              rot: [Math.PI / 2, 0, -Math.PI / 2],
            },
          ],
          0.4,
        ),
      );
      w.position.set(side * 7, 27, 4);
      w.scale.x = side;
      this.wings.push(w);
      this.body.add(w);
    }
    this.root.add(this.body);

    put(
      this.head,
      kit.solid(
        'jabber-head',
        () => {
          const bits: Bit[] = [
            {
              geo: new SphereGeometry(1, 14, 10),
              color: scale,
              at: [0, 0, 0],
              scale: [4.2, 3.6, 5.4],
            },
            {
              geo: new SphereGeometry(1, 12, 8),
              color: scale,
              at: [0, -0.4, 6.4],
              scale: [2.8, 2.2, 5.4],
            },
            {
              geo: new SphereGeometry(1, 8, 6),
              color: belly,
              at: [0, -1.2, 7],
              scale: [2, 1.2, 4.4],
            },
          ];
          for (const x of [-1, 1]) {
            bits.push(
              {
                geo: new ConeGeometry(1, 7, 5),
                color: dark,
                at: [x * 2.6, 3.6, -3.4],
                rot: [-1.2, 0, -x * 0.35],
              },
              {
                geo: new ConeGeometry(0.7, 2.4, 5),
                color: PAPER,
                at: [x * 0.9, -2.7, 11],
                rot: [Math.PI, 0, 0],
              },
            );
            for (const z of [8.4, 10])
              bits.push({
                geo: new ConeGeometry(0.5, 1.7, 4),
                color: PAPER,
                at: [x * 1.8, -2, z],
                rot: [Math.PI, 0, 0],
              });
          }
          return bits;
        },
        0.9,
      ),
    );
    put(
      this.jaw,
      kit.solid(
        'jabber-jaw',
        () => {
          const bits: Bit[] = [
            {
              geo: new SphereGeometry(1, 10, 7),
              color: belly,
              at: [0, 0, 5.6],
              scale: [2.3, 1, 5.8],
            },
          ];
          for (const x of [-1, 1])
            bits.push({
              geo: new ConeGeometry(0.5, 1.8, 4),
              color: PAPER,
              at: [x * 1.6, 1.2, 8.2],
            });
          return bits;
        },
        0.8,
      ),
    );
    this.jaw.position.set(0, -2.2, 1);
    this.head.add(this.jaw);
    this.eyes = kit.own(
      new MeshBasicMaterial({ color: '#ff8a2a', vertexColors: true, fog: false }),
    );
    this.head.add(
      new Mesh(
        kit.geo('jabber-eyes', () =>
          kit.merge(
            [-1, 1].map((x) => ({
              geo: new SphereGeometry(1.2, 8, 6),
              color: WHITE,
              at: [x * 3.1, 1.2, 3.2] as [number, number, number],
              scale: [0.8, 1, 1.2] as [number, number, number],
            })),
          ),
        ),
        this.eyes,
      ),
    );
    put(this.head, kit.glowSprite('#ff7a2a', 14, 0.6), 0, 1.2, 4);
    this.head.position.set(0, 56, 27);
    this.head.rotation.x = 0.35;
    this.root.add(this.head);
    this.root.scale.setScalar(1.3);
  }

  animate(time: number, lunge: number): void {
    const t = time + this.seed;
    this.body.position.y = Math.sin(t * 1.6) * 0.7 + lunge * 1.5;
    this.body.scale.y = 1 + Math.sin(t * 1.6) * 0.015;
    const flap = Math.sin(t * 2.4) * 0.32 + 0.45 + lunge * 0.4;
    for (const [i, w] of this.wings.entries()) w.rotation.z = (i === 0 ? -1 : 1) * flap;
    this.head.position.y = 56 + Math.sin(t * 1.1) * 1.6 - lunge * 4;
    this.head.position.z = 27 + Math.sin(t * 0.8) * 1.4 + lunge * 8;
    this.head.rotation.x = 0.35 + lunge * 0.45 + Math.sin(t * 1.3) * 0.05;
    this.head.rotation.y = Math.sin(t * 0.6) * 0.16;
    this.jaw.rotation.x = 0.16 + lunge * 0.6 + Math.max(0, Math.sin(t * 2.1)) * 0.12;
    this.eyes.color.set('#ff8a2a').multiplyScalar(0.85 + 0.15 * Math.sin(t * 7));
  }
}
