import { PairingPanel } from '../features/phone-camera/PairingPanel';
import { CameraLost } from '../components/CameraLost';
import { AppHeader } from '../components/layout/AppHeader';
import { AppFooter } from '../components/layout/AppFooter';
import { ExplanationView } from '../features/explanation/ExplanationView';
import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { SessionManager } from '../services/SessionManager';
import { pl } from '../i18n/pl';
import { config } from '../config/settings';
import { HandSymbol } from '../components/HandSymbol';
import { GameView } from '../features/game/GameView';
import { InstructorPanel } from '../features/instructor/InstructorPanel';
import { plates } from '../i18n/plates';
import { PartNav, type Part } from '../components/PartNav';
// Part 1 (plate reader) is a separate chunk with OpenCV.js; it does not load TFJS or Phaser.
const PlatesView = lazy(() =>
  import('../features/plates/PlatesView').then((m) => ({ default: m.PlatesView })),
);
const session = new SessionManager();
export function App() {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const video = useRef<HTMLVideoElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [instructor, setInstructor] = useState(false);
  const [part, setPart] = useState<Part | null>(null);
  const hub = part === null && state.controlMode !== 'KEYBOARD';
  const platesOpen = part === 'plates' && state.controlMode !== 'KEYBOARD';
  // Part 1 uses the whole screen with its own slim top bar.
  const fullscreen = platesOpen;
  const choosing = state.stage === 'START' && !state.busy && !state.error;
  const phone = useSyncExternalStore(session.phone.subscribe, session.phone.getSnapshot);
  // A paired phone needs no source controls in the workshop; recovery uses the error retry.
  const phonePaired = state.source === 'phone' && !!phone.stats;
  useEffect(() => {
    if (state.stage === 'START') setPart(null);
  }, [state.stage]);
  // Both parts need a camera: without one we go back to setup.
  const changePart = (next: Part) => setPart(state.cameraLabel ? next : null);
  const chooseCamera = async (source: 'local' | 'phone') => {
    setPart(null);
    await session.selectSource(source);
    void session.start();
  };
  const { stage, counts, prediction, busy } = state;
  useEffect(() => {
    session.attachVideo(video.current!);
    const keyboard = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.code === 'KeyD') {
        event.preventDefault();
        setInstructor((value) => !value);
      }
    };
    const visibility = () => {
      if (document.hidden && session.getSnapshot().stage === 'GAME') session.pause();
      else if (document.hidden && session.getSnapshot().stage !== 'EXPLAIN')
        session.gestures.reset();
    };
    const unload = () => {
      void session.resetSession();
    };
    window.addEventListener('keydown', keyboard);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', unload);
    return () => {
      window.removeEventListener('keydown', keyboard);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', unload);
    };
  }, []);
  useEffect(() => {
    heading.current?.focus();
  }, [stage]);
  const isCapture = stage === 'OPEN' || stage === 'FIST';
  const showCamera =
    hub || isCapture || stage === 'TEST' || stage === 'GAME' || stage === 'EXPLAIN';
  const step = ['START', 'LOADING', 'OPEN', 'FIST'].includes(stage)
    ? 0
    : ['READY', 'TRAINING', 'TRAINED'].includes(stage)
      ? 1
      : ['TEST', 'PARTNER', 'EXPLAIN'].includes(stage)
        ? 2
        : 3;
  const title =
    stage === 'START'
      ? pl.startTitle
      : stage === 'LOADING'
        ? pl.loading
        : stage === 'OPEN'
          ? pl.openTitle
          : stage === 'FIST'
            ? pl.fistTitle
            : stage === 'READY'
              ? pl.ready
              : stage === 'TRAINING'
                ? pl.training
                : stage === 'TRAINED'
                  ? pl.trained
                  : stage === 'TEST'
                    ? state.partner
                      ? pl.partnerTest
                      : pl.test
                    : stage === 'GAME'
                      ? pl.gameTitle
                      : stage === 'RESULT'
                        ? pl.gameOver
                        : stage === 'PARTNER'
                          ? pl.swap
                          : pl.end;
  const probabilities = (
    <div className="probabilities">
      <div className="prediction-heading">
        <span>{pl.prediction}</span>
        <strong>{prediction.gesture ?? pl.uncertain}</strong>
      </div>
      {(['OPEN', 'FIST'] as const).map((label, index) => (
        <div className="probability" key={label}>
          <div>
            <span>{label}</span>
            <b>{Math.round((index ? prediction.fist : prediction.open) * 100)}%</b>
          </div>
          <progress
            aria-label={`${label} – ${pl.probability}`}
            value={index ? prediction.fist : prediction.open}
            max={1}
          />
        </div>
      ))}
    </div>
  );
  return (
    <div className={`app-shell ${fullscreen ? 'fullscreen-part' : ''}`}>
      <AppHeader hidden={fullscreen}>
        {hub && (
          <a className="role-back" href="/">
            Zmień rolę urządzenia
          </a>
        )}
        <div
          hidden={hub || phonePaired}
          className="source-toolbar"
          role="group"
          aria-label="Źródło kamery"
        >
          <button
            aria-pressed={state.source === 'local'}
            disabled={state.resetting}
            onClick={() => void chooseCamera('local')}
          >
            Kamera komputera
          </button>
          <button
            aria-pressed={state.source === 'phone'}
            disabled={state.resetting}
            onClick={() => void chooseCamera('phone')}
          >
            Telefon
          </button>
        </div>
      </AppHeader>
      {!hub && !fullscreen && <PartNav current="gestures" onChange={changePart} />}
      <nav hidden={hub || fullscreen} aria-label={pl.workshop}>
        <ol className="steps">
          {pl.steps.map((label, index) => (
            <li
              key={label}
              className={index === step ? 'current' : index < step ? 'complete' : ''}
              aria-current={index === step ? 'step' : undefined}
            >
              <span>{index < step ? '✓' : `0${index + 1}`}</span>
              {label}
            </li>
          ))}
        </ol>
      </nav>
      {!hub && state.source === 'phone' && !phonePaired && <PairingPanel session={session} />}
      {platesOpen && (
        <Suspense fallback={<p className="plates-loading">{plates.loadingModule}</p>}>
          <PlatesView session={session} onPart={changePart} />
        </Suspense>
      )}
      {state.error === 'lost' && (
        <CameraLost
          session={session}
          source={state.source}
          waiting={state.source === 'phone' && !!phone.stats}
          busy={state.busy}
        />
      )}
      <main
        hidden={fullscreen}
        className={`${hub ? 'camera-hub' : ''} ${stage === 'GAME' ? 'playing' : ''} ${stage === 'START' ? 'welcome' : ''} ${stage === 'EXPLAIN' ? 'explaining' : ''}`}
      >
        <section
          className={`visual-panel ${showCamera ? 'camera-visible' : ''}`}
          hidden={stage === 'EXPLAIN' && !!state.explanation.snapshot}
          aria-label={pl.camera}
        >
          <div className={`camera-frame ${stage === 'GAME' ? 'compact' : ''}`} hidden={!showCamera}>
            <video ref={video} autoPlay muted playsInline aria-label={pl.camera} />
            <div className="camera-corners" />
            {hub && !state.cameraLabel && (
              <div className="hub-preview-empty">
                <span aria-hidden="true">◎</span>
                <h2>Tu pojawi się Twój obraz</h2>
                <p>Wybierz kamerę, aby zobaczyć podgląd.</p>
              </div>
            )}
            <span hidden={hub && !state.cameraLabel} className="live-label">
              {state.cameraLabel ? '● ' + pl.live : pl.empty}
            </span>
            <span hidden={hub && !state.cameraLabel} className="frame-label">
              {pl.frame}
            </span>
          </div>
          {!showCamera && (
            <div className="illustration">
              {stage === 'START' || stage === 'LOADING' ? (
                <>
                  <div className="visual-topline">
                    <span>{pl.inputLabel}</span>
                    <span>{pl.labLabel}</span>
                  </div>
                  <div className="hand-pair">
                    <div>
                      <HandSymbol />
                      <span>OPEN</span>
                    </div>
                    <span className="arrow">→</span>
                    <div>
                      <HandSymbol fist />
                      <span>FIST</span>
                    </div>
                  </div>
                  <div className="signal-line">
                    <span />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <span />
                  </div>
                  <div className="visual-bottomline">
                    <span>{pl.startSequence}</span>
                    <span>↗</span>
                  </div>
                </>
              ) : stage === 'RESULT' ? (
                <div className="score-art">
                  <span>{pl.score}</span>
                  <strong>{state.score.toString().padStart(3, '0')}</strong>
                  <span>SCI / RUN</span>
                </div>
              ) : stage === 'PARTNER' || stage === 'END' ? (
                <>
                  <div className="swap-art">{stage === 'PARTNER' ? '01 ⇄ 02' : pl.dataToAi}</div>
                  <p>{stage === 'PARTNER' ? pl.swapHelp : pl.endQuestion}</p>
                </>
              ) : (
                <div className="dataset-art">
                  <span>{pl.model}</span>
                  <div>
                    <b>{counts.OPEN}</b>
                    <span>OPEN</span>
                  </div>
                  <div>
                    <b>{counts.FIST}</b>
                    <span>FIST</span>
                  </div>
                  <div className="dataset-status">{state.trained ? '✓' : '→'}</div>
                </div>
              )}
            </div>
          )}
          {showCamera && !hub && stage !== 'GAME' && (
            <div className="camera-caption">
              <span>{pl.camera}</span>
              <span>{state.source === 'phone' ? 'Kamera telefonu' : pl.local}</span>
            </div>
          )}
          {!hub && (stage === 'TEST' || stage === 'GAME') && probabilities}
          {stage === 'GAME' && (
            <p className="controller-state">
              {state.controlMode === 'KEYBOARD'
                ? pl.keyboardTest
                : state.armed
                  ? '● ' + pl.armed
                  : '○ ' + pl.rearm}
            </p>
          )}
        </section>
        <section className="hub-controls" hidden={!hub}>
          <span className="eyebrow">Zanim zaczniemy</span>
          <h1>
            {choosing
              ? 'Wybierz swoją kamerę'
              : state.source === 'phone'
                ? 'Połącz aparat telefonu'
                : 'Sprawdź swój podgląd'}
          </h1>
          <p className="lead" hidden={!choosing}>
            Pokaż dłoń, naucz AI i zagraj. Zacznij od połączenia kamery.
          </p>
          <div
            hidden={!choosing}
            className="hub-source-options"
            role="group"
            aria-label="Wybór kamery"
          >
            <button
              aria-label="Kamera komputera"
              aria-pressed={state.source === 'local' && !!state.cameraLabel}
              disabled={state.resetting}
              onClick={() => void chooseCamera('local')}
            >
              <strong>Kamera komputera</strong>
              <span>Użyj wbudowanej kamery lub kamerki USB</span>
            </button>
            <span className="hub-or">lub</span>
            <button
              aria-label="Telefon"
              aria-pressed={state.source === 'phone'}
              disabled={state.resetting}
              onClick={() => void chooseCamera('phone')}
            >
              <strong>Telefon</strong>
              <span>Dołącz aparat za pomocą kodu QR</span>
            </button>
          </div>
          <div className="hub-selected" hidden={choosing}>
            <span>{state.source === 'phone' ? 'Kamera telefonu' : 'Kamera komputera'}</span>
            <button onClick={() => void session.selectSource('local')} disabled={state.resetting}>
              Zmień kamerę
            </button>
          </div>
          {hub && !choosing && state.source === 'phone' && <PairingPanel session={session} />}
          {state.error && state.error !== 'lost' && (
            <div className="error" role="alert">
              <p>{pl.errors[state.error]}</p>
              <button disabled={busy} onClick={() => void session.retry()}>
                {pl.retry}
              </button>
            </div>
          )}
          <div
            className="hub-next"
            hidden={!choosing && state.source === 'phone' && !state.cameraLabel}
          >
            <p role="status">
              {state.cameraLabel
                ? busy
                  ? 'Obraz gotowy. Przygotowujemy AI…'
                  : 'Kamera gotowa. Możemy zaczynać!'
                : busy && state.source === 'local'
                  ? 'Zezwól przeglądarce na dostęp do kamery.'
                  : 'Połącz kamerę, aby przejść dalej.'}
            </p>
            <div className="hub-parts" role="group" aria-label={plates.parts.label}>
              <button
                className="primary hub-part"
                disabled={state.resetting || !!state.error || !state.cameraLabel}
                onClick={() => setPart('plates')}
              >
                <strong>
                  <small>{plates.parts.first}</small>
                  {plates.parts.platesTitle}
                </strong>
                <span>→</span>
              </button>
              <button
                className="secondary hub-part"
                disabled={busy || !!state.error || !state.cameraLabel || stage !== 'OPEN'}
                onClick={() => setPart('gestures')}
              >
                <strong>
                  <small>{plates.parts.second}</small>
                  Przejdź do AI Challenge
                </strong>
                <span>→</span>
              </button>
            </div>
          </div>
        </section>
        <section className="task-panel" hidden={hub || stage === 'EXPLAIN'}>
          <div className="eyebrow">
            {stage === 'START'
              ? pl.workshop
              : `${String(step + 1).padStart(2, '0')} / ${pl.steps[step]}`}
          </div>
          <h1 ref={heading} tabIndex={-1}>
            {title}
          </h1>
          {state.error ? (
            // A lost camera is handled by the CameraLost overlay; actions stay hidden meanwhile.
            state.error !== 'lost' && (
              <div className="error" role="alert">
                <p>{pl.errors[state.error]}</p>
                <button disabled={busy} onClick={() => void session.retry()}>
                  {pl.retry}
                </button>
              </div>
            )
          ) : (
            <>
              {stage === 'START' && (
                <>
                  <p className="lead">{pl.subtitle}</p>
                  <p>{pl.intro}</p>
                  <button
                    className="primary"
                    disabled={state.resetting}
                    onClick={() => void session.start()}
                  >
                    {state.resetting ? pl.instructor.resetting : pl.start}
                    <span>→</span>
                  </button>
                </>
              )}
              {stage === 'LOADING' && (
                <>
                  <p>{pl.loadingHelp}</p>
                  <progress aria-label={pl.loading} />
                </>
              )}
              {isCapture && (
                <>
                  <p className="lead">{pl.captureHelp}</p>
                  {state.trained && <p className="note">{pl.addHelp}</p>}
                  <div className="sample-counts">
                    <span className={stage === 'OPEN' ? 'selected' : ''}>
                      OPEN <b>{counts.OPEN}</b>
                    </span>
                    <span className={stage === 'FIST' ? 'selected' : ''}>
                      FIST <b>{counts.FIST}</b>
                    </span>
                  </div>
                  <progress aria-label={pl.collecting} max={1} value={state.progress} />
                  <button
                    className="primary"
                    disabled={busy || counts[stage] >= config.maximumSamples}
                    onClick={() => void session.capture(stage)}
                  >
                    {busy ? pl.collecting : stage === 'OPEN' ? pl.captureOpen : pl.captureFist}
                    <span>+</span>
                  </button>
                  {counts[stage] >= config.maximumSamples && <p>{pl.limit}</p>}
                  <button
                    className="secondary"
                    disabled={busy || counts[stage] < config.minimumSamples}
                    onClick={() => session.next()}
                  >
                    {stage === 'OPEN' ? pl.nextFist : pl.nextTrain}
                    <span>→</span>
                  </button>
                </>
              )}
              {stage === 'READY' && (
                <>
                  <p className="lead">{pl.readyHelp}</p>
                  <button className="primary" onClick={() => void session.train()}>
                    {state.trained ? pl.retrain : pl.train}
                    <span>→</span>
                  </button>
                </>
              )}
              {stage === 'TRAINING' && (
                <>
                  <p>{pl.trainingHelp}</p>
                  <progress aria-label={pl.training} value={state.progress} max={1} />
                  <div className="progress-number" aria-live="polite">
                    {Math.round(state.progress * 100)}%
                  </div>
                </>
              )}
              {stage === 'TRAINED' && (
                <>
                  <p className="lead">{pl.trainedHelp}</p>
                  <button className="primary" onClick={() => session.test()}>
                    {pl.check}
                    <span>→</span>
                  </button>
                </>
              )}
              {stage === 'TEST' && (
                <>
                  <p className="lead">{pl.testHelp}</p>
                  {state.partner && <p>{pl.partnerHelp}</p>}
                  <button className="primary" onClick={() => void session.play()}>
                    {pl.play}
                    <span>→</span>
                  </button>
                  <button className="secondary" onClick={() => session.improve()}>
                    {pl.add}
                  </button>
                  <button className="secondary" onClick={() => session.openExplanation()}>
                    {pl.explanation.entry}
                  </button>
                  <p className="note">{pl.confidenceNote}</p>
                </>
              )}
              {stage === 'RESULT' && state.controlMode === 'KEYBOARD' && (
                <>
                  <p>{pl.keyboardTest}</p>
                  <button className="primary" onClick={() => void session.play(true)}>
                    {pl.retryGame}
                  </button>
                  <button className="secondary" onClick={() => session.exitDiagnosticGame()}>
                    {pl.back}
                  </button>
                </>
              )}
              {stage === 'RESULT' && state.controlMode === 'GESTURE' && (
                <>
                  <p className="lead">{state.rounds === 1 ? pl.swapHelp : pl.partnerHelp}</p>
                  {state.rounds === 1 && (
                    <button className="primary" onClick={() => session.swap()}>
                      {pl.swap}
                      <span>→</span>
                    </button>
                  )}
                  <button
                    className={state.rounds === 1 ? 'secondary' : 'primary'}
                    onClick={() => void session.play()}
                  >
                    {pl.retryGame}
                  </button>
                  <button className="secondary" onClick={() => session.improve()}>
                    {pl.improve}
                  </button>
                  {state.rounds > 1 && (
                    <button className="quiet" onClick={() => session.finish()}>
                      {pl.finish}
                    </button>
                  )}
                </>
              )}
              {stage === 'PARTNER' && (
                <>
                  <p className="lead">{pl.swapHelp}</p>
                  <p>{pl.partnerHelp}</p>
                  <button className="primary" onClick={() => session.test()}>
                    {pl.swapCheck}
                    <span>→</span>
                  </button>
                </>
              )}
              {stage === 'END' && (
                <>
                  <p className="lead">{pl.endHelp}</p>
                  <p>{pl.endNote}</p>
                </>
              )}
            </>
          )}
          {state.slow && showCamera && <p className="note">{pl.slow}</p>}
        </section>
        {stage === 'EXPLAIN' && <ExplanationView session={session} />}
        {stage === 'GAME' && (
          <section className="game-panel">
            <div className="game-heading">
              <div>
                <h2>{pl.gameTitle}</h2>
                <p>{pl.gameHelp}</p>
              </div>
              <div className="score">
                <span>{pl.score}</span>
                <strong>{state.score}</strong>
              </div>
            </div>
            <div className="game-container">
              <GameView key={state.gameRound} controller={session.game} />
              {state.paused && (
                <div className="pause-overlay">
                  <h2>{pl.paused}</h2>
                  <p>{pl.pausedHelp}</p>
                  <button
                    className="primary"
                    disabled={!!state.error}
                    onClick={() => session.resume()}
                  >
                    {pl.resume}
                  </button>
                </div>
              )}
            </div>
            {state.error && state.error !== 'lost' && (
              <div className="error" role="alert">
                <p>{pl.errors[state.error]}</p>
                <button disabled={busy} onClick={() => void session.retry()}>
                  {pl.retry}
                </button>
              </div>
            )}
          </section>
        )}
      </main>
      <div className="app-bottom" hidden={fullscreen}>
        <span>
          <i className="privacy-dot" />
          {pl.privacy}
        </span>
        <AppFooter />
        <button className="instructor-link" onClick={() => setInstructor(true)}>
          {pl.instructor.title}
          <kbd>⌃ ⇧ D</kbd>
        </button>
      </div>
      {instructor && <InstructorPanel session={session} onClose={() => setInstructor(false)} />}
    </div>
  );
}
