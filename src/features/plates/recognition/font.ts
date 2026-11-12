import opentype from 'opentype.js';
import type { Point } from '../graph/types';
import { rasterize, type Mask } from './raster';

export interface Glyph {
  /** Anti-aliased ink of the character, cropped to its pen box. */
  mask: Mask;
  /** Where the mask's top-left corner lies relative to the pen origin on the baseline. */
  left: number;
  top: number;
}

/** A loaded tile font that can draw single characters at a given capital-letter height. */
export interface GlyphFont {
  name: string;
  render(char: string, capHeight: number): Glyph;
}

/** Converts opentype path commands into closed polygons (curves are flattened). */
function polygonsOf(commands: opentype.PathCommand[], steps = 8): Point[][] {
  const polygons: Point[][] = [];
  let current: Point[] = [];
  let pen: Point = { x: 0, y: 0 };
  for (const command of commands) {
    if (command.type === 'M') {
      if (current.length > 2) polygons.push(current);
      current = [{ x: command.x, y: command.y }];
      pen = { x: command.x, y: command.y };
    } else if (command.type === 'L') {
      current.push({ x: command.x, y: command.y });
      pen = { x: command.x, y: command.y };
    } else if (command.type === 'Q') {
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        current.push({
          x: u * u * pen.x + 2 * u * t * command.x1 + t * t * command.x,
          y: u * u * pen.y + 2 * u * t * command.y1 + t * t * command.y,
        });
      }
      pen = { x: command.x, y: command.y };
    } else if (command.type === 'C') {
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        current.push({
          x:
            u * u * u * pen.x +
            3 * u * u * t * command.x1 +
            3 * u * t * t * command.x2 +
            t * t * t * command.x,
          y:
            u * u * u * pen.y +
            3 * u * u * t * command.y1 +
            3 * u * t * t * command.y2 +
            t * t * t * command.y,
        });
      }
      pen = { x: command.x, y: command.y };
    } else if (command.type === 'Z') {
      if (current.length > 2) polygons.push(current);
      current = [];
    }
  }
  if (current.length > 2) polygons.push(current);
  return polygons;
}

/** Parses a TTF/OTF file (ArrayBuffer) into a glyph renderer. */
export function loadGlyphFont(buffer: ArrayBuffer): GlyphFont {
  const font = opentype.parse(buffer);
  const capUnits = font.charToGlyph('H').getBoundingBox().y2 || font.unitsPerEm * 0.7;
  const cache = new Map<string, Glyph>();
  return {
    name: font.names.fontFamily?.en ?? 'font',
    render(char, capHeight) {
      const key = `${char}@${capHeight}`;
      const cached = cache.get(key);
      if (cached) return cached;
      const size = (capHeight / capUnits) * font.unitsPerEm;
      const path = font.getPath(char, 0, 0, size);
      const box = path.getBoundingBox();
      const pad = 2;
      const left = Math.floor(box.x1) - pad;
      const top = Math.floor(box.y1) - pad;
      const width = Math.max(1, Math.ceil(box.x2) - left + pad);
      const height = Math.max(1, Math.ceil(box.y2) - top + pad);
      const polygons = polygonsOf(path.commands).map((polygon) =>
        polygon.map((p) => ({ x: p.x - left, y: p.y - top })),
      );
      const glyph = { mask: rasterize(polygons, width, height), left, top };
      cache.set(key, glyph);
      return glyph;
    },
  };
}
