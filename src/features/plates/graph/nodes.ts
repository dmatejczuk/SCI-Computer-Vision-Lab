import { plates } from '../../../i18n/plates';
import type { BlockType, SocketType } from './types';

export interface InputDef {
  id: string;
  accepts: SocketType[];
}

export interface ParamDef {
  id: string;
  min: number;
  max: number;
  step: number;
  default: number;
  /** A toggle is a 0/1 parameter shown as a checkbox. */
  toggle?: boolean;
}

export type BlockCategory = 'source' | 'image' | 'binary' | 'plate' | 'view';

export interface BlockDef {
  type: BlockType;
  category: BlockCategory;
  /** Short symbol shown on the node and in the palette. */
  icon: string;
  inputs: InputDef[];
  /** Output type for the given input types; null when the block has no output. */
  output: ((inputs: Record<string, SocketType | undefined>) => SocketType | undefined) | null;
  params: ParamDef[];
  /** The OpenCV function behind the block (shown in tooltips and generated code). */
  opencv: string;
  /** Camera and Output exist once per graph and cannot be deleted. */
  fixed?: boolean;
}

const same =
  (id = 'in') =>
  (inputs: Record<string, SocketType | undefined>) =>
    inputs[id];
const always = (type: SocketType) => () => type;
const IMAGE: SocketType[] = ['color', 'gray', 'binary'];
const size = (defaultValue = 1): ParamDef => ({
  id: 'size',
  min: 1,
  max: 6,
  step: 1,
  default: defaultValue,
});

export const BLOCKS: Record<BlockType, BlockDef> = {
  camera: {
    type: 'camera',
    category: 'source',
    icon: '◉',
    inputs: [],
    output: always('color'),
    params: [],
    opencv: 'frame',
    fixed: true,
  },
  grayscale: {
    type: 'grayscale',
    category: 'image',
    icon: '◐',
    inputs: [{ id: 'in', accepts: ['color'] }],
    output: always('gray'),
    params: [],
    opencv: 'cv.cvtColor',
  },
  blur: {
    type: 'blur',
    category: 'image',
    icon: '≈',
    inputs: [{ id: 'in', accepts: ['color', 'gray'] }],
    // Blurring a black-and-white image creates grey edges.
    output: (inputs) => (inputs.in === 'color' ? 'color' : inputs.in ? 'gray' : undefined),
    params: [{ id: 'strength', min: 1, max: 10, step: 1, default: 2 }],
    opencv: 'cv.GaussianBlur',
  },
  brightness: {
    type: 'brightness',
    category: 'image',
    icon: '☀',
    inputs: [{ id: 'in', accepts: ['gray'] }],
    output: always('gray'),
    params: [
      { id: 'brightness', min: -100, max: 100, step: 5, default: 0 },
      { id: 'contrast', min: 0.5, max: 3, step: 0.1, default: 1 },
    ],
    opencv: 'cv.convertScaleAbs',
  },
  equalize: {
    type: 'equalize',
    category: 'image',
    icon: '▤',
    inputs: [{ id: 'in', accepts: ['gray'] }],
    output: always('gray'),
    params: [],
    opencv: 'cv.equalizeHist',
  },
  threshold: {
    type: 'threshold',
    category: 'binary',
    icon: '◧',
    inputs: [{ id: 'in', accepts: ['gray'] }],
    output: always('binary'),
    params: [
      { id: 'level', min: 0, max: 255, step: 1, default: 128 },
      { id: 'auto', min: 0, max: 1, step: 1, default: 0, toggle: true },
    ],
    opencv: 'cv.threshold',
  },
  adaptive: {
    type: 'adaptive',
    category: 'binary',
    icon: '▦',
    inputs: [{ id: 'in', accepts: ['gray'] }],
    output: always('binary'),
    params: [
      { id: 'window', min: 3, max: 75, step: 2, default: 31 },
      { id: 'sensitivity', min: 0, max: 30, step: 1, default: 10 },
    ],
    opencv: 'cv.adaptiveThreshold',
  },
  invert: {
    type: 'invert',
    category: 'binary',
    icon: '⇄',
    inputs: [{ id: 'in', accepts: ['gray', 'binary'] }],
    output: same(),
    params: [],
    opencv: 'cv.bitwise_not',
  },
  erode: {
    type: 'erode',
    category: 'binary',
    icon: '−',
    inputs: [{ id: 'in', accepts: ['binary'] }],
    output: always('binary'),
    params: [size()],
    opencv: 'cv.erode',
  },
  dilate: {
    type: 'dilate',
    category: 'binary',
    icon: '+',
    inputs: [{ id: 'in', accepts: ['binary'] }],
    output: always('binary'),
    params: [size()],
    opencv: 'cv.dilate',
  },
  open: {
    type: 'open',
    category: 'binary',
    icon: '○',
    inputs: [{ id: 'in', accepts: ['binary'] }],
    output: always('binary'),
    params: [size()],
    opencv: 'cv.morphologyEx(MORPH_OPEN)',
  },
  close: {
    type: 'close',
    category: 'binary',
    icon: '●',
    inputs: [{ id: 'in', accepts: ['binary'] }],
    output: always('binary'),
    params: [size()],
    opencv: 'cv.morphologyEx(MORPH_CLOSE)',
  },
  edges: {
    type: 'edges',
    category: 'binary',
    icon: '⌗',
    inputs: [{ id: 'in', accepts: ['gray'] }],
    output: always('binary'),
    params: [{ id: 'level', min: 10, max: 250, step: 5, default: 80 }],
    opencv: 'cv.Canny',
  },
  findPlate: {
    type: 'findPlate',
    category: 'plate',
    icon: '⬚',
    inputs: [{ id: 'in', accepts: ['binary'] }],
    output: always('region'),
    params: [],
    opencv: 'cv.findContours + cv.approxPolyDP',
  },
  cropPlate: {
    type: 'cropPlate',
    category: 'plate',
    icon: '✂',
    inputs: [
      { id: 'region', accepts: ['region'] },
      { id: 'image', accepts: IMAGE },
    ],
    output: same('image'),
    params: [],
    opencv: 'cv.warpPerspective',
  },
  shapeFilter: {
    type: 'shapeFilter',
    category: 'binary',
    icon: '▯',
    inputs: [{ id: 'in', accepts: ['binary'] }],
    output: always('binary'),
    params: [
      { id: 'minHeight', min: 2, max: 100, step: 1, default: 30 },
      { id: 'maxHeight', min: 2, max: 100, step: 1, default: 95 },
    ],
    opencv: 'cv.connectedComponentsWithStats',
  },
  preview: {
    type: 'preview',
    category: 'view',
    icon: '▣',
    inputs: [{ id: 'in', accepts: IMAGE }],
    output: null,
    params: [],
    opencv: 'cv.imshow',
  },
  compare: {
    type: 'compare',
    category: 'view',
    icon: '◫',
    inputs: [
      { id: 'left', accepts: IMAGE },
      { id: 'right', accepts: IMAGE },
    ],
    output: null,
    params: [],
    opencv: 'cv.hconcat',
  },
  output: {
    type: 'output',
    category: 'view',
    icon: '★',
    inputs: [{ id: 'in', accepts: ['binary'] }],
    output: null,
    params: [],
    opencv: 'recognize',
    fixed: true,
  },
};

