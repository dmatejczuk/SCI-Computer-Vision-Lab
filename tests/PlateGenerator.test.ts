import opentype from 'opentype.js';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildPdf } from '../src/features/generator/pdf';
import {
  cleanPlateText,
  drawPlate,
  MAX_CHARACTERS,
  PLATE,
  PRINTED_PLATE_ASPECT,
  type Drawing,
  type Shape,
} from '../src/features/generator/plateDesign';
import { randomPlate, randomPlates } from '../src/features/generator/randomPlate';
import {
  COPYRIGHT,
  drawPiece,
  FORMATS,
  layoutSheets,
  PAGE_MARGIN,
  pieceHeight,
  plateHeight,
  plateSize,
  sheetCount,
  type SheetFormat,
} from '../src/features/generator/sheet';
import type { Graph } from '../src/features/plates/graph/types';
import { plateConfig, plateShapeAspect } from '../src/features/plates/plateConfig';
import { rasterizeDrawing } from '../src/features/plates/recognition/plateImage';
import { recognize } from '../src/features/plates/recognition/recognize';
import { buildTemplates, type Template } from '../src/features/plates/recognition/templates';
import type { CV } from '../src/features/plates/worker/cv';
import { executeGraph } from '../src/features/plates/worker/engine';
import { withScope } from '../src/features/plates/worker/scope';
import { loadTestOpenCv } from './helpers/opencv';
import { chain, cropGraph, testFont } from './helpers/plates';

let font: opentype.Font;
let cv: CV;
let templates: Template[];
beforeAll(async () => {
  const file = readFileSync(new URL(`../public${plateConfig.font.file}`, import.meta.url));
  font = opentype.parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
  cv = await loadTestOpenCv();
  templates = buildTemplates(testFont(), plateConfig.charset);
}, 60000);

/** Seeded random numbers, so failures are reproducible. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/** A camera-like picture: the plate `pixelWidth` wide on a grey desk, `margin` pixels around it. */
function photo(text: string, pixelWidth: number, margin = 40) {
  const scale = pixelWidth / 520;
  const offset = margin / scale;
  const plate = drawPlate(font, text, 520, offset, offset);
  const scene: Drawing = {
    width: 520 + 2 * offset,
    height: plate.height + 2 * offset,
    shapes: plate.shapes,
  };
  return rasterizeDrawing(scene, scale, [118, 124, 120]);
}

function read(image: { width: number; height: number; data: Uint8ClampedArray }, graph: Graph) {
  return withScope(cv, (scope) => {
    const input = scope.track(cv.matFromImageData(image as unknown as ImageData));
    const run = executeGraph(cv, scope, graph, input);
    const output = graph.nodes.find((node) => node.type === 'output')!;
    const edge = graph.edges.find((item) => item.target === output.id)!;
    const value = run.values.get(edge.source);
    if (!value || value.type === 'region') throw new Error('no output image');
    return recognize(
      { width: value.mat.cols, height: value.mat.rows, data: value.mat.data },
      templates,
    ).text;
  });
}

describe('random plate numbers', () => {
  it('look like Polish plates: district, space, 7–8 characters', () => {
    const random = seeded(7);
    for (let i = 0; i < 300; i++) {
      const plate = randomPlate(plateConfig.charset, random);
      const [district, rest] = plate.split(' ');
      expect(district).toMatch(/^[A-Z]{2,3}$/);
      expect(plate.replace(' ', '').length).toBeGreaterThanOrEqual(7);
      expect(plate.replace(' ', '').length).toBeLessThanOrEqual(8);
      // As on real plates, the distinguishing part avoids letters confused with digits.
      expect(rest).not.toMatch(/[BDIOZ]/);
    }
  });

  it('only use characters from the configured set and do not repeat', () => {
    const plates = randomPlates(40, 'ACEKLMNPRSTW0123456789', seeded(3));
    expect(new Set(plates).size).toBe(40);
    for (const plate of plates) expect(plate).toMatch(/^[ACEKLMNPRSTW0-9 ]+$/);
  });

  it('cleans typed text: capitals, one space, allowed characters, at most 8', () => {
    expect(cleanPlateText('  we-12 34ź', plateConfig.charset)).toBe('WE 12 34');
    expect(cleanPlateText('abcdefghijk', plateConfig.charset)).toBe('ABCDEFGH');
    expect(
      cleanPlateText('wa  12345', plateConfig.charset).replace(' ', '').length,
    ).toBeLessThanOrEqual(MAX_CHARACTERS);
  });
});

