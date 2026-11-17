import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import { plates as text } from '../../../i18n/plates';
import type { SocketType } from '../graph/types';
import { useEditor } from './EditorContext';

export type WireData = { type?: SocketType; problem?: string };
export type Wire = Edge<WireData, 'wire'>;

/** A wire colored by the data type it carries; red and dashed with a bubble when it fails. */
export function WireEdge(props: EdgeProps<Wire>) {
  const [path, labelX, labelY] = getBezierPath(props);
  const problem = props.data?.problem;
  const editor = useEditor();
  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        interactionWidth={28}
        className={`wire wire-${problem ? 'problem' : (props.data?.type ?? 'unknown')} ${props.selected ? 'selected' : ''}`}
      />
      {props.selected && (
        // A selected wire can be cut with one click (or with Delete).
        <EdgeLabelRenderer>
          <button
            className="wire-cut nodrag nopan"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY + (problem ? 30 : 0)}px)`,
            }}
            aria-label={text.editor.cutWire}
            title={text.editor.cutWire}
            onClick={() => editor.cutWire(props.id)}
          >
            ✂
          </button>
        </EdgeLabelRenderer>
      )}
      {problem && (
        <EdgeLabelRenderer>
          <div
            className="wire-bubble nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            role="note"
            tabIndex={0}
            title={problem}
            aria-label={problem}
          >
            <span aria-hidden="true">!</span>
            <p>{problem}</p>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
