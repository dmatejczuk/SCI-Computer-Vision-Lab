import { Snackbar } from '../../components/Snackbar';
import { useEffect, useState, useSyncExternalStore } from 'react';
import QRCode from 'qrcode';
import type { SessionManager } from '../../services/SessionManager';
export function PairingPanel({ session }: { session: SessionManager }) {
  const state = useSyncExternalStore(session.phone.subscribe, session.phone.getSnapshot);
  const workshop = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [qr, setQr] = useState(''),
    [now, setNow] = useState(Date.now()),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    let active = true;
    setQr('');
    setCopied(false);
    if (state.link)
      void QRCode.toDataURL(state.link, { width: 256, margin: 3 })
        .then((value) => {
          if (active) setQr(value);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [state.link]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const controls = (
    <>
      <button onClick={() => void session.repairPhone()}>Połącz nowe urządzenie</button>
      <button onClick={() => void session.selectSource('local')}>
        Rozłącz telefon i wybierz kamerę komputera
      </button>
    </>
  );
  return (
    <section
      className={`pairing-panel ${state.stats ? 'connected' : ''}`}
      aria-label="Połączenie telefonu"
    >
      <Snackbar message={state.status} />
      {!state.stats && (
        <div className="pairing-heading">
          <span className="phone-step">Kamera telefonu</span>
          <h2>
            {state.requests.length
              ? 'Potwierdź swój telefon'
              : state.link
                ? 'Zeskanuj kod i połącz aparat'
                : 'Połącz telefon ze stanowiskiem'}
          </h2>
          <p>
            {state.requests.length
              ? 'Porównaj kod potwierdzenia na obu ekranach.'
              : state.link
                ? 'Zeskanuj QR lub wpisz kod na telefonie.'
                : 'Połącz kamerę, aby rozpocząć.'}
          </p>
        </div>
      )}
      {state.link && state.requests.length === 0 && (
        <div className="pairing-invite">
          <div className="manual-invite">
            <span>Wpisz kod na telefonie</span>
            <strong aria-label="Kod dołączenia">{state.code}</strong>
            <small>Otwórz {location.origin} i wybierz „Udostępnij kamerę”.</small>
          </div>
          {qr && <img src={qr} width={256} height={256} alt="Kod QR zaproszenia telefonu" />}
          <div className="pairing-instructions">
            <h3>Aparat zamiast kamerki</h3>
            <ol>
              <li>Zeskanuj kod aparatem telefonu.</li>
              <li>Porównaj kod i zatwierdź telefon tutaj.</li>
              <li>Włącz aparat na telefonie.</li>
            </ol>
            <p className="note">
              {state.expires > now
                ? 'Zaproszenie aktywne przez ' +
                  Math.min(5, Math.ceil((state.expires - now) / 60000)) +
                  ' min'
                : 'Zaproszenie wygasło. Wybierz Połącz nowe urządzenie.'}
            </p>
            <a href={state.link} target="_blank" rel="noreferrer">
              Otwórz link telefonu
            </a>
            <button
              onClick={() =>
                void navigator.clipboard
                  .writeText(state.link)
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false))
              }
            >
              {copied ? 'Link skopiowany ✓' : 'Kopiuj link'}
            </button>
          </div>
        </div>
      )}
      {state.requests.map((request) => (
        <div
          key={request.attempt}
          className="pairing-request"
          role="group"
          aria-label={`Telefon ${request.name}`}
        >
          <p>
            {request.name} · kod <strong>{request.code}</strong>
          </p>
          <button className="primary" onClick={() => session.phone.approve(request.attempt!)}>
            Zatwierdź telefon
          </button>
          <button onClick={() => session.phone.reject(request.attempt!)}>Odrzuć telefon</button>
        </div>
      ))}
      {state.playback && <button onClick={() => void session.phone.play()}>Odtwórz obraz</button>}
      {state.stats && (
        <>
          <p>
            <span className="connection-dot" />{' '}
            {workshop.error ? 'Sprawdź połączenie telefonu' : 'Telefon połączony'}
          </p>
          {controls}
        </>
      )}
      {!state.stats && (state.link || workshop.error) && (
        <div className="pairing-actions">{controls}</div>
      )}
    </section>
  );
}
