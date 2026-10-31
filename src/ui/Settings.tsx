import { useEffect, useState } from 'preact/hooks';
import { WANTED_KEY, type AppContext } from '../boot/boot.ts';
import { checkClips, downloadClips } from '../clips/pack.ts';
import type { MissingFlag, Prefs } from '../state/prefs.ts';
import { BackupError, importBackup } from '../storage/backup.ts';
import { downloadBackup } from '../storage/download.ts';
import type { ErrorRecord } from '../storage/types.ts';

const mb = (n: number): string => `${(n / 1e6).toFixed(n < 1e7 ? 1 : 0)} MB`;
const CONFIRM_OVER = 50e6;

interface Props {
  ctx: AppContext;
  prefs: Prefs;
  onPrefs: (p: Prefs) => void;
  flags: MissingFlag[];
  onClearFlags: () => void;
}

interface Active {
  catId: string;
  done: number;
  total: number;
  signal: { cancelled: boolean };
}

function Choice<T extends string>({ label, value, options, onChange, testPrefix }: {
  label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; testPrefix: string;
}) {
  return (
    <div role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} class="btn" aria-pressed={value === v} data-testid={`${testPrefix}-${v}`} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

export function Settings({ ctx, prefs, onPrefs, flags, onClearFlags }: Props) {
  const { repo, lexicon, manifest } = ctx;
  const [errors, setErrors] = useState<ErrorRecord[]>([]);
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  const [cachedSizes, setCachedSizes] = useState<Map<string, number>>(new Map());
  const [lastExport, setLastExport] = useState<number | undefined>();
  const [msg, setMsg] = useState('');
  const [active, setActive] = useState<Active | null>(null);

  const refresh = async () => {
    if (repo) {
      setErrors(await repo.allErrors());
      setCachedSizes(await repo.clipSizes());
      setLastExport(await repo.getMeta<number>('lastExportAt'));
    }
    const est = await navigator.storage?.estimate?.().catch(() => undefined);
    if (est) setUsage({ used: est.usage ?? 0, quota: est.quota ?? 0 });
  };
  useEffect(() => void refresh(), []);

  const sizeOf = new Map(manifest.clips.map((c) => [c.video, c.size]));
  const cachedBytes = [...cachedSizes.values()].reduce((a, b) => a + b, 0);

  const videosOf = (catId: string) => lexicon.entries.filter((e) => e.category === catId).map((e) => e.video);

  const downloadCategory = async (catId: string) => {
    if (!repo || active) return;
    const videos = videosOf(catId);
    const check = await checkClips(repo, manifest, videos);
    const todo = [...check.missing, ...check.corrupt];
    const bytes = todo.reduce((a, v) => a + (sizeOf.get(v) ?? 0), 0);
    if (bytes > CONFIRM_OVER && !confirm(`This will download about ${mb(bytes)} (${todo.length} clips), slowly, to keep the dictionary's server happy. Continue?`)) return;
    const wanted = new Set((await repo.getMeta<string[]>(WANTED_KEY)) ?? []);
    videos.forEach((v) => wanted.add(v));
    await repo.setMeta(WANTED_KEY, [...wanted]);
    const signal = { cancelled: false };
    setActive({ catId, done: 0, total: todo.length, signal });
    const res = await downloadClips(repo, ctx.fetcher, ctx.source, manifest, todo, (done, total) => setActive({ catId, done, total, signal }), signal);
    setActive(null);
    setMsg(
      res.cancelled
        ? `Stopped. Downloaded ${res.fixed.length} clip(s) so far.`
        : `Downloaded ${res.fixed.length} clip(s)${res.failed.length ? `, ${res.failed.length} failed` : ''}.`,
    );
    void refresh();
  };

  const removeCategory = async (catId: string) => {
    if (!repo) return;
    const videos = videosOf(catId);
    for (const v of videos) await repo.deleteClip(v);
    const wanted = new Set((await repo.getMeta<string[]>(WANTED_KEY)) ?? []);
    videos.forEach((v) => wanted.delete(v));
    await repo.setMeta(WANTED_KEY, [...wanted]);
    setMsg('Removed that pack from this device. It will download again when you need it.');
    void refresh();
  };

  const repair = async () => {
    if (!repo) return;
    const wanted = (await repo.getMeta<string[]>(WANTED_KEY)) ?? [];
    const check = await checkClips(repo, manifest, wanted);
    for (const v of check.corrupt) await repo.deleteClip(v);
    const todo = [...check.missing, ...check.corrupt];
    ctx.fetcher.reset();
    const res = await downloadClips(repo, ctx.fetcher, ctx.source, manifest, todo);
    setMsg(`Checked ${wanted.length} clip(s): ${todo.length} needed repair, ${res.fixed.length} fixed.`);
    void refresh();
  };

  const doExport = async () => {
    if (!repo) return;
    await downloadBackup(repo);
    setMsg('Backup saved.');
    void refresh();
  };

  const doImport = async (ev: Event) => {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !repo) return;
    try {
      const res = await importBackup(repo, JSON.parse(await file.text()));
      setMsg(`Imported ${res.progress} signs and ${res.reviews} reviews${res.skipped ? ` (${res.skipped} unreadable rows skipped)` : ''}. Existing progress was kept and merged.`);
      void refresh();
    } catch (e) {
      setMsg(e instanceof BackupError ? e.message : 'That file could not be read. Choose a backup made by this app.');
    }
    input.value = '';
  };

  const copyLog = async () => {
    const text = errors.map((e) => `${new Date(e.at).toISOString()} [${e.where}] ${e.message}\n${e.stack ?? ''}`).join('\n\n');
    try {
      await navigator.clipboard.writeText(text || 'No errors recorded.');
      setMsg('Error log copied.');
    } catch {
      setMsg('Copy is not available here; select the text below instead.');
    }
  };

  return (
    <section aria-labelledby="settings-h">
      <h1 id="settings-h">Settings</h1>
      <div aria-live="polite">
        {msg && (
          <p class="note" role="status" data-testid="settings-msg">
            {msg}
          </p>
        )}
      </div>

      <div class="card">
        <h2>Appearance</h2>
        <Choice
          label="Colour theme"
          testPrefix="theme"
          value={prefs.theme}
          options={[['auto', 'Match my device'], ['light', 'Light'], ['dark', 'Dark']] as const}
          onChange={(theme) => onPrefs({ ...prefs, theme })}
        />
      </div>

      <div class="card">
        <h2>Dialect 手語方言</h2>
        <p class="note">When a word has a northern and a southern sign, this one is shown first. You can always open the other.</p>
        <Choice
          label="Preferred dialect"
          testPrefix="dialect"
          value={prefs.dialect}
          options={[['north', 'Northern (Taipei) 北部'], ['south', 'Southern (Tainan) 南部']] as const}
          onChange={(dialect) => onPrefs({ ...prefs, dialect })}
        />
        {Object.keys(prefs.pins).length > 0 && (
          <p class="note" data-testid="pin-count">
            {Object.keys(prefs.pins).length} preferred sign(s) pinned.{' '}
            <button class="link" onClick={() => onPrefs({ ...prefs, pins: {} })}>
              Clear
            </button>
          </p>
        )}
      </div>

      <div class="card" data-testid="learning-settings">
        <h2>Learning 學習設定</h2>
        <div class="field-row">
          <span id="npd">New signs per day</span>
          <div class="stepper" role="group" aria-labelledby="npd">
            <button class="btn" aria-label="Fewer new signs per day" data-testid="newperday-down" onClick={() => onPrefs({ ...prefs, newPerDay: Math.max(1, prefs.newPerDay - 1) })}>
              −
            </button>
            <output data-testid="newperday" aria-live="polite">
              {prefs.newPerDay}
            </output>
            <button class="btn" aria-label="More new signs per day" data-testid="newperday-up" onClick={() => onPrefs({ ...prefs, newPerDay: Math.min(30, prefs.newPerDay + 1) })}>
              +
            </button>
          </div>
        </div>
        <div class="field-row">
          <span id="goal">Daily goal (answers)</span>
          <div class="stepper" role="group" aria-labelledby="goal">
            <button class="btn" aria-label="Lower daily goal" data-testid="goal-down" onClick={() => onPrefs({ ...prefs, dailyGoal: Math.max(5, prefs.dailyGoal - 5) })}>
              −
            </button>
            <output data-testid="goal" aria-live="polite">
              {prefs.dailyGoal}
            </output>
            <button class="btn" aria-label="Raise daily goal" data-testid="goal-up" onClick={() => onPrefs({ ...prefs, dailyGoal: Math.min(200, prefs.dailyGoal + 5) })}>
              +
            </button>
          </div>
        </div>
        <p id="ql">Quiz text language</p>
        <Choice
          label="Quiz text language"
          testPrefix="quizlang"
          value={prefs.quizLang}
          options={[['mixed', 'English and 中文'], ['en', 'English'], ['zh', '中文']] as const}
          onChange={(quizLang) => onPrefs({ ...prefs, quizLang })}
        />
        <p>
          <label class="check">
            <input type="checkbox" checked={prefs.haptics} data-testid="haptics" onChange={(e) => onPrefs({ ...prefs, haptics: (e.target as HTMLInputElement).checked })} /> Vibrate on answers (where supported)
          </label>
        </p>
        <p>
          <label class="check">
            <input type="checkbox" checked={prefs.sound} data-testid="sound" onChange={(e) => onPrefs({ ...prefs, sound: (e.target as HTMLInputElement).checked })} /> Play a short sound on answers
          </label>
        </p>
      </div>

      <div class="card" data-testid="packs-card">
        <h2>Offline packs</h2>
        <p class="note">
          Save a topic to use it without a connection. Clips download slowly on purpose, to be kind to the dictionary&apos;s server, and you can stop at any time.
        </p>
        <ul class="plain">
          {lexicon.categories.map((c) => {
            const videos = videosOf(c.id);
            const have = videos.filter((v) => cachedSizes.get(v) === sizeOf.get(v)).length;
            const size = videos.reduce((a, v) => a + (sizeOf.get(v) ?? 0), 0);
            const running = active?.catId === c.id ? active : null;
            const complete = have === videos.length && videos.length > 0;
            return (
              <li key={c.id} class="pack-row" data-testid={`pack-${c.id}`}>
                <span>
                  <strong>
                    {c.en} <span lang="zh-Hant">{c.zh}</span>
                  </strong>
                  <br />
                  <span class="note" data-testid={`pack-status-${c.id}`}>
                    {complete ? 'Saved' : `${have} of ${videos.length} saved`} · {mb(size)}
                  </span>
                </span>
                <span>
                  {running ? (
                    <button class="btn" data-testid={`cancel-${c.id}`} onClick={() => (running.signal.cancelled = true)}>
                      Stop
                    </button>
                  ) : (
                    <>
                      {!complete && (
                        <button class="btn" data-testid={`dl-${c.id}`} disabled={!!active || !repo} onClick={() => downloadCategory(c.id)}>
                          {have ? 'Download rest' : 'Download'}
                        </button>
                      )}
                      {have > 0 && (
                        <button class="btn" data-testid={`rm-${c.id}`} disabled={!!active} onClick={() => removeCategory(c.id)} aria-label={`Remove ${c.en} pack`}>
                          Remove
                        </button>
                      )}
                    </>
                  )}
                </span>
                {running && (
                  <>
                    <progress max={Math.max(1, running.total)} value={running.done} aria-label={`Downloading ${c.en}`} />
                    <span class="note" data-testid="dl-progress">
                      Downloading {running.done} / {running.total}
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
        <button class="btn" data-testid="repair" disabled={!!active} onClick={repair}>
          Check and repair offline clips
        </button>
      </div>

      <div class="card">
        <h2>Backup</h2>
        <p>Browsers can clear local data. A backup file keeps your progress, decks and settings safe.</p>
        <p class="note" data-testid="last-backup">
          {lastExport ? `Last backup: ${new Date(lastExport).toLocaleDateString()}` : 'No backup yet.'}
        </p>
        <button class="btn" data-testid="export" disabled={!repo} onClick={doExport}>
          Export progress
        </button>
        <label class="btn">
          Import progress
          <input type="file" accept="application/json,.json" class="sr-only" onChange={doImport} data-testid="import" disabled={!repo} />
        </label>
        <p class="note">Importing adds to what is already here and never removes anything.</p>
      </div>

      {flags.length > 0 && (
        <div class="card" data-testid="flag-list">
          <h2>Words you flagged as missing</h2>
          <p>{flags.map((f) => f.word).join(', ')}</p>
          <button class="btn" onClick={onClearFlags}>
            Clear list
          </button>
        </div>
      )}

      <div class="card" data-testid="storage-status">
        <h2>Storage</h2>
        <dl>
          <dt>Saved progress</dt>
          <dd>{repo ? 'On this device' : 'Unavailable in this session'}</dd>
          <dt>Protected from clean-up</dt>
          <dd data-testid="persisted">{ctx.persisted ? 'Yes' : 'Not guaranteed; export a backup now and then'}</dd>
          <dt>Space used</dt>
          <dd>{usage ? `${mb(usage.used)} of ${mb(usage.quota)}` : 'Unknown'}</dd>
          <dt>Offline clips</dt>
          <dd data-testid="cached-count">
            {cachedSizes.size} ({mb(cachedBytes)})
          </dd>
          <dt>Sign list version</dt>
          <dd>{lexicon.buildId}</dd>
          <dt>App version</dt>
          <dd>{__APP_VERSION__}</dd>
        </dl>
      </div>

      <div class="card">
        <h2>Error log</h2>
        <button class="btn" onClick={copyLog} data-testid="copy-log">
          Copy
        </button>
        <pre data-testid="error-log" tabIndex={0} aria-label="Error log">
          {errors.length ? errors.map((e) => `${new Date(e.at).toISOString()} [${e.where}] ${e.message}`).join('\n') : 'No errors recorded.'}
        </pre>
      </div>

      <div class="card" data-testid="about">
        <h2>About and credits</h2>
        <p>
          Sign clips and Chinese and English glosses come from the{' '}
          <a href="https://twtsl.ccu.edu.tw/" target="_blank" rel="noreferrer">
            Taiwan Sign Language Online Dictionary 台灣手語線上辭典
          </a>
          , National Chung Cheng University. This app is an unofficial study tool and is not affiliated with the university.
        </p>
        <p class="note">
          The dictionary does not state reuse terms, so this app does not include the clips: it fetches them from a configurable source, slowly, and saves them on your device. See NOTICE.md in the project.
        </p>
        <p class="note">On an iPhone: tap Share, then “Add to Home Screen”, to use this like an app.</p>
      </div>
    </section>
  );
}
