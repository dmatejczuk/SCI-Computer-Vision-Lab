import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type EdgeChange,
  type FinalConnectionState,
  type NodeChange,
  type OnConnect,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { Modal } from '../../../components/Modal';
import { plates as text } from '../../../i18n/plates';
import { BitmapCanvas } from '../BitmapCanvas';
import type { PlateSession } from '../PlateSession';
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
  type Connection,
} from '../graph/graph';
import { BLOCKS, blockTitle } from '../graph/nodes';
import type { BlockType, Graph, GraphNode } from '../graph/types';
import { EditorContext, type EditorActions } from './EditorContext';
import { NodeCard, type BlockNode } from './NodeCard';
import { Palette } from './Palette';
import { WireEdge, type Wire } from './WireEdge';

const nodeTypes = { block: NodeCard };
const edgeTypes = { wire: WireEdge };
const t = text.editor;
/** Horizontal distance between blocks placed automatically. */
export const STEP_X = 230;

/** The wire (edge id) under a screen point, using the wires' wide invisible hit area. */
function edgeAt(x: number, y: number): string | null {
  for (const element of document.elementsFromPoint(x, y)) {
    const edge = element.closest('[data-testid^="rf__edge-"]');
    if (edge) return edge.getAttribute('data-testid')!.slice('rf__edge-'.length);
  }
  return null;
}

/** Screen position of a mouse or touch event. */
function pointOf(event: MouseEvent | TouchEvent | React.MouseEvent) {
  const point = 'changedTouches' in event ? event.changedTouches[0] : event;
  return { x: point.clientX, y: point.clientY };
}

/** Moves blocks at or right of `fromX` further right to make room for a new block. */
function makeRoom(graph: Graph, fromX: number, exclude: string): Graph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) =>
      node.id !== exclude && node.position.x >= fromX - 1
        ? { ...node, position: { ...node.position, x: node.position.x + STEP_X } }
        : node,
    ),
  };
}

interface Bubble {
  text: string;
  x: number;
  y: number;
}

