import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import type { SocketType } from '../graph/types';

export type WireData = { type?: SocketType; problem?: string };
export type Wire = Edge<WireData, 'wire'>;

/** A wire colored by the data type it carries; red and dashed with a bubble when it fails. */
export function WireEdge(props: EdgeProps<Wire>) {
  const [path, labelX, labelY] = getBezierPath(props);
  const problem = props.data?.problem;
  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        interactionWidth={28}
        className={`wire wire-${problem ? 'problem' : (props.data?.type ?? 'unknown')} ${props.selected ? 'selected' : ''}`}
      />
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
