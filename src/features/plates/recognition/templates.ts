import type { GlyphFont } from './font';
import { inkBox, type Mask } from './raster';
import type { BinaryImage, CharBox } from './segment';

/** Size every character is scaled to before comparing (plan: e.g. 24×40). */
export const NORM = { width: 24, height: 40 };

export interface Template {
  char: string;
  /** Mean-free, unit-length pixel vector: the dot product of two is their correlation. */
  vector: Float32Array;
}

export interface Candidate {
  char: string;
  /** Similarity 0–100 % (normalised correlation). */
  confidence: number;
}

/**
 * Crops a character to its box and scales it to 24×40, keeping its proportions (a narrow
 * "1" stays narrow, so it is not confused with a wide "W"), then centres it.
 */
export function normalize(read: (x: number, y: number) => number, box: CharBox): Float32Array {
  const out = new Float32Array(NORM.width * NORM.height);
  const scale = Math.min(NORM.height / box.height, NORM.width / box.width);
  const width = box.width * scale;
  const height = box.height * scale;
  const offsetX = (NORM.width - width) / 2;
  const offsetY = (NORM.height - height) / 2;
  // Area sampling: each output pixel averages a 3×3 grid of source points.
  for (let y = 0; y < NORM.height; y++)
    for (let x = 0; x < NORM.width; x++) {
      let sum = 0;
      for (let sy = 0; sy < 3; sy++)
        for (let sx = 0; sx < 3; sx++) {
          const u = (x + (sx + 0.5) / 3 - offsetX) / scale;
          const v = (y + (sy + 0.5) / 3 - offsetY) / scale;
          if (u < 0 || v < 0 || u >= box.width || v >= box.height) continue;
          sum += read(box.x + Math.floor(u), box.y + Math.floor(v));
        }
      out[y * NORM.width + x] = sum / 9;
    }
  return standardize(out);
}

/** Subtracts the mean and scales to unit length. */
export function standardize(vector: Float32Array): Float32Array {
  let mean = 0;
  for (const value of vector) mean += value;
  mean /= vector.length;
  let norm = 0;
  for (let i = 0; i < vector.length; i++) {
    vector[i] -= mean;
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < vector.length; i++) vector[i] /= norm;
  return vector;
}

/** Templates generated from the same font as the printed tiles, for the configured set. */
export function buildTemplates(font: GlyphFont, charset: string): Template[] {
  return [...new Set(charset)].map((char) => {
    const { mask } = font.render(char, 120);
    const box = inkBox(mask, 128)!;
    const read = (x: number, y: number) => (mask.data[y * mask.width + x] >= 128 ? 1 : 0);
    return { char, vector: normalize(read, box) };
  });
}

/** Normalised correlation with every template, best first. */
export function rank(vector: Float32Array, templates: Template[]): Candidate[] {
  return templates
    .map(({ char, vector: template }) => {
      let dot = 0;
      for (let i = 0; i < vector.length; i++) dot += vector[i] * template[i];
      return { char, confidence: Math.max(0, Math.round(dot * 100)) };
    })
    .sort((a, b) => b.confidence - a.confidence);
}

export interface Recognized {
  box: CharBox;
  char: string;
  confidence: number;
  /** The two next most similar characters. */
  alternatives: Candidate[];
}

/** Reads one segmented character from the binary image (only its own labelled pixels). */
export function recognizeBox(
  image: BinaryImage,
  labels: Int32Array,
  box: CharBox & { labels: number[] },
  templates: Template[],
): Recognized {
  const own = new Set(box.labels);
  const read = (x: number, y: number) => (own.has(labels[y * image.width + x]) ? 1 : 0);
  const [best, ...others] = rank(normalize(read, box), templates);
  return {
    box: { x: box.x, y: box.y, width: box.width, height: box.height },
    char: best?.char ?? '?',
    confidence: best?.confidence ?? 0,
    alternatives: others.slice(0, 2),
  };
}

export type { Mask };
