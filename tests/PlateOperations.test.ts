import { beforeAll, describe, expect, it } from 'vitest';
import { connect, createNode } from '../src/features/plates/graph/graph';
import type { BlockType, Graph, GraphNode } from '../src/features/plates/graph/types';
import type { CV, Mat } from '../src/features/plates/worker/cv';
import { executeGraph, ResultCache } from '../src/features/plates/worker/engine';
import { plateShapeAspect } from '../src/features/plates/plateConfig';
import { findPlateQuad, quadSize } from '../src/features/plates/worker/operations';
import { MatScope, withScope } from '../src/features/plates/worker/scope';
import { loadTestOpenCv, rgbaImage } from './helpers/opencv';

let cv: CV;
beforeAll(async () => {
  cv = await loadTestOpenCv();
}, 60000);

const PLATE = { left: 100, top: 160, right: 540, bottom: 320 };
const BARS = [140, 220, 300, 380, 460];

/** Grey desk, light plate with a dark frame, five dark "characters" and two specks. */
function scene() {
  return rgbaImage(640, 480, (x, y) => {
    const inPlate = x >= PLATE.left && x < PLATE.right && y >= PLATE.top && y < PLATE.bottom;
    if (!inPlate) return Math.abs(x - 40) < 3 && Math.abs(y - 40) < 3 ? 20 : 90;
    const border =
      x < PLATE.left + 8 || x >= PLATE.right - 8 || y < PLATE.top + 8 || y >= PLATE.bottom - 8;
    if (border) return 30;
    if (y >= 190 && y < 290 && BARS.some((bar) => x >= bar && x < bar + 34)) return 25;
    if (Math.abs(x - 520) < 2 && Math.abs(y - 180) < 2) return 25;
    return 225;
  });
}

function build(
  types: BlockType[],
  params: Partial<Record<BlockType, Record<string, number>>> = {},
) {
  const nodes: GraphNode[] = ['camera', ...types, 'output'].map((type) =>
    createNode(type as BlockType, { x: 0, y: 0 }, params[type as BlockType]),
  );
  let graph: Graph = { nodes, edges: [] };
  for (let i = 1; i < nodes.length; i++)
    graph = connect(graph, { source: nodes[i - 1].id, target: nodes[i].id, targetHandle: 'in' });
  return graph;
}
const pixel = (mat: Mat, x: number, y: number) => mat.data[y * mat.cols + x];
const valueOf = (run: ReturnType<typeof executeGraph>, graph: Graph, type: BlockType) => {
  const value = run.values.get(graph.nodes.find((node) => node.type === type)!.id);
  if (!value || value.type === 'region') throw new Error(`no image from ${type}`);
  return value.mat;
};

