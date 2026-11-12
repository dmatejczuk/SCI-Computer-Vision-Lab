import { describe, expect, it } from 'vitest';
import {
  canConnect,
  connect,
  createNode,
  edgeIntoOutput,
  edgeStatus,
  insertOnEdge,
  isGraph,
  nodeIssues,
  removeNode,
  resolveTypes,
  runnableNodes,
  signatures,
  topoOrder,
} from '../src/features/plates/graph/graph';
import { accepts, BLOCKS } from '../src/features/plates/graph/nodes';
import type { BlockType, Graph } from '../src/features/plates/graph/types';

/** camera → … → output, wired in order. */
function chain(...types: BlockType[]): Graph {
  const nodes = ['camera', ...types, 'output'].map((type, index) =>
    createNode(type as BlockType, { x: index * 200, y: 0 }),
  );
  let graph: Graph = { nodes, edges: [] };
  for (let i = 1; i < nodes.length; i++)
    graph = connect(graph, { source: nodes[i - 1].id, target: nodes[i].id, targetHandle: 'in' });
  return graph;
}
const id = (graph: Graph, type: BlockType) => graph.nodes.find((n) => n.type === type)!.id;

describe('block registry', () => {
  it('describes every block with a title, socket types and parameters in range', () => {
    for (const def of Object.values(BLOCKS)) {
      for (const param of def.params) {
        expect(param.default).toBeGreaterThanOrEqual(param.min);
        expect(param.default).toBeLessThanOrEqual(param.max);
      }
      expect(def.params.length).toBeLessThanOrEqual(2);
    }
  });
  it('treats black-and-white images as grayscale but not the other way round', () => {
    expect(accepts(BLOCKS.threshold.inputs[0], 'binary')).toBe(true);
    expect(accepts(BLOCKS.output.inputs[0], 'gray')).toBe(false);
    expect(accepts(BLOCKS.threshold.inputs[0], 'color')).toBe(false);
  });
});

describe('graph types and validation', () => {
  it('follows types from the camera to the output', () => {
    const graph = chain('grayscale', 'threshold', 'invert');
    const types = resolveTypes(graph);
    expect(types.get(id(graph, 'camera'))).toBe('color');
    expect(types.get(id(graph, 'grayscale'))).toBe('gray');
    expect(types.get(id(graph, 'threshold'))).toBe('binary');
    expect(types.get(id(graph, 'invert'))).toBe('binary');
    expect([...edgeStatus(graph).values()].every((check) => check.ok)).toBe(true);
    expect(runnableNodes(graph).has(id(graph, 'output'))).toBe(true);
    expect(topoOrder(graph)[0]).toBe(id(graph, 'camera'));
  });

  it('refuses incompatible connections with a helpful Polish reason', () => {
    const graph = chain();
    const threshold = createNode('threshold');
    const withNode = { ...graph, nodes: [...graph.nodes, threshold] };
    const check = canConnect(withNode, {
      source: id(graph, 'camera'),
      target: threshold.id,
      targetHandle: 'in',
    });
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.reason).toContain('Progowanie');
      expect(check.reason).toContain('Odcienie szarości');
    }
  });

  it('refuses cycles and self connections', () => {
    const graph = chain('grayscale', 'blur');
    const blur = id(graph, 'blur');
    expect(canConnect(graph, { source: blur, target: blur, targetHandle: 'in' }).ok).toBe(false);
    expect(
      canConnect(graph, { source: blur, target: id(graph, 'grayscale'), targetHandle: 'in' }).ok,
    ).toBe(false);
  });

  it('marks a wire red when the types do not fit and explains what is missing', () => {
    const graph = chain();
    const status = edgeStatus(graph);
    const [check] = [...status.values()];
    expect(check.ok).toBe(false);
    expect(nodeIssues(graph).get(id(graph, 'output'))?.[0]).toContain('czarno-biały');
    expect(runnableNodes(graph).has(id(graph, 'output'))).toBe(false);
  });

  it('one wire per input: a new connection replaces the old one', () => {
    const graph = chain('grayscale');
    const blur = createNode('blur');
    let next: Graph = { ...graph, nodes: [...graph.nodes, blur] };
    next = connect(next, { source: id(graph, 'camera'), target: blur.id, targetHandle: 'in' });
    next = connect(next, { source: blur.id, target: id(graph, 'grayscale'), targetHandle: 'in' });
    expect(next.edges.filter((edge) => edge.target === id(graph, 'grayscale'))).toHaveLength(1);
  });
});

describe('editing helpers', () => {
  it('inserts a block into the wire that leads to the output', () => {
    let graph = chain();
    for (const type of ['grayscale', 'threshold', 'invert'] as BlockType[]) {
      const next = insertOnEdge(graph, edgeIntoOutput(graph)!.id, createNode(type));
      expect(isGraph(next)).toBe(true);
      graph = next as Graph;
    }
    expect(runnableNodes(graph).has(id(graph, 'output'))).toBe(true);
    expect(graph.edges).toHaveLength(4);
  });

  it('does not insert a block that cannot take the wire', () => {
    const graph = chain();
    const result = insertOnEdge(graph, edgeIntoOutput(graph)!.id, createNode('threshold'));
    expect(isGraph(result)).toBe(false);
    if (!isGraph(result) && !result.ok) expect(result.reason).toContain('Odcienie szarości');
  });

  it('removes a block and reconnects its neighbours', () => {
    const graph = chain('grayscale', 'blur', 'threshold');
    const next = removeNode(graph, id(graph, 'blur'));
    expect(next.nodes.some((node) => node.type === 'blur')).toBe(false);
    expect(
      next.edges.some(
        (edge) => edge.source === id(graph, 'grayscale') && edge.target === id(graph, 'threshold'),
      ),
    ).toBe(true);
    // Camera and Output cannot be removed.
    expect(removeNode(graph, id(graph, 'camera'))).toBe(graph);
  });

  it('changes signatures only downstream of a changed parameter', () => {
    const graph = chain('grayscale', 'blur', 'threshold');
    const before = signatures(graph, 'f1');
    const changed: Graph = {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.type === 'blur' ? { ...node, params: { strength: 5 } } : node,
      ),
    };
    const after = signatures(changed, 'f1');
    expect(after.get(id(graph, 'grayscale'))).toBe(before.get(id(graph, 'grayscale')));
    expect(after.get(id(graph, 'blur'))).not.toBe(before.get(id(graph, 'blur')));
    expect(after.get(id(graph, 'threshold'))).not.toBe(before.get(id(graph, 'threshold')));
    expect(signatures(graph, 'f2').get(id(graph, 'grayscale'))).not.toBe(
      before.get(id(graph, 'grayscale')),
    );
  });
});
