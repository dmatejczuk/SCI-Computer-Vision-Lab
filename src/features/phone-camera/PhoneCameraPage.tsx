import { Snackbar } from '../../components/Snackbar';
import { deviceName } from './deviceName';
import { PairingCodeInput } from './PairingCodeInput';
import { useEffect, useRef, useState } from 'react';
import { SignalingClient } from './SignalingClient';
import { PeerConnectionController } from './PeerConnectionController';
export function PhoneCameraPage() {
  const video = useRef<HTMLVideoElement>(null);
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
  const resumeCamera = useRef(() => {});
  const [code, setCode] = useState('');
  const [dimensions, setDimensions] = useState({ width: 1280, height: 720 });
  const facing = useRef<'environment' | 'user'>('environment');
  const invite = useRef<URLSearchParams | null>(null);
  const statsTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const stop = useRef(() => {});
  stop.current = () => {
    epoch.current++;
    wasLive.current = false;
    clearInterval(statsTimer.current);
    stream.current?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    stream.current = null;
    peer.current?.stop();
    peer.current = null;
    signaling.current?.stop();
    signaling.current = null;
    if (video.current) video.current.srcObject = null;
    setApproved(false);
    setJoined(false);
    setHasInvite(false);
    invite.current = null;
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
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', hide);
    return () => {
      stop.current();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', hide);
    };
  }, []);
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
        setStatus(`${m.name}: czekamy na zatwierdzenie komputera.`);
      } else if (m.type === 'reconnecting') {
        peer.current?.stop();
        peer.current = null;
        setStatus('Przerwa w połączeniu. Łączymy ponownie…');
      } else if (m.type === 'approved') {
        peer.current?.stop();
        invite.current = null;
        setApproved(true);
        setStatus('Komputer zaakceptował telefon. Uruchom aparat.');
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
      await peer.current!.sendStream(next);
      if (generation !== epoch.current) return;
      setLive(true);
      wasLive.current = true;
      setStatus('Obraz trafia do komputera. Trzymaj dłoń w zaznaczonym kwadracie.');
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
    if (approved && peer.current && wasLive.current && !busy) void camera();
  };
  useEffect(() => {
    if (approved && wasLive.current) resumeCamera.current();
  }, [approved, resumeVersion]);
  return (
    <main className="phone-page">
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
          : live
            ? 'Kamera telefonu'
            : approved
              ? 'Krok 3 z 3'
              : joined
                ? 'Krok 2 z 3'
                : 'Krok 1 z 3'}
      </div>
      <h1>
        {ended
          ? 'Połączenie zakończone'
          : live
            ? 'Wszystko gotowe'
            : approved
              ? 'Włącz aparat'
              : joined
                ? 'Potwierdź na komputerze'
                : 'Twój telefon, kamera AI'}
      </h1>
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
      <div
        className="phone-preview"
        hidden={!live}
        style={{
          width: `min(100%, ${(55 * dimensions.width) / dimensions.height}dvh)`,
          aspectRatio: dimensions.width / dimensions.height,
        }}
      >
        <video
          ref={video}
          autoPlay
          playsInline
          muted
          aria-label="Podgląd telefonu"
          onResize={() => {
            if (video.current?.videoWidth)
              setDimensions({ width: video.current.videoWidth, height: video.current.videoHeight });
          }}
        />
        <div
          className="phone-crop"
          style={{
            width: `${(100 * Math.min(dimensions.width, dimensions.height)) / dimensions.width}%`,
            height: `${(100 * Math.min(dimensions.width, dimensions.height)) / dimensions.height}%`,
          }}
        />
        <span>Trzymaj dłoń w kwadracie</span>
      </div>
      {approved && (
        <button className="primary" disabled={busy} onClick={() => void camera(live)}>
          {busy ? 'Uruchamianie…' : live ? 'Zmień aparat' : 'Uruchom aparat'}
        </button>
      )}
      {playback && <button onClick={() => void play()}>Odtwórz podgląd</button>}
      {joined && !ended && (
        <button className="danger" onClick={() => stop.current()}>
          Zatrzymaj transmisję
        </button>
      )}
      <p className="phone-hint">
        {live
          ? 'Pozostaw tę stronę otwartą i ekran odblokowany.'
          : 'Tylko obraz. Bez mikrofonu i nagrywania.'}
      </p>
      <details className="phone-help">
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
