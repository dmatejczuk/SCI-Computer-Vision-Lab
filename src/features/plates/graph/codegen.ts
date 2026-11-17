import { inputEdge, runnableNodes, topoOrder } from './graph';
import { blockTitle } from './nodes';
import type { BlockType, Graph, GraphNode } from './types';

/** Python variable name stem for each block's result. */
const NAMES: Partial<Record<BlockType, string>> = {
  camera: 'frame',
  grayscale: 'gray',
  blur: 'blurred',
  brightness: 'adjusted',
  equalize: 'equalized',
  threshold: 'binary',
  adaptive: 'binary',
  invert: 'inverted',
  erode: 'eroded',
  dilate: 'dilated',
  open: 'opened',
  close: 'closed',
  edges: 'edges',
  findPlate: 'plate',
  cropPlate: 'cropped',
  shapeFilter: 'shapes',
};

const HELPERS: Partial<Record<BlockType, string>> = {
  findPlate: `def find_plate(binary):
    """Narożniki największego prostokąta (ramki tablicy)."""
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for contour in sorted(contours, key=cv2.contourArea, reverse=True):
        corners = cv2.approxPolyDP(contour, 0.03 * cv2.arcLength(contour, True), True)
        if len(corners) == 4:
            return corners.reshape(4, 2).astype(np.float32)
    return None`,
  cropPlate: `def crop_plate(image, corners, width=640, height=124):
    """Wycina tablicę i prostuje ją (corners: lewy górny, prawy górny, prawy dolny, lewy dolny)."""
    target = np.float32([[0, 0], [width, 0], [width, height], [0, height]])
    matrix = cv2.getPerspectiveTransform(corners, target)
    return cv2.warpPerspective(image, matrix, (width, height))`,
  shapeFilter: `def filter_shapes(binary, min_height, max_height):
    """Zostawia białe kształty o wysokości znaków (w % wysokości obrazu)."""
    count, labels, stats, _ = cv2.connectedComponentsWithStats(binary)
    result = np.zeros_like(binary)
    for label in range(1, count):
        height = stats[label, cv2.CC_STAT_HEIGHT] / binary.shape[0] * 100
        if min_height <= height <= max_height:
            result[labels == label] = 255
    return result`,
};

const kernel = (size: number) => {
  const k = 2 * Math.max(1, Math.round(size)) + 1;
  return `np.ones((${k}, ${k}), np.uint8)`;
};

/**
 * The graph as Python OpenCV code (read-only, "Pokaż kod"), so students can see that each block
 * is one line of a real program. Blocks that are not connected yet are listed as comments.
 */
export function toPython(graph: Graph): string {
  const runnable = runnableNodes(graph);
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const names = new Map<string, string>();
  const used = new Map<string, number>();
  const name = (node: GraphNode) => {
    const stem = NAMES[node.type] ?? 'image';
    const count = (used.get(stem) ?? 0) + 1;
    used.set(stem, count);
    return count === 1 ? stem : `${stem}${count}`;
  };
  const input = (node: GraphNode, socket = 'in') => {
    const edge = inputEdge(graph, node.id, socket);
    return edge ? (names.get(edge.source) ?? 'None') : 'None';
  };
  const lines: string[] = [];
  const helpers = new Set<BlockType>();
  const skipped: string[] = [];
  for (const id of topoOrder(graph)) {
    const node = nodes.get(id)!;
    if (!runnable.has(id)) {
      skipped.push(blockTitle(node.type));
      continue;
    }
    const v = NAMES[node.type] ? name(node) : '';
    if (v) names.set(id, v);
    const p = node.params;
    const comment = `  # ${blockTitle(node.type)}`;
    switch (node.type) {
      case 'camera':
        lines.push(`${v} = cv2.imread("tablica.png")${comment}`);
        break;
      case 'grayscale':
        lines.push(`${v} = cv2.cvtColor(${input(node)}, cv2.COLOR_BGR2GRAY)${comment}`);
        break;
      case 'blur': {
        const k = 2 * Math.round(p.strength) + 1;
        lines.push(`${v} = cv2.GaussianBlur(${input(node)}, (${k}, ${k}), 0)${comment}`);
        break;
      }
      case 'brightness':
        lines.push(
          `${v} = cv2.convertScaleAbs(${input(node)}, alpha=${p.contrast}, beta=${Math.round(128 * (1 - p.contrast) + p.brightness)})${comment}`,
        );
        break;
      case 'equalize':
        lines.push(`${v} = cv2.equalizeHist(${input(node)})${comment}`);
        break;
      case 'threshold':
        lines.push(
          p.auto >= 0.5
            ? `_, ${v} = cv2.threshold(${input(node)}, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)${comment}`
            : `_, ${v} = cv2.threshold(${input(node)}, ${p.level}, 255, cv2.THRESH_BINARY)${comment}`,
        );
        break;
      case 'adaptive':
        lines.push(
          `${v} = cv2.adaptiveThreshold(${input(node)}, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, ${Math.round(p.window) | 1}, ${p.sensitivity})${comment}`,
        );
        break;
      case 'invert':
        lines.push(`${v} = cv2.bitwise_not(${input(node)})${comment}`);
        break;
      case 'erode':
      case 'dilate':
        lines.push(`${v} = cv2.${node.type}(${input(node)}, ${kernel(p.size)})${comment}`);
        break;
      case 'open':
      case 'close':
        lines.push(
          `${v} = cv2.morphologyEx(${input(node)}, cv2.MORPH_${node.type.toUpperCase()}, ${kernel(p.size)})${comment}`,
        );
        break;
      case 'edges':
        lines.push(`${v} = cv2.Canny(${input(node)}, ${p.level}, ${p.level * 2})${comment}`);
        break;
      case 'findPlate':
        helpers.add('findPlate');
        lines.push(`${v} = find_plate(${input(node)})${comment}`);
        break;
      case 'cropPlate':
        helpers.add('cropPlate');
        lines.push(
          `${v} = crop_plate(${input(node, 'image')}, ${input(node, 'region')})${comment}`,
        );
        break;
      case 'shapeFilter':
        helpers.add('shapeFilter');
        lines.push(
          `${v} = filter_shapes(${input(node)}, ${p.minHeight}, ${p.maxHeight})${comment}`,
        );
        break;
      case 'preview':
        lines.push(`cv2.imshow("Podgląd", ${input(node)})${comment}`);
        break;
      case 'compare':
        lines.push(
          `cv2.imshow("Porównaj", np.hstack([${input(node, 'left')}, ${input(node, 'right')}]))${comment}`,
        );
        break;
      case 'output':
        lines.push(
          `text = read_characters(${input(node)})${comment}: porównanie ze wzorcami znaków`,
        );
        lines.push('print(text)');
        break;
    }
  }
  const header = ['import cv2', 'import numpy as np', ''];
  for (const helper of helpers) header.push(HELPERS[helper]!, '');
  const footer = skipped.length ? ['', `# Jeszcze niepodłączone: ${skipped.join(', ')}`] : [];
  return [...header, ...lines, ...footer].join('\n');
}
