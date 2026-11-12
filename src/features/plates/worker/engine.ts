import { inputEdge, runnableNodes, signatures, topoOrder } from '../graph/graph';
import { BLOCKS } from '../graph/nodes';
import type { Graph, GraphNode } from '../graph/types';
import type { CV, Mat } from './cv';
import { OpError, OPERATIONS, type Value } from './operations';
import { MatScope } from './scope';

export interface NodeRun {
  ms: number;
  /** Error code: 'noPlate' or 'failed'. */
  error?: string;
  info?: string;
  cached?: boolean;
}

export interface EngineResult {
  runs: Map<string, NodeRun>;
  values: Map<string, Value>;
  /** The value that reached each node's input(s), used for views such as Preview/Output. */
  inputs: Map<string, Record<string, Value | undefined>>;
}

interface CacheEntry {
  signature: string;
  value: Value | undefined;
  info?: string;
  owned: Mat[];
}

/**
 * Keeps node results between passes on the same frame (frozen frame or level image), so a
 * slider only recomputes the blocks after it. Live camera frames never use the cache.
 * Cached Mats are counted separately from the per-pass scope and freed on `clear()`.
 */
export class ResultCache {
  private entries = new Map<string, CacheEntry>();
  get size() {
    let count = 0;
    for (const entry of this.entries.values()) count += entry.owned.length;
    return count;
  }
  get(id: string, signature: string) {
    const entry = this.entries.get(id);
    return entry && entry.signature === signature ? entry : undefined;
  }
  set(id: string, entry: CacheEntry) {
    this.drop(id);
    this.entries.set(id, entry);
  }
  /** Removes entries of nodes that no longer exist or changed. */
  retain(valid: Map<string, string>) {
    for (const [id, entry] of [...this.entries])
      if (valid.get(id) !== entry.signature) this.drop(id);
  }
  private drop(id: string) {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.owned.forEach((mat) => {
      if (!mat.isDeleted()) mat.delete();
    });
    this.entries.delete(id);
  }
  clear() {
    for (const id of [...this.entries.keys()]) this.drop(id);
  }
}

/**
 * Runs the graph on one input image. All temporary Mats belong to `scope`, which the caller
 * releases in a `finally` block. With a cache, results of unchanged blocks are reused.
 */
export function executeGraph(
  cv: CV,
  scope: MatScope,
  graph: Graph,
  input: Mat,
  options: { cache?: ResultCache; frame?: string } = {},
): EngineResult {
  const runs = new Map<string, NodeRun>();
  const values = new Map<string, Value>();
  const inputs = new Map<string, Record<string, Value | undefined>>();
  const runnable = runnableNodes(graph);
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const cache = options.cache;
  const marks = cache ? signatures(graph, options.frame ?? 'live') : null;
  for (const id of topoOrder(graph)) {
    const node = nodes.get(id) as GraphNode;
    if (!runnable.has(id)) continue;
    const nodeInputs: Record<string, Value | undefined> = {};
    let ready = true;
    for (const socket of BLOCKS[node.type].inputs) {
      const edge = inputEdge(graph, id, socket.id);
      const value = edge ? values.get(edge.source) : undefined;
      nodeInputs[socket.id] = value;
      if (!value) ready = false;
    }
    inputs.set(id, nodeInputs);
    if (node.type === 'camera') {
      values.set(id, { type: 'color', mat: input });
      runs.set(id, { ms: 0 });
      continue;
    }
    if (!ready) continue;
    const operation = OPERATIONS[node.type];
    if (!operation) {
      // View blocks (Preview, Compare, Output) only show what they receive.
      runs.set(id, { ms: 0 });
      continue;
    }
    const signature = marks?.get(id);
    const hit = signature ? cache?.get(id, signature) : undefined;
    if (hit) {
      if (hit.value) values.set(id, hit.value);
      runs.set(id, { ms: 0, info: hit.info, cached: true });
      continue;
    }
    const before = scope.size;
    const started = performance.now();
    try {
      const result = operation(cv, scope, nodeInputs, node.params);
      const ms = performance.now() - started;
      if (result.value) values.set(id, result.value);
      const noPlate = result.info === 'noPlate';
      runs.set(id, {
        ms,
        info: noPlate ? undefined : result.info,
        error: noPlate ? 'noPlate' : undefined,
      });
      if (cache && signature) {
        const owned = scope.since(before) as Mat[];
        owned.forEach((mat) => scope.keep(mat));
        cache.set(id, { signature, value: result.value, info: result.info, owned });
      }
    } catch (error) {
      const code = error instanceof OpError && error.message === 'noPlate' ? 'noPlate' : 'failed';
      if (!(error instanceof OpError)) console.error(`[plates] ${node.type} failed`, error);
      runs.set(id, { ms: performance.now() - started, error: code });
    }
  }
  if (cache && marks) cache.retain(marks);
  return { runs, values, inputs };
}
