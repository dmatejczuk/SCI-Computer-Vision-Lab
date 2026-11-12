import { drawPlate, PLATE, type Command, type Drawing } from '../../generator/plateDesign';
import type { Point } from '../graph/types';
import { plateConfig } from '../plateConfig';
import type { GlyphFont } from './font';
import { homography, project, random, rasterize } from './raster';

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface PlateSceneOptions {
  /** Scene size in pixels (default 640×400). */
  width?: number;
  height?: number;
  /** Plate width as a fraction of the scene width, when `corners` is not given. */
  plateWidth?: number;
  /** Plate corners in the scene (top-left, top-right, bottom-right, bottom-left): tilt. */
  corners?: Point[];
  /** Darkening of one side, 0–1 (a shadow across the plate). */
  shadow?: number;
  /** Per-pixel noise amplitude, 0–60. */
  noise?: number;
  /** Number of small dark specks on the plate ("dirt"). */
  dirt?: number;
  /** Overall brightness factor of the scene (dim light < 1). */
  light?: number;
  seed?: number;
}

/** Layout of the flat plate in "plate pixels" (one config unit = one pixel). */
const TILE = plateConfig.tile;

const hex = (color: string): [number, number, number] => [
  parseInt(color.slice(1, 3), 16),
  parseInt(color.slice(3, 5), 16),
  parseInt(color.slice(5, 7), 16),
];

/** Flattens drawing commands (mm) into pixel polygons; curves are subdivided. */
function polygonsOf(commands: Command[], scale: number, steps = 8): Point[][] {
  const polygons: Point[][] = [];
  let current: Point[] = [];
  let pen = { x: 0, y: 0 };
  for (const c of commands) {
    if (c[0] === 'M' || c[0] === 'L') {
      if (c[0] === 'M' && current.length > 2) polygons.push(current);
      if (c[0] === 'M') current = [];
      pen = { x: c[1], y: c[2] };
      current.push({ x: pen.x * scale, y: pen.y * scale });
    } else if (c[0] === 'C') {
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        const x =
          u * u * u * pen.x + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t * t * t * c[5];
        const y =
          u * u * u * pen.y + 3 * u * u * t * c[2] + 3 * u * t * t * c[4] + t * t * t * c[6];
        current.push({ x: x * scale, y: y * scale });
      }
      pen = { x: c[5], y: c[6] };
    } else {
      if (current.length > 2) polygons.push(current);
      current = [];
    }
  }
  if (current.length > 2) polygons.push(current);
  return polygons;
}

/**
 * Paints a vector drawing (mm) into an RGBA image, `scale` pixels per millimetre, on a
 * `background` colour. Even-odd shapes (the SCI logo) toggle coverage per outline.
 */
export function rasterizeDrawing(
  drawing: Drawing,
  scale: number,
  background: [number, number, number] = [255, 255, 255],
): RgbaImage {
  const width = Math.max(1, Math.round(drawing.width * scale));
  const height = Math.max(1, Math.round(drawing.height * scale));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([...background, 255], i * 4);
  for (const shape of drawing.shapes) {
    if (!shape.fill) continue;
    const rgb = hex(shape.fill);
    const polygons = polygonsOf(shape.commands, scale);
    const masks = shape.evenOdd
      ? polygons.map((polygon) => rasterize([polygon], width, height).data)
      : [rasterize(polygons, width, height).data];
    const coverage = new Float32Array(width * height);
    for (const mask of masks)
      for (let i = 0; i < mask.length; i++) {
        const m = mask[i] / 255;
        coverage[i] = shape.evenOdd
          ? coverage[i] + m - 2 * coverage[i] * m
          : Math.max(coverage[i], m);
      }
    for (let i = 0; i < coverage.length; i++)
      if (coverage[i] > 0)
        for (let c = 0; c < 3; c++)
          data[i * 4 + c] = data[i * 4 + c] * (1 - coverage[i]) + rgb[c] * coverage[i];
  }
  return { width, height, data };
}

/** Pixel width of a generated flat plate (both styles are about this wide). */
const FLAT_WIDTH = 920;

/** The plate seen head-on, in the configured style (printed EU-style plate or tile frame). */
export function renderFlatPlate(font: GlyphFont, text: string): RgbaImage {
  if (plateConfig.style === 'printed') {
    const drawing = drawPlate(font.font, text, 520);
    // Outside the rounded outline the image takes the outline's colour, so no white slivers
    // appear along the plate's edges in a scene.
    return rasterizeDrawing(drawing, FLAT_WIDTH / drawing.width, hex(PLATE.colors.ink));
  }
  return renderTilePlate(font, text);
}

