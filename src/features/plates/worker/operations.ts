import type { BlockType, Point, SocketType } from '../graph/types';
import { plateAspect } from '../plateConfig';
import type { CV, Mat } from './cv';
import type { MatScope } from './scope';

export type ImageValue = { type: Exclude<SocketType, 'region'>; mat: Mat };
/** A detected plate: four corners (clockwise from top-left) or null when none was found. */
export type RegionValue = { type: 'region'; quad: Point[] | null; base: Mat };
export type Value = ImageValue | RegionValue;

export interface OpResult {
  value?: Value;
  /** Short extra information shown on the node, e.g. the automatic threshold. */
  info?: string;
}

/** Thrown by an operation with a message meant for the student. */
export class OpError extends Error {}

type Inputs = Record<string, Value | undefined>;
type Op = (cv: CV, scope: MatScope, inputs: Inputs, params: Record<string, number>) => OpResult;

function image(inputs: Inputs, id = 'in'): ImageValue {
  const value = inputs[id];
  if (!value || value.type === 'region') throw new OpError('missing input');
  return value;
}

const kernelSize = (size: number) => 2 * Math.max(1, Math.round(size)) + 1;

function morphology(kind: 'erode' | 'dilate' | 'open' | 'close'): Op {
  return (cv, scope, inputs, params) => {
    const input = image(inputs);
    const out = scope.mat();
    const k = kernelSize(params.size);
    const kernel = scope.track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(k, k)));
    if (kind === 'erode') cv.erode(input.mat, out, kernel);
    else if (kind === 'dilate') cv.dilate(input.mat, out, kernel);
    else cv.morphologyEx(input.mat, out, kind === 'open' ? cv.MORPH_OPEN : cv.MORPH_CLOSE, kernel);
    return { value: { type: 'binary', mat: out } };
  };
}

/** Orders four corners: top-left, top-right, bottom-right, bottom-left. */
export function orderQuad(points: Point[]): Point[] {
  const sum = points.map((p) => p.x + p.y);
  const diff = points.map((p) => p.y - p.x);
  const tl = points[sum.indexOf(Math.min(...sum))];
  const br = points[sum.indexOf(Math.max(...sum))];
  const tr = points[diff.indexOf(Math.min(...diff))];
  const bl = points[diff.indexOf(Math.max(...diff))];
  return [tl, tr, br, bl];
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Width/height of a quad from its edge lengths. */
export function quadSize(quad: Point[]) {
  const [tl, tr, br, bl] = quad;
  return {
    width: (distance(tl, tr) + distance(bl, br)) / 2,
    height: (distance(tl, bl) + distance(tr, br)) / 2,
  };
}

function polygonArea(points: Point[]) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

/**
 * Finds the plate: the largest roughly rectangular white area with a plate-like shape.
 * Exported for tests.
 */
export function findPlateQuad(cv: CV, scope: MatScope, binary: Mat): Point[] | null {
  const contours = scope.track(new cv.MatVector());
  const hierarchy = scope.mat();
  // Close thin dark gaps first (seams between tiles, especially in shadow), so the plate
  // stays one white area instead of falling apart into separate tiles.
  const closed = scope.mat();
  const k = Math.max(3, Math.round(binary.cols / 90) | 1);
  const kernel = scope.track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(k, k)));
  cv.morphologyEx(binary, closed, cv.MORPH_CLOSE, kernel);
  cv.findContours(closed, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  const total = binary.rows * binary.cols;
  let best: { quad: Point[]; area: number } | null = null;
  for (let i = 0; i < contours.size(); i++) {
    const contour = scope.track(contours.get(i));
    const area = cv.contourArea(contour);
    if (area < total * 0.02 || area > total * 0.97) continue;
    const approx = scope.mat();
    cv.approxPolyDP(contour, approx, 0.03 * cv.arcLength(contour, true), true);
    let quad: Point[] | null = null;
    if (approx.rows === 4 && cv.isContourConvex(approx)) {
      const data = approx.data32S;
      quad = orderQuad([0, 1, 2, 3].map((k) => ({ x: data[k * 2], y: data[k * 2 + 1] })));
    } else {
      // Rounded or slightly broken outline: use the tightest rotated rectangle instead.
      const rect = cv.minAreaRect(contour);
      const corners = (
        cv as unknown as { RotatedRect: { points(r: unknown): Point[] } }
      ).RotatedRect.points(rect);
      quad = orderQuad(corners.map((p) => ({ x: p.x, y: p.y })));
      // Only accept it when the contour fills most of that rectangle.
      if (area < polygonArea(quad) * 0.8) quad = null;
    }
    if (!quad) continue;
    const { width, height } = quadSize(quad);
    const aspect = width / Math.max(1, height);
    if (aspect < 1.4 || aspect > 9) continue;
    const quadArea = polygonArea(quad);
    if (!best || quadArea > best.area) best = { quad, area: quadArea };
  }
  return best?.quad ?? null;
}

