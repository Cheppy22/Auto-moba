import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Group,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type Texture,
} from 'three';
import type { Content } from '../../sim';
import { buildTerrain } from '../../sim';
import { groundTiles, woodsTiles } from './lod';
import { LOOK, TABLE } from './palette';
import {
  CAMP_BADGE,
  groveProps,
  LIP,
  mapStyle,
  type MapStyle,
  type MapStyleId,
  paintCover,
  paintLake,
  paintLongStyled,
} from './longlook';
import { bastionSites, type Ground, LongRelief, Relief, RELIEF, TERRACE } from './relief';

/** Walnut frame width around the square board (world units). */
export const FRAME = 130;
/** The Long Board's apron: ground past the board's edge, out to the lake (world units). */
export const APRON = 340;
/** Side of the lake plane round the Long Board (it reaches past the fog). */
const LAKE_SIZE = 40000;
/** Board top is y = 0; the slab and frame sit just under it. */
const SLAB = 46;

export type Orient = 'portrait' | 'landscape';

const FILES = 'abcdefgh';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, aniso = 8): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = aniso;
  t.minFilter = LinearMipmapLinearFilter;
  return t;
}

/** Point at arc length `d` along a polyline. */
function along(pts: readonly (readonly number[])[], d: number): [number, number, number] {
  let left = d;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const len = Math.hypot(bx - ax, by - ay);
    if (left <= len) {
      const t = left / len;
      return [ax + (bx - ax) * t, ay + (by - ay) * t, Math.atan2(by - ay, bx - ax)];
    }
    left -= len;
  }
  const [x, y] = pts[pts.length - 1];
  return [x, y, 0];
}

/**
 * The board. Square map: the Tournament Table, a walnut table in a dark hall, a thick board slab
 * with a walnut notation frame and brass bead, an 8×8 chessboard in mid tones, felt lane runners
 * edged in brass, recessed jungle courts and the two base medallions. Long Board: the garden in its
 * theme, filling the screen; past its edge the dead-space floor and the river run on across an
 * apron ringed by woods, down to a lake that fades into the haze (no table, no frame). The whole
 * top is one painted texture (one draw).
 */
