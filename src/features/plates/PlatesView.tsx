import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { SessionManager } from '../../services/SessionManager';
import { plates as text } from '../../i18n/plates';
import { CodeModal } from './editor/CodeModal';
import { NodeEditor } from './editor/NodeEditor';
import { OutputStatus } from './editor/OutputStatus';
import { BLOCKS } from './graph/nodes';
import type { BlockType } from './graph/types';
import { LevelBar, LevelTabs } from './LevelBar';
import { levelById } from './levels';
import { plateConfig } from './plateConfig';
import { ReaderView } from './reader/ReaderView';
import { plateSessionFor } from './PlateSession';
import './plates.css';

// The tile font, also used to show the read text in plate style ("Plate" font family).
if (typeof FontFace !== 'undefined')
  void new FontFace('Plate', `url(${plateConfig.font.file})`)
    .load()
    .then((face) => document.fonts.add(face))
    .catch(() => {});

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
  const outputStatus = useMemo(() => <OutputStatus plates={plates} />, [plates]);
  const [code, setCode] = useState(false);
  return (
    <main className="plates" aria-labelledby="plates-title">
      <div className="plates-toolbar">
        <h1 id="plates-title">{text.title}</h1>
        {state.view === 'editor' && <LevelTabs plates={plates} />}
        <div className="plates-actions">
          {state.view === 'editor' ? (
            <>
              <button disabled={!state.canUndo} onClick={() => plates.undo()} title="Ctrl+Z">
                ↶ {t.undo}
              </button>
              <button disabled={!state.canRedo} onClick={() => plates.redo()} title="Ctrl+Y">
                ↷ {t.redo}
              </button>
              <button onClick={() => plates.clearGraph()}>{t.clear}</button>
            </>
          ) : (
            <button onClick={() => plates.setView('editor')}>{text.reader.back}</button>
          )}
          {!state.sample && (
            <button
              aria-pressed={state.frozen}
              disabled={state.status !== 'ready'}
              onClick={() => void (state.frozen ? plates.unfreeze() : plates.freeze())}
            >
              {state.frozen ? text.unfreeze : text.freeze}
            </button>
          )}
          {state.view === 'editor' && (
            <button
              className="launch-reader"
              disabled={!plates.canRead}
              title={plates.canRead ? undefined : text.reader.launchHint}
              onClick={() => plates.setView('reader')}
            >
              {text.reader.launch} →
            </button>
          )}
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
      {state.view === 'editor' && <LevelBar plates={plates} onShowCode={() => setCode(true)} />}
      <div className={`plates-workspace view-${state.view}`}>
        {state.view === 'editor' ? (
          <NodeEditor
            key={state.level}
            plates={plates}
            blocks={state.allBlocks ? ALL_BLOCKS : levelById(state.level).blocks}
            outputStatus={outputStatus}
          />
        ) : (
          <ReaderView plates={plates} />
        )}
        <figure className="camera-dock" hidden={!!state.sample}>
          {/* No mirroring here: a mirrored plate would show reversed characters. */}
          <video ref={video} autoPlay muted playsInline aria-label={text.cameraLabel} />
          {state.frozen && <span className="plates-frozen-badge">{text.frozenBadge}</span>}
          <figcaption>
            {text.cameraLabel} · {state.fps ? state.fps.toFixed(0) : '–'} {text.fpsUnit}
          </figcaption>
        </figure>
      </div>
      {code && <CodeModal graph={state.graph} onClose={() => setCode(false)} />}
    </main>
  );
}
