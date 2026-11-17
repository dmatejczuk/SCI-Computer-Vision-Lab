import type opentype from 'opentype.js';
import { SCI_LOGO } from './sciLogo';

/** One drawing command in millimetres, y pointing down (like SVG). */
export type Command =
  | ['M', number, number]
  | ['L', number, number]
  | ['C', number, number, number, number, number, number]
  | ['Z'];

export interface Shape {
  commands: Command[];
  fill?: string;
  /** Holes (logo, letters such as O or 8) use the even-odd rule. */
  evenOdd?: boolean;
  stroke?: { color: string; width: number; dash?: number[] };
}

export interface Drawing {
  width: number;
  height: number;
  shapes: Shape[];
}

/**
 * EU-style plate, one row of characters, with the SCI band instead of the EU band.
 * Units: millimetres of a full-size 520 × 114 mm plate; drawings are scaled from it.
 */
export const PLATE = {
  width: 520,
  height: 114,
  radius: 6,
  /** Black outline along the edge. */
  border: 2.5,
  /** The blue band on the left. */
  band: 40,
  /** Height of the capital letters. */
  capHeight: 79,
  /** Gap between neighbouring characters and the width of a space between groups. */
  tracking: 4,
  space: 26,
  /** Free margin between the band / right edge and the characters. */
  margin: 12,
  colors: {
    band: '#003399',
    ink: '#111111',
    background: '#ffffff',
    bandInk: '#ffffff',
    /** Faint "EDU" pattern behind the characters: visible on paper, ignored by the reader. */
    watermark: '#ececec',
  },
  /** Capital height of the "EDU" watermark and the gap between its words. */
  watermark: { text: 'EDU', capHeight: 11, gap: 16, rows: [33, 65, 97] },
} as const;

/** Most characters on a plate (spaces between groups do not count). */
export const MAX_CHARACTERS = 8;

/**
 * Width / height of the white area right of the band, inside the outline: what the reader's
 * "Znajdź tablicę" block finds on a printed plate. "Wytnij i wyprostuj" straightens to it.
 */
export const PRINTED_PLATE_ASPECT =
  (PLATE.width - PLATE.border * 2 - PLATE.band) / (PLATE.height - PLATE.border * 2);

const KAPPA = 0.5523;

/** A rectangle with independently rounded corners (top-left, top-right, bottom-right, bottom-left). */
export function roundedRect(
  x: number,
  y: number,
  width: number,
  height: number,
  radii: [number, number, number, number],
): Command[] {
  const [tl, tr, br, bl] = radii;
  const k = (r: number) => r * KAPPA;
  return [
    ['M', x + tl, y],
    ['L', x + width - tr, y],
    ['C', x + width - tr + k(tr), y, x + width, y + tr - k(tr), x + width, y + tr],
    ['L', x + width, y + height - br],
    [
      'C',
      x + width,
      y + height - br + k(br),
      x + width - br + k(br),
      y + height,
      x + width - br,
      y + height,
    ],
    ['L', x + bl, y + height],
    ['C', x + bl - k(bl), y + height, x, y + height - bl + k(bl), x, y + height - bl],
    ['L', x, y + tl],
    ['C', x, y + tl - k(tl), x + tl - k(tl), y, x + tl, y],
    ['Z'],
  ];
}

/** Parses the logo's "M x yL x y…Z" path and places it at (x, y) with the given width. */
function logoCommands(x: number, y: number, width: number): Command[] {
  const scale = width / SCI_LOGO.width;
  const commands: Command[] = [];
  for (const part of SCI_LOGO.path.matchAll(/([MLZ])([^MLZ]*)/g)) {
    if (part[1] === 'Z') {
      commands.push(['Z']);
      continue;
    }
    const [px, py] = part[2].trim().split(/\s+/).map(Number);
    commands.push([part[1] as 'M' | 'L', x + px * scale, y + py * scale]);
  }
  return commands;
}