export class Board {
  readonly group = new Group();
  /** Half the board's width (x) and length (z), and the half extents with the frame or apron. */
  readonly hx: number;
  readonly hz: number;
  readonly ex: number;
  readonly ez: number;
  /** Ground drawn past the board's edge: the square board's frame, the Long Board's apron. */
  readonly margin: number;
  /** The Long Board (terraces, rectangular): painted and raised by its own rules. */
  readonly long: boolean;
  /** Ground heights (raised squares, daises, court pits, Bastion tiles; terraces on the Long Board). */
  readonly relief: Ground;
  private readonly topMat: MeshLambertMaterial;
  private readonly owned: { dispose(): void }[] = [];
  private orient: Orient | null = null;
  private readonly gates: { mesh: Mesh; id: string }[] = [];
  private readonly texSize: number;
  /** The Long Board's theme; null on the square board. */
  private style: MapStyle | null;
  /** Long Board: the closed-clearing cover (repainted with the theme), the props and the lake. */
  private cover: { canvas: HTMLCanvasElement; tex: CanvasTexture; r: number } | null = null;
  private props: Mesh[] = [];
  private readonly propsMat = this.own(
    new MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  private lake: { canvas: HTMLCanvasElement; tex: CanvasTexture } | null = null;

  constructor(
    private readonly content: Content,
    texSize: number,
    theme: MapStyleId = 'a',
  ) {
    const map = content.map;
    const hx = map.size / 2;
    const hz = (map.length ?? map.size) / 2;
    this.hx = hx;
    this.hz = hz;
    this.long = !!map.terraces;
    this.margin = this.long ? APRON : FRAME;
    this.ex = hx + this.margin;
    this.ez = hz + this.margin;
    const E = Math.max(this.ex, this.ez);
    this.texSize = texSize;
    this.style = this.long ? mapStyle(theme) : null;
    this.relief = this.long ? new LongRelief(map, APRON, 20, LIP) : new Relief(content, E);

    // the painted top (board + frame or apron), lifted into relief; flat shading gives the
    // terraces crisp, faceted sides (low poly) while the flat tops stay one tone
    this.topMat = this.own(new MeshLambertMaterial({ color: '#ffffff', flatShading: true }));
    // the Long Board's ground comes in tiles (the frustum skips the ones off screen), its apron coarser
    const tops =
      this.relief instanceof LongRelief
        ? groundTiles(this.relief, Math.round(APRON / this.relief.cell), TERRACE.lake)
        : [this.reliefGeometry()];
    for (const geo of tops) {
      const top = new Mesh(this.own(geo), this.topMat);
      top.receiveShadow = true;
      this.group.add(top);
    }
    if (this.long) this.buildLake();
    else this.buildTable(E);

    // covers over jungle courts that are not open yet: the Long Board's dark cover with a
    // keyhole, notched round the camp's badge; the square board's iron grate
    const [gc, gg] = canvas(256, 256);
    const coverR = (content.map.slots[0]?.radius ?? 0) * 0.92 + 8;
    if (!this.style) {
      gg.fillStyle = 'rgba(14,10,8,0.14)';
      gg.fillRect(0, 0, 256, 256);
      gg.strokeStyle = 'rgba(30,26,24,0.7)';
      gg.lineWidth = 7;
      for (let i = -256; i < 512; i += 42) {
        gg.beginPath();
        gg.moveTo(i, 0);
        gg.lineTo(i + 256, 256);
        gg.moveTo(i + 256, 0);
        gg.lineTo(i, 256);
        gg.stroke();
      }
      gg.strokeStyle = 'rgba(201,163,90,0.8)';
      gg.lineWidth = 6;
      gg.strokeRect(6, 6, 244, 244);
    }
    const coverTex = this.own(tex(gc, 4));
    if (this.style) {
      this.cover = { canvas: gc, tex: coverTex, r: coverR };
      this.paintCover();
    }
    const gateMat = this.own(
      new MeshBasicMaterial({ map: coverTex, transparent: true, depthWrite: false }),
    );
    for (const slot of content.map.slots) {
      const side = slot.radius * 1.84;
      const mesh = new Mesh(
        this.own(
          this.style
            ? new CircleGeometry(coverR, 40).rotateX(-Math.PI / 2)
            : new PlaneGeometry(side, side).rotateX(-Math.PI / 2),
        ),
        gateMat,
      );
      const y = this.long ? this.relief.atSim(slot.x, slot.y) : 0;
      mesh.position.set(slot.x - hx, 1.2 + y, slot.y - hz);
      mesh.renderOrder = 2;
      this.gates.push({ mesh, id: slot.id });
      this.group.add(mesh);
    }
    this.buildProps();
  }

  /** The square board's table: a walnut plane with a pool of lamp light, the slab and the beads. */
  private buildTable(E: number): void {
    const lift = this.relief.frameH;
    const [tc, tg] = canvas(1024, 1024);
    const r = tg.createRadialGradient(512, 512, 40, 512, 512, 512);
    const tg4 = TABLE.tableGrad;
    r.addColorStop(0, tg4[0]);
    r.addColorStop(0.28, tg4[1]);
    r.addColorStop(0.62, tg4[2]);
    r.addColorStop(1, tg4[3]);
    tg.fillStyle = r;
    tg.fillRect(0, 0, 1024, 1024);
    tg.globalAlpha = 0.05;
    for (let i = 0; i < 160; i++) {
      tg.strokeStyle = i % 2 ? '#000' : '#a0703f';
      tg.lineWidth = 1 + (i % 3);
      tg.beginPath();
      const y = (i / 160) * 1024 + Math.sin(i * 1.7) * 6;
      tg.moveTo(0, y);
      tg.bezierCurveTo(300, y + Math.sin(i) * 10, 700, y - Math.cos(i) * 10, 1024, y);
      tg.stroke();
    }
    const tableTex = this.own(tex(tc, 4));
    const tableMat = this.own(new MeshLambertMaterial({ map: tableTex }));
    const table = new Mesh(
      this.own(new PlaneGeometry(E * 7, E * 7).rotateX(-Math.PI / 2)),
      tableMat,
    );
    table.position.y = -SLAB;
    table.receiveShadow = true;

    // the slab under the frame; its top sits below the court pits (the relief's rim drops onto it)
    const slabMat = this.own(new MeshLambertMaterial({ color: TABLE.frameDark }));
    const slabTop = -24;
    const slab = new Mesh(
      this.own(new BoxGeometry(this.ex * 2, SLAB + slabTop, this.ez * 2)),
      slabMat,
    );
    slab.position.y = (-SLAB + slabTop) / 2;
    slab.receiveShadow = true;
    this.group.add(table, slab);

    // brass bead around the playing field, dark bead at the outer edge
    const brass = this.own(new MeshLambertMaterial({ color: TABLE.brass, emissive: '#2a1d08' }));
    const dark = this.own(new MeshLambertMaterial({ color: TABLE.frameDark }));
    const bead = (
      len: number,
      w: number,
      h: number,
      x: number,
      z: number,
      rot: boolean,
      m: MeshLambertMaterial,
    ): void => {
      const mesh = new Mesh(this.own(new BoxGeometry(len, h, w)), m);
      mesh.position.set(x, h / 2 - 0.5 + lift, z);
      if (rot) mesh.rotation.y = Math.PI / 2;
      this.group.add(mesh);
    };
    const sx = this.hx + 5;
    const sz = this.hz + 5;
    for (const sign of [-1, 1]) {
      bead(sx * 2 + 10, 10, 4, 0, sign * sz, false, brass);
      bead(sz * 2 + 10, 10, 4, sign * sx, 0, true, brass);
      bead(this.ex * 2 + 8, 12, 7, 0, sign * (this.ez - 2), false, dark);
      bead(this.ez * 2 + 8, 12, 7, sign * (this.ex - 2), 0, true, dark);
    }
  }

  /** The Long Board's lake: one wide plane round the island, fading into the haze. */
  private buildLake(): void {
    const [c] = canvas(1024, 1024);
    const t = this.own(tex(c, 4));
    this.lake = { canvas: c, tex: t };
    this.paintLake();
    const lake = new Mesh(
      this.own(new PlaneGeometry(LAKE_SIZE, LAKE_SIZE).rotateX(-Math.PI / 2)),
      this.own(new MeshLambertMaterial({ map: t })),
    );
    lake.position.y = TERRACE.lake + 8;
    this.group.add(lake);
  }

  private paintLake(): void {
    if (!this.lake || !this.style) return;
    const c = this.lake.canvas;
    paintLake(c.getContext('2d')!, c.width, LAKE_SIZE, this.content.map, this.style);
    this.lake.tex.needsUpdate = true;
  }

  /** The Long Board's grove pines, hedges and gate arches (they cast shadows) and the woods round the garden. */
  private buildProps(): void {
    for (const m of this.props) {
      this.group.remove(m);
      m.geometry.dispose();
    }
    this.props = [];
    if (!this.style) return;
    const grove = groveProps(this.content.map, this.relief, this.style);
    if (grove) {
      const m = new Mesh(grove, this.propsMat);
      m.castShadow = true;
      this.props.push(m);
    }
    for (const geo of woodsTiles(this.content.map, this.relief, this.style, APRON))
      this.props.push(new Mesh(geo, this.propsMat));
    this.group.add(...this.props);
  }

  private paintCover(): void {
    const c = this.cover;
    if (!c || !this.style) return;
    const g = c.canvas.getContext('2d')!;
    paintCover(g, c.canvas.width, this.style, (c.r - 8) / c.r, (CAMP_BADGE + 5) / c.r);
    c.tex.needsUpdate = true;
  }

  /** The Long Board's theme (repaints the ground, the covers, the props and the lake). */
  setTheme(theme: MapStyleId): void {
    if (!this.long || this.style?.id === theme) return;
    this.style = mapStyle(theme);
    this.paintCover();
    this.buildProps();
    this.paintLake();
    if (this.orient) {
      const o = this.orient;
      this.orient = null;
      this.setOrient(o);
    }
  }

  /** The haze colour the distance fades into (the Long Board's theme), or null for the hall. */
  get haze(): string | null {
    return this.style?.haze ?? null;
  }

  /** One indexed grid over board and frame, heights from the relief, UVs onto the painted top. */
  private reliefGeometry(): BufferGeometry {
    const R = this.relief;
    const nx = R.nx;
    const nz = R.nz;
    const w = nx + 1;
    const pos = new Float32Array(w * (nz + 1) * 3);
    const uv = new Float32Array(w * (nz + 1) * 2);
    for (let j = 0; j <= nz; j++)
      for (let i = 0; i <= nx; i++) {
        const k = j * w + i;
        const x = -R.ex + i * R.cell;
        const z = -R.ez + j * R.cell;
        pos[k * 3] = x;
        // the outermost ring drops to the slab (the square board's side edge) or into the lake
        const rim = i === 0 || j === 0 || i === nx || j === nz;
        pos[k * 3 + 1] = rim ? (this.long ? TERRACE.lake : -SLAB * 0.6) : R.h[k];
        pos[k * 3 + 2] = z;
        uv[k * 2] = (x + R.ex) / (2 * R.ex);
        uv[k * 2 + 1] = 1 - (z + R.ez) / (2 * R.ez);
      }
    // split each cell along its flatter diagonal, so 45° cliffs in either direction stay straight
    // (a fixed split saw-tooths every edge that runs the other way)
    const idx: number[] = [];
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const a = j * w + i;
        const b = a + 1;
        const c = a + w;
        const d = c + 1;
        const y = (k: number): number => pos[k * 3 + 1];
        if (Math.abs(y(a) - y(d)) < Math.abs(y(b) - y(c))) idx.push(a, c, d, a, d, b);
        else idx.push(a, c, b, b, c, d);
      }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  private own<T extends { dispose(): void }>(x: T): T {
    this.owned.push(x);
    return x;
  }

  /** Repaints the top when the screen turns (labels and notation face the player). */
  setOrient(o: Orient): void {
    if (o === this.orient) return;
    this.orient = o;
    const old = this.topMat.map;
    this.topMat.map = this.paint(o);
    this.topMat.needsUpdate = true;
    old?.dispose();
    // the closed-clearing covers' keyholes face the player too
    if (this.style)
      for (const g of this.gates) g.mesh.rotation.y = o === 'portrait' ? 0 : Math.PI / 2;
  }

  /** Shows the iron gate over each court that is still closed. */
  sync(open: (id: string) => boolean): void {
    for (const g of this.gates) g.mesh.visible = !open(g.id);
  }

  private paint(o: Orient): Texture {
    if (this.style) {
      // the long side gets a third more pixels than the square board's texture
      const H = Math.round((this.texSize * 4) / 3);
      const [c, g] = canvas(Math.round((H * this.ex) / this.ez), H);
      paintLongStyled(g, c.height / (2 * this.ez), this.content.map, APRON, o, this.style);
      return this.own(tex(c));
    }
    const S = this.texSize;
    const half = this.hx;
    const size = half * 2;
    const E = this.ex;
    const [c, g] = canvas(S, S);
    const k = S / (2 * E);
    // sim coordinates: (0,0) is the board's top-left corner, the frame sits outside [0, size]
    g.setTransform(k, 0, 0, k, FRAME * k, FRAME * k);
    // text faces the player: White sits at the (0, size) corner; the square framing sits on
    // White's rank-1 edge, so its text needs no turn
    const upright = LOOK.cam.square ? 0 : o === 'portrait' ? Math.PI / 4 : -Math.PI / 4;

    // frame: walnut with a soft sheen and a brass inlay line
    const fg = g.createLinearGradient(-FRAME, -FRAME, size + FRAME, size + FRAME);
    fg.addColorStop(0, TABLE.frameGrad[0]);
    fg.addColorStop(0.5, TABLE.frameGrad[1]);
    fg.addColorStop(1, TABLE.frameGrad[2]);
    g.fillStyle = fg;
    g.fillRect(-FRAME, -FRAME, size + FRAME * 2, size + FRAME * 2);
    g.strokeStyle = TABLE.brassDark;
    g.lineWidth = 4;
    g.strokeRect(-FRAME * 0.72, -FRAME * 0.72, size + FRAME * 1.44, size + FRAME * 1.44);

    // notation: files a-h along White's near edges, ranks 1-8 along the other near edge
    const sq = size / 8;
    g.fillStyle = TABLE.notation;
    g.font = `${Math.round(FRAME * 0.5)}px 'IM Fell English SC', Georgia, serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const glyph = (txt: string, x: number, y: number): void => {
      g.save();
      g.translate(x, y);
      g.rotate(upright);
      g.fillText(txt, 0, 0);
      g.restore();
    };
    for (let i = 0; i < 8; i++) {
      glyph(FILES[i], sq * (i + 0.5), size + FRAME * 0.42);
      glyph(String(i + 1), -FRAME * 0.42, size - sq * (i + 0.5));
      glyph(FILES[i], sq * (i + 0.5), -FRAME * 0.42);
      glyph(String(i + 1), size + FRAME * 0.42, size - sq * (i + 0.5));
    }

    // the chessboard
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 8; j++) {
        g.fillStyle = (i + j) % 2 === 0 ? TABLE.sqLight : TABLE.sqDark;
        g.fillRect(i * sq, j * sq, sq + 0.5, sq + 0.5);
      }
    // lamp light: warm centre, darker corners
    const lamp = g.createRadialGradient(half, half, size * 0.05, half, half, size * 0.75);
    lamp.addColorStop(0, `rgba(255,226,170,${TABLE.lampIn})`);
    lamp.addColorStop(0.6, 'rgba(0,0,0,0)');
    lamp.addColorStop(1, `rgba(10,6,3,${TABLE.lampOut})`);
    g.fillStyle = lamp;
    g.fillRect(0, 0, size, size);

    // halfway rule (the old river line), a double brass hairline corner to corner
    g.strokeStyle = 'rgba(201,163,90,0.55)';
    g.lineWidth = 3;
    for (const d of [-9, 9]) {
      g.beginPath();
      g.moveTo(d, -d);
      g.lineTo(size + d, size - d);
      g.stroke();
    }

    const map = this.content.map;
    const terrain = buildTerrain(map);
    // jungle courts: recessed squares one step darker, a soft inner shadow, a low-contrast check
    for (const slot of map.slots) {
      const h = slot.radius * 0.92;
      const x0 = slot.x - h;
      const y0 = slot.y - h;
      g.fillStyle = TABLE.ink;
      g.fillRect(x0 - 10, y0 - 10, h * 2 + 20, h * 2 + 20);
      g.fillStyle = TABLE.brassDark;
      g.fillRect(x0 - 6, y0 - 6, h * 2 + 12, h * 2 + 12);
      const n = 4;
      const cs = (h * 2) / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          g.fillStyle = (i + j) % 2 === 0 ? TABLE.court : TABLE.courtDark;
          g.fillRect(x0 + i * cs, y0 + j * cs, cs + 0.5, cs + 0.5);
        }
      const sh = g.createLinearGradient(x0, y0, x0 + h * 0.5, y0 + h * 0.5);
      sh.addColorStop(0, 'rgba(0,0,0,0.5)');
      sh.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = sh;
      g.fillRect(x0, y0, h * 2, h * 2);
    }

    // felt runners: lanes and court paths share one outline (ink, brass, felt, nap)
    const runs = terrain.shapes.filter((s) => s.kind === 'lane' || s.kind === 'port');
    const stroke = (pad: number, style: string, scale = 1): void => {
      g.strokeStyle = style;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      for (const s of runs) {
        g.lineWidth = (s.r * scale + pad) * 2;
        g.beginPath();
        g.moveTo(s.ax, s.ay);
        g.lineTo(s.bx, s.by);
        g.stroke();
      }
    };
    stroke(13, 'rgba(10,6,4,0.6)');
    stroke(8, TABLE.brass);
    stroke(4, TABLE.brassDark);
    stroke(0, TABLE.feltDark);
    stroke(-6, TABLE.felt);
    stroke(-6, TABLE.feltLight, 0.55);
    stroke(-6, TABLE.felt, 0.42);

    // Bastion squares: a marble tile edged in brass under every Bastion
    for (const [tx, ty] of bastionSites(this.content)) {
      const h = RELIEF.tileHalf;
      g.fillStyle = 'rgba(10,6,4,0.6)';
      g.fillRect(tx - h - 8, ty - h - 8, h * 2 + 16, h * 2 + 16);
      g.fillStyle = TABLE.brass;
      g.fillRect(tx - h - 3, ty - h - 3, h * 2 + 6, h * 2 + 6);
      g.fillStyle = TABLE.sqLight;
      g.fillRect(tx - h + 3, ty - h + 3, h * 2 - 6, h * 2 - 6);
      g.strokeStyle = TABLE.brassDark;
      g.lineWidth = 3;
      g.strokeRect(tx - h * 0.62, ty - h * 0.62, h * 1.24, h * 1.24);
    }

    // base medallions: brass ring, team marble, an eight-point brass star
    for (const [team, [bx, by]] of Object.entries(map.bases)) {
      const R = map.walk.base;
      g.fillStyle = 'rgba(10,6,4,0.6)';
      g.beginPath();
      g.arc(bx, by, R + 14, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = TABLE.brass;
      g.beginPath();
      g.arc(bx, by, R + 8, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = team === 'A' ? TABLE.baseA : TABLE.baseB;
      g.beginPath();
      g.arc(bx, by, R, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = team === 'A' ? 'rgba(125,98,50,0.8)' : 'rgba(195,204,216,0.45)';
      g.lineWidth = 5;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        const rr = i % 2 === 0 ? R * 0.86 : R * 0.55;
        g.beginPath();
        g.moveTo(bx + Math.cos(a - 0.2) * R * 0.2, by + Math.sin(a - 0.2) * R * 0.2);
        g.lineTo(bx + Math.cos(a) * rr, by + Math.sin(a) * rr);
        g.lineTo(bx + Math.cos(a + 0.2) * R * 0.2, by + Math.sin(a + 0.2) * R * 0.2);
        g.stroke();
      }
      g.beginPath();
      g.arc(bx, by, R * 0.93, 0, Math.PI * 2);
      g.stroke();
    }

    // lane names painted in brass on the felt, clear of White's dais and Throne
    g.font = `${Math.round(map.walk.lane * 0.46)}px 'IM Fell English SC', Georgia, serif`;
    const names: [keyof typeof map.lanes, string][] = [
      ['top', 'LEFT'],
      ['mid', 'MID'],
      ['bot', 'RIGHT'],
    ];
    for (const [id, name] of names) {
      const [x, y] = along(map.lanes[id], map.walk.base + 110);
      g.fillStyle = 'rgba(10,6,4,0.55)';
      glyph(name, x + 3, y + 3);
      g.fillStyle = TABLE.laneName;
      glyph(name, x, y);
    }

    return this.own(tex(c));
  }

  dispose(): void {
    for (const o of this.owned) o.dispose();
    this.topMat.map?.dispose();
  }
}
