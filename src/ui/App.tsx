import { useEffect, useState } from 'preact/hooks';
import { boot, BootError, type AppContext, type BootState } from '../boot/boot.ts';
import { registerServiceWorker } from '../sw-register.ts';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { savePrefs, saveFlags, type MissingFlag, type Prefs } from '../state/prefs.ts';
import { Library } from './Library.tsx';
import { Lookup } from './Lookup.tsx';
import { Settings } from './Settings.tsx';

const sw = registerServiceWorker();

export function App() {
  const [state, setState] = useState<BootState>({ phase: 'starting', detail: 'Starting' });
  const [ctx, setCtx] = useState<AppContext | null>(null);
  const [tab, setTab] = useState<'lookup' | 'library' | 'settings'>('lookup');
  const [prefs, setPrefsState] = useState<Prefs | null>(null);
  const [flags, setFlags] = useState<MissingFlag[]>([]);
  const [update, setUpdate] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    sw.onUpdate(() => setUpdate(true));
  }, []);

  useEffect(() => {
    let alive = true;
    boot((s) => alive && setState(s))
      .then((c) => {
        if (!alive) return;
        setPrefsState(c.initialPrefs);
        setFlags(c.initialFlags);
        setCtx(c);
      })
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

  const p = prefs ?? ctx.initialPrefs;
  const setPrefs = (next: Prefs) => {
    setPrefsState(next);
    void (ctx.repo && savePrefs(ctx.repo, next).catch((e) => ctx.repo?.logError('prefs', e)));
  };
  const addFlag = (word: string) => {
    const next = [...flags.filter((f) => f.word !== word), { word, at: Date.now() }];
    setFlags(next);
    void (ctx.repo && saveFlags(ctx.repo, next).catch((e) => ctx.repo?.logError('flags', e)));
  };
  const clearFlags = () => {
    setFlags([]);
    void (ctx.repo && saveFlags(ctx.repo, []).catch((e) => ctx.repo?.logError('flags', e)));
  };

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
          {tab === 'lookup' && <Lookup ctx={ctx} prefs={p} onPrefs={setPrefs} flags={flags} onFlag={addFlag} />}
          {tab === 'library' && <Library ctx={ctx} prefs={p} onPrefs={setPrefs} />}
          {tab === 'settings' && <Settings ctx={ctx} prefs={p} onPrefs={setPrefs} flags={flags} onClearFlags={clearFlags} />}
        </ErrorBoundary>
      </main>
      <nav class="tabs" aria-label="Main">
        <button aria-current={tab === 'lookup' ? 'page' : undefined} onClick={() => setTab('lookup')} data-testid="tab-lookup">
          Lookup
        </button>
        <button aria-current={tab === 'library' ? 'page' : undefined} onClick={() => setTab('library')} data-testid="tab-library">
          Library
        </button>
        <button aria-current={tab === 'settings' ? 'page' : undefined} onClick={() => setTab('settings')} data-testid="tab-settings">
          Settings
        </button>
      </nav>
    </>
  );
}
