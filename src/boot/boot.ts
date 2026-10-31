import { PoliteFetcher } from '../clips/fetcher.ts';
import { checkClips, downloadClips, type Manifest, type PackCheck } from '../clips/pack.ts';
import { loadContentSource, type ContentSource } from '../config.ts';
import type { Lexicon } from '../lexicon/types.ts';
import { NewerSchemaError, openDatabase } from '../storage/db.ts';
import { Repo } from '../storage/repo.ts';

export interface AppContext {
  /** null when IndexedDB is unavailable: lookup still works, progress is not saved */
  repo: Repo | null;
  lexicon: Lexicon;
  manifest: Manifest;
  source: ContentSource;
  fetcher: PoliteFetcher;
  persisted: boolean;
  notes: string[];
}

export type BootState =
  | { phase: 'starting'; detail: string }
  | { phase: 'repairing'; done: number; total: number }
  | { phase: 'ready'; ctx: AppContext }
  | { phase: 'fatal'; kind: 'newer-schema' | 'no-data'; message: string };

export class BootError extends Error {
  constructor(readonly kind: 'newer-schema' | 'no-data', message: string) {
    super(message);
  }
}

export const WANTED_KEY = 'wantedClips';

function isLexicon(x: unknown): x is Lexicon {
  const l = x as Lexicon | null;
  return !!l && l.schemaVersion === 1 && Array.isArray(l.entries) && Array.isArray(l.categories) && typeof l.buildId === 'string';
}
function isManifest(x: unknown): x is Manifest {
  const m = x as Manifest | null;
  return !!m && typeof m.buildId === 'string' && Array.isArray(m.clips);
}

async function fetchJson(url: string): Promise<unknown> {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

/**
 * Loads the sign list. Network first so updates arrive; falls back to the copy
 * kept in IndexedDB so that wiping the Cache API cannot leave the app empty.
 */
async function loadData(repo: Repo | null, notes: string[]): Promise<{ lexicon: Lexicon; manifest: Manifest }> {
  try {
    const [lexicon, manifest] = await Promise.all([fetchJson('data/lexicon.json'), fetchJson('data/manifest.json')]);
    if (!isLexicon(lexicon) || !isManifest(manifest)) throw new Error('sign list has an unexpected format');
    await repo?.setMeta('dataCopy', { lexicon, manifest }).catch(() => undefined);
    return { lexicon, manifest };
  } catch (err) {
    const copy = await repo?.getMeta<{ lexicon: unknown; manifest: unknown }>('dataCopy').catch(() => undefined);
    if (copy && isLexicon(copy.lexicon) && isManifest(copy.manifest)) {
      notes.push('Using the saved copy of the sign list (could not reach the server).');
      return { lexicon: copy.lexicon, manifest: copy.manifest };
    }
    throw new BootError(
      'no-data',
      `The sign list could not be loaded and there is no saved copy. Connect to the internet once and try again. (${(err as Error).message})`,
    );
  }
}

export async function boot(onState: (s: BootState) => void): Promise<AppContext> {
  const notes: string[] = [];
  onState({ phase: 'starting', detail: 'Opening your saved data' });

  let repo: Repo | null = null;
  try {
    repo = new Repo(await openDatabase());
  } catch (err) {
    if (err instanceof NewerSchemaError) {
      throw new BootError('newer-schema', 'Your saved data was made by a newer version of this app. Reload to get the latest version, or export before resetting.');
    }
    notes.push('Saved data is unavailable in this browser session, so progress will not be kept.');
  }

  let persisted = false;
  try {
    persisted = (await navigator.storage?.persisted?.()) || (await navigator.storage?.persist?.()) || false;
  } catch {
    /* not supported */
  }

  onState({ phase: 'starting', detail: 'Loading the sign list' });
  const { lexicon, manifest } = await loadData(repo, notes);
  const source = await loadContentSource();
  const fetcher = new PoliteFetcher({ maxConcurrent: source.maxConcurrent, minGapMs: source.minGapMs });

  if (repo) {
    const wanted = (await repo.getMeta<string[]>(WANTED_KEY)) ?? [];
    if (wanted.length) {
      const check: PackCheck = await checkClips(repo, manifest, wanted);
      const broken = [...check.missing, ...check.corrupt];
      if (broken.length) {
        onState({ phase: 'repairing', done: 0, total: broken.length });
        for (const v of check.corrupt) await repo.deleteClip(v);
        const res = await downloadClips(repo, fetcher, source, manifest, broken, (done, total) =>
          onState({ phase: 'repairing', done, total }),
        );
        if (res.failed.length) {
          notes.push(`${res.failed.length} clip(s) could not be repaired yet; they will retry next launch.`);
          await repo.logError('boot/repair', new Error(`failed: ${res.failed.slice(0, 5).map((f) => `${f.video}:${f.reason}`).join(', ')}`));
        }
      }
      if (check.unknown.length) {
        await repo.setMeta(WANTED_KEY, wanted.filter((v) => !check.unknown.includes(v)));
      }
    }
  }

  const ctx: AppContext = { repo, lexicon, manifest, source, fetcher, persisted, notes };
  onState({ phase: 'ready', ctx });
  return ctx;
}
