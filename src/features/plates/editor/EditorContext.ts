import { createContext, useContext, useEffect, useState } from 'react';
import type { PlateSession } from '../PlateSession';
import type { SocketType } from '../graph/types';
import type { NodeResult } from '../worker/protocol';

export interface EditorActions {
  plates: PlateSession;
  setParam(node: string, param: string, value: number): void;
  remove(node: string): void;
  /** Takes the block out of its wires and leaves it on the canvas. */
  unplug(node: string): void;
  /** Removes one wire. */
  cutWire(edge: string): void;
  preview(node: string): void;
  /** Extra content for the Output block (character counter). */
  outputStatus?: React.ReactNode;
}

export const EditorContext = createContext<EditorActions | null>(null);

export function useEditor(): EditorActions {
  const value = useContext(EditorContext);
  if (!value) throw new Error('EditorContext missing');
  return value;
}

type Summary = Pick<NodeResult, 'ms' | 'error' | 'info' | 'cached'> | undefined;

/** The latest run information of one block; re-renders only when the text changes. */
export function useNodeResult(plates: PlateSession, id: string): Summary {
  const read = (): Summary => {
    const node = plates.latest?.nodes[id];
    return node
      ? { ms: node.ms, error: node.error, info: node.info, cached: node.cached }
      : undefined;
  };
  const [summary, setSummary] = useState<Summary>(read);
  useEffect(
    () =>
      plates.onResult((result) => {
        const node = result.nodes[id];
        setSummary((previous) => {
          const next = node
            ? { ms: node.ms, error: node.error, info: node.info, cached: node.cached }
            : undefined;
          // Timings change every frame; only re-render when the shown text changes.
          if (
            previous?.error === next?.error &&
            previous?.info === next?.info &&
            Math.round(previous?.ms ?? 0) === Math.round(next?.ms ?? 0)
          )
            return previous;
          return next;
        });
      }),
    [plates, id],
  );
  return summary;
}

export const SOCKET_CLASS: Record<SocketType, string> = {
  color: 'socket-color',
  gray: 'socket-gray',
  binary: 'socket-binary',
  region: 'socket-region',
};
