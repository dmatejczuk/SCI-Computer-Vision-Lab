import { useEffect, useState, useSyncExternalStore } from 'react';
import { plates as text } from '../../../i18n/plates';
import { blockTitle } from '../graph/nodes';
import { plateConfig } from '../plateConfig';
import { existingPlateSession, type PlateSession } from '../PlateSession';

const t = text.instructor;

function Diagnostics({ plates }: { plates: PlateSession }) {
  const state = useSyncExternalStore(plates.subscribe, plates.getSnapshot);
  // Node timings change every frame; refreshing twice a second is enough here.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((tick) => tick + 1), 500);
    return () => clearInterval(timer);
  }, []);
  const nodes = plates.latest?.nodes ?? {};
  const source = state.sample ? t.sample : state.frozen ? t.frozen : t.camera;
  return (
    <>
      <dl className="diagnostics">
        <dt>{t.status}</dt>
        <dd>{state.status === 'ready' ? t.ready : state.status}</dd>
        <dt>{t.level}</dt>
        <dd>{state.level}</dd>
        <dt>{t.source}</dt>
        <dd>{source}</dd>
        <dt>{t.fps}</dt>
        <dd>{state.fps.toFixed(1)}</dd>
        <dt>{t.pass}</dt>
        <dd>{state.passMs.toFixed(0)} ms</dd>
        <dt>{t.width}</dt>
        <dd>{state.workWidth} px</dd>
        <dt>{t.mats}</dt>
        <dd data-testid="plates-mats">
          {state.liveMats} / {state.cachedMats}
        </dd>
        <dt>{t.wasm}</dt>
        <dd>{(state.wasmBytes / 1024 / 1024).toFixed(0)} MB</dd>
      </dl>
      <details>
        <summary>{t.nodes}</summary>
        <table className="perf-table">
          <thead>
            <tr>
              <th>{t.block}</th>
              <th>{t.time}</th>
            </tr>
          </thead>
          <tbody>
            {state.graph.nodes.map((node) => (
              <tr key={node.id}>
                <th>{blockTitle(node.type)}</th>
                <td>
                  {nodes[node.id]
                    ? nodes[node.id].cached
                      ? t.cached
                      : `${nodes[node.id].ms.toFixed(1)} ms`
                    : '–'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <div className="actions">
        <button onClick={() => plates.loadReference()}>{t.reference(state.level)}</button>
      </div>
      <p className="note">{t.referenceNote}</p>
      <label className="setting">
        <input
          type="checkbox"
          checked={state.allBlocks}
          onChange={(event) => plates.setAllBlocks(event.target.checked)}
        />{' '}
        {t.allBlocks}
      </label>
    </>
  );
}

/** Plate reader section of the facilitator panel (loaded with the plate module chunk). */
export function PlatesInstructor() {
  const plates = existingPlateSession();
  return (
    <section className="plates-instructor" aria-label={t.title}>
      <h3>{t.title}</h3>
      {plates ? <Diagnostics plates={plates} /> : <p>{t.notOpened}</p>}
      <details>
        <summary>{t.config}</summary>
        <dl className="diagnostics">
          <dt>{t.font}</dt>
          <dd>{plateConfig.font.name}</dd>
          <dt>{t.charset}</dt>
          <dd>{plateConfig.charset}</dd>
          <dt>{t.slots}</dt>
          <dd>{plateConfig.slots}</dd>
        </dl>
        <p className="note">{t.configNote}</p>
      </details>
    </section>
  );
}
