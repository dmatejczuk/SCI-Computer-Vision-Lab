/**
 * The node graph is plain JSON data: easy to test, undo, send to the worker and compare
 * with a level's reference solution.
 */

/** Data types flowing through sockets (each has its own color in the editor). */
export type SocketType = 'color' | 'gray' | 'binary' | 'region';

export type BlockType =
  | 'camera'
  | 'grayscale'
  | 'blur'
  | 'brightness'
  | 'equalize'
  | 'threshold'
  | 'adaptive'
  | 'invert'
  | 'erode'
  | 'dilate'
  | 'open'
  | 'close'
  | 'edges'
  | 'findPlate'
  | 'cropPlate'
  | 'shapeFilter'
  | 'preview'
  | 'compare'
  | 'output';

export interface GraphNode {
  id: string;
  type: BlockType;
  params: Record<string, number>;
  position: { x: number; y: number };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  /** Input socket id on the target node. Every node has a single output socket. */
  targetHandle: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Point {
  x: number;
  y: number;
}
