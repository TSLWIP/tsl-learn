import { useEffect, useState } from 'preact/hooks';
import { WANTED_KEY, type AppContext } from '../boot/boot.ts';
import { checkClips, downloadClips } from '../clips/pack.ts';
import { BackupError, exportBackup, importBackup } from '../storage/backup.ts';
import type { MissingFlag, Prefs } from '../state/prefs.ts';
import type { ErrorRecord } from '../storage/types.ts';

function mb(n: number): string {
  return `${(n / 1e6).toFixed(1)} MB`;
}

interface Props {
  ctx: AppContext;
  prefs: Prefs;
  onPrefs: (p: Prefs) => void;
  flags: MissingFlag[];
  onClearFlags: () => void;
}

export function Settings({ ctx, prefs, onPrefs, flags, onClearFlags }: Props) {
  const { repo, lexicon, manifest } = ctx;
  const [errors, setErrors] = useState<ErrorRecord[]>([]);
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  const [cached, setCached] = useState<{ count: number; bytes: number }>({ count: 0, bytes: 0 });
  const [msg, setMsg] = useState('');
  const [progress, setProgress] = useState<string>('');

  const refresh = async () => {
    if (repo) {
      setErrors(await repo.allErrors());
      const sizes = await repo.clipSizes();
      setCached({ count: sizes.size, bytes: [...sizes.values()].reduce((a, b) => a + b, 0) });
    }
    const est = await navigator.storage?.estimate?.().catch(() => undefined);
    if (est) setUsage({ used: est.usage ?? 0, quota: est.quota ?? 0 });
  };
  useEffect(() => void refresh(), []);

  const sizeOf = new Map(manifest.clips.map((c) => [c.video, c.size]));

  const downloadCategory = async (catId: string) => {
    if (!repo) return;
    const videos = lexicon.entries.filter((e) => e.category === catId).map((e) => e.video);
    const wanted = new Set((await repo.getMeta<string[]>(WANTED_KEY)) ?? []);
    videos.forEach((v) => wanted.add(v));
    await repo.setMeta(WANTED_KEY, [...wanted]);
    const check = await checkClips(repo, manifest, videos);
    const todo = [...check.missing, ...check.corrupt];
    const res = await downloadClips(repo, ctx.fetcher, ctx.source, manifest, todo, (d, t) => setProgress(`${d} / ${t}`));
    setProgress('');
    setMsg(`Downloaded ${res.fixed.length} clip(s)${res.failed.length ? `, ${res.failed.length} failed` : ''}.`);
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
    const blob = new Blob([JSON.stringify(await exportBackup(repo))], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tsl-learn-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setMsg('Backup saved.');
  };

  const doImport = async (ev: Event) => {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file || !repo) return;
    try {
      const res = await importBackup(repo, JSON.parse(await file.text()));
      setMsg(`Imported ${res.progress} signs and ${res.reviews} reviews${res.skipped ? ` (${res.skipped} unreadable rows skipped)` : ''}.`);
    } catch (e) {
      setMsg(e instanceof BackupError ? e.message : 'That file could not be read.');
    }
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
      {msg && (
        <p class="note" role="status" data-testid="settings-msg">
          {msg}
        </p>
      )}

      <div class="card">
        <h2>Dialect 手語方言</h2>
        <p class="note">When a word has a northern and a southern sign, this one is shown first. You can always open the other.</p>
        <div role="radiogroup" aria-label="Preferred dialect">
          <button class="btn" role="radio" aria-checked={prefs.dialect === 'north'} data-testid="dialect-north" onClick={() => onPrefs({ ...prefs, dialect: 'north' })}>
            Northern (Taipei) 北部
          </button>
          <button class="btn" role="radio" aria-checked={prefs.dialect === 'south'} data-testid="dialect-south" onClick={() => onPrefs({ ...prefs, dialect: 'south' })}>
            Southern (Tainan) 南部
          </button>
        </div>
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
        <label class="field">
          New signs per day
          <div class="stepper">
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
        </label>
        <div role="radiogroup" aria-label="Quiz text language">
          {([['mixed', 'English and 中文'], ['en', 'English'], ['zh', '中文']] as const).map(([v, label]) => (
            <button key={v} class="btn" role="radio" aria-checked={prefs.quizLang === v} data-testid={`quizlang-${v}`} onClick={() => onPrefs({ ...prefs, quizLang: v })}>
              {label}
            </button>
          ))}
        </div>
        <p>
          <label>
            <input type="checkbox" checked={prefs.haptics} data-testid="haptics" onChange={(e) => onPrefs({ ...prefs, haptics: (e.target as HTMLInputElement).checked })} /> Vibrate on answers (where supported)
          </label>
        </p>
        <p>
          <label>
            <input type="checkbox" checked={prefs.sound} data-testid="sound" onChange={(e) => onPrefs({ ...prefs, sound: (e.target as HTMLInputElement).checked })} /> Play a short sound on answers
          </label>
        </p>
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
            {cached.count} ({mb(cached.bytes)})
          </dd>
          <dt>Sign list version</dt>
          <dd>{lexicon.buildId}</dd>
          <dt>App version</dt>
          <dd>{__APP_VERSION__}</dd>
        </dl>
      </div>

      <div class="card">
        <h2>Offline packs</h2>
        <p>Download one category at a time. Clips are fetched slowly on purpose, to be kind to the dictionary&apos;s server.</p>
        {progress && <p data-testid="dl-progress">Downloading {progress}</p>}
        <ul class="plain">
          {lexicon.categories.map((c) => {
            const items = lexicon.entries.filter((e) => e.category === c.id);
            const size = items.reduce((a, e) => a + (sizeOf.get(e.video) ?? 0), 0);
            return (
              <li key={c.id}>
                <span>
                  {c.en} {c.zh} · {items.length} signs · {mb(size)}
                </span>
                <button class="btn" data-testid={`dl-${c.id}`} onClick={() => downloadCategory(c.id)}>
                  Download
                </button>
              </li>
            );
          })}
        </ul>
        <button class="btn" data-testid="repair" onClick={repair}>
          Check and repair offline clips
        </button>
      </div>

      <div class="card">
        <h2>Backup</h2>
        <p>Browsers can clear local data. A backup file keeps your progress safe.</p>
        <button class="btn" data-testid="export" onClick={doExport}>
          Export progress
        </button>
        <label class="btn">
          Import progress
          <input type="file" accept="application/json" hidden onChange={doImport} data-testid="import" />
        </label>
      </div>

      <div class="card">
        <h2>Error log</h2>
        <button class="btn" onClick={copyLog} data-testid="copy-log">
          Copy
        </button>
        <pre data-testid="error-log">
          {errors.length ? errors.map((e) => `${new Date(e.at).toISOString()} [${e.where}] ${e.message}`).join('\n') : 'No errors recorded.'}
        </pre>
      </div>
    </section>
  );
}