describe('plate drawing and print sheets', () => {
  it('keeps EU proportions and the shape the reader straightens to', () => {
    const drawing = drawPlate(font, 'WE 12345', 200);
    expect(drawing.width).toBe(200);
    expect(drawing.height).toBeCloseTo((200 * 114) / 520, 5);
    // The reader is configured for printed plates and straightens them to this shape.
    expect(plateConfig.style).toBe('printed');
    expect(plateShapeAspect()).toBe(PRINTED_PLATE_ASPECT);
    // Outline, band, white field, "EDU" watermark, logo, "SCI" (3 letters) and 7 characters.
    expect(drawing.shapes).toHaveLength(5 + 3 + 7);
  });

  it('prints A5 plates two to a portrait A4 sheet and A4 plates one to a landscape sheet', () => {
    expect(plateSize('a5')).toEqual({ width: 200, height: 44 });
    expect(plateSize('a4')).toEqual({ width: 277, height: 61 });
    expect(sheetCount(5, 'a5')).toBe(3);
    expect(sheetCount(5, 'a4')).toBe(5);
    const texts = ['WE 12345', 'KR 1AB23', 'GD 5432A'];
    const a5 = layoutSheets(font, texts, { format: 'a5', cutLines: true, fold: false });
    expect(a5).toHaveLength(2);
    expect(a5[0]).toMatchObject({ width: 210, height: 297 });
    // Two plates (15 shapes each, plus the copyright line) and one cut line on the first sheet.
    expect(a5[0].shapes).toHaveLength(16 * 2 + 1);
    const a4 = layoutSheets(font, texts, { format: 'a4', cutLines: true, fold: false });
    expect(a4).toHaveLength(3);
    expect(a4[0]).toMatchObject({ width: 297, height: 210 });
    // One plate per sheet: nothing to cut apart.
    expect(a4[0].shapes).toHaveLength(16);
    // Everything printed (not the cut lines across the sheet) keeps the printer margin.
    for (const sheet of [...a5, ...a4])
      for (const shape of sheet.shapes.filter((item) => item.fill))
        for (const c of shape.commands)
          if (c[0] !== 'Z') {
            expect(c[1]).toBeGreaterThanOrEqual(PAGE_MARGIN - 0.01);
            expect(c[1]).toBeLessThanOrEqual(sheet.width - PAGE_MARGIN + 0.01);
            expect(c[2]).toBeGreaterThanOrEqual(0);
            expect(c[2]).toBeLessThanOrEqual(sheet.height);
          }
  });

  it.each(['a5', 'a4'] as SheetFormat[])(
    '%s: folded, the upper half stays blank and the plate is centred in the lower half',
    (format) => {
      const { perSheet, plateWidth } = FORMATS[format];
      const [sheet] = layoutSheets(font, ['WE 12345', 'KR 1AB23'].slice(0, perSheet), {
        format,
        cutLines: true,
        fold: true,
      });
      const piece = sheet.height / perSheet;
      const ys = (shape: Shape) => shape.commands.flatMap((c) => (c[0] === 'Z' ? [] : [c[2]]));
      // The plate outline is the first black shape of the first piece.
      const outline = sheet.shapes.find((shape) => shape.fill === PLATE.colors.ink)!;
      const top = Math.min(...ys(outline));
      expect(top).toBeGreaterThan(piece / 2 + PAGE_MARGIN);
      expect(top + plateHeight(plateWidth)).toBeLessThan(piece - PAGE_MARGIN);
      expect((top + top + pieceHeight(plateWidth)) / 2).toBeCloseTo((piece * 3) / 4, 1);
      // Dotted fold line in the middle of each piece; a dashed cut line between A5 pieces.
      const lines = sheet.shapes.filter((shape) => shape.stroke).map((shape) => ys(shape)[0]);
      expect(lines.sort((a, b) => a - b)).toEqual(
        format === 'a5' ? [piece / 2, piece, piece * 1.5] : [piece / 2],
      );
    },
  );

  it('prints the copyright line under the right edge of every plate', () => {
    const width = FORMATS.a5.plateWidth;
    const piece = drawPiece(font, 'WE 12345', width);
    const caption = piece.shapes.at(-1)!;
    const xs = caption.commands.flatMap((c) => (c[0] === 'Z' ? [] : [c[1]]));
    const ys = caption.commands.flatMap((c) => (c[0] === 'Z' ? [] : [c[2]]));
    expect(COPYRIGHT).toMatch(/© \d{4} DM · For Educational Purposes Only/);
    expect(Math.max(...xs)).toBeCloseTo(width - 1, 0);
    expect(Math.min(...ys)).toBeGreaterThan(plateHeight(width));
    expect(Math.max(...ys)).toBeLessThanOrEqual(pieceHeight(width));
  });

  it('writes a well-formed PDF with one page per sheet', () => {
    const sheets = layoutSheets(font, ['WE 12345', 'KR 1AB23', 'GD 5432A'], {
      format: 'a5',
      cutLines: true,
      fold: false,
    });
    const bytes = buildPdf(sheets);
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('/Count 2');
    expect(text).toContain('/MediaBox [0 0 595.276 841.89]');
    // Every cross-reference entry points at the start of its object.
    const xref = +text
      .slice(text.lastIndexOf('startxref') + 9)
      .trim()
      .split(/\s/)[0];
    const entries = text.slice(xref).split('\n').slice(3);
    entries
      .filter((line) => / n $/.test(line))
      .forEach((line, i) =>
        expect(text.slice(+line.slice(0, 10)).startsWith(`${i + 1} 0 obj`)).toBe(true),
      );
    // Each stream's /Length matches its content.
    for (const match of text.matchAll(/\/Length (\d+) >>\nstream\n/g)) {
      const start = match.index! + match[0].length;
      expect(text.slice(start + +match[1], start + +match[1] + 10)).toBe('\nendstream');
    }
  });
});

describe('the reader reads printed plates', () => {
  it.each(['WE 12345', 'KR 1AC23', 'GD 5432A', 'PO 77WX4'])('reads %s head-on', (plate) => {
    const image = photo(plate, 560);
    expect(read(image, chain('grayscale', ['threshold', { level: 128 }], 'invert'))).toBe(
      plate.replace(' ', ''),
    );
  });

  it('reads a printed plate after "Znajdź tablicę" and "Wytnij i wyprostuj"', () => {
    const image = photo('WPR 4K21', 520, 60);
    expect(read(image, cropGraph())).toBe('WPR4K21');
  });
});
