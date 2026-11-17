import { plates } from '../../../i18n/plates';
import { accepts, BLOCKS, defaultParams, mismatchReason } from './nodes';
import type { BlockType, Graph, GraphEdge, GraphNode, SocketType } from './types';

export type Check = { ok: true } | { ok: false; reason: string };

export interface Connection {
  source: string;
  target: string;
  targetHandle: string;
}

let counter = 0;
/** Unique, readable ids ("threshold-3"). */
export function newId(prefix: string) {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}`;
}

export function createNode(
  type: BlockType,
  position = { x: 0, y: 0 },
  params?: Record<string, number>,
): GraphNode {
  return { id: newId(type), type, position, params: { ...defaultParams(type), ...params } };
}

export const edgeId = (connection: Connection) =>
  `e-${connection.source}-${connection.target}-${connection.targetHandle}`;

const byId = (graph: Graph) => new Map(graph.nodes.map((node) => [node.id, node]));

/** Node ids in an order where every node comes after all of its inputs. Cycles are skipped. */
export function topoOrder(graph: Graph): string[] {
  const incoming = new Map(graph.nodes.map((node) => [node.id, 0]));
  for (const edge of graph.edges)
    if (incoming.has(edge.target) && incoming.has(edge.source))
      incoming.set(edge.target, incoming.get(edge.target)! + 1);
  const ready = graph.nodes.filter((node) => incoming.get(node.id) === 0).map((node) => node.id);
  const order: string[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    order.push(id);
    for (const edge of graph.edges)
      if (edge.source === id && incoming.has(edge.target)) {
        const left = incoming.get(edge.target)! - 1;
        incoming.set(edge.target, left);
        if (left === 0) ready.push(edge.target);
      }
  }
  return order;
}

/** Edge feeding the given input socket, if any. */
export function inputEdge(graph: Graph, node: string, handle: string): GraphEdge | undefined {
  return graph.edges.find((edge) => edge.target === node && edge.targetHandle === handle);
}

/** Output type of every node, following the edges from the camera. */
export function resolveTypes(graph: Graph): Map<string, SocketType | undefined> {
  const nodes = byId(graph);
  const types = new Map<string, SocketType | undefined>();
  for (const id of topoOrder(graph)) {
    const node = nodes.get(id)!;
    const def = BLOCKS[node.type];
    const inputs: Record<string, SocketType | undefined> = {};
    for (const input of def.inputs) {
      const edge = inputEdge(graph, id, input.id);
      inputs[input.id] = edge ? types.get(edge.source) : undefined;
    }
    types.set(id, def.output ? def.output(inputs) : undefined);
  }
  return types;
}

function reaches(graph: Graph, from: string, to: string): boolean {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === to) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const edge of graph.edges) if (edge.source === id) stack.push(edge.target);
  }
  return false;
}

/** Whether a new connection is allowed; the reason is shown to the student when it is not. */
export function canConnect(graph: Graph, connection: Connection): Check {
  const nodes = byId(graph);
  const source = nodes.get(connection.source);
  const target = nodes.get(connection.target);
  if (!source || !target) return { ok: false, reason: plates.errors.failed };
  if (source.id === target.id) return { ok: false, reason: plates.errors.self };
  if (!BLOCKS[source.type].output) return { ok: false, reason: plates.errors.noOutput };
  const input = BLOCKS[target.type].inputs.find((item) => item.id === connection.targetHandle);
  if (!input) return { ok: false, reason: plates.errors.failed };
  if (reaches(graph, target.id, source.id)) return { ok: false, reason: plates.errors.cycle };
  const type = resolveTypes(graph).get(source.id);
  if (type && !accepts(input, type))
    return { ok: false, reason: mismatchReason(target.type, input, type) };
  return { ok: true };
}

/** Adds a connection; an input socket holds one wire, so an older one is replaced. */
export function connect(graph: Graph, connection: Connection): Graph {
  const edges = graph.edges.filter(
    (edge) => !(edge.target === connection.target && edge.targetHandle === connection.targetHandle),
  );
  return { ...graph, edges: [...edges, { id: edgeId(connection), ...connection }] };
}

/** Status of each wire. A wire turns red when the types along it no longer fit. */
export function edgeStatus(graph: Graph): Map<string, Check> {
  const nodes = byId(graph);
  const types = resolveTypes(graph);
  const status = new Map<string, Check>();
  for (const edge of graph.edges) {
    const target = nodes.get(edge.target);
    const input =
      target && BLOCKS[target.type].inputs.find((item) => item.id === edge.targetHandle);
    const type = types.get(edge.source);
    if (!target || !input) status.set(edge.id, { ok: false, reason: plates.errors.failed });
    else if (type && !accepts(input, type))
      status.set(edge.id, { ok: false, reason: mismatchReason(target.type, input, type) });
    else status.set(edge.id, { ok: true });
  }
  return status;
}

/** Problems of each node that stop it from working (missing or wrong inputs). */
export function nodeIssues(graph: Graph): Map<string, string[]> {
  const status = edgeStatus(graph);
  const issues = new Map<string, string[]>();
  for (const node of graph.nodes) {
    const list: string[] = [];
    for (const input of BLOCKS[node.type].inputs) {
      const edge = inputEdge(graph, node.id, input.id);
      if (!edge)
        list.push(
          plates.errors.missingInput(
            BLOCKS[node.type].inputs.length > 1
              ? plates.inputs[input.id as keyof typeof plates.inputs]
              : plates.inputs.in,
          ),
        );
      else {
        const check = status.get(edge.id);
        if (check && !check.ok) list.push(check.reason);
      }
    }
    issues.set(node.id, list);
  }
  return issues;
}

/** Nodes that can run: every input is connected, typed correctly and itself runnable. */
export function runnableNodes(graph: Graph): Set<string> {
  const nodes = byId(graph);
  const issues = nodeIssues(graph);
  const runnable = new Set<string>();
  for (const id of topoOrder(graph)) {
    if (issues.get(id)?.length) continue;
    const node = nodes.get(id)!;
    const ok = BLOCKS[node.type].inputs.every((input) => {
      const edge = inputEdge(graph, id, input.id);
      return edge && runnable.has(edge.source);
    });
    if (ok) runnable.add(id);
  }
  return runnable;
}

/**
 * Inserts a node into a wire (as in Blender). The wire's source must fit the new node's
 * first matching input; the new node's output then feeds the old target, even if the types
 * there do not fit yet (the wire turns red and explains what is still missing).
 */
export function insertOnEdge(graph: Graph, edgeId: string, node: GraphNode): Graph | Check {
  const edge = graph.edges.find((item) => item.id === edgeId);
  if (!edge) return { ok: false, reason: plates.errors.failed };
  const def = BLOCKS[node.type];
  if (!def.output || !def.inputs.length) return { ok: false, reason: plates.errors.noOutput };
  const withNode: Graph = { ...graph, nodes: [...graph.nodes, node] };
  const sourceType = resolveTypes(withNode).get(edge.source);
  const input = def.inputs.find((item) => accepts(item, sourceType)) ?? def.inputs[0];
  const check = canConnect(withNode, {
    source: edge.source,
    target: node.id,
    targetHandle: input.id,
  });
  if (!check.ok) return check;
  let next: Graph = { ...withNode, edges: withNode.edges.filter((item) => item.id !== edgeId) };
  next = connect(next, { source: edge.source, target: node.id, targetHandle: input.id });
  next = connect(next, { source: node.id, target: edge.target, targetHandle: edge.targetHandle });
  // A crop block also needs the plate region: reuse a "Find plate" block upstream if any.
  if (node.type === 'cropPlate' && input.id === 'image') {
    const finder = graph.nodes.find((item) => item.type === 'findPlate');
    if (finder)
      next = connect(next, { source: finder.id, target: node.id, targetHandle: 'region' });
  }
  return next;
}

export const isGraph = (value: Graph | Check): value is Graph => 'nodes' in value;

/**
 * Removes a node. When it sat in the middle of a chain, its input is reconnected to the
 * blocks it fed, where the types allow it, so the chain stays connected.
 */
export function removeNode(graph: Graph, id: string): Graph {
  const node = graph.nodes.find((item) => item.id === id);
  if (!node || BLOCKS[node.type].fixed) return graph;
  const incoming = graph.edges.filter((edge) => edge.target === id);
  const outgoing = graph.edges.filter((edge) => edge.source === id);
  let next: Graph = {
    nodes: graph.nodes.filter((item) => item.id !== id),
    edges: graph.edges.filter((edge) => edge.source !== id && edge.target !== id),
  };
  const upstream = incoming.find(
    (edge) => edge.targetHandle === 'in' || edge.targetHandle === 'image',
  );
  if (upstream)
    for (const edge of outgoing) {
      const connection = {
        source: upstream.source,
        target: edge.target,
        targetHandle: edge.targetHandle,
      };
      // Keep the chain even when the types do not fit yet: the red wire explains why.
      if (!reaches(next, edge.target, upstream.source)) next = connect(next, connection);
    }
  return next;
}

/**
 * Takes a block out of the chain but keeps it on the canvas, moved to `position`: its wires go
 * and its neighbours are joined, exactly as when the block is deleted.
 */
export function unplugNode(graph: Graph, id: string, position?: { x: number; y: number }): Graph {
  const node = graph.nodes.find((item) => item.id === id);
  if (!node || BLOCKS[node.type].fixed) return graph;
  const without = removeNode(graph, id);
  return {
    ...without,
    nodes: [...without.nodes, { ...node, position: position ?? node.position }],
  };
}

/** Removes one wire. */
export function cutEdge(graph: Graph, id: string): Graph {
  return { ...graph, edges: graph.edges.filter((edge) => edge.id !== id) };
}

/**
 * A fingerprint of each node's computation: its type, parameters and everything upstream.
 * Equal fingerprints mean equal results for the same input frame (used for caching).
 */
export function signatures(graph: Graph, frame: string): Map<string, string> {
  const nodes = byId(graph);
  const result = new Map<string, string>();
  for (const id of topoOrder(graph)) {
    const node = nodes.get(id)!;
    const inputs = BLOCKS[node.type].inputs.map((input) => {
      const edge = inputEdge(graph, id, input.id);
      return `${input.id}<${edge ? result.get(edge.source) : '∅'}>`;
    });
    const params = Object.keys(node.params)
      .sort()
      .map((key) => `${key}=${node.params[key]}`)
      .join(',');
    result.set(
      id,
      node.type === 'camera' ? `camera(${frame})` : `${node.type}(${params})[${inputs.join(';')}]`,
    );
  }
  return result;
}

/** The single Output node of a graph. */
export const outputNode = (graph: Graph) => graph.nodes.find((node) => node.type === 'output');
export const cameraNode = (graph: Graph) => graph.nodes.find((node) => node.type === 'camera');

/** Linear chain from the camera to the output, used for "click to add" in the palette. */
export function edgeIntoOutput(graph: Graph): GraphEdge | undefined {
  const output = outputNode(graph);
  return output ? inputEdge(graph, output.id, 'in') : undefined;
}
