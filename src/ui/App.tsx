import { useEffect, useState } from 'preact/hooks';
import { boot, BootError, type AppContext, type BootState } from '../boot/boot.ts';
import { registerServiceWorker } from '../sw-register.ts';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { Settings } from './Settings.tsx';

const sw = registerServiceWorker();

function Home({ ctx }: { ctx: AppContext }) {
  return (
    <section>
      <h1>TSL Learn</h1>
      <p data-testid="home-count">{ctx.lexicon.entries.length.toLocaleString()} signs ready.</p>
      <p class="note">
        Taiwan Sign Language has its own grammar and word order. Looking signs up word by word is a study aid, not a translation.
      </p>
      {ctx.notes.map((n) => (
        <p class="note" key={n} data-testid="boot-note">
          {n}
        </p>
      ))}
    </section>
  );
}

export function App() {
  const [state, setState] = useState<BootState>({ phase: 'starting', detail: 'Starting' });
  const [ctx, setCtx] = useState<AppContext | null>(null);
  const [tab, setTab] = useState<'home' | 'settings'>('home');
  const [update, setUpdate] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    sw.onUpdate(() => setUpdate(true));
  }, []);

  useEffect(() => {
    let alive = true;
    boot((s) => alive && setState(s))
      .then((c) => alive && setCtx(c))
      .catch((err) => {
        if (!alive) return;
        if (err instanceof BootError) setState({ phase: 'fatal', kind: err.kind, message: err.message });
        else setState({ phase: 'fatal', kind: 'no-data', message: `Something went wrong while starting: ${(err as Error).message}` });
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  useEffect(() => {
    const log = (where: string, e: unknown) => void ctx?.repo?.logError(where, e).catch(() => undefined);
    const onErr = (e: ErrorEvent) => log('window', e.error ?? e.message);
    const onRej = (e: PromiseRejectionEvent) => log('promise', e.reason);
    addEventListener('error', onErr);
    addEventListener('unhandledrejection', onRej);
    return () => {
      removeEventListener('error', onErr);
      removeEventListener('unhandledrejection', onRej);
    };
  }, [ctx]);

  if (state.phase === 'fatal') {
    return (
      <main class="center" data-testid="fatal">
        <h1>Can&apos;t start yet</h1>
        <p data-testid="fatal-message">{state.message}</p>
        <button class="btn" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </button>
      </main>
    );
  }

  if (!ctx) {
    return (
      <main class="center" data-testid="booting" aria-live="polite">
        {state.phase === 'repairing' ? (
          <>
            <h1 data-testid="repairing">Repairing offline pack</h1>
            <progress max={state.total} value={state.done} />
            <p>
              {state.done} of {state.total} clips
            </p>
          </>
        ) : (
          <p>{state.phase === 'starting' ? state.detail : 'Starting'}…</p>
        )}
      </main>
    );
  }

  return (
    <>
      {update && (
        <div class="banner" role="status" data-testid="update-banner">
          A new version is ready.
          <button class="btn" onClick={() => sw.apply()}>
            Reload
          </button>
        </div>
      )}
      <main>
        <ErrorBoundary where={tab} repo={ctx.repo} key={tab}>
          {tab === 'home' ? <Home ctx={ctx} /> : <Settings ctx={ctx} />}
        </ErrorBoundary>
      </main>
      <nav class="tabs" aria-label="Main">
        <button aria-current={tab === 'home' ? 'page' : undefined} onClick={() => setTab('home')} data-testid="tab-home">
          Home
        </button>
        <button aria-current={tab === 'settings' ? 'page' : undefined} onClick={() => setTab('settings')} data-testid="tab-settings">
          Settings
        </button>
      </nav>
    </>
  );
}
