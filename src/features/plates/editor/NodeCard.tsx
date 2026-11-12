import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { plates as text } from '../../../i18n/plates';
import { BitmapCanvas } from '../BitmapCanvas';
import { BLOCKS, blockDescription, blockTitle, paramLabel } from '../graph/nodes';
import type { GraphNode, SocketType } from '../graph/types';
import { SOCKET_CLASS, useEditor, useNodeResult } from './EditorContext';

export type BlockNodeData = {
  node: GraphNode;
  outputType?: SocketType;
  issues: string[];
};
export type BlockNode = Node<BlockNodeData, 'block'>;

const t = text.editor;

function formatParam(type: GraphNode['type'], param: string, value: number) {
  if (type === 'shapeFilter') return `${value}%`;
  if (param === 'contrast') return `×${value.toFixed(1)}`;
  return String(value);
}

/** One block: title, live thumbnail, sliders, sockets and error bubbles. */
export const NodeCard = memo(function NodeCard({ data, selected }: NodeProps<BlockNode>) {
  const { node, outputType, issues } = data;
  const editor = useEditor();
  const def = BLOCKS[node.type];
  const run = useNodeResult(editor.plates, node.id);
  const autoThreshold = node.type === 'threshold' && node.params.auto >= 0.5;
  const runError =
    run?.error === 'noPlate' ? text.errors.noPlate : run?.error ? text.errors.failed : '';
  const problems = issues.length ? issues : runError ? [runError] : [];
  const info =
    run?.info && node.type === 'threshold'
      ? `${t.autoLevel}: ${run.info}`
      : run?.info && node.type === 'shapeFilter'
        ? `${t.shapes}: ${run.info}`
        : '';
  return (
    <div
      className={`block-card block-${def.category} ${problems.length ? 'has-problem' : ''} ${selected ? 'selected' : ''}`}
      data-block={node.type}
      aria-label={blockTitle(node.type)}
      title={blockDescription(node.type)}
    >
      {def.inputs.map((input, index) => (
        <Handle
          key={input.id}
          id={input.id}
          type="target"
          position={Position.Left}
          className={`socket ${SOCKET_CLASS[input.accepts[0]]}`}
          style={{ top: def.inputs.length > 1 ? `${30 + index * 40}%` : '50%' }}
          title={`${def.inputs.length > 1 ? text.inputs[input.id as keyof typeof text.inputs] + ': ' : ''}${input.accepts.map((type) => text.sockets[type]).join(' / ')}`}
        />
      ))}
      <div className="block-head">
        <span className="block-icon" aria-hidden="true">
          {def.icon}
        </span>
        <strong>{blockTitle(node.type)}</strong>
        {!def.fixed && (
          <button
            className="block-delete nodrag"
            aria-label={`${t.remove}: ${blockTitle(node.type)}`}
            title={t.remove}
            onClick={() => editor.remove(node.id)}
          >
            ×
          </button>
        )}
      </div>
      {def.inputs.length > 1 && (
        <div className="block-inputs">
          {def.inputs.map((input) => (
            <span key={input.id}>{text.inputs[input.id as keyof typeof text.inputs]}</span>
          ))}
        </div>
      )}
      <div className="block-thumb" title={t.enlarge}>
        <BitmapCanvas
          plates={editor.plates}
          pick={(result) => result.nodes[node.id]?.thumbnail}
          label={`${t.thumbnail}: ${blockTitle(node.type)}`}
          onDoubleClick={() => editor.preview(node.id)}
        />
        <button
          className="block-zoom nodrag"
          aria-label={`${t.enlarge}: ${blockTitle(node.type)}`}
          onClick={() => editor.preview(node.id)}
        >
          ⤢
        </button>
      </div>
      {node.type === 'output' && editor.outputStatus}
      {def.params.map((param) =>
        param.toggle ? (
          <label key={param.id} className="block-toggle nodrag">
            <input
              type="checkbox"
              checked={node.params[param.id] >= 0.5}
              onChange={(event) => editor.setParam(node.id, param.id, event.target.checked ? 1 : 0)}
            />
            {paramLabel(node.type, param.id)}
          </label>
        ) : (
          <label key={param.id} className="block-param nodrag nowheel">
            <span>
              {paramLabel(node.type, param.id)}
              <output>{formatParam(node.type, param.id, node.params[param.id])}</output>
            </span>
            <input
              type="range"
              min={param.min}
              max={param.max}
              step={param.step}
              value={node.params[param.id]}
              disabled={autoThreshold && param.id === 'level'}
              onChange={(event) => editor.setParam(node.id, param.id, Number(event.target.value))}
            />
          </label>
        ),
      )}
      {info && <p className="block-info">{info}</p>}
      {problems.length > 0 && (
        <div className="block-problem" role="note">
          {problems[0]}
        </div>
      )}
      {def.output && (
        <>
          <span className="block-out-type">
            {outputType ? text.sockets[outputType] : t.noImage}
          </span>
          <Handle
            type="source"
            position={Position.Right}
            className={`socket ${outputType ? SOCKET_CLASS[outputType] : 'socket-unknown'}`}
            title={outputType ? text.sockets[outputType] : t.noImage}
          />
        </>
      )}
    </div>
  );
});
