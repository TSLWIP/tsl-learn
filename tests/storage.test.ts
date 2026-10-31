import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { BackupError, exportBackup, importBackup } from '../src/storage/backup.ts';
import { NewerSchemaError, openDatabase } from '../src/storage/db.ts';
import { upgradeProgress } from '../src/storage/migrations.ts';
import { Repo } from '../src/storage/repo.ts';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  globalThis.IDBKeyRange = IDBKeyRange;
});

/** Creates a database exactly as the first release would have left it. */
function makeV1(name: string, rows: object[]): Promise<void> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => {
      const s = r.result.createObjectStore('progress', { keyPath: 'sign' });
      rows.forEach((x) => s.put(x));
    };
    r.onsuccess = () => {
      r.result.close();
      res();
    };
    r.onerror = () => rej(r.error);
  });
}

describe('migrations', () => {
  it('migrates a v1 store to the current schema without losing rows', async () => {
    await makeV1('t', [
      { sign: 'able_n', ef: 2.1, interval: 6, due: '2026-03-01', n: 4 },
      { sign: 'thank_a', ef: 2.5, interval: 1, due: '2026-03-02', n: 1 },
    ]);
    const repo = new Repo(await openDatabase('t'));
    const all = await repo.allProgress();
    expect(all.map((p) => p.id).sort()).toEqual(['able_n', 'thank_a']);
    const able = (await repo.getProgress('able_n'))!;
    expect(able).toMatchObject({ schemaVersion: 2, ease: 2.1, intervalDays: 6, reps: 4, lapses: 0 });
    expect(able.dueAt).toBe(Date.parse('2026-03-01T00:00:00Z'));
    await repo.addReviews([{ signId: 'able_n', at: 1, grade: 'good', mode: 'flashcard' }]);
    expect(await repo.allReviews()).toHaveLength(1);
  });

  it('reopening a current database keeps its data', async () => {
    const a = await openDatabase('t2');
    await new Repo(a).putProgress({ id: 'x', schemaVersion: 2, ease: 2.5, intervalDays: 0, dueAt: 0, reps: 0, lapses: 0 });
    a.close();
    expect(await new Repo(await openDatabase('t2')).allProgress()).toHaveLength(1);
  });

  it('refuses data written by a newer app instead of destroying it', async () => {
    await new Promise<void>((res) => {
      const r = indexedDB.open('t3', 99);
      r.onupgradeneeded = () => r.result.createObjectStore('x');
      r.onsuccess = () => {
        r.result.close();
        res();
      };
    });
    await expect(openDatabase('t3')).rejects.toBeInstanceOf(NewerSchemaError);
  });

  it('rejects garbage rows in upgradeProgress', () => {
    expect(upgradeProgress(null)).toBeNull();
    expect(upgradeProgress({ foo: 1 })).toBeNull();
  });
});

describe('large history and backup', () => {
  it('handles 5,000 review events and round-trips them through export/import', async () => {
    const repo = new Repo(await openDatabase('big'));
    const t0 = Date.now();
    const grades = ['again', 'hard', 'good', 'easy'] as const;
    const events = Array.from({ length: 5000 }, (_, i) => ({
      signId: `sign_${i % 400}`,
      at: t0 + i * 1000,
      grade: grades[i % 4],
      mode: 'flashcard' as const,
    }));
    await repo.addReviews(events);
    expect(await repo.allReviews()).toHaveLength(5000);
    expect(await repo.reviewsSince(t0 + 4990 * 1000)).toHaveLength(10);

    const json = JSON.parse(JSON.stringify(await exportBackup(repo)));
    const fresh = new Repo(await openDatabase('big-restore'));
    const res = await importBackup(fresh, json);
    expect(res).toMatchObject({ reviews: 5000, skipped: 0 });
    expect(await fresh.allReviews()).toHaveLength(5000);
  });

  it('imports an older backup and skips unreadable rows', async () => {
    const repo = new Repo(await openDatabase('imp'));
    const res = await importBackup(repo, {
      app: 'tsl-learn',
      schemaVersion: 1,
      progress: [{ sign: 'a', ef: 2.5, interval: 2, due: '2026-01-01', n: 3 }, { nonsense: true }],
      reviews: [],
    });
    expect(res).toMatchObject({ progress: 1, skipped: 1 });
    expect((await repo.getProgress('a'))?.reps).toBe(3);
  });

  it('rejects foreign and future backups with a clear error', async () => {
    const repo = new Repo(await openDatabase('rej'));
    await expect(importBackup(repo, { hello: 1 })).rejects.toBeInstanceOf(BackupError);
    await expect(importBackup(repo, { app: 'tsl-learn', schemaVersion: 99 })).rejects.toThrow(/newer/);
  });

  it('caps the error log', async () => {
    const repo = new Repo(await openDatabase('err'));
    for (let i = 0; i < 230; i++) await repo.logError('t', new Error(`e${i}`));
    const errs = await repo.allErrors();
    expect(errs.length).toBeLessThanOrEqual(200);
    expect(errs.at(-1)!.message).toBe('e229');
  });
});
