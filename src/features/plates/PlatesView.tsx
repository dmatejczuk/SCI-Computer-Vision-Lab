import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { SessionManager } from '../../services/SessionManager';
import { plates as text } from '../../i18n/plates';
import { BLOCKS } from './graph/nodes';
import type { BlockType } from './graph/types';
import { NodeEditor } from './editor/NodeEditor';
import { plateSessionFor } from './PlateSession';
import './plates.css';

const ALL_BLOCKS = (Object.keys(BLOCKS) as BlockType[]).filter((type) => !BLOCKS[type].fixed);

/** Part 1 of the workshop: the plate reader (node editor and reader screens). */
export function PlatesView({ session }: { session: SessionManager }) {
  const plates = plateSessionFor(session);
  const state = useSyncExternalStore(plates.subscribe, plates.getSnapshot);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current!;
    session.enterPlates(element);
    void plates.attach(element);
    return () => {
      plates.detach();
      session.leavePlates();
    };
  }, [session, plates]);
  const t = text.editor;
  return (
    <main className="plates" aria-labelledby="plates-title">
      <div className="plates-toolbar">
        <div>
          <span className="eyebrow">{text.parts.first}</span>
          <h1 id="plates-title">{text.title}</h1>
        </div>
        <div className="plates-actions">
          <button disabled={!state.canUndo} onClick={() => plates.undo()} title="Ctrl+Z">
            ↶ {t.undo}
          </button>
          <button disabled={!state.canRedo} onClick={() => plates.redo()} title="Ctrl+Y">
            ↷ {t.redo}
          </button>
          <button onClick={() => plates.clearGraph()}>{t.clear}</button>
          <button
            aria-pressed={state.frozen}
            disabled={state.status !== 'ready'}
            onClick={() => void (state.frozen ? plates.unfreeze() : plates.freeze())}
          >
            {state.frozen ? text.unfreeze : text.freeze}
          </button>
        </div>
      </div>
      {state.status === 'loading' && (
        <p className="plates-status" role="status">
          {text.loadingVision}
        </p>
      )}
      {state.status === 'error' && (
        <p className="error" role="alert">
          {state.error === 'csp' ? text.perf.csp : text.visionFailed}
        </p>
      )}
      <div className="plates-workspace">
        <NodeEditor plates={plates} blocks={ALL_BLOCKS} />
        <figure className="camera-dock">
          {/* No mirroring here: a mirrored plate would show reversed characters. */}
          <video ref={video} autoPlay muted playsInline aria-label={text.cameraLabel} />
          {state.frozen && <span className="plates-frozen-badge">{text.frozenBadge}</span>}
          <figcaption>
            {text.cameraLabel} · {state.fps ? state.fps.toFixed(0) : '–'} {text.fpsUnit}
          </figcaption>
        </figure>
      </div>
    </main>
  );
}