function Flow({
  plates,
  blocks,
  outputStatus,
}: {
  plates: PlateSession;
  blocks: BlockType[];
  outputStatus?: ReactNode;
}) {
  const state = useSyncExternalStore(plates.subscribe, plates.getSnapshot);
  const graph = state.graph;
  const flow = useReactFlow<BlockNode, Wire>();
  const wrapper = useRef<HTMLDivElement>(null);
  const graphRef = useRef(graph);
  useEffect(() => {
    graphRef.current = graph;
  }, [graph]);
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const [dropEdge, setDropEdge] = useState<string | null>(null);
  const types = useMemo(() => resolveTypes(graph), [graph]);
  const issues = useMemo(() => nodeIssues(graph), [graph]);
  const status = useMemo(() => edgeStatus(graph), [graph]);
  const [rfNodes, setRfNodes] = useState<BlockNode[]>([]);
  const [rfEdges, setRfEdges] = useState<Wire[]>([]);

  useEffect(() => {
    setRfNodes((previous) =>
      graph.nodes.map((node) => {
        const old = previous.find((item) => item.id === node.id);
        return {
          ...old,
          id: node.id,
          type: 'block',
          position: node.position,
          data: { node, outputType: types.get(node.id), issues: issues.get(node.id) ?? [] },
          deletable: !BLOCKS[node.type].fixed,
        };
      }),
    );
  }, [graph, types, issues]);
  useEffect(() => {
    setRfEdges((previous) =>
      graph.edges.map((edge) => {
        const old = previous.find((item) => item.id === edge.id);
        const check = status.get(edge.id);
        return {
          id: edge.id,
          type: 'wire',
          source: edge.source,
          target: edge.target,
          targetHandle: edge.targetHandle,
          selected: old?.selected,
          className: dropEdge === edge.id ? 'drop-target' : undefined,
          data: {
            type: types.get(edge.source),
            problem: check && !check.ok ? check.reason : undefined,
          },
        };
      }),
    );
  }, [graph, types, status, dropEdge]);

  const say = useCallback((message: string, x?: number, y?: number) => {
    const box = wrapper.current?.getBoundingClientRect();
    setBubble({
      text: message,
      x: x !== undefined && box ? x - box.left : (box?.width ?? 400) / 2,
      y: y !== undefined && box ? y - box.top : 40,
    });
  }, []);
  useEffect(() => {
    if (!bubble) return;
    const timer = setTimeout(() => setBubble(null), 5000);
    return () => clearTimeout(timer);
  }, [bubble]);

  const actions = useMemo<EditorActions>(
    () => ({
      plates,
      outputStatus,
      setParam(node, param, value) {
        const current = graphRef.current;
        plates.apply(
          {
            ...current,
            nodes: current.nodes.map((item) =>
              item.id === node ? { ...item, params: { ...item.params, [param]: value } } : item,
            ),
          },
          `param:${node}:${param}`,
        );
      },
      remove(node) {
        plates.apply(removeNode(graphRef.current, node));
      },
      preview(node) {
        plates.setPreview(node);
      },
    }),
    [plates, outputStatus],
  );

  /** Adds a block: into the given wire, or the wire into "Wynik", or freely on the canvas. */
  const addBlock = useCallback(
    (type: BlockType, at?: { x: number; y: number }, wire?: string | null, client?: Bubble) => {
      const current = graphRef.current;
      const target = wire ?? (at ? null : edgeIntoOutput(current)?.id);
      const edge = target ? current.edges.find((item) => item.id === target) : undefined;
      if (edge) {
        // The new block takes the place of the wire's target, which moves one step right.
        const before = current.nodes.find((node) => node.id === edge.target)!;
        const node = createNode(type, { ...before.position });
        const next = insertOnEdge(makeRoom(current, before.position.x, ''), edge.id, node);
        if (isGraph(next)) {
          plates.apply(next);
          setTimeout(() => void flow.fitView({ duration: 250, padding: 0.15, maxZoom: 1 }), 50);
        } else if (!next.ok) say(next.reason, client?.x, client?.y);
        return;
      }
      const position = at ?? flow.screenToFlowPosition({ x: 300, y: 300 });
      plates.apply({ ...current, nodes: [...current.nodes, createNode(type, position)] });
    },
    [plates, flow, say],
  );

  const onConnect: OnConnect = useCallback(
    (connection) => {
      if (!connection.targetHandle) return;
      const wanted: Connection = {
        source: connection.source,
        target: connection.target,
        targetHandle: connection.targetHandle,
      };
      const check = canConnect(graphRef.current, wanted);
      if (check.ok) plates.apply(connect(graphRef.current, wanted));
    },
    [plates],
  );

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connection: FinalConnectionState) => {
      if (!connection.toHandle || connection.isValid || !connection.fromNode || !connection.toNode)
        return;
      const fromSource = connection.fromHandle?.type === 'source';
      const wanted: Connection = fromSource
        ? {
            source: connection.fromNode.id,
            target: connection.toNode.id,
            targetHandle: connection.toHandle.id ?? 'in',
          }
        : {
            source: connection.toNode.id,
            target: connection.fromNode.id,
            targetHandle: connection.fromHandle?.id ?? 'in',
          };
      const check = canConnect(graphRef.current, wanted);
      const point = pointOf(event);
      if (!check.ok) say(check.reason, point.x, point.y);
    },
    [say],
  );

  const isValidConnection = useCallback(
    (connection: { source: string; target: string; targetHandle?: string | null }) =>
      canConnect(graphRef.current, {
        source: connection.source,
        target: connection.target,
        targetHandle: connection.targetHandle ?? 'in',
      }).ok,
    [],
  );

  const onNodesChange = useCallback((changes: NodeChange<BlockNode>[]) => {
    setRfNodes((nodes) =>
      applyNodeChanges(
        changes.filter((change) => change.type !== 'remove'),
        nodes,
      ),
    );
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange<Wire>[]) => {
    setRfEdges((edges) =>
      applyEdgeChanges(
        changes.filter((change) => change.type !== 'remove'),
        edges,
      ),
    );
  }, []);

  const onNodeDrag = useCallback((event: MouseEvent | TouchEvent, node: BlockNode) => {
    const free = !graphRef.current.edges.some(
      (edge) => edge.source === node.id || edge.target === node.id,
    );
    const point = pointOf(event);
    setDropEdge(free ? edgeAt(point.x, point.y) : null);
  }, []);

  const onNodeDragStop = useCallback(
    (event: MouseEvent | TouchEvent, dragged: BlockNode, nodes: BlockNode[]) => {
      setDropEdge(null);
      const point = pointOf(event);
      const current = graphRef.current;
      const moved = new Map(nodes.map((node) => [node.id, node.position]));
      const positioned: Graph = {
        ...current,
        nodes: current.nodes.map((node) =>
          moved.has(node.id) ? { ...node, position: moved.get(node.id)! } : node,
        ),
      };
      const free = !current.edges.some(
        (edge) => edge.source === dragged.id || edge.target === dragged.id,
      );
      const wire = free && nodes.length === 1 ? edgeAt(point.x, point.y) : null;
      if (wire) {
        // Blender-style: a loose block dropped onto a wire is inserted into it.
        const node = positioned.nodes.find((item) => item.id === dragged.id) as GraphNode;
        const without = { ...positioned, nodes: positioned.nodes.filter((n) => n.id !== node.id) };
        const next = insertOnEdge(without, wire, node);
        if (isGraph(next)) {
          plates.apply(next);
          return;
        }
        if (!next.ok) say(next.reason, point.x, point.y);
      }
      plates.apply(positioned);
    },
    [plates, say],
  );

  // Keyboard: Delete removes selected blocks/wires, Ctrl+Z / Ctrl+Y undo and redo.
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input[type="text"], textarea, dialog')) return;
      if (!wrapper.current?.isConnected) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 'z' && !event.shiftKey) {
        event.preventDefault();
        plates.undo();
      } else if (
        (event.ctrlKey || event.metaKey) &&
        (key === 'y' || (key === 'z' && event.shiftKey))
      ) {
        event.preventDefault();
        plates.redo();
      } else if (key === 'delete' || key === 'backspace') {
        if (target.closest('input')) return;
        const nodes = rfNodesRef.current.filter((node) => node.selected).map((node) => node.id);
        const edges = rfEdgesRef.current.filter((edge) => edge.selected).map((edge) => edge.id);
        if (!nodes.length && !edges.length) return;
        event.preventDefault();
        let next = graphRef.current;
        for (const id of nodes) next = removeNode(next, id);
        next = { ...next, edges: next.edges.filter((edge) => !edges.includes(edge.id)) };
        plates.apply(next);
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [plates]);
  const rfNodesRef = useRef(rfNodes);
  const rfEdgesRef = useRef(rfEdges);
  useEffect(() => {
    rfNodesRef.current = rfNodes;
    rfEdgesRef.current = rfEdges;
  }, [rfNodes, rfEdges]);

  const previewNode = graph.nodes.find((node) => node.id === state.preview);
  return (
    <EditorContext.Provider value={actions}>
      <div className="node-editor">
        <Palette
          blocks={blocks}
          onAdd={(type, element) => {
            const box = element.getBoundingClientRect();
            const selected = rfEdgesRef.current.find((edge) => edge.selected)?.id;
            addBlock(type, undefined, selected, { text: '', x: box.right + 12, y: box.top });
          }}
        />
        <div
          className="node-canvas"
          ref={wrapper}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes('application/x-plate-block')) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
            setDropEdge(edgeAt(event.clientX, event.clientY));
          }}
          onDragLeave={() => setDropEdge(null)}
          onDrop={(event) => {
            const type = event.dataTransfer.getData('application/x-plate-block') as BlockType;
            setDropEdge(null);
            if (!type || !(type in BLOCKS)) return;
            event.preventDefault();
            const at = flow.screenToFlowPosition({ x: event.clientX - 90, y: event.clientY - 40 });
            const point = { text: '', x: event.clientX, y: event.clientY };
            addBlock(type, at, edgeAt(event.clientX, event.clientY), point);
          }}
        >
          <ReactFlow<BlockNode, Wire>
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectEnd={onConnectEnd}
            isValidConnection={isValidConnection}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            deleteKeyCode={null}
            fitView
            fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
            minZoom={0.3}
            maxZoom={1.6}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} size={1.5} />
            <Controls showInteractive={false} />
          </ReactFlow>
          {bubble && (
            <div
              className="editor-bubble"
              role="alert"
              style={{ left: bubble.x, top: bubble.y }}
              onClick={() => setBubble(null)}
            >
              {bubble.text}
            </div>
          )}
        </div>
      </div>
      {previewNode && (
        <Modal
          title={`${t.preview}: ${blockTitle(previewNode.type)}`}
          onClose={() => plates.setPreview(null)}
        >
          <div className="plates-preview">
            <BitmapCanvas
              plates={plates}
              pick={(result) => result.preview}
              label={`${t.preview}: ${blockTitle(previewNode.type)}`}
            />
          </div>
        </Modal>
      )}
    </EditorContext.Provider>
  );
}

/** Blender-style node editor for building the image processing chain. */
export function NodeEditor(props: {
  plates: PlateSession;
  blocks: BlockType[];
  outputStatus?: ReactNode;
}) {
  return (
    <ReactFlowProvider>
      <Flow {...props} />
    </ReactFlowProvider>
  );
}
