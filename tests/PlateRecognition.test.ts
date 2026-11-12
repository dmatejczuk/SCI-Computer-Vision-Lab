import { beforeAll, describe, expect, it } from 'vitest';
import type { Graph } from '../src/features/plates/graph/types';
import { plateConfig } from '../src/features/plates/plateConfig';
import type { GlyphFont } from '../src/features/plates/recognition/font';
import {
  renderPlateScene,
  type PlateSceneOptions,
} from '../src/features/plates/recognition/plateImage';
import { homography, project, rasterize } from '../src/features/plates/recognition/raster';
import { recognize, Voter, type Recognized } from '../src/features/plates/recognition/recognize';
import { segmentCharacters } from '../src/features/plates/recognition/segment';
import { buildTemplates, type Template } from '../src/features/plates/recognition/templates';
import type { CV } from '../src/features/plates/worker/cv';
import { executeGraph } from '../src/features/plates/worker/engine';
import { MatScope, withScope } from '../src/features/plates/worker/scope';
import { loadTestOpenCv } from './helpers/opencv';
import { chain, cropGraph, testFont } from './helpers/plates';

let cv: CV;
let font: GlyphFont;
let templates: Template[];
beforeAll(async () => {
  cv = await loadTestOpenCv();
  font = testFont();
  templates = buildTemplates(font, plateConfig.charset);
}, 60000);

/** Renders a generated plate photo, runs the graph and reads the Output image. */
function read(text: string, options: PlateSceneOptions, graph: Graph) {
  const scene = renderPlateScene(font, text, options);
  return withScope(cv, (scope) => {
    const input = scope.track(cv.matFromImageData(scene as unknown as ImageData));
    const run = executeGraph(cv, scope, graph, input);
    const output = graph.nodes.find((node) => node.type === 'output')!;
    const edge = graph.edges.find((item) => item.target === output.id)!;
    const value = run.values.get(edge.source);
    if (!value || value.type === 'region') throw new Error('no output image');
    return recognize(
      { width: value.mat.cols, height: value.mat.rows, data: value.mat.data },
      templates,
    );
  });
}

const BASIC = () => chain('grayscale', ['threshold', { level: 128 }], 'invert');

describe('tile font and drawing', () => {
  it('rasterises a square with smooth edges', () => {
    const square = rasterize(
      [
        [
          { x: 2, y: 2 },
          { x: 8, y: 2 },
          { x: 8, y: 8 },
          { x: 2, y: 8 },
        ],
      ],
      10,
      10,
    );
    expect(square.data[5 * 10 + 5]).toBe(255);
    expect(square.data[0]).toBe(0);
  });
  it('maps corners with a homography', () => {
    const from = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const to = [
      { x: 10, y: 20 },
      { x: 110, y: 10 },
      { x: 120, y: 90 },
      { x: 5, y: 80 },
    ];
    const h = homography(from, to);
    const p = project(h, 1, 1);
    expect(p.x).toBeCloseTo(120, 3);
    expect(p.y).toBeCloseTo(90, 3);
  });
  it('has a template for every configured character', () => {
    expect(templates.map((t) => t.char).join('')).toBe(plateConfig.charset);
  });
});

