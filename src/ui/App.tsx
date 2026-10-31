import { useEffect, useRef, useState } from 'preact/hooks';
import { boot, BootError, type AppContext, type BootState } from '../boot/boot.ts';
import { registerServiceWorker } from '../sw-register.ts';
import { savePrefs, saveFlags, type MissingFlag, type Prefs } from '../state/prefs.ts';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { Learn } from './Learn.tsx';
import { Library } from './Library.tsx';
import { Lookup } from './Lookup.tsx';
import { Onboarding } from './Onboarding.tsx';
import { Progress } from './Progress.tsx';
import { Settings } from './Settings.tsx';

const sw = registerServiceWorker();

type Tab = 'learn' | 'lookup' | 'library' | 'progress' | 'settings';

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <path d={d} />
  </svg>
);

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'learn', label: 'Learn', icon: 'M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4z M8 17h10' },
  { id: 'lookup', label: 'Lookup', icon: 'M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12z M15.5 15.5 20 20' },
  { id: 'library', label: 'Library', icon: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z' },
  { id: 'progress', label: 'Progress', icon: 'M5 20V11 M12 20V4 M19 20v-6' },
  { id: 'settings', label: 'Settings', icon: 'M4 7h9 M17 7h3 M4 17h3 M11 17h9 M15 7m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M9 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0' },
];

export function App() {
  const [state, setState] = useState<BootState>({ phase: 'starting', detail: 'Starting' });
  const [ctx, setCtx] = useState<AppContext | null>(null);
  const [tab, setTab] = useState<Tab>('learn');
  const [prefs, setPrefsState] = useState<Prefs | null>(null);
  const [flags, setFlags] = useState<MissingFlag[]>([]);
  const [update, setUpdate] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const main = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

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

  const theme = (prefs ?? ctx?.initialPrefs)?.theme ?? 'auto';
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);

  // Moving between tabs: say where we are (page title) and put keyboard/screen-reader focus on the new content.
  useEffect(() => {
    document.title = `${TABS.find((t) => t.id === tab)!.label} · TSL Learn`;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    main.current?.focus({ preventScroll: true });
  }, [tab]);

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
            <progress max={state.total} value={state.done} aria-label="Repair progress" />
            <p>
              {state.done} of {state.total} clips
            </p>
          </>
        ) : (
          <p role="status">{state.phase === 'starting' ? state.detail : 'Starting'}…</p>
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

  if (!p.onboarded) return <Onboarding prefs={p} onDone={setPrefs} />;

  return (
    <>
      <a class="skip" href="#main" onClick={(e) => (e.preventDefault(), main.current?.focus())}>
        Skip to content
      </a>
      {update && (
        <div class="banner" role="status" data-testid="update-banner">
          A new version is ready.
          <button class="btn" onClick={() => sw.apply()}>
            Reload
          </button>
        </div>
      )}
      <main id="main" tabIndex={-1} ref={main}>
        <ErrorBoundary where={tab} repo={ctx.repo} key={tab}>
          {tab === 'learn' && <Learn ctx={ctx} prefs={p} onPrefs={setPrefs} flags={flags} />}
          {tab === 'lookup' && <Lookup ctx={ctx} prefs={p} onPrefs={setPrefs} flags={flags} onFlag={addFlag} />}
          {tab === 'library' && <Library ctx={ctx} prefs={p} onPrefs={setPrefs} />}
          {tab === 'progress' && <Progress ctx={ctx} prefs={p} />}
          {tab === 'settings' && <Settings ctx={ctx} prefs={p} onPrefs={setPrefs} flags={flags} onClearFlags={clearFlags} />}
        </ErrorBoundary>
      </main>
      <nav class="tabs" aria-label="Main">
        {TABS.map((t) => (
          <button key={t.id} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)} data-testid={`tab-${t.id}`}>
            <Icon d={t.icon} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
