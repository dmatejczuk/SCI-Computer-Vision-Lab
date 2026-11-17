import { plates as text } from '../../i18n/plates';
import { connect, createNode } from './graph/graph';
import type { BlockType, Graph, GraphNode } from './graph/types';
import { plateConfig } from './plateConfig';
import type { PlateSceneOptions } from './recognition/plateImage';

export type LevelId = 1 | 2 | 3;

export interface Level {
  id: LevelId;
  title: string;
  goal: string;
  hints: string[];
  /** Blocks offered in the palette. */
  blocks: BlockType[];
  /** Built-in image instead of the camera (level 1), or an optional practice image. */
  sample: { text: string; scene: PlateSceneOptions } | null;
  practice: { text: string; scene: PlateSceneOptions } | null;
  start: () => Graph;
  /** A working solution, for the facilitator and for tests. */
  reference: () => Graph;
}

const STEP = 230;

/** camera → blocks → output in one row. */
function row(blocks: (BlockType | [BlockType, Record<string, number>])[]): Graph {
  const nodes: GraphNode[] = [
    createNode('camera', { x: 0, y: 80 }),
    ...blocks.map((block, index) =>
      Array.isArray(block)
        ? createNode(block[0], { x: (index + 1) * STEP, y: 80 }, block[1])
        : createNode(block, { x: (index + 1) * STEP, y: 80 }),
    ),
    createNode('output', { x: (blocks.length + 1) * STEP, y: 80 }),
  ];
  let graph: Graph = { nodes, edges: [] };
  for (let i = 1; i < nodes.length; i++)
    graph = connect(graph, { source: nodes[i - 1].id, target: nodes[i].id, targetHandle: 'in' });
  return graph;
}

/** Find the plate on a black-and-white copy, cut it out of the grey image, then read it. */
function straightened(after: (BlockType | [BlockType, Record<string, number>])[]): Graph {
  const at = (x: number, y = 80) => ({ x: x * STEP, y });
  const camera = createNode('camera', at(0));
  const gray = createNode('grayscale', at(1));
  const threshold = createNode('threshold', at(2, -200), { auto: 1 });
  const find = createNode('findPlate', at(3, -200));
  const crop = createNode('cropPlate', at(4));
  const rest = after.map((block, index) =>
    Array.isArray(block)
      ? createNode(block[0], at(5 + index), block[1])
      : createNode(block, at(5 + index)),
  );
  const output = createNode('output', at(5 + after.length));
  let graph: Graph = { nodes: [camera, gray, threshold, find, crop, ...rest, output], edges: [] };
  const chain = [crop, ...rest, output];
  const wires: [GraphNode, GraphNode, string][] = [
    [camera, gray, 'in'],
    [gray, threshold, 'in'],
    [threshold, find, 'in'],
    [find, crop, 'region'],
    [gray, crop, 'image'],
    ...chain.slice(1).map((node, i) => [chain[i], node, 'in'] as [GraphNode, GraphNode, string]),
  ];
  for (const [from, to, handle] of wires)
    graph = connect(graph, { source: from.id, target: to.id, targetHandle: handle });
  return graph;
}

const t = text.levels;

export const LEVELS: Level[] = [
  {
    id: 1,
    title: t[1].title,
    goal: t[1].goal,
    hints: t[1].hints,
    blocks: ['grayscale', 'blur', 'threshold', 'invert', 'preview'],
    sample: { text: plateConfig.sampleText, scene: { seed: 1, plateWidth: 0.8 } },
    practice: null,
    start: () => row([]),
    reference: () => row(['grayscale', ['threshold', { level: 128 }], 'invert']),
  },
  {
    id: 2,
    title: t[2].title,
    goal: t[2].goal,
    hints: t[2].hints,
    blocks: [
      'grayscale',
      'blur',
      'brightness',
      'threshold',
      'invert',
      'shapeFilter',
      'findPlate',
      'cropPlate',
      'preview',
      'compare',
    ],
    sample: null,
    practice: { text: 'WX4821', scene: { seed: 3, plateWidth: 0.55, noise: 12 } },
    start: () => row([]),
    reference: () =>
      row([
        'grayscale',
        ['blur', { strength: 1 }],
        ['threshold', { auto: 1 }],
        'invert',
        ['shapeFilter', { minHeight: 8, maxHeight: 60 }],
      ]),
  },
  {
    id: 3,
    title: t[3].title,
    goal: t[3].goal,
    hints: t[3].hints,
    blocks: [
      'grayscale',
      'blur',
      'brightness',
      'equalize',
      'threshold',
      'adaptive',
      'invert',
      'erode',
      'dilate',
      'open',
      'close',
      'edges',
      'shapeFilter',
      'findPlate',
      'cropPlate',
      'preview',
      'compare',
    ],
    sample: null,
    practice: {
      text: 'B80O1S',
      scene: {
        seed: 7,
        shadow: 0.55,
        dirt: 12,
        corners: [
          { x: 110, y: 170 },
          { x: 540, y: 130 },
          { x: 560, y: 250 },
          { x: 90, y: 290 },
        ],
      },
    },
    start: () => row([]),
    reference: () =>
      straightened([
        ['adaptive', { window: 31, sensitivity: 12 }],
        'invert',
        ['open', { size: 1 }],
        ['shapeFilter', { minHeight: 40, maxHeight: 95 }],
      ]),
  },
];

export const levelById = (id: LevelId) => LEVELS.find((level) => level.id === id)!;