describe('recognition on generated plate photos', () => {
  it('reads every character of the set on head-on plates', () => {
    const charset = plateConfig.charset;
    let correct = 0;
    for (let start = 0; start < charset.length; start += plateConfig.slots) {
      const text = charset.slice(start, start + plateConfig.slots);
      const result = read(text, { seed: start + 1 }, BASIC());
      correct += [...text].filter((char, i) => result.characters[i]?.char === char).length;
    }
    expect(correct).toBe(charset.length);
  });

  it('tells confusable pairs apart and reports alternatives', () => {
    const result = read('O0I1B8S', { seed: 11 }, BASIC());
    expect(result.text).toBe('O0I1B8S');
    for (const character of result.characters) {
      expect(character.confidence).toBeGreaterThanOrEqual(80);
      expect(character.alternatives).toHaveLength(2);
      expect(character.alternatives[0].confidence).toBeLessThan(character.confidence);
    }
  });

  it('reads the built-in level 1 plate with the expected level 1 graph', () => {
    expect(read(plateConfig.sampleText, { seed: 1 }, BASIC()).text).toBe(plateConfig.sampleText);
  });

  it('a tilted plate needs "Wytnij i wyprostuj"', () => {
    const tilted: PlateSceneOptions = {
      seed: 5,
      corners: [
        { x: 90, y: 150 },
        { x: 560, y: 110 },
        { x: 580, y: 250 },
        { x: 70, y: 280 },
      ],
    };
    expect(read('KOT2026', tilted, cropGraph()).text).toBe('KOT2026');
  });

  it('a shadow defeats a single threshold but not adaptive thresholding', () => {
    const shadow: PlateSceneOptions = { shadow: 0.7, seed: 7 };
    expect(read('WX4821', shadow, BASIC()).text).not.toBe('WX4821');
    const adaptive = chain('grayscale', ['adaptive', { window: 15, sensitivity: 10 }], 'invert');
    expect(read('WX4821', shadow, adaptive).text).toBe('WX4821');
  });

  it('noise and dirt are handled with blur and opening', () => {
    const blur = chain(
      'grayscale',
      ['blur', { strength: 2 }],
      ['threshold', { level: 128 }],
      'invert',
    );
    expect(read('PL7ABC9', { noise: 30, seed: 9 }, blur).text).toBe('PL7ABC9');
    const open = chain('grayscale', ['threshold', { level: 128 }], 'invert', ['open', { size: 2 }]);
    expect(read('PL7ABC9', { dirt: 25, seed: 9 }, open).text).toBe('PL7ABC9');
  });

  it('dim light works with the automatic threshold', () => {
    const auto = chain('grayscale', ['threshold', { auto: 1 }], 'invert');
    expect(read('DIM1234', { light: 0.55, seed: 2 }, auto).text).toBe('DIM1234');
  });

  it('ignores the frame, the tile seams and the background', () => {
    const result = read('AB12', { seed: 4 }, BASIC());
    expect(result.text).toBe('AB12');
    const xs = result.characters.map((c) => c.box.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(MatScope.live).toBe(0);
  });
});

describe('segmentation details', () => {
  it('merges two pieces of a broken character', () => {
    const width = 60;
    const height = 60;
    const data = new Uint8Array(width * height);
    const fill = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data[y * width + x] = 255;
    };
    fill(20, 10, 34, 28); // upper half
    fill(20, 31, 34, 50); // lower half, 3 px gap
    const { boxes } = segmentCharacters({ width, height, data });
    expect(boxes).toHaveLength(1);
    expect(boxes[0].height).toBe(40);
  });
});

describe('voting over frames', () => {
  const frame = (text: string, confidence = 90): Recognized[] =>
    [...text].map((char, i) => ({
      box: { x: i * 10, y: 0, width: 8, height: 20 },
      char,
      confidence,
      alternatives: [],
    }));
  it('keeps the most frequent reading so a single bad frame does not flicker', () => {
    const voter = new Voter(7);
    for (let i = 0; i < 5; i++) voter.push(frame('KOT2026'));
    voter.push(frame('K0T2026', 60));
    voter.push(frame('KOT202'));
    const result = voter.result();
    expect(result.map((c) => c.char).join('')).toBe('KOT2026');
    expect(result[1].agreement).toBeCloseTo(5 / 6, 5);
    voter.clear();
    expect(voter.result()).toEqual([]);
  });
});

describe('comparing with "Moja tablica"', () => {
  it('marks every position as ok, wrong, missing or extra', async () => {
    const { compareReading, cleanPlate } = await import(
      '../src/features/plates/recognition/compare'
    );
    expect(cleanPlate(' kot-2026 ')).toBe('KOT2026');
    expect(compareReading('K0T2026', 'kot2026').map((c) => c.verdict)).toEqual([
      'ok',
      'wrong',
      'ok',
      'ok',
      'ok',
      'ok',
      'ok',
    ]);
    expect(
      compareReading('KOT20', 'KOT2')
        .map((c) => c.verdict)
        .at(-1),
    ).toBe('extra');
    expect(
      compareReading('KO', 'KOT')
        .map((c) => c.verdict)
        .at(-1),
    ).toBe('missing');
  });
});
