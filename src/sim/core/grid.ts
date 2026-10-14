interface Positioned {
  x: number;
  y: number;
}

export class Grid<T extends Positioned> {
  private cells: T[][];
  /** Indices of the cells holding items, so `clear` skips the empty ones. */
  private used: number[] = [];
  private readonly cols: number;
  private readonly rows: number;
  constructor(
    width: number,
    length: number,
    private readonly cell: number,
  ) {
    this.cols = Math.ceil(width / cell);
    this.rows = Math.ceil(length / cell);
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
  }

  clear(): void {
    for (const k of this.used) this.cells[k].length = 0;
    this.used.length = 0;
  }

  private idx(v: number, n: number): number {
    const i = Math.floor(v / this.cell);
    return i < 0 ? 0 : i >= n ? n - 1 : i;
  }

  insert(item: T): void {
    const k = this.idx(item.y, this.rows) * this.cols + this.idx(item.x, this.cols);
    if (this.cells[k].length === 0) this.used.push(k);
    this.cells[k].push(item);
  }

  query(x: number, y: number, radius: number, out: T[] = []): T[] {
    const x0 = this.idx(x - radius, this.cols);
    const x1 = this.idx(x + radius, this.cols);
    const y0 = this.idx(y - radius, this.rows);
    const y1 = this.idx(y + radius, this.rows);
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