/** Converts opentype path commands (quadratic curves become cubic) into drawing commands. */
function fromOpentype(path: opentype.Path, scaleX = 1, originX = 0): Command[] {
  const commands: Command[] = [];
  const sx = (value: number) => originX + (value - originX) * scaleX;
  let pen = { x: 0, y: 0 };
  for (const c of path.commands) {
    if (c.type === 'M' || c.type === 'L') {
      commands.push([c.type, sx(c.x), c.y]);
      pen = { x: c.x, y: c.y };
    } else if (c.type === 'Q') {
      const c1 = { x: pen.x + (2 / 3) * (c.x1 - pen.x), y: pen.y + (2 / 3) * (c.y1 - pen.y) };
      const c2 = { x: c.x + (2 / 3) * (c.x1 - c.x), y: c.y + (2 / 3) * (c.y1 - c.y) };
      commands.push(['C', sx(c1.x), c1.y, sx(c2.x), c2.y, sx(c.x), c.y]);
      pen = { x: c.x, y: c.y };
    } else if (c.type === 'C') {
      commands.push(['C', sx(c.x1), c.y1, sx(c.x2), c.y2, sx(c.x), c.y]);
      pen = { x: c.x, y: c.y };
    } else commands.push(['Z']);
  }
  return commands;
}

/** Font size whose capital letters are `capHeight` tall. */
function sizeFor(font: opentype.Font, capHeight: number) {
  const capUnits = font.charToGlyph('H').getBoundingBox().y2 || font.unitsPerEm * 0.7;
  return (capHeight / capUnits) * font.unitsPerEm;
}

/** Ink extent of a character at the given size (left edge and width, in mm). */
function inkOf(font: opentype.Font, char: string, size: number) {
  const box = font.getPath(char, 0, 0, size).getBoundingBox();
  return { left: box.x1, width: Math.max(0, box.x2 - box.x1) };
}

/**
 * Text centred in a box: characters placed by their ink with fixed gaps, spaces as wider gaps,
 * condensed horizontally if it would not fit. Returns one filled shape per character.
 */
function textShapes(
  font: opentype.Font,
  text: string,
  box: { left: number; right: number; baseline: number },
  capHeight: number,
  color: string,
  gaps: { tracking: number; space: number } = { tracking: PLATE.tracking, space: PLATE.space },
): Shape[] {
  const size = sizeFor(font, capHeight);
  const items = [...text].map((char) =>
    char === ' ' ? { char, left: 0, width: gaps.space } : { char, ...inkOf(font, char, size) },
  );
  // Characters next to each other get the tracking gap; a space replaces it with a wider one.
  const tracked = (i: number) =>
    i < items.length - 1 && items[i].char !== ' ' && items[i + 1].char !== ' ';
  const natural = items.reduce(
    (sum, item, i) => sum + item.width + (tracked(i) ? gaps.tracking : 0),
    0,
  );
  const available = box.right - box.left;
  const squeeze = natural > available ? available / natural : 1;
  let x = box.left + (available - natural * squeeze) / 2;
  const shapes: Shape[] = [];
  items.forEach((item, i) => {
    if (item.char === ' ') {
      x += item.width * squeeze;
      return;
    }
    // Ink starts at x; the glyph is then condensed around that point.
    const path = font.getPath(item.char, x - item.left, box.baseline, size);
    shapes.push({ commands: fromOpentype(path, squeeze, x), fill: color, evenOdd: false });
    x += (item.width + (tracked(i) ? gaps.tracking : 0)) * squeeze;
  });
  return shapes;
}

/**
 * Ordinary text with the font's own spacing, as one filled shape. `x` is the left edge, the
 * right edge or the centre depending on `align`. Returns the shape and its width.
 */
export function textLine(
  font: opentype.Font,
  text: string,
  x: number,
  baseline: number,
  capHeight: number,
  color: string,
  align: 'left' | 'right' | 'center' = 'left',
): { shape: Shape; width: number } {
  const size = sizeFor(font, capHeight);
  const width = font.getAdvanceWidth(text, size);
  const left = align === 'left' ? x : align === 'right' ? x - width : x - width / 2;
  const path = font.getPath(text, left, baseline, size);
  return { shape: { commands: fromOpentype(path), fill: color }, width };
}

