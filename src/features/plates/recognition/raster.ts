import type { Point } from '../graph/types';

/** A single-channel image: 0 = background, 255 = ink. */
export interface Mask {
  width: number;
  height: number;
  data: Uint8Array;
}

export function emptyMask(width: number, height: number): Mask {
  return { width, height, data: new Uint8Array(width * height) };
}

/**
 * Fills polygons with the non-zero winding rule (as fonts are drawn), with `ss`×`ss`
 * supersampling for smooth, anti-aliased edges. Coordinates are in output pixels.
 */
export function rasterize(polygons: Point[][], width: number, height: number, ss = 4): Mask {
  const out = emptyMask(width, height);
  const coverage = new Float32Array(width * height);
  const edges: { x0: number; y0: number; x1: number; y1: number; dir: number }[] = [];
  for (const polygon of polygons)
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      if (a.y === b.y) continue;
      edges.push(
        a.y < b.y
          ? { x0: a.x, y0: a.y, x1: b.x, y1: b.y, dir: 1 }
          : { x0: b.x, y0: b.y, x1: a.x, y1: a.y, dir: -1 },
      );
    }
  const crossings: { x: number; dir: number }[] = [];
  const weight = 1 / (ss * ss);
  for (let sy = 0; sy < height * ss; sy++) {
    const y = (sy + 0.5) / ss;
    crossings.length = 0;
    for (const edge of edges)
      if (y >= edge.y0 && y < edge.y1)
        crossings.push({
          x: edge.x0 + ((y - edge.y0) / (edge.y1 - edge.y0)) * (edge.x1 - edge.x0),
          dir: edge.dir,
        });
    if (!crossings.length) continue;
    crossings.sort((p, q) => p.x - q.x);
    const row = Math.floor(sy / ss) * width;
    let winding = 0;
    for (let i = 0; i < crossings.length - 1; i++) {
      winding += crossings[i].dir;
      if (winding === 0) continue;
      // Sub-samples of this row covered by the span [x0, x1).
      const start = Math.max(0, Math.ceil(crossings[i].x * ss - 0.5));
      const end = Math.min(width * ss, Math.ceil(crossings[i + 1].x * ss - 0.5));
      for (let sx = start; sx < end; sx++) coverage[row + Math.floor(sx / ss)] += weight;
    }
  }
  for (let i = 0; i < coverage.length; i++)
    out.data[i] = Math.min(255, Math.round(coverage[i] * 255));
  return out;
}

/** Bounding box of pixels at or above `level`; null for an empty mask. */
export function inkBox(mask: Mask, level = 128) {
  let left = mask.width;
  let top = mask.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < mask.height; y++)
    for (let x = 0; x < mask.width; x++)
      if (mask.data[y * mask.width + x] >= level) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
  return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/** Deterministic pseudo-random numbers (mulberry32), so generated images are repeatable. */
export function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Solves the 3×3 homography mapping four `from` points onto four `to` points. */
export function homography(from: Point[], to: Point[]): number[] {
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  // Gaussian elimination with partial pivoting.
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let row = col + 1; row < 8; row++)
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    [b[col], b[pivot]] = [b[pivot], b[col]];
    for (let row = col + 1; row < 8; row++) {
      const factor = a[row][col] / a[col][col];
      for (let k = col; k < 8; k++) a[row][k] -= factor * a[col][k];
      b[row] -= factor * b[col];
    }
  }
  const h = new Array<number>(8).fill(0);
  for (let row = 7; row >= 0; row--) {
    let sum = b[row];
    for (let k = row + 1; k < 8; k++) sum -= a[row][k] * h[k];
    h[row] = sum / a[row][row];
  }
  return [...h, 1];
}

export function project(h: number[], x: number, y: number): Point {
  const w = h[6] * x + h[7] * y + h[8];
  return { x: (h[0] * x + h[1] * y + h[2]) / w, y: (h[3] * x + h[4] * y + h[5]) / w };
}
