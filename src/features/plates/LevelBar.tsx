import { useSyncExternalStore } from 'react';
import { plates as text } from '../../i18n/plates';
import { LEVELS, levelById } from './levels';
import type { PlateSession } from './PlateSession';

const t = text.levels;

/** Level tabs (shown in the toolbar). */
export function LevelTabs({ plates }: { plates: PlateSession }) {
  const state = useSyncExternalStore(plates.subscribe, plates.getSnapshot);
  return (
    <div className="level-tabs" role="tablist" aria-label={t.label}>
      {LEVELS.map((item) => (
        <button
          key={item.id}
          role="tab"
          aria-selected={item.id === state.level}
          className={state.completed.includes(item.id) ? 'completed' : ''}
          onClick={() => plates.setLevel(item.id)}
        >
          <span>
            {t.label} {item.id}
            {state.completed.includes(item.id) ? ' ✓' : ''}
          </span>
          {item.title}
        </button>
      ))}
    </div>
  );
}

/** The level's goal, hints revealed one at a time and the image source. */
export function LevelBar({ plates, onShowCode }: { plates: PlateSession; onShowCode: () => void }) {
  const state = useSyncExternalStore(plates.subscribe, plates.getSnapshot);
  const level = levelById(state.level);
  const done = state.completed.includes(level.id);
  const next = LEVELS.find((item) => item.id === level.id + 1);
  return (
    <section className="level-bar" aria-label={`${t.label} ${level.id}`}>
      <div className="level-body">
        <p className="level-goal">{level.goal}</p>
        <div className="level-tools">
          {level.practice && (
            <div className="level-source" role="group" aria-label={t.source}>
              <button aria-pressed={!state.practice} onClick={() => plates.setPractice(false)}>
                {t.camera}
              </button>
              <button aria-pressed={state.practice} onClick={() => plates.setPractice(true)}>
                {t.practice}
              </button>
            </div>
          )}
          {level.sample && <span className="level-source-label">{t.sampleSource}</span>}
          <button className="code-button" onClick={onShowCode}>
            {text.editor.showCode}
          </button>
          <button
            className="hint-button"
            disabled={state.hintsShown >= level.hints.length}
            onClick={() => plates.showHint()}
          >
            💡 {state.hintsShown ? t.nextHint : t.hint}
          </button>
        </div>
      </div>
      {state.hintsShown > 0 && (
        <ol className="level-hints" aria-live="polite">
          {level.hints.slice(0, state.hintsShown).map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
          {state.hintsShown >= level.hints.length && <li className="muted">{t.noMoreHints}</li>}
        </ol>
      )}
      {done && (
        <div className="level-done" role="status">
          <strong>{t.done}</strong>
        </div>
      )}
      {next && (
        // Levels are never locked: the group (or the facilitator) decides when to move on.
        <button
          className={done ? 'primary-small' : 'level-next'}
          onClick={() => plates.setLevel(next.id)}
        >
          {t.goTo(next.id)} →
        </button>
      )}
    </section>
  );
}
