import { readFileSync } from 'node:fs';
import { connect, createNode } from '../../src/features/plates/graph/graph';
import type { BlockType, Graph, GraphNode } from '../../src/features/plates/graph/types';
import { plateConfig } from '../../src/features/plates/plateConfig';
import { loadGlyphFont } from '../../src/features/plates/recognition/font';
import { buildTemplates } from '../../src/features/plates/recognition/templates';

/** The configured tile font, read from public/ like the worker fetches it. */
export function testFont() {
  const file = readFileSync(new URL(`../../public${plateConfig.font.file}`, import.meta.url));
  return loadGlyphFont(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
}

export function testTemplates() {
  return buildTemplates(testFont(), plateConfig.charset);
}

/** camera → blocks → output, each block optionally with parameters. */
export function chain(...blocks: (BlockType | [BlockType, Record<string, number>])[]): Graph {
  const nodes: GraphNode[] = [
    createNode('camera'),
    ...blocks.map((block) =>
      Array.isArray(block) ? createNode(block[0], undefined, block[1]) : createNode(block),
    ),
    createNode('output'),
  ];
  let graph: Graph = { nodes, edges: [] };
  for (let i = 1; i < nodes.length; i++)
    graph = connect(graph, { source: nodes[i - 1].id, target: nodes[i].id, targetHandle: 'in' });
  return graph;
}

/** The level 2/3 reference: find the plate, straighten it, then threshold the crop. */
export function cropGraph(): Graph {
  const camera = createNode('camera');
  const gray = createNode('grayscale');
  const threshold = createNode('threshold', undefined, { auto: 1 });
  const find = createNode('findPlate');
  const crop = createNode('cropPlate');
  const threshold2 = createNode('threshold', undefined, { auto: 1 });
  const invert = createNode('invert');
  const shapes = createNode('shapeFilter', undefined, { minHeight: 40, maxHeight: 90 });
  const output = createNode('output');
  let graph: Graph = {
    nodes: [camera, gray, threshold, find, crop, threshold2, invert, shapes, output],
    edges: [],
  };
  const wires: [GraphNode, GraphNode, string][] = [
    [camera, gray, 'in'],
    [gray, threshold, 'in'],
    [threshold, find, 'in'],
    [find, crop, 'region'],
    [gray, crop, 'image'],
    [crop, threshold2, 'in'],
    [threshold2, invert, 'in'],
    [invert, shapes, 'in'],
    [shapes, output, 'in'],
  ];
  for (const [from, to, handle] of wires)
    graph = connect(graph, { source: from.id, target: to.id, targetHandle: handle });
  return graph;
}