/** A black-and-white image is also a valid grayscale image (pixels 0 and 255). */
export function accepts(input: InputDef, type: SocketType | undefined): boolean {
  if (!type) return true;
  return input.accepts.includes(type) || (type === 'binary' && input.accepts.includes('gray'));
}

export const blockTitle = (type: BlockType) => plates.blocks[type].title;
export const blockDescription = (type: BlockType) => plates.blocks[type].description;
export function paramLabel(type: BlockType, param: string): string {
  const block = plates.blocks[type] as { params?: Record<string, string> };
  return block.params?.[param] ?? param;
}

export function defaultParams(type: BlockType): Record<string, number> {
  return Object.fromEntries(BLOCKS[type].params.map((param) => [param.id, param.default]));
}

/** Polish explanation why `type` cannot go into this input, with a hint what to add. */
export function mismatchReason(block: BlockType, input: InputDef, type: SocketType): string {
  const text = plates.errors;
  const needs = input.accepts.map((item) => plates.sockets[item]).join(' lub ');
  const base = text.needs(blockTitle(block), needs, plates.sockets[type]);
  const hint =
    input.accepts.includes('region') && type !== 'region'
      ? text.hintRegion
      : input.accepts.includes('gray') && type === 'color'
        ? text.hintGray
        : input.accepts.includes('binary') && !input.accepts.includes('gray') && type === 'gray'
          ? text.hintBinary
          : input.accepts.includes('binary') && type === 'color'
            ? text.hintBinaryFromColor
            : '';
  return hint ? `${base} ${hint}` : base;
}
