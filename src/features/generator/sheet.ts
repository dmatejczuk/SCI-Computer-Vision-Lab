import type opentype from 'opentype.js';
import { drawPlate, PLATE, textLine, type Drawing, type Shape } from './plateDesign';

/** A4 in millimetres. */
export const A4 = { short: 210, long: 297 } as const;
/** Printers cannot print to the edge. */
export const PAGE_MARGIN = 5;

/**
 * Print formats. Every job prints on A4: an "A5" piece is half an A4 sheet in landscape (two per
 * portrait A4, cut apart), an "A4" piece is a whole A4 sheet in landscape.
 */
export const FORMATS = {
  a5: {
    /** Plate width in mm: the A5 width minus the printer margins. */
    plateWidth: 200,
    perSheet: 2,
    page: { width: A4.short, height: A4.long },
  },
  a4: {
    plateWidth: 277,
    perSheet: 1,
    page: { width: A4.long, height: A4.short },
  },
} as const;
export type SheetFormat = keyof typeof FORMATS;

/** Small print under every plate, at its right edge. */
export const COPYRIGHT = `© ${new Date().getFullYear()} DM · For Educational Purposes Only · Not a valid registration plate`;
const CAPTION = { gap: 1.6, capHeight: 1.7, color: '#8a908d' };
const LINE_COLOR = '#9aa5a0';

export interface SheetOptions {
  format: SheetFormat;
  /** Dashed line between the two A5 pieces of a sheet (A5 format only). */
  cutLines: boolean;
  /**
   * Each piece is folded in half into a standing card: the upper half stays blank, the plate is
   * centred in the lower half and a dotted line marks the fold.
   */
  fold: boolean;
}

/** Plate height for a plate width (EU proportions). */
export const plateHeight = (width: number) => (width * PLATE.height) / PLATE.width;

/** Size of the caption under the plate, scaled with the plate. */
const captionHeight = (width: number) => (CAPTION.capHeight * width) / FORMATS.a5.plateWidth;

/** Height of one printed piece: the plate and the caption under it. */
export const pieceHeight = (width: number) =>
  plateHeight(width) + CAPTION.gap + captionHeight(width) * 1.35;

/** Plate size in whole millimetres for a format, e.g. for labels. */
export function plateSize(format: SheetFormat) {
  const width = FORMATS[format].plateWidth;
  return { width, height: Math.round(plateHeight(width)) };
}

/** Number of A4 sheets for `plates` plates. */
export const sheetCount = (plates: number, format: SheetFormat) =>
  Math.ceil(plates / FORMATS[format].perSheet);

/** One plate with the copyright line under its right edge, top-left at (x, y). */
export function drawPiece(font: opentype.Font, text: string, width: number, x = 0, y = 0): Drawing {
  const plate = drawPlate(font, text, width, x, y);
  const cap = captionHeight(width);
  const caption = textLine(
    font,
    COPYRIGHT,
    x + width - 1,
    y + plate.height + CAPTION.gap + cap,
    cap,
    CAPTION.color,
    'right',
  );
  return {
    width,
    height: pieceHeight(width),
    shapes: [...plate.shapes, caption.shape],
  };
}

const line = (y: number, width: number, dash: number[], stroke = 0.25): Shape => ({
  commands: [
    ['M', 0, y],
    ['L', width, y],
  ],
  stroke: { color: LINE_COLOR, width: stroke, dash },
});

/**
 * The A4 sheets of a print job. Each sheet holds `perSheet` pieces of the format (A5: the two
 * halves of a portrait A4, with a cut line between them; A4: the whole landscape sheet). Without
 * folding the plate is centred in its piece. With folding a dotted fold line runs across the
 * piece's middle, the upper half stays blank and the plate is centred in the lower half: folded,
 * the piece stands on the table with the plate upright on its front.
 */
export function layoutSheets(
  font: opentype.Font,
  texts: string[],
  options: SheetOptions,
): Drawing[] {
  const { plateWidth: width, perSheet, page } = FORMATS[options.format];
  const piece = pieceHeight(width);
  const strip = page.height / perSheet;
  const sheets: Drawing[] = [];
  for (let start = 0; start < texts.length; start += perSheet) {
    const shapes: Shape[] = [];
    texts.slice(start, start + perSheet).forEach((text, i) => {
      const top = i * strip;
      const space = options.fold ? strip / 2 : strip;
      const offset = options.fold ? strip / 2 : 0;
      const x = (page.width - width) / 2;
      shapes.push(...drawPiece(font, text, width, x, top + offset + (space - piece) / 2).shapes);
      if (options.fold) shapes.push(line(top + strip / 2, page.width, [0.6, 1.4]));
    });
    if (options.cutLines)
      for (let i = 1; i < perSheet; i++) shapes.push(line(i * strip, page.width, [3, 2]));
    sheets.push({ ...page, shapes });
  }
  return sheets;
}