describe('operations on a generated plate image', () => {
  it('grayscale → threshold → invert gives white characters on black', () => {
    withScope(cv, (scope) => {
      const input = scope.track(cv.matFromImageData(scene()));
      const graph = build(['grayscale', 'threshold', 'invert']);
      const run = executeGraph(cv, scope, graph, input);
      const out = valueOf(run, graph, 'invert');
      expect(out.channels()).toBe(1);
      expect(pixel(out, 157, 240)).toBe(255); // inside a character
      expect(pixel(out, 200, 240)).toBe(0); // plate background
      expect([...run.runs.values()].every((r) => !r.error)).toBe(true);
    });
    expect(MatScope.live).toBe(0);
  });

  it('automatic threshold (Otsu) reports the chosen level', () => {
    withScope(cv, (scope) => {
      const input = scope.track(cv.matFromImageData(scene()));
      const graph = build(['grayscale', 'threshold'], { threshold: { level: 128, auto: 1 } });
      const run = executeGraph(cv, scope, graph, input);
      const info = [...run.runs.values()].find((r) => r.info)?.info;
      expect(Number(info)).toBeGreaterThan(40);
      expect(Number(info)).toBeLessThan(220);
    });
  });

  it('finds the plate, crops it and keeps only character-sized shapes', () => {
    withScope(cv, (scope) => {
      const input = scope.track(cv.matFromImageData(scene()));
      const camera = createNode('camera');
      const gray = createNode('grayscale');
      const threshold = createNode('threshold', undefined, { level: 128 });
      const find = createNode('findPlate');
      const crop = createNode('cropPlate');
      const cropThreshold = createNode('threshold', undefined, { level: 128 });
      const invert = createNode('invert');
      const shapes = createNode('shapeFilter', undefined, { minHeight: 40, maxHeight: 90 });
      const output = createNode('output');
      let graph: Graph = {
        nodes: [camera, gray, threshold, find, crop, cropThreshold, invert, shapes, output],
        edges: [],
      };
      const wires: [GraphNode, GraphNode, string][] = [
        [camera, gray, 'in'],
        [gray, threshold, 'in'],
        [threshold, find, 'in'],
        [find, crop, 'region'],
        [gray, crop, 'image'],
        [crop, cropThreshold, 'in'],
        [cropThreshold, invert, 'in'],
        [invert, shapes, 'in'],
        [shapes, output, 'in'],
      ];
      for (const [from, to, handle] of wires)
        graph = connect(graph, { source: from.id, target: to.id, targetHandle: handle });
      const run = executeGraph(cv, scope, graph, input);
      const region = run.values.get(find.id);
      expect(region?.type).toBe('region');
      if (region?.type !== 'region' || !region.quad) throw new Error('plate not found');
      const [tl, , br] = region.quad;
      expect(Math.abs(tl.x - PLATE.left)).toBeLessThan(12);
      expect(Math.abs(br.y - PLATE.bottom)).toBeLessThan(12);
      const cropped = run.values.get(crop.id);
      if (!cropped || cropped.type === 'region') throw new Error('no crop');
      // The outline is close enough to the configured plate to be straightened to its shape.
      expect(cropped.mat.cols / cropped.mat.rows).toBeCloseTo(plateShapeAspect(), 0);
      expect(run.runs.get(shapes.id)?.info).toBe('5');
    });
    expect(MatScope.live).toBe(0);
  });

  it('straightens a tilted plate', () => {
    withScope(cv, (scope) => {
      const flat = scope.track(cv.matFromImageData(scene()));
      const from = scope.track(
        cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, 640, 0, 640, 480, 0, 480]),
      );
      const to = scope.track(
        cv.matFromArray(4, 1, cv.CV_32FC2, [40, 60, 600, 0, 620, 470, 0, 420]),
      );
      const warp = scope.track(cv.getPerspectiveTransform(from, to));
      const tilted = scope.mat();
      cv.warpPerspective(flat, tilted, warp, new cv.Size(640, 480), cv.INTER_LINEAR);
      const gray = scope.mat();
      cv.cvtColor(tilted, gray, cv.COLOR_RGBA2GRAY);
      const binary = scope.mat();
      cv.threshold(gray, binary, 128, 255, cv.THRESH_BINARY);
      const quad = findPlateQuad(cv, scope, binary);
      expect(quad).not.toBeNull();
      const { width, height } = quadSize(quad!);
      expect(width / height).toBeGreaterThan(2);
    });
  });

  it('reports a missing plate on the crop block instead of failing the whole graph', () => {
    withScope(cv, (scope) => {
      const input = scope.track(cv.matFromImageData(rgbaImage(320, 240, () => 10)));
      const camera = createNode('camera');
      const gray = createNode('grayscale');
      const threshold = createNode('threshold');
      const find = createNode('findPlate');
      const crop = createNode('cropPlate');
      let graph: Graph = { nodes: [camera, gray, threshold, find, crop], edges: [] };
      for (const [from, to, handle] of [
        [camera, gray, 'in'],
        [gray, threshold, 'in'],
        [threshold, find, 'in'],
        [find, crop, 'region'],
        [gray, crop, 'image'],
      ] as [GraphNode, GraphNode, string][])
        graph = connect(graph, { source: from.id, target: to.id, targetHandle: handle });
      const run = executeGraph(cv, scope, graph, input);
      expect(run.runs.get(find.id)?.error).toBe('noPlate');
      expect(run.runs.get(crop.id)?.error).toBe('noPlate');
      expect(run.runs.get(gray.id)?.error).toBeUndefined();
    });
    expect(MatScope.live).toBe(0);
  });

  it('every morphology and image block runs and releases its memory', () => {
    const types: BlockType[] = ['grayscale', 'blur', 'brightness', 'equalize', 'adaptive'];
    const binary: BlockType[] = ['erode', 'dilate', 'open', 'close', 'shapeFilter', 'invert'];
    withScope(cv, (scope) => {
      const input = scope.track(cv.matFromImageData(scene()));
      const graph = build([...types, ...binary]);
      const run = executeGraph(cv, scope, graph, input);
      for (const node of graph.nodes)
        if (node.type !== 'camera' && node.type !== 'output')
          expect(run.values.has(node.id), node.type).toBe(true);
      const edges = build(['grayscale', 'edges']);
      const edgeRun = executeGraph(cv, scope, edges, input);
      expect(valueOf(edgeRun, edges, 'edges').channels()).toBe(1);
    });
    expect(MatScope.live).toBe(0);
  });
});

describe('result cache for a frozen frame', () => {
  it('recomputes only the blocks after a changed slider', () => {
    const cache = new ResultCache();
    const graph = build(['grayscale', 'blur', 'threshold']);
    const frame = scene();
    const once = (g: Graph) =>
      withScope(cv, (scope) => {
        const input = scope.track(cv.matFromImageData(frame));
        return executeGraph(cv, scope, g, input, { cache, frame: 'f1' }).runs;
      });
    once(graph);
    expect(cache.size).toBeGreaterThan(0);
    const again = once(graph);
    expect(
      [...again.entries()]
        .filter(([key]) => !key.startsWith('camera') && !key.startsWith('output'))
        .every(([, run]) => run.cached),
    ).toBe(true);
    const changed: Graph = {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.type === 'blur' ? { ...node, params: { strength: 4 } } : node,
      ),
    };
    const third = once(changed);
    const byType = (type: BlockType) => third.get(graph.nodes.find((n) => n.type === type)!.id);
    expect(byType('grayscale')?.cached).toBe(true);
    expect(byType('blur')?.cached).toBeFalsy();
    expect(byType('threshold')?.cached).toBeFalsy();
    expect(MatScope.live).toBe(0);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});
