/** A character candidate: bounding box in the output image and its pixel labels. */
export interface CharBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Component extends CharBox {
  labels: number[];
  area: number;
}

export interface BinaryImage {
  width: number;
  height: number;
  /** 0 = background, anything else = ink (white characters on black). */
  data: Uint8Array | Uint8ClampedArray;
}

/** Connected white regions (8-neighbourhood) with their boxes, via union–find. */
export function components(image: BinaryImage): { labels: Int32Array; list: Component[] } {
  const { width, height, data } = image;
  const labels = new Int32Array(width * height);
  const parent: number[] = [0];
  const find = (a: number) => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!data[i]) continue;
      const neighbours: number[] = [];
      if (x > 0 && labels[i - 1]) neighbours.push(labels[i - 1]);
      if (y > 0) {
        const up = i - width;
        if (labels[up]) neighbours.push(labels[up]);
        if (x > 0 && labels[up - 1]) neighbours.push(labels[up - 1]);
        if (x < width - 1 && labels[up + 1]) neighbours.push(labels[up + 1]);
      }
      if (!neighbours.length) {
        parent.push(parent.length);
        labels[i] = parent.length - 1;
      } else {
        const smallest = Math.min(...neighbours);
        labels[i] = smallest;
        for (const n of neighbours) union(smallest, n);
      }
    }
  const boxes = new Map<number, Component>();
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!labels[i]) continue;
      const root = find(labels[i]);
      labels[i] = root;
      const box = boxes.get(root);
      if (!box) boxes.set(root, { x, y, width: 1, height: 1, labels: [root], area: 1 });
      else {
        const right = Math.max(box.x + box.width, x + 1);
        const bottom = Math.max(box.y + box.height, y + 1);
        box.x = Math.min(box.x, x);
        box.y = Math.min(box.y, y);
        box.width = right - box.x;
        box.height = bottom - box.y;
        box.area++;
      }
    }
  return { labels, list: [...boxes.values()] };
}

function overlapX(a: CharBox, b: CharBox) {
  return Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
}

function mergeInto(target: Component, other: Component) {
  const right = Math.max(target.x + target.width, other.x + other.width);
  const bottom = Math.max(target.y + target.height, other.y + other.height);
  target.x = Math.min(target.x, other.x);
  target.y = Math.min(target.y, other.y);
  target.width = right - target.x;
  target.height = bottom - target.y;
  target.labels.push(...other.labels);
  target.area += other.area;
}

export interface Segmentation {
  boxes: (CharBox & { labels: number[] })[];
  labels: Int32Array;
}

/**
 * Finds the characters of one plate row in a binary image (white on black):
 * 1. connected white regions; 2. pieces of one broken character are merged;
 * 3. regions too small, too large or with the wrong proportions are rejected;
 * 4. the largest group of regions of similar height on one line wins;
 * 5. sorted left to right.
 */
export function segmentCharacters(image: BinaryImage, maxCharacters = 12): Segmentation {
  const { labels, list } = components(image);
  const minHeight = Math.max(8, image.height * 0.06);
  // Merge vertically stacked pieces that share most of their width (a broken "8" or "B").
  const pieces = list
    .filter((c) => c.height >= 3 && c.width >= 1 && c.area >= 6)
    .sort((a, b) => a.x - b.x);
  const merged: Component[] = [];
  for (const piece of pieces) {
    const host = merged.find((c) => {
      const overlap = overlapX(c, piece);
      // Negative gap = the boxes overlap vertically by that much.
      const gap = Math.max(c.y, piece.y) - Math.min(c.y + c.height, piece.y + piece.height);
      const widths = Math.max(c.width, piece.width) / Math.max(1, Math.min(c.width, piece.width));
      return (
        overlap > 0.6 * Math.min(c.width, piece.width) &&
        // Pieces of one character have similar widths; a frame around it does not.
        widths <= 2.5 &&
        // Stacked one above the other: a small gap, not one inside the other.
        gap < 0.25 * Math.max(c.height, piece.height) &&
        gap > -0.5 * Math.min(c.height, piece.height) &&
        Math.max(c.y + c.height, piece.y + piece.height) - Math.min(c.y, piece.y) <
          image.height * 0.95
      );
    });
    if (host) mergeInto(host, piece);
    else merged.push({ ...piece, labels: [...piece.labels] });
  }
  const candidates = merged.filter((c) => {
    const aspect = c.height / c.width;
    const fill = c.area / (c.width * c.height);
    return (
      c.height >= minHeight &&
      c.height <= image.height * 0.95 &&
      c.width <= image.width * 0.5 &&
      aspect >= 0.6 &&
      aspect <= 12 &&
      fill >= 0.12 &&
      fill <= 1
    );
  });
  // The plate row: the biggest set of candidates with similar heights on one line.
  let best: Component[] = [];
  for (const reference of candidates) {
    const group = candidates.filter(
      (c) =>
        Math.abs(c.height - reference.height) <= 0.25 * reference.height &&
        Math.abs(c.y + c.height / 2 - (reference.y + reference.height / 2)) <=
          0.5 * reference.height,
    );
    const height = (g: Component[]) => g.reduce((sum, c) => sum + c.height, 0);
    if (
      group.length > best.length ||
      (group.length === best.length && height(group) > height(best))
    )
      best = group;
  }
  const boxes = best
    .sort((a, b) => a.x - b.x)
    .slice(0, maxCharacters)
    .map(({ x, y, width, height, labels: owned }) => ({ x, y, width, height, labels: owned }));
  return { boxes, labels };
}
