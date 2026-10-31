import { upgradeProgress } from './migrations.ts';
import type { Repo } from './repo.ts';
import { SCHEMA_VERSION, type Deck, type ReviewEvent } from './types.ts';

export interface BackupFile {
  app: 'tsl-learn';
  schemaVersion: number;
  exportedAt: number;
  progress: unknown[];
  reviews: unknown[];
  decks: unknown[];
}

export class BackupError extends Error {}

export async function exportBackup(repo: Repo): Promise<BackupFile> {
  const [progress, reviews, decks] = await Promise.all([repo.allProgress(), repo.allReviews(), repo.allDecks()]);
  const exportedAt = Date.now();
  await repo.setMeta('lastExportAt', exportedAt);
  return {
    app: 'tsl-learn',
    schemaVersion: SCHEMA_VERSION,
    exportedAt,
    progress,
    reviews: reviews.map(({ id: _id, ...rest }) => rest),
    decks,
  };
}

/** Merges a backup into the store. Older backups are migrated; unreadable rows are skipped and counted. */
export async function importBackup(
  repo: Repo,
  raw: unknown,
): Promise<{ progress: number; reviews: number; skipped: number }> {
  const b = raw as Partial<BackupFile> | null;
  if (!b || b.app !== 'tsl-learn' || typeof b.schemaVersion !== 'number') {
    throw new BackupError('This file is not a TSL Learn backup');
  }
  if (b.schemaVersion > SCHEMA_VERSION) {
    throw new BackupError('This backup is from a newer version of the app. Update the app first.');
  }
  let skipped = 0;
  let progress = 0;
  for (const row of b.progress ?? []) {
    const p = upgradeProgress(row);
    if (!p) {
      skipped++;
      continue;
    }
    const existing = await repo.getProgress(p.id);
    if (!existing || existing.reps <= p.reps) await repo.putProgress(p);
    progress++;
  }
  const events = (b.reviews ?? []).filter(
    (r): r is ReviewEvent => !!r && typeof (r as ReviewEvent).signId === 'string',
  );
  skipped += (b.reviews?.length ?? 0) - events.length;
  await repo.addReviews(events.map(({ signId, at, grade, mode }) => ({ signId, at, grade, mode })));
  for (const d of (b.decks ?? []) as Deck[]) if (d && typeof d.id === 'string') await repo.putDeck(d);
  return { progress, reviews: events.length, skipped };
}
