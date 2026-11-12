import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { SessionManager } from '../../services/SessionManager';
import { plates as text } from '../../i18n/plates';
import { BitmapCanvas } from './BitmapCanvas';
import { plateSessionFor } from './PlateSession';
import './plates.css';

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
  return (
    <main className="plates" aria-labelledby="plates-title">
      <div className="plates-toolbar">
        <div>
          <span className="eyebrow">{text.parts.first}</span>
          <h1 id="plates-title">{text.title}</h1>
        </div>
        <div className="plates-actions">
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
      <div className="plates-stage">
        <figure className="plates-camera">
          {/* No mirroring here: a mirrored plate would show reversed characters. */}
          <video ref={video} autoPlay muted playsInline aria-label={text.cameraLabel} />
          {state.frozen && <span className="plates-frozen-badge">{text.frozenBadge}</span>}
          <figcaption>{text.cameraLabel}</figcaption>
        </figure>
        <figure className="plates-processed">
          <BitmapCanvas
            plates={plates}
            pick={(result) => {
              const output = state.graph.nodes.find((node) => node.type === 'output');
              return output ? result.nodes[output.id]?.thumbnail : undefined;
            }}
            label={text.workerImage}
          />
          <figcaption>
            {text.workerImage} · {state.fps ? state.fps.toFixed(0) : '–'} {text.fpsUnit}
          </figcaption>
        </figure>
      </div>
    </main>
  );
}
