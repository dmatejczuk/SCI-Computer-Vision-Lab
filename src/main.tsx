import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
const App = lazy(() => import('./app/App').then((m) => ({ default: m.App })));
const Phone = lazy(() =>
  import('./features/phone-camera/PhoneCameraPage').then((m) => ({ default: m.PhoneCameraPage })),
);
// Facilitator mode: the plate generator, without camera, ML or game modules.
const Generator = lazy(() =>
  import('./features/generator/GeneratorView').then((m) => ({ default: m.GeneratorView })),
);
import { pl } from './i18n/pl';
import './styles.css';
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.error('Application failure', error);
  }
  render() {
    return this.state.failed ? (
      <main>
        <h1>{pl.errors.unexpected}</h1>
        <button onClick={() => location.reload()}>{pl.retry}</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
function currentRole() {
  if (location.pathname === '/phone') return 'phone';
  const role = new URLSearchParams(location.search).get('role');
  return role === 'station' || role === 'instructor' ? role : '';
}
function Entry() {
  const [role, setRole] = useState(currentRole);
  useEffect(() => {
    const back = () => setRole(currentRole());
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);
  if (role === 'phone') return <Phone />;
  if (role === 'station') return <App />;
  if (role === 'instructor') return <Generator />;
  return (
    <main className="role-page">
      <a className="role-brand" href="/">
        SCI<span>_</span>
      </a>
      <div className="eyebrow">AI Vision Challenge</div>
      <h1>Jak chcesz dołączyć?</h1>
      <p>Wybierz rolę tego urządzenia.</p>
      <div className="role-options">
        <button
          onClick={() => {
            history.pushState(null, '', '/?role=station');
            setRole('station');
          }}
        >
          <span aria-hidden="true">▣</span>
          <strong>Uruchom AI Challenge</strong>
          <small>Stanowisko z podglądem, nauką AI i grą</small>
        </button>
        <button
          onClick={() => {
            history.pushState(null, '', '/phone');
            setRole('phone');
          }}
        >
          <span aria-hidden="true">◎</span>
          <strong>Udostępnij kamerę</strong>
          <small>Połącz ten telefon ze stanowiskiem za pomocą kodu</small>
        </button>
      </div>
      <p className="note">Aparat włączysz dopiero po zatwierdzeniu połączenia.</p>
      <a
        className="role-instructor"
        href="/?role=instructor"
        onClick={(event) => {
          event.preventDefault();
          history.pushState(null, '', '/?role=instructor');
          setRole('instructor');
        }}
      >
        Tryb prowadzącego
      </a>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <Suspense fallback={<p>Ładowanie…</p>}>
      <Entry />
    </Suspense>
  </ErrorBoundary>,
);