/** Keeps connected white shapes whose height and proportions look like characters. */
export function filterShapes(
  cv: CV,
  scope: MatScope,
  binary: Mat,
  minHeight: number,
  maxHeight: number,
): { mat: Mat; kept: number } {
  const labels = scope.mat();
  const stats = scope.mat();
  const centroids = scope.mat();
  const count = cv.connectedComponentsWithStats(binary, labels, stats, centroids, 8, cv.CV_32S);
  const keep = new Uint8Array(count);
  const low = (Math.min(minHeight, maxHeight) / 100) * binary.rows;
  const high = (Math.max(minHeight, maxHeight) / 100) * binary.rows;
  let kept = 0;
  const s = stats.data32S;
  for (let label = 1; label < count; label++) {
    const width = s[label * 5 + cv.CC_STAT_WIDTH];
    const height = s[label * 5 + cv.CC_STAT_HEIGHT];
    const aspect = height / Math.max(1, width);
    if (height >= low && height <= high && aspect >= 0.5 && aspect <= 15) {
      keep[label] = 255;
      kept++;
    }
  }
  const out = scope.track(new cv.Mat(binary.rows, binary.cols, cv.CV_8UC1));
  const source = labels.data32S;
  const target = out.data;
  for (let i = 0; i < source.length; i++) target[i] = keep[source[i]];
  return { mat: out, kept };
}

export const OPERATIONS: Partial<Record<BlockType, Op>> = {
  grayscale: (cv, scope, inputs) => {
    const out = scope.mat();
    cv.cvtColor(image(inputs).mat, out, cv.COLOR_RGBA2GRAY);
    return { value: { type: 'gray', mat: out } };
  },
  blur: (cv, scope, inputs, params) => {
    const input = image(inputs);
    const out = scope.mat();
    const k = kernelSize(params.strength);
    cv.GaussianBlur(input.mat, out, new cv.Size(k, k), 0);
    return { value: { type: input.type === 'color' ? 'color' : 'gray', mat: out } };
  },
  brightness: (cv, scope, inputs, params) => {
    const out = scope.mat();
    // Contrast pivots around middle grey, so it does not also change the brightness.
    const alpha = params.contrast;
    cv.convertScaleAbs(image(inputs).mat, out, alpha, 128 * (1 - alpha) + params.brightness);
    return { value: { type: 'gray', mat: out } };
  },
  equalize: (cv, scope, inputs) => {
    const out = scope.mat();
    cv.equalizeHist(image(inputs).mat, out);
    return { value: { type: 'gray', mat: out } };
  },
  threshold: (cv, scope, inputs, params) => {
    const out = scope.mat();
    const auto = params.auto >= 0.5;
    const used = cv.threshold(
      image(inputs).mat,
      out,
      params.level,
      255,
      auto ? cv.THRESH_BINARY + cv.THRESH_OTSU : cv.THRESH_BINARY,
    );
    return { value: { type: 'binary', mat: out }, info: auto ? `${Math.round(used)}` : undefined };
  },
  adaptive: (cv, scope, inputs, params) => {
    const out = scope.mat();
    const window = Math.max(3, Math.round(params.window) | 1);
    cv.adaptiveThreshold(
      image(inputs).mat,
      out,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY,
      window,
      params.sensitivity,
    );
    return { value: { type: 'binary', mat: out } };
  },
  invert: (cv, scope, inputs) => {
    const input = image(inputs);
    const out = scope.mat();
    cv.bitwise_not(input.mat, out);
    return { value: { type: input.type, mat: out } };
  },
  erode: morphology('erode'),
  dilate: morphology('dilate'),
  open: morphology('open'),
  close: morphology('close'),
  edges: (cv, scope, inputs, params) => {
    const out = scope.mat();
    cv.Canny(image(inputs).mat, out, params.level, params.level * 2);
    return { value: { type: 'binary', mat: out } };
  },
  findPlate: (cv, scope, inputs) => {
    const input = image(inputs);
    const quad = findPlateQuad(cv, scope, input.mat);
    return { value: { type: 'region', quad, base: input.mat }, info: quad ? undefined : 'noPlate' };
  },
  cropPlate: (cv, scope, inputs) => {
    const region = inputs.region;
    const input = image(inputs, 'image');
    if (!region || region.type !== 'region') throw new OpError('missing input');
    if (!region.quad) throw new OpError('noPlate');
    // The region may come from an image of another size (e.g. a 320 px branch).
    const sx = input.mat.cols / region.base.cols;
    const sy = input.mat.rows / region.base.rows;
    const quad = region.quad.map((p) => ({ x: p.x * sx, y: p.y * sy }));
    const { width, height } = quadSize(quad);
    // A tilted plate looks narrower than it is. When the outline resembles our plate frame,
    // straighten it to the known proportions so characters keep their true shape.
    const measured = width / Math.max(1, height);
    const known = plateAspect();
    const aspect = measured > known * 0.6 && measured < known * 1.6 ? known : measured;
    const outHeight = Math.max(24, Math.min(200, Math.round(height)));
    const outWidth = Math.max(48, Math.min(1000, Math.round(aspect * outHeight)));
    const from = scope.track(
      cv.matFromArray(
        4,
        1,
        cv.CV_32FC2,
        quad.flatMap((p) => [p.x, p.y]),
      ),
    );
    const to = scope.track(
      cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, outWidth, 0, outWidth, outHeight, 0, outHeight]),
    );
    const matrix = scope.track(cv.getPerspectiveTransform(from, to));
    const out = scope.mat();
    cv.warpPerspective(
      input.mat,
      out,
      matrix,
      new cv.Size(outWidth, outHeight),
      input.type === 'binary' ? cv.INTER_NEAREST : cv.INTER_LINEAR,
      cv.BORDER_REPLICATE,
    );
    return { value: { type: input.type, mat: out } };
  },
  shapeFilter: (cv, scope, inputs, params) => {
    const { mat, kept } = filterShapes(
      cv,
      scope,
      image(inputs).mat,
      params.minHeight,
      params.maxHeight,
    );
    return { value: { type: 'binary', mat }, info: `${kept}` };
  },
};
