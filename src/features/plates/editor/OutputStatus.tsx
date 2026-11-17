import { useSyncExternalStore } from 'react';
import { plates as text } from '../../../i18n/plates';
import type { PlateSession } from '../PlateSession';

/** Shown inside the "Wynik" block: how many characters were found and what they read. */
export function OutputStatus({ plates }: { plates: PlateSession }) {
  const state = useSyncExternalStore(plates.subscribe, plates.getSnapshot);
  const found = state.reading.length;
  const ok = found >= state.expected.min && found <= state.expected.max;
  return (
    <div className={`output-status ${ok ? 'ok' : found ? 'partial' : ''}`} aria-live="polite">
      <p className="output-count">
        {text.reader.found(found, state.expected)} {ok ? '✓' : ''}
      </p>
      {found > 0 && (
        <p className="output-text" aria-label={text.reader.readText}>
          {state.reading.map((c) => c.char).join('')}
        </p>
      )}
    </div>
  );
}
