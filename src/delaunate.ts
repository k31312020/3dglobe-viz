// delaunate.ts
// Simple Bowyer–Watson Delaunay triangulation in TypeScript

export interface Vec2 { x: number; y: number; boundary?: boolean; }

export interface Triangle {
  a: number;
  b: number;
  c: number;
  circum?: { x: number; y: number; r2: number };
}

export class Delaunay2D {
  points: Vec2[];
  triangles: Triangle[] = [];

  constructor(points: Vec2[]) {
    this.points = [...points];
    this.initSuperTriangle();
  }

  private initSuperTriangle() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of this.points) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }

    const dx = maxX - minX;
    const dy = maxY - minY;
    const d = Math.max(dx, dy);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2; 

    const p1 = { x: cx - 20 * d, y: cy - d };
    const p2 = { x: cx, y: cy + 20 * d };
    const p3 = { x: cx + 20 * d, y: cy - d };

    const i1 = this.points.push(p1) - 1;
    const i2 = this.points.push(p2) - 1;
    const i3 = this.points.push(p3) - 1;

    this.triangles.push({ a: i1, b: i2, c: i3, circum: this.computeCircum(i1, i2, i3) });
  }

  private computeCircum(aIdx: number, bIdx: number, cIdx: number) {
    const A = this.points[aIdx];
    const B = this.points[bIdx];
    const C = this.points[cIdx];
    const d = 2 * (A.x * (B.y - C.y) + B.x * (C.y - A.y) + C.x * (A.y - B.y));
    if (Math.abs(d) < 1e-12) return { x: Infinity, y: Infinity, r2: Infinity };

    const ux = ((A.x ** 2 + A.y ** 2) * (B.y - C.y) +
                (B.x ** 2 + B.y ** 2) * (C.y - A.y) +
                (C.x ** 2 + C.y ** 2) * (A.y - B.y)) / d;
    const uy = ((A.x ** 2 + A.y ** 2) * (C.x - B.x) +
                (B.x ** 2 + B.y ** 2) * (A.x - C.x) +
                (C.x ** 2 + C.y ** 2) * (B.x - A.x)) / d;

    const r2 = (ux - A.x) ** 2 + (uy - A.y) ** 2;
    return { x: ux, y: uy, r2 };
  }

  public insertPoint(idx: number) {
    const P = this.points[idx];
    const bad: Triangle[] = [];

    // Find triangles whose circumcircle contains P
    for (const t of this.triangles) {
      if (!t.circum) t.circum = this.computeCircum(t.a, t.b, t.c);
      const c = t.circum;
      const d2 = (c.x - P.x) ** 2 + (c.y - P.y) ** 2;
      if (d2 <= c.r2 + 1e-12) bad.push(t);
    }

    // Find boundary edges
    const edgeMap = new Map<string, number>();
    const key = (a: number, b: number) => a < b ? `${a}-${b}` : `${b}-${a}`;

    for (const t of bad) {
      [[t.a, t.b], [t.b, t.c], [t.c, t.a]].forEach(([a, b]) => {
        edgeMap.set(key(a, b), (edgeMap.get(key(a, b)) || 0) + 1);
      });
    }

    const polygon: [number, number][] = [];
    for (const [k, count] of edgeMap.entries()) if (count === 1) {
      const [a, b] = k.split('-').map(Number);
      polygon.push([a, b]);
    }

    // Remove bad triangles
    this.triangles = this.triangles.filter(t => !bad.includes(t));

    // Create new triangles
    for (const [a, b] of polygon) {
      const t: Triangle = { a, b, c: idx, circum: {x:0, y:0, r2:0} };
      t.circum = this.computeCircum(a, b, idx);
      this.triangles.push(t);
    }
  }

  public finalize() {
    const superIdx = this.points.length - 3;
    const superSet = new Set([superIdx, superIdx + 1, superIdx + 2]);
    this.triangles = this.triangles.filter(t =>
      !superSet.has(t.a) && !superSet.has(t.b) && !superSet.has(t.c)
    );
  }
}
