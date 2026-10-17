import { describe, expect, it } from 'vitest';
import { gridLines, groundTiles } from '../src/render/table/lod';

describe('Long Board ground budget (4F)', () => {
  it('keeps every grid line over the board and thins the apron', () => {
    const lines = gridLines(134, 17);
    for (let i = 17; i <= 117; i++) expect(lines).toContain(i);
    expect(lines[0]).toBe(0);
    expect(lines[lines.length - 1]).toBe(134);
    expect(lines.length).toBeLessThan(134 - 2 * 17 + 1 + 2 * 8);
    // symmetric on both ends
    expect(lines.map((i) => 134 - i).sort((a, b) => a - b)).toEqual(lines);
  });

  it('tiles cover every kept cell once, sharing one vertex set', () => {
    const nx = 20;
    const nz = 40;
    const h = new Float32Array((nx + 1) * (nz + 1)).map((_, k) => (k % 7) * 3);
    const g = { nx, nz, ex: 200, ez: 400, cell: 20, h };
    const tiles = groundTiles(g, 4, -50, 2, 3);
    expect(tiles.length).toBe(6);
    const cells = (gridLines(nx, 4).length - 1) * (gridLines(nz, 4).length - 1);
    const tris = tiles.reduce((n, t) => n + t.index!.count / 3, 0);
    expect(tris).toBe(cells * 2);
    for (const t of tiles) {
      expect(t.getAttribute('position')).toBe(tiles[0].getAttribute('position'));
      expect(t.boundingSphere!.radius).toBeGreaterThan(0);
    }
  });
});
