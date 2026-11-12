import { Snackbar } from '../../components/Snackbar';
import { deviceName } from './deviceName';
import { PairingCodeInput } from './PairingCodeInput';
import { useEffect, useRef, useState } from 'react';
import { SignalingClient } from './SignalingClient';
import { PeerConnectionController } from './PeerConnectionController';
import {
  canTransform,
  enterFullscreen,
  exitFullscreen,
  fullscreenSupported,
  isFullscreen,
  isIdentity,
  loadView,
  previewTransform,
  saveView,
  TransformedStream,
  type ViewTransform,
} from './viewTransform';
const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};
const icons = {
  switch: 'M4 7h11l-3-3m8 13H9l3 3M7 11a5 5 0 0 1 5-4m5 6a5 5 0 0 1-5 4',
  flipX: 'M12 3v18M9 6l-6 6 6 6zm6 0 6 6-6 6z',
  flipY: 'M3 12h18M6 9l6-6 6 6zm0 6 6 6 6-6z',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  shrink: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  stop: 'M7 7h10v10H7z',
};
function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}
export function PhoneCameraPage() {
  const video = useRef<HTMLVideoElement>(null);
  const pipeline = useRef<TransformedStream | null>(null);
  const [view, setView] = useState<ViewTransform>(() => loadView(storage()));
  const viewRef = useRef(view);
  viewRef.current = view;
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen] = useState(fullscreenSupported);
  const [transformable] = useState(canTransform);
  const signaling = useRef<SignalingClient | null>(null);
  const peer = useRef<PeerConnectionController | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const epoch = useRef(0);
  const [status, setStatus] = useState(
    'Dołącz do stanowiska, następnie porównaj kod na obu ekranach.',
  );
  const [approved, setApproved] = useState(false);
  const [joined, setJoined] = useState(false);
  const [live, setLive] = useState(false);
  const [ended, setEnded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [playback, setPlayback] = useState(false);
  const [name, setName] = useState(() => deviceName());
  const [joinCode, setJoinCode] = useState('');
  const [hasInvite, setHasInvite] = useState(false);
  const [resumeVersion, setResumeVersion] = useState(0);
  const wasLive = useRef(false);
  // The camera starts by itself once after approval; the button stays as a fallback.
  const autoStarted = useRef(false);
  const resumeCamera = useRef(() => {});
  const [code, setCode] = useState('');
  const facing = useRef<'environment' | 'user'>('environment');
  const invite = useRef<URLSearchParams | null>(null);
  const statsTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const stop = useRef(() => {});
  stop.current = () => {
    epoch.current++;
    wasLive.current = false;
    clearInterval(statsTimer.current);
    pipeline.current?.stop();
    pipeline.current = null;
    stream.current?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    stream.current = null;
    void exitFullscreen();
    peer.current?.stop();
    peer.current = null;
    signaling.current?.stop();
    signaling.current = null;
    if (video.current) video.current.srcObject = null;
    setApproved(false);
    setJoined(false);
    setHasInvite(false);
    invite.current = null;
    autoStarted.current = false;
    setEnded(true);
    setCode('');
    setLive(false);
    setBusy(false);
    setPlayback(false);
    setStatus('Transmisja zakończona. Wpisz nowy kod lub zeskanuj QR ze stanowiska.');
  };
  useEffect(() => {
    invite.current = new URLSearchParams(location.hash.slice(1));
    setHasInvite(!!invite.current.get('room') && !!invite.current.get('invite'));
    history.replaceState(null, '', '/phone');
    const visibility = () => {
      if (!document.hidden && wasLive.current) resumeCamera.current();
    };
    const hide = () => stop.current();
    const screenChange = () => setFullscreen(isFullscreen());
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('fullscreenchange', screenChange);
    document.addEventListener('webkitfullscreenchange', screenChange);
    window.addEventListener('pagehide', hide);
    return () => {
      stop.current();
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('fullscreenchange', screenChange);
      document.removeEventListener('webkitfullscreenchange', screenChange);
      window.removeEventListener('pagehide', hide);
    };
  }, []);
  /** Sends the plain camera track, or a flipped canvas copy when a flip is set. */
  const route = async () => {
    const raw = stream.current,
      current = peer.current;
    const source = raw?.getVideoTracks()[0];
    if (!raw || !current || !source || !video.current) return;
    if (isIdentity(viewRef.current) || !transformable) {
      const previous = pipeline.current;
      pipeline.current = null;
      await current.sendStream(raw);
      previous?.stop();
    } else if (pipeline.current?.source === source) pipeline.current.transform = viewRef.current;
    else {
      const previous = pipeline.current;
      pipeline.current = new TransformedStream(video.current, source, viewRef.current);
      await current.sendStream(pipeline.current.stream);
      previous?.stop();
    }
  };
  const join = async () => {
    if (!window.isSecureContext || !navigator.mediaDevices) {
      setStatus('Otwórz link HTTPS w Safari lub Chrome i zaufaj certyfikatowi serwera.');
      return;
    }
    const room = invite.current?.get('room'),
      secret = invite.current?.get('invite');
    if ((!room || !secret) && !/^[A-Z2-9]{6}$/.test(joinCode)) {
      setStatus('Wpisz sześć znaków kodu wyświetlanego na komputerze.');
      return;
    }
    setJoined(true);
    setEnded(false);
    const generation = ++epoch.current;
    const lost = () => {
      if (generation === epoch.current) stop.current();
    };
    const client = new SignalingClient((m) => {
      if (generation !== epoch.current) return;
      if (m.type === 'waiting') {
        setCode(m.code!);
        setStatus('Czekamy na zatwierdzenie na komputerze.');
      } else if (m.type === 'reconnecting') {
        peer.current?.stop();
        peer.current = null;
        setStatus('Przerwa w połączeniu. Łączymy ponownie…');
      } else if (m.type === 'approved') {
        peer.current?.stop();
        invite.current = null;
        setApproved(true);
        setStatus('Komputer zaakceptował telefon. Uruchamiamy aparat…');
        peer.current = new PeerConnectionController('phone', client, m, () => {}, lost);
        setResumeVersion((v) => v + 1);
      } else if (m.type === 'error') {
        lost();
        setStatus('Nie można dołączyć. Sprawdź kod lub poproś o nowe zaproszenie.');
      } else if (m.type === 'ended') lost();
      else peer.current?.handle(m);
    }, lost);
    signaling.current = client;
    try {
      await client.ready;
      if (generation === epoch.current) {
        if (room && secret) client.send('join', { room, secret, name: name.trim() || 'Telefon' });
        else client.send('join-code', { code: joinCode, name: name.trim() || 'Telefon' });
      }
    } catch {
      lost();
    }
  };
  const play = async () => {
    try {
      await video.current?.play();
      setPlayback(false);
    } catch {
      setPlayback(true);
    }
  };
  const camera = async (switchCamera = false) => {
    if (!approved || busy) return;
    setBusy(true);
    const generation = epoch.current;
    if (switchCamera) facing.current = facing.current === 'environment' ? 'user' : 'environment';
    // Some mobile devices cannot open a second camera while the first is active.
    pipeline.current?.stop();
    pipeline.current = null;
    stream.current?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    let next: MediaStream | undefined;
    try {
      try {
        next = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facing.current },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, max: 30 },
          },
        });
      } catch (e) {
        if (e instanceof DOMException && ['NotAllowedError', 'NotFoundError'].includes(e.name))
          throw e;
        next = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: facing.current } },
        });
      }
      if (generation !== epoch.current) {
        next.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = next;
      video.current!.srcObject = next;
      next.getVideoTracks()[0].onended = () => {
        setLive(false);
        setStatus('Aparat został wstrzymany. Wróć do strony, aby wznowić.');
      };
      await play();
      await route();
      if (generation !== epoch.current) return;
      setLive(true);
      wasLive.current = true;
      // The full-screen viewfinder speaks for itself; no notice covers it while streaming.
      setStatus('');
      clearInterval(statsTimer.current);
      let degraded = 0,
        adapted = false;
      statsTimer.current = setInterval(() => {
        const current = peer.current;
        if (!current || adapted) return;
        void current.pc
          .getStats()
          .then((report) => {
            if (generation !== epoch.current) return;
            let constrained = false;
            report.forEach((s) => {
              if (
                s.type === 'outbound-rtp' &&
                s.kind === 'video' &&
                ['bandwidth', 'cpu'].includes(s.qualityLimitationReason)
              )
                constrained = true;
            });
            degraded = constrained ? degraded + 1 : 0;
            if (degraded >= 5) {
              adapted = true;
              void stream.current
                ?.getVideoTracks()[0]
                .applyConstraints({
                  width: { ideal: 854 },
                  height: { ideal: 480 },
                  frameRate: { ideal: 20, max: 24 },
                })
                .catch(() => {});
              setStatus('Profil oszczędny: obniżona jakość dla stabilniejszej transmisji.');
            }
          })
          .catch(() => {});
      }, 2000);
    } catch (e) {
      next?.getTracks().forEach((t) => t.stop());
      if (generation === epoch.current) {
        setLive(false);
        setStatus(
          e instanceof DOMException && e.name === 'NotAllowedError'
            ? 'Brak zgody na aparat. Zezwól w ustawieniach przeglądarki i spróbuj ponownie.'
            : 'Nie można uruchomić aparatu. Zamknij inne aplikacje i spróbuj ponownie.',
        );
      }
    } finally {
      if (generation === epoch.current) setBusy(false);
    }
  };
  resumeCamera.current = () => {
    if (!approved || !peer.current || busy) return;
    if (wasLive.current) void camera();
    else if (!autoStarted.current) {
      autoStarted.current = true;
      void camera();
    }
  };
  useEffect(() => {
    if (approved) resumeCamera.current();
  }, [approved, resumeVersion]);
  const routeRef = useRef(route);
  routeRef.current = route;
  useEffect(() => {
    saveView(view, storage());
    if (stream.current && peer.current) void routeRef.current().catch(() => {});
  }, [view]);
  useEffect(() => {
    // Keep the screen awake while streaming; the lock is released whenever the page is hidden.
    if (!live || !('wakeLock' in navigator)) return;
    let cancelled = false,
      lock: WakeLockSentinel | null = null;
    const acquire = () => {
      if (document.hidden || lock) return;
      navigator.wakeLock
        .request('screen')
        .then((s) => {
          if (cancelled) void s.release();
          else {
            lock = s;
            s.onrelease = () => {
              lock = null;
            };
          }
        })
        .catch(() => {});
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release().catch(() => {});
    };
  }, [live]);
  return (
    <main className={live ? 'phone-page phone-live' : 'phone-page'}>
      {!live && (
        <>
          <header>
            <strong>
              SCI<span>_</span>
            </strong>
            <a className="role-back" href="/">
              Zmień rolę urządzenia
            </a>
          </header>
          <div className="phone-step">
            {ended
              ? 'Do zobaczenia'
              : approved
                ? 'Krok 3 z 3'
                : joined
                  ? 'Krok 2 z 3'
                  : 'Krok 1 z 3'}
          </div>
          <h1>
            {ended
              ? 'Połączenie zakończone'
              : approved
                ? 'Włącz aparat'
                : joined
                  ? 'Potwierdź na komputerze'
                  : 'Twój telefon, kamera AI'}
          </h1>
        </>
      )}
      <Snackbar message={status} />
      {code && !approved && !ended && (
        <p className="pair-code">
          Porównaj kod na komputerze<strong>{code}</strong>
        </p>
      )}
      {!joined && (
        <>
          {!hasInvite && <PairingCodeInput value={joinCode} onChange={setJoinCode} />}
          <label>
            Nazwa telefonu
            <input maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button
            className="primary"
            disabled={!hasInvite && !/^[A-Z2-9]{6}$/.test(joinCode)}
            onClick={() => void join()}
          >
            Dołącz do stanowiska
          </button>
        </>
      )}
      <section className="phone-stage" hidden={!live} aria-label="Kamera telefonu">
        <div className="phone-view">
          <video
            ref={video}
            autoPlay
            playsInline
            muted
            aria-label="Podgląd telefonu"
            style={{ transform: previewTransform(view) }}
          />
          <p className="phone-live-badge">
            <span className="connection-dot" />
            Na żywo
          </p>
          {playback && (
            <button className="phone-play" onClick={() => void play()}>
              Odtwórz podgląd
            </button>
          )}
        </div>
        <div className="phone-controls" role="toolbar" aria-label="Sterowanie kamerą">
          <button disabled={busy} onClick={() => void camera(true)}>
            <Icon path={icons.switch} />
            <span>{busy ? 'Uruchamianie…' : 'Zmień aparat'}</span>
          </button>
          {transformable && (
            <>
              <button
                disabled={busy}
                aria-pressed={view.flipX}
                onClick={() => setView((v) => ({ ...v, flipX: !v.flipX }))}
              >
                <Icon path={icons.flipX} />
                <span>Odbij poziomo</span>
              </button>
              <button
                disabled={busy}
                aria-pressed={view.flipY}
                onClick={() => setView((v) => ({ ...v, flipY: !v.flipY }))}
              >
                <Icon path={icons.flipY} />
                <span>Odbij pionowo</span>
              </button>
            </>
          )}
          {canFullscreen && (
            <button
              aria-pressed={fullscreen}
              aria-label="Pełny ekran"
              onClick={() => void (fullscreen ? exitFullscreen() : enterFullscreen())}
            >
              <Icon path={fullscreen ? icons.shrink : icons.expand} />
              <span>Pełny ekran</span>
            </button>
          )}
          <button
            className="phone-stop"
            aria-label="Zatrzymaj transmisję"
            onClick={() => stop.current()}
          >
            <Icon path={icons.stop} />
            <span>Zatrzymaj</span>
          </button>
        </div>
      </section>
      {approved && !live && (
        <button
          className="primary"
          disabled={busy}
          onClick={() => {
            // Fullscreen needs the tap's user gesture, so request it before any await.
            if (canFullscreen) void enterFullscreen();
            void camera();
          }}
        >
          {busy ? 'Uruchamianie…' : 'Uruchom aparat'}
        </button>
      )}
      {playback && !live && <button onClick={() => void play()}>Odtwórz podgląd</button>}
      {joined && !ended && !live && (
        <button className="danger" onClick={() => stop.current()}>
          Zatrzymaj transmisję
        </button>
      )}
      {!live && <p className="phone-hint">Tylko obraz. Bez mikrofonu i nagrywania.</p>}
      <details className="phone-help" hidden={live}>
        <summary>Pomoc i prywatność</summary>
        <p>
          Obraz analizuje komputer. Po powrocie do strony spróbujemy wznowić połączenie. Jeśli
          przerwa trwała ponad minutę, połącz telefon ponownie.
        </p>
        <p>
          Nie możesz się połączyć? Otwórz link w Safari lub Chrome. Oba urządzenia muszą ufać
          certyfikatowi strony.
        </p>
      </details>
    </main>
  );
}
