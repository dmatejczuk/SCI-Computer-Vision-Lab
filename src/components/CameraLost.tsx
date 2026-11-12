import { useEffect, useRef } from 'react';
import type { SessionManager } from '../services/SessionManager';
/** Covers the app whenever the camera image is lost; it closes itself when frames return. */
export function CameraLost({
  session,
  source,
  waiting,
  busy,
}: {
  session: SessionManager;
  source: 'local' | 'phone';
  /** A phone pairing is still alive, so the image can come back on its own. */
  waiting: boolean;
  busy: boolean;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => dialog.current?.focus(), []);
  const phone = source === 'phone';
  return (
    <div className="camera-lost">
      <div
        ref={dialog}
        className="camera-lost-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="camera-lost-title"
        aria-describedby="camera-lost-text"
        tabIndex={-1}
      >
        {waiting && <span className="camera-lost-spinner" aria-hidden="true" />}
        <h2 id="camera-lost-title">{phone ? 'Rozłączono urządzenie' : 'Rozłączono kamerę'}</h2>
        <p id="camera-lost-text">
          {!phone
            ? 'Podłącz kamerę ponownie i wybierz „Spróbuj ponownie”. Zebrane przykłady zostają.'
            : waiting
              ? 'Oczekiwanie na ponowne połączenie… Sprawdź, czy telefon ma odblokowany ekran i otwartą stronę aparatu.'
              : 'Połączenie z telefonem zostało zakończone. Połącz telefon ponownie lub użyj kamery komputera.'}
        </p>
        {phone ? (
          <>
            <button className="primary" onClick={() => void session.repairPhone()}>
              Połącz nowe urządzenie
            </button>
            <button onClick={() => void session.selectSource('local')}>
              Użyj kamery komputera
            </button>
          </>
        ) : (
          <>
            <button className="primary" disabled={busy} onClick={() => void session.retry()}>
              Spróbuj ponownie
            </button>
            <button onClick={() => void session.repairPhone()}>Użyj telefonu</button>
          </>
        )}
      </div>
    </div>
  );
}