/** Rows of a faint word across the white field, offset row by row like a watermark. */
function watermark(font: opentype.Font, left: number, right: number): Shape {
  const { text, capHeight, gap, rows } = PLATE.watermark;
  const word = textLine(font, text, 0, 0, capHeight, PLATE.colors.watermark).width;
  const step = word + gap;
  const commands: Command[] = [];
  rows.forEach((baseline, row) => {
    // Every other row starts half a step further, so the words do not line up in columns.
    for (let x = left + 4 + (row % 2) * (step / 2); x + word <= right - 4; x += step)
      commands.push(
        ...textLine(font, text, x, baseline, capHeight, PLATE.colors.watermark).shape.commands,
      );
  });
  return { commands, fill: PLATE.colors.watermark };
}

/** Normalises typed plate text: capitals, one space between groups, only allowed characters. */
export function cleanPlateText(text: string, charset: string) {
  const allowed = new Set([...charset]);
  const cleaned = [...text.toUpperCase()]
    .map((char) => (char === ' ' || char === '-' ? ' ' : char))
    .filter((char) => char === ' ' || allowed.has(char))
    .join('')
    .replace(/\s+/g, ' ')
    .trimStart();
  let count = 0;
  let out = '';
  for (const char of cleaned) {
    if (char !== ' ') {
      if (count >= MAX_CHARACTERS) break;
      count++;
    }
    out += char;
  }
  return out;
}

/**
 * The plate drawn at `width` mm, top-left at (x, y): outline, white field with a faint "EDU"
 * watermark, blue band with the SCI logo and "SCI", and the characters in one row.
 */
export function drawPlate(font: opentype.Font, text: string, width: number, x = 0, y = 0): Drawing {
  const s = width / PLATE.width;
  const at = (commands: Command[]): Command[] =>
    commands.map((c) =>
      c[0] === 'Z'
        ? c
        : (c.map((value, i) =>
            i === 0 ? value : i % 2 ? x + (value as number) * s : y + (value as number) * s,
          ) as Command),
    );
  const { border: b, radius: r, band, colors } = PLATE;
  const inner = r - b * 0.6;
  // The white field starts where the band ends: no white may show under the band's edges,
  // or "Znajdź tablicę" would join those slivers to the field and misjudge the plate's shape.
  const shapes: Shape[] = [
    { commands: at(roundedRect(0, 0, PLATE.width, PLATE.height, [r, r, r, r])), fill: colors.ink },
    {
      commands: at(roundedRect(b, b, band, PLATE.height - 2 * b, [inner, 0, 0, inner])),
      fill: colors.band,
    },
    {
      commands: at(
        roundedRect(b + band, b, PLATE.width - 2 * b - band, PLATE.height - 2 * b, [
          0,
          inner,
          inner,
          0,
        ]),
      ),
      fill: colors.background,
    },
  ];
  const mark = watermark(font, b + band, PLATE.width - b);
  shapes.push({ ...mark, commands: at(mark.commands) });
  const logoWidth = band * 0.72;
  shapes.push({
    commands: at(logoCommands(b + (band - logoWidth) / 2, b + 9, logoWidth)),
    fill: colors.bandInk,
    evenOdd: true,
  });
  const bandText = textShapes(
    font,
    'SCI',
    { left: b + 3, right: b + band - 3, baseline: PLATE.height - b - 9 },
    17,
    colors.bandInk,
    { tracking: 1.5, space: 0 },
  );
  const main = textShapes(
    font,
    text.trim(),
    {
      left: b + band + PLATE.margin,
      right: PLATE.width - b - PLATE.margin,
      baseline: (PLATE.height + PLATE.capHeight) / 2,
    },
    PLATE.capHeight,
    colors.ink,
  );
  for (const shape of [...bandText, ...main])
    shapes.push({ ...shape, commands: at(shape.commands) });
  return { width, height: PLATE.height * s, shapes };
}

const n = (value: number) => +value.toFixed(3);

/** SVG path data of drawing commands (mm units). */
export function svgPath(commands: Command[]) {
  return commands
    .map((c) =>
      c[0] === 'Z'
        ? 'Z'
        : `${c[0]}${c
            .slice(1)
            .map((v) => n(v as number))
            .join(' ')}`,
    )
    .join('');
}