/** The 3D tile frame seen head-on: frame, tiles in slots and characters from the tile font. */
function renderTilePlate(font: GlyphFont, text: string): RgbaImage {
  const slots = Math.max(plateConfig.slots, text.length);
  const width = TILE.border * 2 + slots * TILE.width + (slots - 1) * TILE.seam;
  const height = TILE.border * 2 + TILE.height;
  const data = new Uint8ClampedArray(width * height * 4);
  const colors = plateConfig.colors;
  const [frame, tile, seam, ink] = [colors.frame, colors.tile, colors.seam, colors.character].map(
    hex,
  );
  const paint = (x: number, y: number, rgb: [number, number, number], alpha = 1) => {
    const i = (y * width + x) * 4;
    for (let c = 0; c < 3; c++) data[i + c] = data[i + c] * (1 - alpha) + rgb[c] * alpha;
    data[i + 3] = 255;
  };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const inside =
        x >= TILE.border && x < width - TILE.border && y >= TILE.border && y < height - TILE.border;
      if (!inside) paint(x, y, frame);
      else {
        const offset = (x - TILE.border) % (TILE.width + TILE.seam);
        paint(x, y, offset >= TILE.width ? seam : tile);
      }
    }
  const chars = [...text.padEnd(slots, ' ')].slice(0, slots);
  // Characters are centred in their tile horizontally; all share one baseline.
  const baseline = TILE.border + (TILE.height + TILE.capHeight) / 2;
  chars.forEach((char, slot) => {
    if (char === ' ') return;
    const glyph = font.render(char, TILE.capHeight);
    const tileLeft = TILE.border + slot * (TILE.width + TILE.seam);
    let left = 0;
    let right = glyph.mask.width - 1;
    const column = (x: number) => {
      for (let y = 0; y < glyph.mask.height; y++)
        if (glyph.mask.data[y * glyph.mask.width + x]) return true;
      return false;
    };
    while (left < right && !column(left)) left++;
    while (right > left && !column(right)) right--;
    const ox = Math.round(tileLeft + (TILE.width - (right - left + 1)) / 2) - left;
    const oy = Math.round(baseline + glyph.top);
    for (let y = 0; y < glyph.mask.height; y++)
      for (let x = 0; x < glyph.mask.width; x++) {
        const alpha = glyph.mask.data[y * glyph.mask.width + x] / 255;
        const px = ox + x;
        const py = oy + y;
        if (alpha > 0 && px >= 0 && py >= 0 && px < width && py < height) paint(px, py, ink, alpha);
      }
  });
  return { width, height, data };
}

/**
 * A camera-like picture of a plate: the flat plate warped onto a desk background, with
 * optional tilt, shadow, dim light, noise and dirt. Deterministic for a given seed.
 */
export function renderPlateScene(
  font: GlyphFont,
  text: string,
  options: PlateSceneOptions = {},
): RgbaImage & { corners: Point[] } {
  const width = options.width ?? 640;
  const height = options.height ?? 400;
  const flat = renderFlatPlate(font, text);
  const plateWidth = (options.plateWidth ?? 0.8) * width;
  const plateHeight = (plateWidth * flat.height) / flat.width;
  const left = (width - plateWidth) / 2;
  const top = (height - plateHeight) / 2;
  const corners = options.corners ?? [
    { x: left, y: top },
    { x: left + plateWidth, y: top },
    { x: left + plateWidth, y: top + plateHeight },
    { x: left, y: top + plateHeight },
  ];
  const toFlat = homography(corners, [
    { x: 0, y: 0 },
    { x: flat.width, y: 0 },
    { x: flat.width, y: flat.height },
    { x: 0, y: flat.height },
  ]);
  const rand = random(options.seed ?? 1);
  const noise = options.noise ?? 6;
  const light = options.light ?? 1;
  const shadow = options.shadow ?? 0;
  const data = new Uint8ClampedArray(width * height * 4);
  const specks = Array.from({ length: options.dirt ?? 0 }, () => ({
    x: rand() * flat.width,
    y: flat.height * (0.12 + rand() * 0.76),
    r: 2 + rand() * 5,
  }));
  const sample = (x: number, y: number, c: number) => {
    const x0 = Math.max(0, Math.min(flat.width - 2, Math.floor(x)));
    const y0 = Math.max(0, Math.min(flat.height - 2, Math.floor(y)));
    const fx = Math.min(1, Math.max(0, x - x0));
    const fy = Math.min(1, Math.max(0, y - y0));
    const at = (xx: number, yy: number) => flat.data[(yy * flat.width + xx) * 4 + c];
    return (
      at(x0, y0) * (1 - fx) * (1 - fy) +
      at(x0 + 1, y0) * fx * (1 - fy) +
      at(x0, y0 + 1) * (1 - fx) * fy +
      at(x0 + 1, y0 + 1) * fx * fy
    );
  };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const p = project(toFlat, x + 0.5, y + 0.5);
      const onPlate = p.x >= 0 && p.y >= 0 && p.x < flat.width && p.y < flat.height;
      let rgb: number[];
      if (onPlate) {
        rgb = [0, 1, 2].map((c) => sample(p.x - 0.5, p.y - 0.5, c));
        for (const speck of specks)
          if ((p.x - speck.x) ** 2 + (p.y - speck.y) ** 2 < speck.r ** 2) rgb = [70, 66, 60];
      } else {
        // A slightly uneven grey-green desk.
        const shade = 112 + 18 * Math.sin(x / 47) * Math.cos(y / 61) - (y / height) * 20;
        rgb = [shade * 0.92, shade, shade * 0.95];
      }
      // Shadow from the left, fading to the right.
      const dark = shadow * Math.max(0, 1 - x / (width * 0.75));
      for (let c = 0; c < 3; c++)
        data[i + c] = rgb[c] * light * (1 - dark) + (rand() - 0.5) * 2 * noise;
      data[i + 3] = 255;
    }
  return { width, height, data, corners };
}
