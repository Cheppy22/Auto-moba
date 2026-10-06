export interface Positioned {
  x: number;
  y: number;
}

export class Grid<T extends Positioned> {
  private cells: T[][];
  private readonly cols: number;
  constructor(
    private readonly size: number,
    private readonly cell: number,
  ) {
    this.cols = Math.ceil(size / cell);
    this.cells = Array.from({ length: this.cols * this.cols }, () => []);
  }

  clear(): void {
    for (const c of this.cells) c.length = 0;
  }

  private idx(v: number): number {
    const i = Math.floor(v / this.cell);
    return i < 0 ? 0 : i >= this.cols ? this.cols - 1 : i;
  }

  insert(item: T): void {
    this.cells[this.idx(item.y) * this.cols + this.idx(item.x)].push(item);
  }

  query(x: number, y: number, radius: number, out: T[] = []): T[] {
    const x0 = this.idx(x - radius);
    const x1 = this.idx(x + radius);
    const y0 = this.idx(y - radius);
    const y1 = this.idx(y + radius);
    const r2 = radius * radius;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const bucket = this.cells[cy * this.cols + cx];
        for (let i = 0; i < bucket.length; i++) {
          const it = bucket[i];
          const dx = it.x - x;
          const dy = it.y - y;
          if (dx * dx + dy * dy <= r2) out.push(it);
        }
      }
    }
    return out;
  }
}
